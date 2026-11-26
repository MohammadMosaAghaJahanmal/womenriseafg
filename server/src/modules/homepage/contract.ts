import type { DiscoverableKind } from '../discovery/contract';

export const homepageManagePermission = 'homepage:manage';
export const interfaceLocales = ['en', 'ps', 'fa-AF'] as const;
export type InterfaceLocale = (typeof interfaceLocales)[number];
export const sectionKeys = [
  'announcements', 'continue', 'subjects', 'featured', 'popular', 'recommendedCourses',
  'videos', 'shorts', 'books', 'ai', 'paths', 'daily', 'recent', 'mission',
] as const;
export type SectionKey = (typeof sectionKeys)[number];

export interface HomepageSection { key: SectionKey; enabled: boolean }
export interface BrandingTranslation { locale: InterfaceLocale; slogan: string; mission: string }
export interface HomepageBranding {
  name: string;
  logoId: string | null;
  faviconId: string | null;
  translations: BrandingTranslation[];
}
export interface AnnouncementTranslation { locale: InterfaceLocale; title: string; body: string }
export interface HomepageAnnouncement { enabled: boolean; translations: AnnouncementTranslation[] }
export interface HomepageSettings {
  branding: HomepageBranding;
  sections: HomepageSection[];
  featuredCourseIds: string[];
  recommendedBookIds: string[];
  announcements: HomepageAnnouncement[];
  version: number;
}
export interface HomeQuery { language?: string; preferred?: string }
export interface LocalizedTitle { locale: string; title: string }
export interface HomepageItem extends LocalizedTitle {
  kind: DiscoverableKind;
  id: string;
  href: string;
  description: string;
  imageId: string | null;
  languages: string[];
  contentLanguage?: string;
  lessonCount?: number;
  estimatedMinutes?: number;
  subject?: LocalizedTitle;
  level?: LocalizedTitle;
}
export class HomepageError extends Error {
  constructor(readonly code: 'STALE_VERSION' | 'INVALID_REFERENCE' | 'HOME_UNAVAILABLE' | 'COURSE_UNAVAILABLE') {
    super(code);
  }
}

export const defaultSettings: Omit<HomepageSettings, 'version'> = {
  branding: { name: 'womenriseafg', logoId: null, faviconId: null, translations: [
    { locale: 'en', slogan: 'A place to learn and grow.',
      mission: 'Free learning for Afghan girls and women, in Pashto, Dari and English.' },
    { locale: 'ps', slogan: 'د زده‌کړې او ودې ځای.',
      mission: 'د افغان نجونو او ښځو لپاره په پښتو، دري او انګلیسي وړیا زده‌کړه.' },
    { locale: 'fa-AF', slogan: 'جایی برای یادگیری و رشد.',
      mission: 'آموزش رایگان برای دختران و زنان افغان به زبان‌های پشتو، دری و انگلیسی.' },
  ] },
  sections: sectionKeys.map(key => ({ key, enabled: true })),
  featuredCourseIds: [],
  recommendedBookIds: [],
  announcements: [],
};
