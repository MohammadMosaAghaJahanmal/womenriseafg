import { useSyncExternalStore } from 'react';

const path = '/sw.js';
const cachePrefix = 'womenriseafg-precache-';
const operationTimeout = 60_000;
const readinessTimeout = 3_000;
let pending: Promise<unknown> = Promise.resolve();
let generation = 0;

type InstallPrompt = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let installPrompt: InstallPrompt | undefined;
const installListeners = new Set<() => void>();

function publishInstallPrompt(prompt?: InstallPrompt) {
  installPrompt = prompt;
  for (const listener of installListeners) listener();
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  publishInstallPrompt(event as InstallPrompt);
});
window.addEventListener('appinstalled', () => publishInstallPrompt());

export function offlineShellSupported() {
  return import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window;
}

function subscribeInstall(listener: () => void) {
  installListeners.add(listener);
  return () => { installListeners.delete(listener); };
}

async function promptInstall() {
  const event = installPrompt;
  if (!event) return false;
  publishInstallPrompt();
  try {
    await event.prompt();
    return (await event.userChoice).outcome === 'accepted';
  } catch { return false; }
}

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(subscribeInstall, () => Boolean(installPrompt), () => false);
  return { canInstall, promptInstall };
}

function ownsWorker(worker: ServiceWorker | null | undefined): worker is ServiceWorker {
  return worker?.scriptURL === new URL(path, window.location.origin).href;
}

function serialize(operation: () => Promise<void>) {
  const run = async () => {
    if ('locks' in navigator) await navigator.locks.request('womenriseafg-offline-shell', operation);
    else await operation();
  };
  const next = pending.then(run);
  pending = next.catch(() => undefined);
  return next;
}

export async function offlineShellReady() {
  if (!offlineShellSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const worker = registration?.active;
    return ownsWorker(worker) && await askWorker(worker, 'check-offline-shell', readinessTimeout);
  } catch { return false; }
}

function waitForWorker(registration: ServiceWorkerRegistration) {
  return new Promise<ServiceWorker>((resolve, reject) => {
    let worker: ServiceWorker | null = null;
    const timer = window.setTimeout(() => finish(), operationTimeout);

    function finish(active?: ServiceWorker) {
      window.clearTimeout(timer);
      registration.removeEventListener('updatefound', observe);
      worker?.removeEventListener('statechange', observe);
      if (active) resolve(active);
      else reject(new Error('Offline shell installation failed.'));
    }

    function observe() {
      const active = registration.active;
      if (active?.state === 'activated' && ownsWorker(active)) return finish(active);
      const next = registration.installing ?? registration.waiting ?? active;
      if (!next && worker?.state === 'redundant') return finish();
      if (next === worker) return;
      worker?.removeEventListener('statechange', observe);
      worker = next;
      worker?.addEventListener('statechange', observe);
    }

    registration.addEventListener('updatefound', observe);
    observe();
  });
}

function askWorker(worker: ServiceWorker, action: 'check-offline-shell' | 'prepare-offline-shell', timeout: number) {
  return new Promise<boolean>(resolve => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => finish(false), timeout);
    function finish(ok: boolean) {
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(ok);
    }
    channel.port1.onmessage = event => finish(event.data === true);
    try {
      worker.postMessage(action, [channel.port2]);
    } catch {
      channel.port2.close();
      finish(false);
    }
  });
}

export function enableOfflineShell() {
  const started = generation;
  const checkGeneration = () => {
    if (started !== generation) throw new Error('Offline shell preparation was cancelled.');
  };
  return serialize(async () => {
    checkGeneration();
    if (!offlineShellSupported()) throw new Error('Offline shell unavailable.');
    const ready = await offlineShellReady();
    checkGeneration();
    if (ready) return;
    const registration = await navigator.serviceWorker.register(path, { scope: '/', updateViaCache: 'none' });
    const worker = await waitForWorker(registration);
    checkGeneration();
    if (!await askWorker(worker, 'prepare-offline-shell', operationTimeout)) {
      throw new Error('Offline shell could not be saved.');
    }
    checkGeneration();
    window.dispatchEvent(new Event('womenriseafg-offline-shell'));
  });
}

export function clearOfflineShell() {
  generation++;
  return serialize(async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (registration && [registration.active, registration.waiting, registration.installing].some(ownsWorker)) {
        await registration.unregister();
      }
    }
    if ('caches' in window) {
      const names = (await caches.keys()).filter(name => name.startsWith(cachePrefix));
      await Promise.all(names.map(name => caches.delete(name)));
    }
    window.dispatchEvent(new Event('womenriseafg-offline-shell'));
  });
}
