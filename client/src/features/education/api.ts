import axios from 'axios';
import { authError, authStatus } from '../auth/api';

export const kinds = ['categories', 'subjects', 'levels', 'grades', 'languages', 'tags'] as const;
export type Kind = typeof kinds[number];

export const statuses = ['draft', 'educational-review', 'translation-review', 'approved', 'published', 'archived'] as const;
export type Status = typeof statuses[number];

export const statusTransitions: Record<Status, Status[]> = {
  draft: ['educational-review'],
  'educational-review': ['draft', 'translation-review', 'approved'],
  'translation-review': ['draft', 'approved'],
  approved: ['draft', 'published'],
  published: ['archived'],
  archived: ['draft'],
};

export const canEdit = (status: Status) => status === 'draft' || status === 'educational-review' || status === 'translation-review';
export const canDelete = (status: Status) => status === 'draft' || status === 'archived';

export interface Translation { locale: string; name: string; description: string }
export interface EducationInput {
  slug: string;
  categoryId?: string | null;
  gradeNumber?: number;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  translations: Translation[];
}
export interface EducationRecord extends EducationInput {
  id: string;
  status: Status;
  version: number;
  updatedAt: string;
}
interface ListResponse { items: EducationRecord[]; total: number; page: number; pageSize: number }
interface SummaryRow { kind: Kind; total: number; published: number }
interface ListOptions { q?: string; status?: Status; page?: number; pageSize?: number }

const service = axios.create({ baseURL: '/api/v1/admin/education', timeout: 12000 });

export async function listEducation(kind: Kind, options: ListOptions, signal: AbortSignal) {
  const { data } = await service.get<ListResponse>('/' + kind, { params: options, signal });
  return data;
}

export async function educationSummary(signal: AbortSignal) {
  const { data } = await service.get<{ items: SummaryRow[] }>('/summary', { signal });
  return data.items;
}

export async function getEducation(kind: Kind, id: string, signal: AbortSignal) {
  const { data } = await service.get<{ item: EducationRecord }>(`/${kind}/${id}`, { signal });
  return data.item;
}

export async function loadChoices(kind: 'categories' | 'languages', signal: AbortSignal) {
  const records: EducationRecord[] = [];
  let page = 1;
  for (;;) {
    const result = await listEducation(kind, { page: page++, pageSize: 50 }, signal);
    records.push(...result.items);
    if (records.length >= result.total || !result.items.length) return records;
  }
}

export async function saveEducation(kind: Kind, input: EducationInput, record?: EducationRecord) {
  const result = record
    ? await service.put<{ item: EducationRecord }>(`/${kind}/${record.id}`, { ...input, version: record.version })
    : await service.post<{ item: EducationRecord }>('/' + kind, input);
  return result.data.item;
}

export async function setEducationStatus(kind: Kind, record: EducationRecord, status: Status) {
  const { data } = await service.patch<{ item: EducationRecord }>(`/${kind}/${record.id}/status`, { status, version: record.version });
  return data.item;
}

export async function deleteEducation(kind: Kind, record: EducationRecord) {
  await service.delete(`/${kind}/${record.id}`, { data: { version: record.version } });
}

export function educationError(error: unknown, fallback: string) {
  const status = authStatus(error);
  if (status === 401) return 'sessionExpired';
  if (status === 403) return 'noAccess';
  switch (authError(error)) {
    case 'INVALID_INPUT': return 'invalid';
    case 'CONFLICT': return fallback === 'deleteFailed' ? 'inUse' : 'duplicate';
    case 'INVALID_REFERENCE': return 'invalidReference';
    case 'INVALID_TRANSITION': return 'invalidTransition';
    case 'STALE_VERSION': return 'stale';
    case 'NOT_FOUND': return 'missing';
    default: return fallback;
  }
}

export function educationPath(kind?: Kind) {
  return '/admin/education' + (kind ? '/' + kind : '');
}

export function localeName(locale: string, interfaceLanguage: string) {
  return new Intl.DisplayNames(interfaceLanguage, { type: 'language' }).of(locale) || locale;
}

export function preferredName(record: EducationRecord, interfaceLanguage: string) {
  return record.translations.find(item => item.locale === interfaceLanguage) ??
    record.translations.find(item => item.locale === 'en') ?? record.translations[0];
}
