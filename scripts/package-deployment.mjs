import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const releaseFiles = ['app.js', 'package.json', 'package-lock.json', 'client/package.json',
  'server/package.json', '.env.example', 'docs/DEPLOYMENT.md'];

function build(workspace, output) {
  execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build', '--workspace',
    '@womenriseafg/' + workspace, '--', '--outDir', output], { cwd: root, stdio: 'inherit' });
}

async function copyToRelease(from, release, relative) {
  const destination = path.join(release, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(from, destination);
}

async function copyClientBuild(buildDirectory, release, isPublicAsset) {
  const entries = await readdir(buildDirectory, { recursive: true, withFileTypes: true });
  const files = new Set();
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const relative = path.relative(buildDirectory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (relative === '.vite/manifest.json') continue;
    if (!entry.isFile()) throw new Error('Unexpected non-file in client build: ' + relative);
    files.add(relative);
  }
  for (const needed of ['index.html', 'sw.js', 'manifest.webmanifest', 'offline.html']) {
    if (!files.has(needed)) throw new Error('Missing client build file: ' + needed);
  }
  for (const relative of files) {
    const original = relative.replace(/\.(?:gz|br)$/, '');
    if (!files.has(original) || !isPublicAsset(original)) throw new Error('Unexpected client build file: ' + relative);
    await copyToRelease(path.join(buildDirectory, relative), release, path.join('client', 'dist', relative));
  }
}

async function packageDeployment() {
  const [filename, extra] = process.argv.slice(2);
  if (!filename?.endsWith('.tar.gz') || extra || !process.env.npm_execpath) {
    throw new Error('Usage: npm run package:deployment -- /path/to/womenriseafg-deployment.tar.gz');
  }
  const destination = path.resolve(filename);
  const temporary = await mkdtemp(path.join(tmpdir(), 'womenriseafg-release-'));
  try {
    const release = path.join(temporary, 'release');
    const serverBuild = path.join(release, 'server', 'dist');
    const clientBuild = path.join(temporary, 'client-build');
    for (const file of releaseFiles) await copyToRelease(path.join(root, file), release, file);
    build('client', clientBuild);
    build('server', serverBuild);
    const { isPublicAsset } = require(path.join(serverBuild, 'config', 'staticAssets.js'));
    await copyClientBuild(clientBuild, release, isPublicAsset);

    const archive = path.join(temporary, 'womenriseafg.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', release, '.'], { stdio: 'inherit' });
    const checksum = createHash('sha256').update(await readFile(archive)).digest('hex');
    await copyFile(archive, destination, constants.COPYFILE_EXCL);
    console.log('Deployment archive: ' + destination);
    console.log('SHA-256: ' + checksum);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

try {
  await packageDeployment();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
