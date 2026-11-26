import axios from 'axios';
import type { PublicMedia } from '../../courses/student/api';
import type { EducationRecord } from '../../education/api';

export type Collection = 'videos' | 'shorts' | 'ai-learning';
export type MediaKind = 'video' | 'short' | 'resource';
export type Origin = 'human' | 'ai-assisted' | 'ai-generated';
export type Translation = { locale: string; title: string; description: string };

export interface LearningItem {
  id: string;
  slug: string;
  kind: MediaKind;
  categoryId: string | null;
  thumbnailId: string | null;
  durationMs: number | null;
  aiOrigin: Origin;
  aiTool: string;
  translations: Translation[];
}

export interface StudyMedia extends PublicMedia {
  author: string;
  license: string;
  source: string;
  language: string | null;
}

interface RelatedTitle {
  slug: string;
  translations: Pick<Translation, 'locale' | 'title'>[];
}

export interface LearningDetail {
  item: LearningItem;
  media: StudyMedia;
  related: { course: RelatedTitle | null; lesson: RelatedTitle | null };
}

interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface CatalogQuery { q: string; language: string; categoryId: string; page: number }

const api = axios.create({ baseURL: '/api/v1', timeout: 12_000 });

export async function listLearning(collection: Collection, query: CatalogQuery, signal: AbortSignal, pageSize = 12) {
  const { q, language, categoryId, page } = query;
  const { data } = await api.get<Page<LearningItem>>('/' + collection, {
    params: { q: q || undefined, language: language || undefined, categoryId: categoryId || undefined, page, pageSize }, signal,
  });
  return data;
}

export async function readLearning(collection: Collection, slug: string, signal: AbortSignal) {
  const { data } = await api.get<LearningDetail>('/' + collection + '/' + encodeURIComponent(slug), { signal });
  return data;
}

export async function loadTaxonomy(kind: 'categories' | 'languages', signal: AbortSignal) {
  const entries: EducationRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await api.get<Page<EducationRecord>>('/education/' + kind, { params: { page, pageSize: 50 }, signal });
    entries.push(...data.items);
    if (!data.items.length || entries.length >= data.total) return entries;
  }
}

export async function loadFacets(signal: AbortSignal) {
  const [categories, languages] = await Promise.all([
    loadTaxonomy('categories', signal), loadTaxonomy('languages', signal),
  ]);
  return { categories, languages };
}

export function loadCategories(signal: AbortSignal) {
  return loadTaxonomy('categories', signal);
}
