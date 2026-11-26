import axios, { type AxiosProgressEvent } from 'axios';
import { authError, authStatus } from '../auth/api';

export const mediaPath = '/admin/media';
export const mediaKinds = ['video', 'audio', 'image', 'pdf', 'subtitle', 'transcript', 'attachment'] as const;
export const mediaStatuses = ['draft', 'published', 'archived'] as const;

export type MediaKind = typeof mediaKinds[number];
export type MediaStatus = typeof mediaStatuses[number];
export type MediaRelation = 'thumbnail' | 'video-variant' | 'audio' | 'subtitle' | 'transcript';

export const relationKind: Record<MediaRelation, MediaKind> = {
  thumbnail: 'image', 'video-variant': 'video', audio: 'audio', subtitle: 'subtitle', transcript: 'transcript',
};
export const relationLabel = {
  thumbnail: 'thumbnail', 'video-variant': 'video-variant', audio: 'linkAudio', subtitle: 'linkSubtitle', transcript: 'linkTranscript',
} as const;
export const qualityLevels = ['144p', '240p', '360p', '480p', '720p', '1080p'];

export interface MediaMetadata {
  title: string;
  license: string;
  source: string;
  author: string;
  language: string;
  downloadAllowed: boolean;
}

export interface MediaLink {
  relation: MediaRelation;
  slot: string;
  assetId: string;
}

export interface MediaRecord extends Omit<MediaMetadata, 'language'> {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  originalName: string;
  language: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  links: MediaLink[];
}

export interface MediaListOptions {
  q?: string;
  kind?: MediaKind;
  status?: MediaStatus;
  page?: number;
  pageSize?: number;
  orphans?: boolean;
}

interface MediaList {
  items: MediaRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface MediaUsage {
  assets: number;
  usedBytes: number;
  orphanAssets: number;
  capacityBytes: number;
  freeBytes: number;
  pendingDeletes: number;
  orphanFiles?: number;
  maxUploadBytes?: number;
}

const api = axios.create({ baseURL: '/api/v1/admin/media', timeout: 12_000 });

export async function listMedia(options: MediaListOptions, signal: AbortSignal) {
  const { data } = await api.get<MediaList>('', { params: options, signal });
  return data;
}

export async function loadMediaUsage(signal: AbortSignal) {
  const { data } = await api.get<MediaUsage>('/usage', { signal });
  return data;
}

export async function getMedia(id: string, signal: AbortSignal) {
  const { data } = await api.get<{ item: MediaRecord }>('/' + id, { signal });
  return data.item;
}

export async function uploadMedia(
  file: File, metadata: MediaMetadata & { kind: MediaKind }, signal: AbortSignal,
  onUploadProgress: (event: AxiosProgressEvent) => void,
) {
  const form = new FormData();
  form.append('metadata', JSON.stringify({ ...metadata, language: metadata.language || null }));
  form.append('file', file);
  const { data } = await api.post<{ item: MediaRecord }>('', form, { timeout: 0, signal, onUploadProgress });
  return data.item;
}

export async function saveMedia(record: MediaRecord, metadata: MediaMetadata, signal: AbortSignal) {
  const { data } = await api.put<{ item: MediaRecord }>('/' + record.id, {
    ...metadata, language: metadata.language || null, version: record.version,
  }, { signal });
  return data.item;
}

export async function changeMediaStatus(record: MediaRecord, status: MediaStatus, signal: AbortSignal) {
  const { data } = await api.patch<{ item: MediaRecord }>('/' + record.id + '/status', { status, version: record.version }, { signal });
  return data.item;
}

export async function attachMedia(record: MediaRecord, link: MediaLink, signal: AbortSignal) {
  const { data } = await api.post<{ item: MediaRecord }>('/' + record.id + '/links', { ...link, version: record.version }, { signal });
  return data.item;
}

export async function detachMedia(record: MediaRecord, { relation, slot }: MediaLink, signal: AbortSignal) {
  const { data } = await api.delete<{ item: MediaRecord }>('/' + record.id + '/links', {
    data: { relation, slot, version: record.version }, signal,
  });
  return data.item;
}

export async function deleteMedia(record: MediaRecord, signal: AbortSignal) {
  const { data } = await api.delete<{ cleanupPending: boolean }>('/' + record.id, {
    data: { version: record.version, confirm: true }, signal,
  });
  return data;
}

export async function cleanupMedia(signal: AbortSignal) {
  const { data } = await api.post<{ removed: number; pending: number }>('/cleanup', { confirm: true }, { signal });
  return data;
}

export const mediaFileUrl = (id: string, download = false) =>
  '/api/v1/admin/media/' + encodeURIComponent(id) + '/file' + (download ? '?download=true' : '');

export async function previewText(id: string, signal: AbortSignal) {
  const { data, headers } = await api.get<string>('/' + id + '/file', {
    headers: { Range: 'bytes=0-65535' }, responseType: 'text', signal,
  });
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(headers['content-range'] ?? ''));
  return { text: data, truncated: Boolean(range && Number(range[2]) + 1 < Number(range[3])) };
}

export function mediaError(error: unknown, area?: string) {
  switch (authError(error)) {
    case 'MEDIA_IN_USE': case 'ASSET_IN_USE': case 'IN_USE': case 'REFERENCED': return 'inUse';
    case 'MEDIA_DUPLICATE': case 'DUPLICATE': case 'DUPLICATE_ASSET': return 'duplicate';
    case 'CONFLICT': return area === 'delete' || area === 'status' ? 'inUse' : 'duplicate';
    case 'STALE_VERSION': return 'stale';
    case 'INVALID_FILE': return 'typeError';
    case 'UPLOAD_TOO_LARGE': return 'limitError';
    case 'INVALID_LINK': return 'invalidLink';
    case 'INVALID_REFERENCE': return 'invalidReference';
    case 'PENDING_LEARNING_REVIEW': return 'pendingLearningReview';
    case 'INVALID_INPUT': case 'INVALID_STATUS': case 'INVALID_TRANSITION': return 'invalid';
  }
  switch (authStatus(error)) {
    case 400: case 422: return 'invalid';
    case 401: return 'sessionExpired';
    case 403: return 'noAccess';
    case 404: return 'missing';
    case 413: return 'limitError';
    case 415: return 'typeError';
    case 409: return 'stale';
    default: return 'error';
  }
}

export function mediaBytes(value: number, locale: string) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(Math.max(1, value)) / Math.log(1024))));
  const numeric = new Intl.NumberFormat(locale, { maximumFractionDigits: index ? 1 : 0 });
  return numeric.format(value / 1024 ** index) + ' ' + units[index];
}

export function contentLanguageName(locale: string | null, interfaceLanguage: string) {
  if (!locale) return '';
  try { return new Intl.DisplayNames(interfaceLanguage, { type: 'language' }).of(locale) || locale; }
  catch { return locale; }
}
