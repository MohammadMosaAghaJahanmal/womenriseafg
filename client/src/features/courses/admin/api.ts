import axios from 'axios';
import { authError, authStatus } from '../../auth/api';
import type { EducationRecord, Status } from '../../education/api';
import type { MediaKind, MediaRecord } from '../../media/api';
import type { ContentProvenance } from '../Provenance';

export const courseAdminPath = '/admin/courses';
export const lessonKinds = ['text', 'video', 'audio', 'pdf', 'image', 'quiz'] as const;
export type LessonKind = typeof lessonKinds[number];

export interface ChapterTranslation { locale: string; title: string }
export interface CourseTranslation extends ChapterTranslation {
  description: string;
  objectives: string;
  prerequisites: string;
  provenance?: ContentProvenance | null;
}
export interface LessonTranslation extends ChapterTranslation {
  description: string; body: string; imageAlt?: string; provenance?: ContentProvenance | null;
}
export interface LessonResource { mediaId: string; label: string }
export interface LessonInput {
  id?: string;
  slug: string;
  kind: LessonKind;
  mediaId: string | null;
  quizId?: string | null;
  translations: LessonTranslation[];
  resources: LessonResource[];
}
export interface ChapterInput { id?: string; translations: ChapterTranslation[]; lessons: LessonInput[] }
export interface CourseInput {
  slug: string;
  subjectId: string | null;
  levelId: string | null;
  gradeId: string | null;
  thumbnailId: string | null;
  estimatedMinutes: number | null;
  instructor: string;
  provenance?: ContentProvenance | null;
  tagIds: string[];
  relatedCourseIds: string[];
  translations: CourseTranslation[];
  chapters: ChapterInput[];
}
export interface CourseRecord extends CourseInput {
  id: string;
  status: Status;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface CourseSummary extends Omit<CourseInput, 'chapters' | 'tagIds' | 'relatedCourseIds'> {
  id: string;
  status: Status;
  lessonCount: number;
  updatedAt: string;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export type CourseAsset = Pick<MediaRecord, 'id' | 'title' | 'kind' | 'language' | 'originalName'>;
export const taxonomyKinds = ['subjects', 'levels', 'grades', 'tags', 'languages'] as const;
export type CourseTaxonomy = Record<typeof taxonomyKinds[number], EducationRecord[]>;

const service = axios.create({ baseURL: '/api/v1', timeout: 12_000 });
const base = courseAdminPath;

export async function listCourses(params: { q?: string; status?: Status; page: number; pageSize: number }, signal: AbortSignal) {
  const { data } = await service.get<Page<CourseSummary>>(base, { params, signal });
  return data;
}

export async function listCourseAssets(params: { q?: string; kind?: MediaKind; page: number; pageSize: number }, signal: AbortSignal) {
  const { data } = await service.get<Page<CourseAsset>>(base + '/assets', { params, signal });
  return data;
}

export async function getCourseAsset(id: string, signal: AbortSignal) {
  const { data } = await service.get<{ item: CourseAsset | null }>(base + '/assets/' + id, { signal });
  return data.item;
}

export async function getLessonQuizTitles(id: string, signal: AbortSignal) {
  const { data } = await service.get<{ titles: ChapterTranslation[] }>(base + '/quiz-options/' + id, { signal });
  return data.titles;
}

export async function getCourse(id: string, signal: AbortSignal) {
  const { data } = await service.get<{ item: CourseRecord }>(base + '/' + id, { signal });
  return data.item;
}

export async function saveCourse(input: CourseInput, record?: CourseRecord) {
  const result = record
    ? await service.put<{ item: CourseRecord }>(base + '/' + record.id, { ...input, version: record.version })
    : await service.post<{ item: CourseRecord }>(base, input);
  return result.data.item;
}

export async function changeCourseStatus(record: CourseRecord, status: Status) {
  const { data } = await service.patch<{ item: CourseRecord }>(base + '/' + record.id + '/status', { status, version: record.version });
  return data.item;
}

export async function deleteCourse(record: CourseRecord) {
  await service.delete(base + '/' + record.id, { data: { confirm: true, version: record.version } });
}

async function listTaxonomy(kind: typeof taxonomyKinds[number], signal: AbortSignal) {
  const all: EducationRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await service.get<Page<EducationRecord>>('/education/' + kind, { params: { page, pageSize: 50 }, signal });
    all.push(...data.items);
    if (all.length >= data.total || !data.items.length) return all;
  }
}

export async function loadTaxonomy(signal: AbortSignal): Promise<CourseTaxonomy> {
  const [subjects, levels, grades, tags, languages] = await Promise.all(taxonomyKinds.map(kind => listTaxonomy(kind, signal)));
  return { subjects, levels, grades, tags, languages };
}

export function courseError(error: unknown, fallback = 'error') {
  switch (authStatus(error)) {
    case 401: return 'sessionExpired';
    case 403: return 'noAccess';
    case 404: return 'missing';
    case 413: return 'courseTooLarge';
  }
  switch (authError(error)) {
    case 'INVALID_INPUT': return 'invalid';
    case 'CONFLICT': return 'duplicate';
    case 'STALE_VERSION': return 'stale';
    case 'INVALID_REFERENCE': return 'invalidReference';
    case 'INVALID_TRANSITION': return 'invalidTransition';
    case 'INCOMPLETE_COURSE': return 'incomplete';
    case 'INCOMPLETE_PROVENANCE': return 'incompleteProvenance';
    case 'RESOURCE_DOWNLOAD_FORBIDDEN': return 'resourceDownloadForbidden';
    default: return fallback;
  }
}

export function preferredTitle<T extends ChapterTranslation>(translations: T[], locale: string) {
  return translations.find(item => item.locale === locale && item.title.trim()) ??
    translations.find(item => item.locale === 'en' && item.title.trim()) ?? translations.find(item => item.title.trim());
}
