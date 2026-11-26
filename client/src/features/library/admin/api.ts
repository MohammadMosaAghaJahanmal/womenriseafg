import axios from 'axios';
import { authError, authStatus } from '../../auth/api';
import type { Page } from '../../courses/admin/api';
import type { EducationRecord, Status } from '../../education/api';
import type { MediaRecord } from '../../media/api';

export const bookAdminPath = '/admin/books';
export const bookManagePermission = 'book:manage';
export const bookPublishPermission = 'book:publish';

export interface BookTranslation {
  locale: string;
  title: string;
  description: string;
}

export interface BookInput {
  slug: string;
  pdfId: string | null;
  coverId: string | null;
  categoryId: string | null;
  levelId: string | null;
  gradeId: string | null;
  contentLanguage: string | null;
  author: string;
  publisher: string;
  publicationYear: number | null;
  edition: string;
  translations: BookTranslation[];
}

export interface BookRecord extends BookInput {
  id: string;
  status: Status;
  version: number;
  createdAt: string;
  updatedAt: string;
  reviewNote: string;
  reviewedAt: string | null;
  fileSizeBytes: number | null;
  downloadAllowed: boolean;
  license: string;
  source: string;
}

export type BookAssetKind = 'pdf' | 'image';
export type BookAssetStatus = 'draft' | 'published';
export type BookAsset = Pick<MediaRecord, 'id' | 'kind' | 'title' | 'originalName' | 'language' | 'status' | 'version' |
  'sizeBytes' | 'license' | 'source' | 'author' | 'downloadAllowed'>;

const api = axios.create({ baseURL: '/api/v1', timeout: 12_000 });

export async function listBooks(params: {
  q: string; page: number; pageSize: number; status?: Status; categoryId?: string; levelId?: string; language?: string;
}, signal: AbortSignal) {
  const { data } = await api.get<Page<BookRecord>>(bookAdminPath, { params, signal });
  return data;
}

export async function readBook(id: string, signal: AbortSignal) {
  const { data } = await api.get<{ item: BookRecord }>(bookAdminPath + '/' + id, { signal });
  return data.item;
}

export async function saveBook(input: BookInput, record?: BookRecord) {
  const { data } = record
    ? await api.put<{ item: BookRecord }>(bookAdminPath + '/' + record.id, { ...input, version: record.version })
    : await api.post<{ item: BookRecord }>(bookAdminPath, input);
  return data.item;
}

export async function changeBookStatus(record: BookRecord, status: Status, reviewNote = '') {
  const { data } = await api.patch<{ item: BookRecord }>(bookAdminPath + '/' + record.id + '/status',
    { status, reviewNote, version: record.version });
  return data.item;
}

export async function deleteBook(record: BookRecord) {
  await api.delete(bookAdminPath + '/' + record.id, { data: { version: record.version, confirm: true } });
}

export async function listBookAssets(params: { q: string; kind: BookAssetKind; status: BookAssetStatus; page: number; pageSize: number },
  signal: AbortSignal) {
  const { data } = await api.get<Page<BookAsset>>(bookAdminPath + '/assets', { params, signal });
  return data;
}

export async function readBookAsset(id: string, signal: AbortSignal) {
  const { data } = await api.get<{ item: BookAsset }>(bookAdminPath + '/assets/' + id, { signal });
  return data.item;
}

export async function bookTaxonomy(kind: 'categories' | 'levels' | 'languages' | 'grades', signal: AbortSignal) {
  const records: EducationRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await api.get<Page<EducationRecord>>('/education/' + kind, { params: { page, pageSize: 50 }, signal });
    records.push(...data.items);
    if (records.length >= data.total || !data.items.length) return records;
  }
}

export function bookError(error: unknown, fallback = 'failure') {
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
    case 'REVIEW_REQUIRED': return 'needReview';
    case 'INCOMPLETE_CONTENT': return 'incomplete';
    case 'FILES_UNPUBLISHED': return 'filesUnpublished';
    default: return fallback;
  }
}
