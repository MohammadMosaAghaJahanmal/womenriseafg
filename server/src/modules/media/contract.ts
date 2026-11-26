export const mediaKinds = ['video', 'audio', 'image', 'pdf', 'subtitle', 'transcript', 'attachment'] as const;
export const mediaStatuses = ['draft', 'published', 'archived'] as const;
export const mediaRelations = ['thumbnail', 'video-variant', 'audio', 'subtitle', 'transcript'] as const;
export const videoQualities = ['144p', '240p', '360p', '480p', '720p', '1080p'] as const;
export type MediaKind = typeof mediaKinds[number];
export type MediaStatus = typeof mediaStatuses[number];
export type MediaRelation = typeof mediaRelations[number];

export const mediaManagePermission = 'media:manage';
export const mediaPublishPermission = 'media:publish';
export const learningMediaReviewOwner = 'learning-media-review';
export const bookReviewOwner = 'book-review';

export interface MediaMetadata {
  title: string;
  license: string;
  source: string;
  author: string;
  language: string | null;
  downloadAllowed: boolean;
}

export interface StoredFile {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface MediaLink {
  relation: MediaRelation;
  slot: string;
  assetId: string;
}

export interface MediaAsset extends MediaMetadata, StoredFile {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  links: MediaLink[];
}

export interface MediaListOptions {
  q: string;
  kind?: MediaKind;
  status?: MediaStatus;
  page: number;
  pageSize: number;
  orphans?: boolean;
}

export type MediaErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STALE_VERSION' | 'INVALID_LINK' | 'PENDING_LEARNING_REVIEW' |
  'INVALID_TRANSITION' | 'INVALID_REFERENCE' | 'INVALID_FILE' | 'UPLOAD_TOO_LARGE' | 'STORAGE_UNAVAILABLE';

export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode) {
    super(code);
  }
}

export function canonicalMediaLocale(value: string): string | undefined {
  try {
    const locale = new Intl.Locale(value);
    if (locale.toString() === locale.baseName && locale.baseName.length <= 35) return locale.baseName;
  } catch {
    // Invalid locale syntax is reported by the caller.
  }
}

export function isValidMediaSlot(relation: MediaRelation, slot: string) {
  if (relation === 'thumbnail') return slot === 'default';
  if (relation === 'video-variant') return videoQualities.some(quality => quality === slot);
  if (slot === 'default') return relation !== 'subtitle';
  return canonicalMediaLocale(slot) === slot;
}
