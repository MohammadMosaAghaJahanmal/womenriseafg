import axios, { isAxiosError } from 'axios';
import type { EducationRecord } from '../../education/api';

export interface BookTranslation {
  locale: string;
  title: string;
  description: string;
}

export interface PublicBook {
  id: string;
  slug: string;
  coverId: string | null;
  categoryId: string | null;
  levelId: string | null;
  gradeId: string | null;
  contentLanguage: string;
  author: string;
  publisher: string;
  publicationYear: number | null;
  edition: string;
  fileSizeBytes: number | null;
  downloadAllowed: boolean;
  license: string;
  source: string;
  translations: BookTranslation[];
  updatedAt: string;
}

interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface BooksQuery { q: string; categoryId: string; levelId: string; language: string; page: number }

const api = axios.create({ baseURL: '/api/v1', timeout: 12_000 });

export async function listBooks({ q, categoryId, levelId, language, page }: BooksQuery, signal: AbortSignal) {
  const { data } = await api.get<Page<PublicBook>>('/books', {
    params: { q: q || undefined, categoryId: categoryId || undefined, levelId: levelId || undefined,
      language: language || undefined, page, pageSize: 12 },
    signal,
  });
  return data;
}

export async function readBook(slug: string, signal: AbortSignal) {
  const { data } = await api.get<{ item: PublicBook }>('/books/' + encodeURIComponent(slug), { signal });
  return data.item;
}

async function readTaxonomy(kind: 'categories' | 'levels' | 'grades' | 'languages', signal: AbortSignal) {
  const items: EducationRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await api.get<Page<EducationRecord>>('/education/' + kind, {
      params: { page, pageSize: 50 }, signal,
    });
    items.push(...data.items);
    if (!data.items.length || items.length >= data.total) return items;
  }
}

export async function catalogFacets(signal: AbortSignal) {
  const [categories, levels, languages] = await Promise.all([
    readTaxonomy('categories', signal), readTaxonomy('levels', signal), readTaxonomy('languages', signal),
  ]);
  return { categories, levels, languages };
}

export async function bookTaxonomy(signal: AbortSignal) {
  const [categories, levels, grades] = await Promise.all([
    readTaxonomy('categories', signal), readTaxonomy('levels', signal), readTaxonomy('grades', signal),
  ]);
  return { categories, levels, grades };
}

export function unavailableBook(error: unknown) {
  return isAxiosError(error) && [400, 404].includes(error.response?.status ?? 0);
}

export function bookPath(slug: string, read = false, language?: string) {
  const path = '/library/' + encodeURIComponent(slug) + (read ? '/read' : '');
  return language ? path + '?' + new URLSearchParams({ lang: language }) : path;
}

export function bookFile(slug: string, download = false) {
  return '/api/v1/books/' + encodeURIComponent(slug) + '/file' + (download ? '?download=true' : '');
}
