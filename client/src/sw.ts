/// <reference lib="webworker" />
import { cacheNames, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, PrecacheController } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

setCacheNameDetails({ prefix: 'womenriseafg' });
const entries = self.__WB_MANIFEST;
const publicAssets = new Set(entries.map(entry =>
  new URL(typeof entry === 'string' ? entry : entry.url, self.location.origin).pathname));
const downloadsNavigation = /^\/downloads(?:\/(?:[a-z0-9_:-]|%3a){1,180})?\/?$/i;
const publicNavigation = /^\/(?:explore|courses(?:\/[a-z0-9-]+)?|learn\/[a-z0-9-]+\/[a-z0-9-]+|(?:videos|shorts|ai-learning|quizzes|learning-paths)(?:\/[a-z0-9-]+)?|library(?:\/[a-z0-9-]+(?:\/read)?)?|search|daily-learning|my-learning|saved|settings|status)\/?$/i;

function anonymousRequest(input: RequestInfo) {
  return new Request(input, { credentials: 'omit', redirect: 'error', cache: 'reload' });
}

function publicResponse(response: Response) {
  return response.status === 200 && !/\b(?:private|no-store)\b/i.test(response.headers.get('Cache-Control') ?? '');
}

const shell = new PrecacheController({
  plugins: [{
    requestWillFetch: async ({ request }) => anonymousRequest(request),
    cacheWillUpdate: async ({ response }) => publicResponse(response) ? response : null,
  }],
});
shell.precache(entries);
const shellCacheKeys = [...shell.getURLsToCacheKeys().values()];
cleanupOutdatedCaches();

function cachedShellAsset(key: string) {
  return caches.match(key, { cacheName: cacheNames.precache, ignoreVary: true });
}

function cached(url: string) {
  const key = shell.getCacheKeyForURL(url);
  return key ? cachedShellAsset(key) : Promise.resolve(undefined);
}

async function shellIsReady() {
  const assets = await Promise.all(shellCacheKeys.map(cachedShellAsset));
  return assets.every(Boolean);
}

async function repairShell() {
  const cache = await caches.open(cacheNames.precache);
  const added: string[] = [];
  try {
    for (const key of shellCacheKeys) {
      if (await cache.match(key, { ignoreVary: true })) continue;
      const response = await fetch(anonymousRequest(key));
      if (!publicResponse(response)) throw new Error('Offline shell asset unavailable.');
      await cache.put(key, response);
      added.push(key);
    }
  } catch (error) {
    await Promise.allSettled(added.map(key => cache.delete(key, { ignoreVary: true })));
    throw error;
  }
}

self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port || !['check-offline-shell', 'prepare-offline-shell'].includes(event.data)) return;
  const operation = event.data === 'check-offline-shell' ? shellIsReady() : repairShell().then(() => true);
  event.waitUntil(operation.then(ready => port.postMessage(ready), () => port.postMessage(false)));
});

async function navigate(request: Request, path: string) {
  try {
    const response = await fetch(request);
    if (response.status < 502 || response.status > 504) return response;
  } catch { /* An offline visit can show the explicitly enabled app shell. */ }
  return await cached(downloadsNavigation.test(path) ? '/index.html' : '/offline.html') ?? Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    if (url.pathname === '/' || publicNavigation.test(url.pathname) || downloadsNavigation.test(url.pathname)) {
      event.respondWith(navigate(request, url.pathname));
    }
    return;
  }
  if (url.search || request.headers.has('Range') || !publicAssets.has(url.pathname)) return;
  event.respondWith(cached(url.pathname).then(response => response ?? fetch(request)));
});
