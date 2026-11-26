import { useSyncExternalStore } from 'react';
import { downloadFile, validateFileSource } from './downloadFile';
import {
  deleteOfflineRecord, deleteOfflineRecords, getOfflineRecord, listOfflineSummaries, putOfflineRecord,
  releaseDownload, reservationTokens, reserveDownload,
} from './offlineDatabase';
import {
  OfflineError, offlineFileLimitBytes, offlineKinds, offlineRecordLimit, offlineStorageLimitBytes, validOfflineKey,
  type OfflineErrorCode, type OfflineJob, type OfflineResourceDraft, type OfflineStorageUsage, type OfflineSummary,
} from './types';

export { OfflineError, offlineResourceKey } from './types';
export type { OfflineErrorCode, OfflineJob, OfflineRecord, OfflineResourceDraft, OfflineStorageUsage, OfflineSummary } from './types';

interface OfflineView {
  records: OfflineSummary[];
  active: OfflineJob[];
  loading: boolean;
  error: OfflineErrorCode | null;
  storage: OfflineStorageUsage;
}

interface ActiveDownload {
  info: OfflineJob;
  controller: AbortController;
  token: string;
  startedAt: number;
  reserved: boolean;
}

const initial: OfflineView = {
  records: [], active: [], loading: true, error: null,
  storage: { downloadBytes: 0, usageBytes: null, quotaBytes: null,
    limitBytes: offlineStorageLimitBytes, fileLimitBytes: offlineFileLimitBytes },
};
const signalKey = 'womenriseafg.offline-change';
const maxConcurrentDownloads = 2;
const listeners = new Set<() => void>();
const jobs = new Map<string, ActiveDownload>();
let view = initial;
let channel: BroadcastChannel | undefined;
let listening = false;
let clearing = 0;
let refreshVersion = 0;

function update(change: Partial<OfflineView>) {
  view = { ...view, ...change };
  for (const notify of listeners) notify();
}

function updateJobs() {
  update({ active: Array.from(jobs.values(), job => ({ ...job.info })) });
}

function normaliseError(error: unknown, signal?: AbortSignal): OfflineError {
  if (signal?.aborted) return new OfflineError('cancelled');
  if (error instanceof OfflineError) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return new OfflineError('quota');
  return new OfflineError('unavailable');
}

async function estimate() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { usageBytes: null, quotaBytes: null };
    const { usage, quota } = await navigator.storage.estimate();
    return {
      usageBytes: typeof usage === 'number' && Number.isFinite(usage) && usage >= 0 ? usage : null,
      quotaBytes: typeof quota === 'number' && Number.isFinite(quota) && quota >= 0 ? quota : null,
    };
  } catch { return { usageBytes: null, quotaBytes: null }; }
}

export async function refreshOfflineDownloads() {
  const version = ++refreshVersion;
  try {
    const [records, usage] = await Promise.all([listOfflineSummaries(), estimate()]);
    if (version !== refreshVersion) return;
    records.sort((left, right) => right.savedAt - left.savedAt);
    const downloadBytes = records.reduce((total, item) => total + item.sizeBytes, 0);
    update({ records, storage: { ...initial.storage, ...usage, downloadBytes }, loading: false, error: null });
  } catch (error) {
    if (version === refreshVersion) update({ loading: false, error: normaliseError(error).code });
  }
}

function cancelJob(job: ActiveDownload) {
  if (jobs.get(job.info.key) !== job) return;
  jobs.delete(job.info.key);
  job.controller.abort();
  updateJobs();
}

async function externalChange(clearTime?: number) {
  if (clearTime !== undefined) {
    for (const job of jobs.values()) {
      if (job.startedAt <= clearTime) cancelJob(job);
    }
  }
  const pending = Array.from(jobs.values()).filter(job => job.reserved);
  if (pending.length) {
    try {
      const tokens = await reservationTokens(pending.map(job => job.info.key));
      pending.forEach((job, index) => {
        if (tokens[index] !== job.token) cancelJob(job);
      });
    } catch { /* The final transaction still checks each job's reservation. */ }
  }
  await refreshOfflineDownloads();
}

function fromAnotherTab(value: unknown) {
  if (value === 'update') void externalChange();
  if (typeof value === 'number' && Number.isFinite(value)) void externalChange(value);
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(signalKey);
      channel.addEventListener('message', event => fromAnotherTab(event.data));
    }
  } catch { /* Use the storage event on browsers without BroadcastChannel. */ }
  window.addEventListener('storage', event => {
    if (event.key !== signalKey || !event.newValue) return;
    try { fromAnotherTab(JSON.parse(event.newValue)); } catch { /* Ignore other site storage values. */ }
  });
  window.addEventListener('pageshow', () => void externalChange());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void externalChange();
  });
}

function announce(clearTime?: number) {
  const message = clearTime ?? 'update';
  if (channel) {
    channel.postMessage(message);
    return;
  }
  try {
    localStorage.setItem(signalKey, JSON.stringify(message));
    localStorage.removeItem(signalKey);
  } catch { /* IndexedDB guards concurrent writes when messages are unavailable. */ }
}

function subscribe(notify: () => void) {
  startListening();
  listeners.add(notify);
  if (listeners.size === 1) void refreshOfflineDownloads();
  return () => { listeners.delete(notify); };
}

export function useOfflineDownloads() {
  return useSyncExternalStore(subscribe, () => view, () => initial);
}

function validateDraft(draft: OfflineResourceDraft) {
  const title = draft.title.trim();
  const description = draft.description?.trim() ?? '';
  const body = draft.body ?? '';
  if (!validOfflineKey(draft.key) || !offlineKinds.includes(draft.kind) || !title || title.length > 200 ||
      !/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(draft.locale) || draft.locale.length > 35 ||
      description.length > 2000 || body.length > 64_000 || (!draft.file && !body.trim()) ||
      (draft.kind === 'book' && !draft.file)) throw new OfflineError('invalid');
  return { title, description, body, key: draft.key, kind: draft.kind, locale: draft.locale,
    source: draft.file && validateFileSource(draft.file, draft.kind) };
}

async function budgetFor(key: string, textBytes: number) {
  const [records, { usageBytes, quotaBytes }] = await Promise.all([listOfflineSummaries(), estimate()]);
  const other = records.filter(item => item.key !== key);
  const occupied = other.reduce((total, item) => total + item.sizeBytes, 0);
  const originFree = quotaBytes === null || usageBytes === null ? Infinity : quotaBytes - usageBytes;
  function checkSize(fileBytes: number) {
    if (fileBytes > offlineFileLimitBytes) throw new OfflineError('tooLarge');
    if (textBytes + fileBytes > originFree || other.length >= offlineRecordLimit ||
        occupied + textBytes + fileBytes > offlineStorageLimitBytes) throw new OfflineError('quota');
  }
  return checkSize;
}

async function prepareDownload(prepare: (signal: AbortSignal) => Promise<void>, signal: AbortSignal) {
  signal.throwIfAborted();
  let cancel: () => void = () => undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(new OfflineError('cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
  });
  try {
    await Promise.race([prepare(signal), interrupted]);
  } catch {
    throw new OfflineError(signal.aborted ? 'cancelled' : 'unavailable');
  } finally { signal.removeEventListener('abort', cancel); }
}

export async function saveOfflineResource(
  input: OfflineResourceDraft,
  options?: { prepare?: (signal: AbortSignal) => Promise<void> },
): Promise<OfflineSummary> {
  const draft = validateDraft(input);
  if (clearing || jobs.has(draft.key) || jobs.size >= maxConcurrentDownloads) throw new OfflineError('inProgress');
  if (typeof crypto.randomUUID !== 'function') throw new OfflineError('unavailable');
  const { key, kind, title, locale, source, body, description } = draft;
  const job: ActiveDownload = {
    info: { key, kind, title, locale, loadedBytes: 0, totalBytes: source?.sizeBytes ?? null },
    controller: new AbortController(), token: crypto.randomUUID(), startedAt: Date.now(), reserved: false,
  };
  startListening();
  jobs.set(key, job);
  updateJobs();

  const { signal } = job.controller;
  try {
    await reserveDownload(key, job.token, signal);
    job.reserved = true;
    announce();
    const textBytes = new TextEncoder().encode(body + description + title).byteLength;
    const checkSize = await budgetFor(key, textBytes);
    checkSize(source?.sizeBytes ?? 0);
    signal.throwIfAborted();
    if (options?.prepare) await prepareDownload(options.prepare, signal);
    signal.throwIfAborted();
    const downloaded = source ? await downloadFile(source, signal, checkSize, (loadedBytes, totalBytes) => {
      job.info = { ...job.info, loadedBytes, totalBytes };
      if (jobs.get(key) === job) updateJobs();
    }) : null;
    signal.throwIfAborted();
    const summary: OfflineSummary = {
      key, kind, title, locale, description, savedAt: Date.now(),
      sizeBytes: textBytes + (downloaded?.blob.size ?? 0), file: downloaded?.file ?? null,
    };
    await putOfflineRecord(summary, { key, body, blob: downloaded?.blob ?? null }, job.token, signal);
    job.reserved = false;
    announce();
    await refreshOfflineDownloads();
    return summary;
  } catch (error) { throw normaliseError(error, signal); }
  finally {
    if (job.reserved) void releaseDownload(key, job.token).catch(() => undefined);
    if (jobs.get(key) === job) {
      jobs.delete(key);
      updateJobs();
    }
  }
}

export function cancelOfflineDownload(key: string) {
  const job = jobs.get(key);
  if (job) cancelJob(job);
}

export async function readOfflineResource(key: string) {
  if (!validOfflineKey(key)) return null;
  try { return await getOfflineRecord(key); }
  catch (error) { throw normaliseError(error); }
}

export async function removeOfflineResource(key: string) {
  if (!validOfflineKey(key)) throw new OfflineError('invalid');
  startListening();
  cancelOfflineDownload(key);
  try {
    await deleteOfflineRecord(key);
    announce();
    await refreshOfflineDownloads();
  } catch (error) { throw normaliseError(error); }
}

export async function clearOfflineResources() {
  startListening();
  clearing++;
  for (const job of jobs.values()) cancelJob(job);
  try {
    await deleteOfflineRecords();
    announce(Date.now());
    await refreshOfflineDownloads();
  } catch (error) { throw normaliseError(error); }
  finally { clearing--; }
}
