import axios from 'axios';
import type { Theme } from '../../preferences';

export type SectionKey = 'announcements' | 'continue' | 'subjects' | 'featured' | 'popular' | 'recommendedCourses' |
  'videos' | 'shorts' | 'books' | 'ai' | 'paths' | 'daily' | 'recent' | 'mission';

export interface Branding {
  name: string;
  logoId: string | null;
  faviconId: string | null;
  defaultTheme?: Theme;
  translations: { locale: string; slogan: string; mission: string }[];
}

export interface HomepageItem {
  kind: 'course' | 'lesson' | 'video' | 'short' | 'book' | 'quiz' | 'ai' | 'subject' | 'category' | 'path';
  id: string;
  href: string;
  locale: string;
  title: string;
  description: string;
  imageId: string | null;
  languages: string[];
  lessonCount?: number;
  estimatedMinutes?: number | null;
  subject?: { locale: string; title: string };
  level?: { locale: string; title: string };
  contentLanguage?: string;
}

export interface Homepage {
  branding: Branding;
  sections: { key: SectionKey; enabled: boolean }[];
  announcements: { translations: { locale: string; title: string; body: string }[] }[];
  content: Partial<Record<SectionKey, HomepageItem[]>>;
}

const service = axios.create({ baseURL: '/api/v1/homepage', timeout: 12_000 });

export async function loadHomepage(preferred: string, language: string | undefined, signal: AbortSignal) {
  const { data } = await service.get<Homepage>('', { signal, params: { preferred, language } });
  return data;
}

export async function loadBranding(signal: AbortSignal) {
  const { data } = await service.get<{ branding: Branding }>('/branding', { signal });
  return data.branding;
}

export function recordCourseOpen(slug: string) {
  void fetch('/api/v1/homepage/course-opens', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ slug }),
  }).catch(() => undefined);
}
