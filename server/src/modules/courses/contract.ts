import type { EducationStatus } from '../education/contract';
import type { ContentProvenance } from './provenance';

export const courseManagePermission = 'course:manage';
export const coursePublishPermission = 'course:publish';
export const lessonKinds = ['text', 'video', 'audio', 'pdf', 'image', 'quiz'] as const;
export type LessonKind = typeof lessonKinds[number];
export type CourseStatus = EducationStatus;

export interface ChapterTranslation {
  locale: string;
  title: string;
}
export interface CourseTranslation extends ChapterTranslation {
  description: string;
  objectives: string;
  prerequisites: string;
  provenance?: ContentProvenance | null;
}
export interface LessonTranslation extends ChapterTranslation {
  description: string;
  body: string;
  imageAlt?: string;
  provenance?: ContentProvenance | null;
}
export interface LessonResource {
  mediaId: string;
  label: string;
}
export interface LessonInput {
  id?: string;
  slug: string;
  kind: LessonKind;
  mediaId: string | null;
  quizId?: string | null;
  translations: LessonTranslation[];
  resources: LessonResource[];
}
export interface ChapterInput {
  id?: string;
  translations: ChapterTranslation[];
  lessons: LessonInput[];
}
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
export interface LessonRecord extends LessonInput { id: string }
export interface ChapterRecord extends ChapterInput { id: string; lessons: LessonRecord[] }
export interface CourseRecord extends CourseInput {
  id: string;
  status: CourseStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  chapters: ChapterRecord[];
}
export interface CourseSummary extends Omit<CourseInput, 'chapters' | 'tagIds' | 'relatedCourseIds'> {
  id: string;
  status: CourseStatus;
  lessonCount: number;
  updatedAt: string;
}
export interface CourseListOptions {
  q: string;
  language?: string;
  subjectId?: string;
  levelId?: string;
  status?: CourseStatus;
  page: number;
  pageSize: number;
  publicOnly?: boolean;
}
export type CourseErrorCode =
  'NOT_FOUND' | 'CONFLICT' | 'STALE_VERSION' | 'INVALID_REFERENCE' | 'INVALID_TRANSITION' |
  'INCOMPLETE_COURSE' | 'RESOURCE_DOWNLOAD_FORBIDDEN' | 'INCOMPLETE_PROVENANCE';
export class CourseError extends Error {
  constructor(readonly code: CourseErrorCode) { super(code); }
}
