import type { EducationStatus } from '../education/contract';

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
  status: EducationStatus;
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

export interface BookListOptions {
  q: string;
  page: number;
  pageSize: number;
  publicOnly?: boolean;
  categoryId?: string;
  levelId?: string;
  language?: string;
  status?: EducationStatus;
}

export type BookErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STALE_VERSION' | 'INVALID_TRANSITION' |
  'INVALID_REFERENCE' | 'REVIEW_REQUIRED' | 'INCOMPLETE_CONTENT' | 'DRAFT_MEDIA_FORBIDDEN' | 'FILES_UNPUBLISHED';

export class BookError extends Error {
  constructor(readonly code: BookErrorCode) {
    super(code);
  }
}
