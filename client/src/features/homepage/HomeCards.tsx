import { ArrowUpRight, BookOpen, BookOpenText, ClipboardCheck, Film, GraduationCap, Layers, LibraryBig, Route, Sparkles, Video } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fileUrl } from '../courses/student/api';
import { learnerLanguageName } from '../courses/student/components';
import { useDataSaving } from '../data-saving/preferences';
import { useLearning } from '../engagement/local';
import { SaveResource } from '../engagement/SaveResource';
import { type HomepageItem, type SectionKey } from './api';
import { homepageNamespace as ns } from './strings';

const icons = {
  course: GraduationCap, lesson: BookOpenText, video: Video, short: Film, book: LibraryBig, quiz: ClipboardCheck,
  ai: Sparkles, subject: BookOpen, category: Layers, path: Route,
} as const;

const sectionLinks = {
  subjects: ['/explore', 'seeSubjects'],
  featured: ['/courses', 'seeCourses'],
  popular: ['/courses', 'seeCourses'],
  recommendedCourses: ['/courses', 'seeCourses'],
  videos: ['/videos', 'seeVideos'],
  shorts: ['/shorts', 'seeShorts'],
  books: ['/library', 'seeBooks'],
  ai: ['/ai-learning', 'seeAI'],
  paths: ['/learning-paths', 'seePaths'],
  recent: ['/search', 'seeRecent'],
} as const;

type ContentSection = Exclude<SectionKey, 'announcements' | 'continue' | 'mission'>;

function entryLink(item: HomepageItem) {
  if (item.kind === 'subject' || item.kind === 'category') return item.href;
  const next = new URL(item.href, window.location.origin);
  next.searchParams.set('lang', item.locale);
  return next.pathname + next.search;
}

function CourseActions({ item, href }: { item: HomepageItem; href: string }) {
  const { t } = useTranslation(ns);
  const { completedCourses, recent } = useLearning();
  const slug = item.href.split('/').at(-1) ?? '';
  const complete = completedCourses.includes(item.id);
  const active = !complete && recent.some(entry => entry.resource.kind === 'lesson' && entry.resource.parentSlug === slug);
  return <div className="home-card-actions">
    <Link to={href} className="home-card-open">{t(complete ? 'complete' : active ? 'continue' : 'open')}
      <ArrowUpRight size={15} className="home-arrow" aria-hidden="true" /></Link>
    <SaveResource resource={{ kind: 'course', id: item.id, slug, title: item.title, locale: item.locale }} />
  </div>;
}

function PreviewLanguages({ item, requested }: { item: HomepageItem; requested: string }) {
  const { t } = useTranslation(ns);
  return <div className="home-languages">
    {item.locale !== requested && <span>{t('showingLanguage', { language: learnerLanguageName(item.locale) })}</span>}
    {item.languages.length > 0 && <span>{t('available')}{' '}
      <bdi>{item.languages.map(learnerLanguageName).join(' · ')}</bdi></span>}
    {item.contentLanguage && <span>{t('pdfLanguage')}{' '}
      <bdi lang={item.contentLanguage}>{learnerLanguageName(item.contentLanguage)}</bdi></span>}
  </div>;
}

function Card({ item, requested, compact }: { item: HomepageItem; requested: string; compact: boolean }) {
  const { t, i18n } = useTranslation(ns);
  const { enabled: saving } = useDataSaving();
  const id = useId();
  const Icon = icons[item.kind];
  const href = entryLink(item);
  const number = new Intl.NumberFormat(i18n.language);
  return <article className={'home-card' + (compact ? ' home-card--compact' : '')} data-kind={item.kind} aria-labelledby={id}>
    <div className="home-card-art" aria-hidden="true">
      {item.imageId && !saving ? <img src={fileUrl(item.imageId)} alt="" loading="lazy" decoding="async" />
        : <Icon size={30} strokeWidth={1.5} />}
    </div>
    <div className="home-card-body">
      {item.kind !== 'subject' && <small className="home-card-type">{t(item.kind)}{item.kind === 'course' && ' · ' + t('free')}</small>}
      <h3 id={id}><Link to={href}><bdi lang={item.locale}>{item.title}</bdi></Link></h3>
      {item.description && <p lang={item.locale} dir="auto">{item.description}</p>}
      {item.kind === 'course' && <div className="home-card-meta">
        {item.subject && <bdi lang={item.subject.locale}>{item.subject.title}</bdi>}
        {item.level && <bdi lang={item.level.locale}>{item.level.title}</bdi>}
        {typeof item.lessonCount === 'number' && <span>{t('lessons')} {number.format(item.lessonCount)}</span>}
        {item.estimatedMinutes && <span>{t('minutes', { value: number.format(item.estimatedMinutes) })}</span>}
      </div>}
      {item.kind !== 'subject' && <PreviewLanguages item={item} requested={requested} />}
      {item.kind === 'course' && <CourseActions item={item} href={href} />}
      {item.kind === 'subject' && item.locale !== requested && <PreviewLanguages item={item} requested={requested} />}
    </div>
  </article>;
}

export function HomeSection({ section, items, requested, language }: {
  section: ContentSection; items: HomepageItem[]; requested: string; language?: string;
}) {
  const { t } = useTranslation(ns);
  const heading = useId();
  if (!items.length) return null;
  const link = section === 'daily' ? undefined : sectionLinks[section];
  const compact = section === 'subjects' || section === 'daily' || section === 'recent';
  const to = link && link[0] + (language && section !== 'subjects' ? '?' + new URLSearchParams({ language }) : '');
  return <section className="discover-section home-content" aria-labelledby={heading} data-home-section={section}>
    <div className="discover-section__heading">
      <h2 id={heading}>{t(section)}</h2>
      {link && to && <Link to={to} className="home-see-all">
        {t(link[1])}<ArrowUpRight size={16} className="home-arrow" aria-hidden="true" />
      </Link>}
    </div>
    {section === 'popular' && <p className="home-popular-hint">{t('popularHint')}</p>}
    <ul className="home-grid" data-layout={section}>{items.map(item =>
      <li key={item.kind + ':' + item.id}><Card item={item} requested={requested} compact={compact} /></li>)}</ul>
  </section>;
}
