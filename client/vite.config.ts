import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Manifest, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const offlineEntry = 'src/features/offline/OfflinePage.tsx';
const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);

function precompressedFiles(): Plugin {
  return {
    name: 'womenriseafg-static-compression',
    apply: 'build',
    async writeBundle({ dir }, bundle) {
      if (!dir) return;
      const files = Object.keys(bundle).filter(file => /^assets\/[^/]+\.(?:js|mjs|css)$/.test(file));
      files.push('index.html', 'offline.html', 'offline-fallback.css', 'offline-fallback.js');

      for (const file of files) {
        const filename = path.join(dir, file);
        const data = await readFile(filename);
        if (data.byteLength < 256 || data.byteLength > 2_000_000) continue;
        const [brotli, gzipped] = await Promise.all([
          compressBrotli(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
          compressGzip(data, { level: 6 }),
        ]);
        if (brotli.byteLength < data.byteLength) await writeFile(filename + '.br', brotli);
        if (gzipped.byteLength < data.byteLength) await writeFile(filename + '.gz', gzipped);
      }
    },
  };
}

async function offlineFiles(buildManifest: string) {
  const manifest = JSON.parse(await readFile(buildManifest, 'utf8')) as Manifest;
  const files = new Set(['index.html', 'offline.html', 'offline-fallback.css', 'offline-fallback.js', 'favicon.svg',
    'icons/app-192.png', 'icons/app-512.png', 'icons/app-maskable.png']);
  const checked = new Set<string>();

  function addStaticDependencies(key: string) {
    if (checked.has(key)) return;
    checked.add(key);
    const entry = manifest[key];
    if (!entry) throw new Error('Missing offline app shell entry: ' + key);
    files.add(entry.file);
    for (const file of entry.css ?? []) files.add(file);
    for (const file of entry.assets ?? []) {
      if (file.endsWith('.woff2')) files.add(file);
    }
    for (const dependency of entry.imports ?? []) addStaticDependencies(dependency);
  }

  addStaticDependencies('index.html');
  addStaticDependencies(offlineEntry);
  return files;
}

export default defineConfig(({ mode }) => {
  const { PORT = '3000' } = loadEnv(mode, repositoryRoot, 'PORT');
  let buildManifest: string;
  const manifestLocation: Plugin = {
    name: 'womenriseafg-manifest-location',
    apply: 'build',
    configResolved(config) {
      buildManifest = path.resolve(config.root, config.build.outDir, '.vite/manifest.json');
    },
  };

  return {
    plugins: [react(), tailwindcss(), manifestLocation, VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'womenriseafg',
        short_name: 'womenriseafg',
        description: 'Free education for Afghan girls and women.',
        scope: '/',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8f9fc',
        theme_color: '#6d28d9',
        icons: [
          { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/app-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['index.html', 'offline.html', 'offline-fallback.{css,js}', 'favicon.svg',
          'icons/app-*.png', 'assets/*.{css,js,mjs,woff2}'],
        manifestTransforms: [async entries => {
          const files = await offlineFiles(buildManifest);
          const manifest = entries.filter(entry => files.has(entry.url));
          if (manifest.length !== files.size) throw new Error('The offline app shell contains missing build assets.');
          return { manifest, warnings: [] };
        }],
      },
    }), precompressedFiles()],
    build: { manifest: true },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: {
        allow: [
          fileURLToPath(new URL('./', import.meta.url)),
          fileURLToPath(new URL('../node_modules/', import.meta.url)),
        ],
      },
      proxy: {
        '/api': `http://127.0.0.1:${PORT}`,
      },
    },
  };
});
