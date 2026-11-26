export const educationKinds = ['categories', 'subjects', 'levels', 'grades', 'languages', 'tags'] as const;
export const educationStatuses = ['draft', 'educational-review', 'translation-review', 'approved', 'published', 'archived'] as const;
export type EducationKind = typeof educationKinds[number];
export type EducationStatus = typeof educationStatuses[number];

export const educationManagePermission = 'education:manage';
export const educationPublishPermission = 'education:publish';

export interface EducationInput {
  slug: string;
  categoryId?: string | null;
  gradeNumber?: number | null;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  translations: { locale: string; name: string; description: string }[];
}

export interface EducationRecord extends EducationInput {
  id: string;
  status: EducationStatus;
  version: number;
  updatedAt: string;
}

export interface EducationListOptions {
  search: string;
  status?: EducationStatus;
  page: number;
  pageSize: number;
  publicOnly?: boolean;
}

export type EducationErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'INVALID_REFERENCE' | 'INVALID_TRANSITION' | 'STALE_VERSION';

export class EducationError extends Error {
  constructor(readonly code: EducationErrorCode) {
    super(code);
  }
}

const transitions: Record<EducationStatus, readonly EducationStatus[]> = {
  draft: ['educational-review'],
  'educational-review': ['draft', 'translation-review', 'approved'],
  'translation-review': ['draft', 'approved'],
  approved: ['draft', 'published'],
  published: ['archived'],
  archived: ['draft'],
};

export function transitionAllowed(from: EducationStatus, to: EducationStatus) {
  return transitions[from].includes(to);
}
