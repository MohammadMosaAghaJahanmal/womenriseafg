import type { EducationStatus } from '../education/contract';
import type { MediaKind } from '../media/contract';

export const learningMediaManagePermission = 'learning-media:manage';
export const learningMediaPublishPermission = 'learning-media:publish';
export const learningMediaKinds = ['video', 'short', 'resource'] as const;
export const aiOrigins = ['human', 'ai-assisted', 'ai-generated'] as const;
export const aiResourceKinds: readonly MediaKind[] = ['image', 'audio', 'pdf', 'transcript', 'subtitle'];
export type LearningMediaKind = typeof learningMediaKinds[number];
export type AiOrigin = typeof aiOrigins[number];

export interface LearningMediaTranslation {
  locale: string;
  title: string;
  description: string;
  imageAlt?: string | null;
}

export interface LearningMediaInput {
  slug: string;
  kind: LearningMediaKind;
  mediaId: string | null;
  categoryId: string | null;
  relatedCourseId: string | null;
  relatedLessonId: string | null;
  aiOrigin: AiOrigin;
  aiTool: string;
  aiNotes: string;
  translations: LearningMediaTranslation[];
}

export interface LearningMediaRecord extends LearningMediaInput {
  id: string;
  status: EducationStatus;
  version: number;
  updatedAt: string;
  createdAt: string;
  thumbnailId: string | null;
  durationMs: number | null;
  relatedCourseSlug: string | null;
  reviewNote: string;
  reviewedAt: string | null;
}

export interface LearningMediaListOptions {
  q: string;
  page: number;
  pageSize: number;
  publicOnly?: boolean;
  kind?: LearningMediaKind;
  aiOnly?: boolean;
  categoryId?: string;
  language?: string;
  status?: EducationStatus;
}

export interface LearningMediaRelated {
  course: { slug: string; translations: Omit<LearningMediaTranslation, 'description'>[] } | null;
  lesson: { slug: string; translations: Omit<LearningMediaTranslation, 'description'>[] } | null;
}

export type LearningMediaErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STALE_VERSION' | 'INVALID_TRANSITION' |
  'INVALID_REFERENCE' | 'INVALID_SHORT' | 'REVIEW_REQUIRED' | 'INCOMPLETE_CONTENT' | 'DRAFT_MEDIA_FORBIDDEN' | 'MISSING_IMAGE_ALT';

export class LearningMediaError extends Error {
  constructor(readonly code: LearningMediaErrorCode) {
    super(code);
  }
}
