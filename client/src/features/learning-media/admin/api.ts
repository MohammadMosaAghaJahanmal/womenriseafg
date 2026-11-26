import axios from 'axios';
import { authError, authStatus } from '../../auth/api';
import type { Page } from '../../courses/admin/api';
import type { EducationRecord, Status } from '../../education/api';
import type { MediaKind, MediaRecord } from '../../media/api';

export const learningMediaAdminPath = '/admin/learning-media';
export const learningMediaKinds = ['video', 'short', 'resource'] as const;
export const learningMediaOrigins = ['human', 'ai-assisted', 'ai-generated'] as const;
export const learningResourceKinds: readonly MediaKind[] = ['audio', 'image', 'pdf', 'transcript', 'subtitle'];
export type LearningMediaKind = typeof learningMediaKinds[number];
export type LearningMediaOrigin = typeof learningMediaOrigins[number];

export interface MediaTranslation { locale: string; title: string; description: string }
export interface LearningMediaInput {
  slug: string;
  kind: LearningMediaKind;
  mediaId: string | null;
  categoryId: string | null;
  relatedCourseId: string | null;
  relatedLessonId: string | null;
  aiOrigin: LearningMediaOrigin;
  aiTool: string;
  aiNotes: string;
  translations: MediaTranslation[];
}
export interface LearningMediaRecord extends LearningMediaInput {
  id: string;
  status: Status;
  version: number;
  updatedAt: string;
  createdAt: string;
  thumbnailId: string | null;
  durationMs: number | null;
  reviewNote: string;
  reviewedAt: string | null;
  relatedCourseSlug: string | null;
}
export type Asset = Pick<MediaRecord, 'id' | 'kind' | 'title' | 'originalName' | 'language' | 'width' | 'height' |
  'durationMs' | 'links' | 'license' | 'author' | 'source' | 'status' | 'version'>;
export type AssetStatus = 'draft' | 'published';
const api = axios.create({ baseURL: '/api/v1', timeout: 12_000 });
const base = learningMediaAdminPath;

export async function listEntries(params: { q: string; page: number; pageSize: number; kind?: LearningMediaKind;
  status?: Status; aiOnly?: boolean }, signal: AbortSignal) {
  const { data } = await api.get<Page<LearningMediaRecord>>(base, { params, signal });
  return data;
}

export async function loadEntry(id: string, signal: AbortSignal) {
  const { data } = await api.get<{ item: LearningMediaRecord }>(base + '/' + id, { signal });
  return data.item;
}

export async function saveEntry(input: LearningMediaInput, entry?: LearningMediaRecord) {
  const { data } = entry
    ? await api.put<{ item: LearningMediaRecord }>(base + '/' + entry.id, { ...input, version: entry.version })
    : await api.post<{ item: LearningMediaRecord }>(base, input);
  return data.item;
}

export async function changeEntryStatus(entry: LearningMediaRecord, status: Status, reviewNote = '') {
  const { data } = await api.patch<{ item: LearningMediaRecord }>(base + '/' + entry.id + '/status',
    { status, reviewNote, version: entry.version });
  return data.item;
}

export async function deleteEntry(entry: LearningMediaRecord) {
  await api.delete(base + '/' + entry.id, { data: { version: entry.version, confirm: true } });
}

export async function assetChoices(params: { q: string; kind: MediaKind; status: AssetStatus; page: number; pageSize: number }, signal: AbortSignal) {
  const { data } = await api.get<Page<Asset>>(base + '/assets', { params, signal });
  return data;
}

export async function selectedAsset(id: string, signal: AbortSignal) {
  const { data } = await api.get<{ item: Asset }>(base + '/assets/' + id, { signal });
  return data.item;
}

export async function publicTaxonomy(kind: 'categories' | 'languages', signal: AbortSignal) {
  const items: EducationRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await api.get<Page<EducationRecord>>('/education/' + kind, { params: { page, pageSize: 50 }, signal });
    items.push(...data.items);
    if (items.length >= data.total || !data.items.length) return items;
  }
}

export function entryPath({ kind, slug }: LearningMediaRecord) {
  return (kind === 'short' ? '/shorts/' : kind === 'video' ? '/videos/' : '/ai-learning/') + slug;
}

export function entryError(error: unknown, fallback = 'failure') {
  const code = authError(error);
  const status = authStatus(error);
  if (status === 401) return 'sessionEnded';
  if (code === 'DRAFT_MEDIA_FORBIDDEN') return 'draftAccess';
  if (status === 403) return 'noAccess';
  if (status === 404) return 'missing';
  switch (code) {
    case 'INVALID_INPUT': return 'invalid';
    case 'CONFLICT': return 'duplicate';
    case 'STALE_VERSION': return 'stale';
    case 'INVALID_REFERENCE': return 'invalidReference';
    case 'INVALID_TRANSITION': return 'invalidTransition';
    case 'INVALID_SHORT': return 'invalidFormat';
    case 'REVIEW_REQUIRED': return 'needReview';
    case 'INCOMPLETE_CONTENT': return 'incomplete';
    default: return fallback;
  }
}
