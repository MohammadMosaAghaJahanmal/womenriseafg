import axios from 'axios';
import { authError } from '../auth/api';
import type { EducationRecord, Kind, Status } from '../education/api';

export const activityKinds = ['course', 'lesson', 'video', 'short', 'book', 'quiz'] as const;
export const resultKinds = [...activityKinds, 'ai', 'subject', 'category', 'path'] as const;
export const dailyModes = ['automatic', 'curated', 'off'] as const;
export type ActivityKind = typeof activityKinds[number];
export type ResultKind = typeof resultKinds[number];
export type DailyMode = typeof dailyModes[number];
export interface DiscoveryText { locale: string; title: string; description: string }
export interface SearchEntry extends DiscoveryText { kind: ResultKind; id: string; href: string }
export interface ActivityReference { kind: ActivityKind; id: string }
export interface PathActivity { reference: ActivityReference; activity: SearchEntry | null }
export interface PathInput {
  slug: string; subjectId: string | null; levelId: string | null; translations: DiscoveryText[]; activities: ActivityReference[];
}
export interface PathRecord extends Omit<PathInput, 'activities'> {
  id: string; status: Status; version: number; updatedAt: string; activities: PathActivity[];
}
export type PathSummary = Omit<PathRecord, 'activities'> & { activityCount: number };
export interface PublicPath { id: string; slug: string; translations: DiscoveryText[]; activities: SearchEntry[] }
export interface DailySettings { mode: DailyMode; activities: ActivityReference[]; version: number }
export interface DailyActivity { date: string; item: SearchEntry | null }
interface List<T> { items: T[]; total: number; page: number; pageSize: number }
export interface SearchFilters {
  q?: string; kind?: ResultKind; language?: string; subjectId?: string; categoryId?: string;
  levelId?: string; gradeId?: string; page?: number; pageSize?: number;
}

const service = axios.create({ baseURL: '/api/v1', timeout: 12000 });
const admin = '/admin/discovery';

export async function searchContent(filters: SearchFilters, signal: AbortSignal) {
  const { data } = await service.get<List<SearchEntry>>('/search', { params: filters, signal });
  return data;
}

export async function searchSuggestions(q: string, language: string | undefined, signal: AbortSignal) {
  const { data } = await service.get<{ items: SearchEntry[] }>('/search/suggestions', { params: { q, language }, signal });
  return data.items;
}

export async function loadPaths(q: string, page: number, language: string | undefined, signal: AbortSignal) {
  const { data } = await service.get<List<SearchEntry>>('/learning-paths', { params: { q, page, language }, signal });
  return data;
}

export async function pathDetails(slug: string, language: string | undefined, signal: AbortSignal) {
  const { data } = await service.get<{ item: PublicPath }>('/learning-paths/' + encodeURIComponent(slug), { params: { language }, signal });
  return data.item;
}

export async function dailyActivity(language: string | undefined, signal: AbortSignal) {
  const { data } = await service.get<DailyActivity>('/daily-learning', { params: { language }, signal });
  return data;
}

export async function relatedLearning(kind: ResultKind, id: string, language: string, signal: AbortSignal) {
  const { data } = await service.get<{ items: SearchEntry[] }>(`/recommendations/${kind}/${encodeURIComponent(id)}`,
    { params: { language }, signal });
  return data.items;
}

export async function publishedTaxonomy(kind: Kind, signal: AbortSignal) {
  const records: EducationRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await service.get<List<EducationRecord>>('/education/' + kind, { params: { page, pageSize: 50 }, signal });
    records.push(...data.items);
    if (!data.items.length || records.length >= data.total) return records;
  }
}

export async function adminPaths(q: string, status: Status | '', page: number, signal: AbortSignal) {
  const { data } = await service.get<List<PathSummary>>(admin + '/paths', { params: { q, status: status || undefined, page }, signal });
  return data;
}

export async function adminPath(id: string, signal: AbortSignal) {
  const { data } = await service.get<{ item: PathRecord }>(admin + '/paths/' + encodeURIComponent(id), { signal });
  return data.item;
}

export async function savePath(input: PathInput, current?: PathRecord) {
  const result = current
    ? await service.put<{ item: PathRecord }>(admin + '/paths/' + current.id, { ...input, version: current.version })
    : await service.post<{ item: PathRecord }>(admin + '/paths', input);
  return result.data.item;
}

export async function pathStatus(current: PathRecord, status: Status) {
  const { data } = await service.patch<{ item: PathRecord }>(admin + '/paths/' + current.id + '/status', { version: current.version, status });
  return data.item;
}

export async function deletePath(current: PathRecord) {
  await service.delete(admin + '/paths/' + current.id, { data: { version: current.version, confirm: true } });
}

export async function readDailySettings(signal: AbortSignal) {
  const { data } = await service.get<{ settings: DailySettings; previews: (SearchEntry | null)[] }>(admin + '/daily-learning', { signal });
  return data;
}

export async function saveDailySettings(settings: DailySettings) {
  const { data } = await service.put<{ settings: DailySettings }>(admin + '/daily-learning', settings);
  return data.settings;
}

export function editError(error: unknown): string {
  switch (authError(error)) {
    case 'STALE_VERSION': return 'stale';
    case 'INVALID_INPUT': return 'invalid';
    case 'INVALID_TRANSITION': return 'transition';
    case 'INVALID_REFERENCE': return 'reference';
    case 'INCOMPLETE_PATH': return 'incomplete';
    case 'CONFLICT': return 'conflict';
    case 'FORBIDDEN': case 'AUTH_REQUIRED': return 'permission';
    default: return 'failed';
  }
}
