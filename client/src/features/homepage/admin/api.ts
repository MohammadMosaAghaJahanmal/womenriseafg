import axios from 'axios';
import type { Language } from '../../../i18n';
import type { Theme } from '../../../preferences';
import { authError, authStatus } from '../../auth/api';
import { searchContent } from '../../discovery/api';
import type { Page } from '../../quizzes/api';

export const homepageAdminPath = '/admin/homepage';
export const homepageSectionKeys = [
  'announcements', 'continue', 'subjects', 'featured', 'popular', 'recommendedCourses', 'videos', 'shorts',
  'books', 'ai', 'paths', 'daily', 'recent', 'mission',
] as const;

export type SectionKey = typeof homepageSectionKeys[number];
export type HomepageSection = { key: SectionKey; enabled: boolean };
export type BrandingTranslation = { locale: Language; slogan: string; mission: string };
export type Branding = {
  name: string;
  logoId: string | null;
  faviconId: string | null;
  defaultTheme?: Theme;
  translations: BrandingTranslation[];
};
export type AnnouncementTranslation = { locale: Language; title: string; body: string };
export type Announcement = { enabled: boolean; translations: AnnouncementTranslation[] };
export type SelectedChoice = { id: string; title: string; locale?: string | null };
export type HomepageSelections = { featuredCourses: SelectedChoice[]; recommendedBooks: SelectedChoice[] };
export type HomepageSettings = {
  version: number;
  branding: Branding;
  sections: HomepageSection[];
  featuredCourseIds: string[];
  recommendedBookIds: string[];
  announcements: Announcement[];
};
export type HomepageSettingsResponse = { settings: HomepageSettings; selected?: HomepageSelections };

const api = axios.create({ baseURL: '/api/v1/admin/homepage', timeout: 12_000 });

export async function loadHomepageSettings(signal: AbortSignal) {
  const { data } = await api.get<HomepageSettingsResponse>('', { signal });
  return data;
}

export async function saveHomepageSettings(settings: HomepageSettings, signal: AbortSignal) {
  const { data } = await api.put<HomepageSettingsResponse>('', settings, { signal });
  return data;
}

export async function searchBrandingImages(q: string, page: number, signal: AbortSignal) {
  const { data } = await api.get<Page<SelectedChoice>>('/images', { params: { q, page, pageSize: 12 }, signal });
  return { ...data, items: data.items.map(choice => ({ ...choice, locale: choice.locale ?? undefined })) };
}

export async function searchPublishedChoices(kind: 'course' | 'book', q: string, page: number, signal: AbortSignal) {
  const data = await searchContent({ kind, q, page, pageSize: 12 }, signal);
  return { ...data, items: data.items.map(({ id, title, locale }) => ({ id, title, locale })) };
}

export function homepageSettingsError(error: unknown, fallback: 'loadError' | 'saveError') {
  const status = authStatus(error);
  const code = authError(error);
  if (status === 401) return 'sessionExpired';
  if (status === 403) return 'noPermission';
  if (status === 409 || code === 'STALE_VERSION') return 'stale';
  if (code === 'INVALID_REFERENCE') return 'invalidReference';
  if (status === 400 || status === 422) return 'invalid';
  return fallback;
}
