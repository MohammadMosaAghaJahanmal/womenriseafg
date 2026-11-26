import type { EducationStatus } from '../education/contract';

export const discoveryManagePermission = 'discovery:manage';
export const discoveryPublishPermission = 'discovery:publish';
export const activityKinds = ['course', 'lesson', 'video', 'short', 'book', 'quiz'] as const;
export const discoverableKinds = [...activityKinds, 'ai', 'subject', 'category', 'path'] as const;
export const dailyModes = ['automatic', 'curated', 'off'] as const;

export type ActivityKind = (typeof activityKinds)[number];
export type DiscoverableKind = (typeof discoverableKinds)[number];
export type DailyMode = (typeof dailyModes)[number];
export type DiscoveryErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STALE_VERSION' | 'INVALID_TRANSITION' | 'INVALID_REFERENCE' | 'INCOMPLETE_PATH';

export class DiscoveryError extends Error {
  constructor(readonly code: DiscoveryErrorCode) { super(code); }
}

export interface Translation {
  locale: string;
  title: string;
  description: string;
}

export interface Reference {
  kind: ActivityKind;
  id: string;
}

export interface SearchEntry extends Translation {
  kind: DiscoverableKind;
  id: string;
  href: string;
}

export interface SearchQuery {
  q: string;
  kind?: DiscoverableKind;
  language?: string;
  subjectId?: string;
  categoryId?: string;
  levelId?: string;
  gradeId?: string;
  page: number;
  pageSize: number;
}

export interface PathInput {
  slug: string;
  subjectId: string | null;
  levelId: string | null;
  translations: Translation[];
  activities: Reference[];
}

export interface EditorialPath {
  id: string;
  slug: string;
  subjectId: string | null;
  levelId: string | null;
  status: EducationStatus;
  version: number;
  updatedAt: string;
  translations: Translation[];
  activities: { reference: Reference; activity: SearchEntry | null }[];
}

export interface PathListQuery {
  q: string;
  page: number;
  pageSize: number;
  status?: EducationStatus;
}

export interface DailySettings {
  mode: DailyMode;
  activities: Reference[];
  version: number;
}
