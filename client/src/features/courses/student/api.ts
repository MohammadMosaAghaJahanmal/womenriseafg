import axios, { isAxiosError } from 'axios';
import type { EducationRecord } from '../../education/api';
import type { MediaKind, MediaLink } from '../../media/api';
import type { PublicProvenance } from '../Provenance';

type Translation = { locale: string; title: string };
type Description = Translation & { description: string };
type CourseTranslation = Description & { objectives: string; prerequisites: string; provenance?: PublicProvenance | null };
export type LessonKind = 'text' | 'video' | 'audio' | 'pdf' | 'image' | 'quiz';

export interface LessonReference {
  id: string;
  slug: string;
  kind: LessonKind;
  translations: Description[];
  resourceLabels?: string[];
}

export interface CourseChapter {
  id: string;
  translations: Translation[];
  lessons: LessonReference[];
}

export interface CourseSummary {
  id: string;
  slug: string;
  subjectId: string | null;
  levelId: string | null;
  gradeId: string | null;
  thumbnailId: string | null;
  estimatedMinutes: number | null;
  instructor: string;
  translations: CourseTranslation[];
  lessonCount: number;
}

export interface PublicCourse extends CourseSummary {
  chapters: CourseChapter[];
  provenance?: PublicProvenance | null;
}

export interface PublicMedia {
  id: string;
  kind: MediaKind;
  title: string;
  mimeType: string;
  downloadAllowed: boolean;
  sizeBytes?: number;
  links: MediaLink[];
}

interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface CourseOptions {
  q: string;
  language: string;
  subjectId: string;
  levelId: string;
  page: number;
}

export interface LessonResponse {
  course: PublicCourse;
  lesson: Omit<LessonReference, 'translations'> & {
    translations: (Description & { body: string; imageAlt?: string; provenance?: PublicProvenance | null })[];
    mediaId: string | null;
    quizSlug?: string | null;
  };
  previous: string | null;
  next: string | null;
  media: PublicMedia | null;
  resources: { mediaId: string; label: string; media: PublicMedia }[];
}

const api = axios.create({ baseURL: '/api/v1', timeout: 12_000 });

export async function listCourses(options: CourseOptions, signal: AbortSignal) {
  const { q, language, subjectId, levelId, page } = options;
  const { data } = await api.get<ListResponse<CourseSummary>>('/courses', {
    params: { q: q || undefined, language: language || undefined, subjectId: subjectId || undefined,
      levelId: levelId || undefined, page, pageSize: 12 }, signal,
  });
  return data;
}

export async function findCourse(slug: string, signal: AbortSignal) {
  const { data } = await api.get<{ course: PublicCourse; related: CourseSummary[] }>(
    `/courses/${encodeURIComponent(slug)}`, { signal });
  return data;
}

export async function findLesson(course: string, lesson: string, signal: AbortSignal) {
  const { data } = await api.get<LessonResponse>(
    `/courses/${encodeURIComponent(course)}/lessons/${encodeURIComponent(lesson)}`, { signal });
  return data;
}

async function educationList(kind: 'subjects' | 'levels' | 'grades' | 'languages', signal: AbortSignal) {
  const items: EducationRecord[] = [];
  let page = 1;
  for (;;) {
    const { data } = await api.get<ListResponse<EducationRecord>>(`/education/${kind}`, {
      params: { page, pageSize: 50 }, signal,
    });
    items.push(...data.items);
    if (items.length >= data.total || !data.items.length) return items;
    page++;
  }
}

export async function loadCourseFacets(signal: AbortSignal) {
  const [subjects, levels, languages] = await Promise.all([
    educationList('subjects', signal), educationList('levels', signal), educationList('languages', signal),
  ]);
  return { subjects, levels, languages };
}

export async function loadCourseFacts(signal: AbortSignal) {
  const [subjects, levels, grades] = await Promise.all([
    educationList('subjects', signal), educationList('levels', signal), educationList('grades', signal),
  ]);
  return { subjects, levels, grades };
}

export function isMissing(error: unknown) {
  return isAxiosError(error) && [400, 404].includes(error.response?.status ?? 0);
}

const mediaPath = (id: string) => `/media/${encodeURIComponent(id)}/file`;
export function fileUrl(id: string, download = false) {
  return `/api/v1${mediaPath(id)}${download ? '?download=true' : ''}`;
}

export async function fetchTranscript(id: string, signal: AbortSignal) {
  const { data, headers, status } = await api.get<string>(mediaPath(id), {
    signal, headers: { Range: 'bytes=0-65535' }, responseType: 'text', transformResponse: value => value,
  });
  const bytes = /^bytes \d+-(\d+)\/(\d+)$/.exec(headers['content-range'] ?? '');
  return { text: data, truncated: status === 206 && bytes !== null && Number(bytes[1]) + 1 < Number(bytes[2]) };
}
