export const offlineKinds = ['lesson', 'book', 'video', 'short', 'ai', 'resource'] as const;
export type OfflineKind = (typeof offlineKinds)[number];

export interface OfflineFileDraft {
  url: string;
  sizeBytes?: number | null;
  mimeType?: string;
}

export interface OfflineResourceDraft {
  key: string;
  kind: OfflineKind;
  title: string;
  locale: string;
  description?: string;
  body?: string;
  file?: OfflineFileDraft;
}

export interface OfflineFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface OfflineSummary {
  key: string;
  kind: OfflineKind;
  title: string;
  locale: string;
  description: string;
  savedAt: number;
  sizeBytes: number;
  file: OfflineFile | null;
}

export interface OfflineRecord extends OfflineSummary {
  body: string;
  blob: Blob | null;
}

export interface OfflineJob {
  key: string;
  kind: OfflineKind;
  title: string;
  locale: string;
  loadedBytes: number;
  totalBytes: number | null;
}

export interface OfflineStorageUsage {
  downloadBytes: number;
  usageBytes: number | null;
  quotaBytes: number | null;
  limitBytes: number;
  fileLimitBytes: number;
}

export type OfflineErrorCode = 'invalid' | 'unavailable' | 'denied' | 'network' | 'quota' | 'tooLarge' | 'cancelled' | 'inProgress';

export class OfflineError extends Error {
  constructor(readonly code: OfflineErrorCode) {
    super(code);
    this.name = 'OfflineError';
  }
}

export const offlineFileLimitBytes = 128 * 1024 * 1024;
export const offlineStorageLimitBytes = 384 * 1024 * 1024;
export const offlineRecordLimit = 512;

export const validOfflineKey = (value: string) => /^[a-zA-Z0-9:_-]{1,180}$/.test(value);

export function offlineResourceKey(kind: OfflineKind, id: string, locale: string) {
  return kind + ':' + id + ':' + locale;
}
