import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, FileText, Headphones, Layers3, Play, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { languageNames, type Language } from '../../../i18n';
import { preferredName, type EducationRecord } from '../../education/api';
import { fileUrl, isMissing, type CourseSummary, type LessonKind, type PublicCourse } from './api';
import { courseNamespace } from './strings';
import './student-courses.css';

export const lessonIcons = { text: FileText, video: Video, audio: Headphones, pdf: FileText } satisfies Record<LessonKind, typeof FileText>;

export function chooseTranslation<T extends { locale: string }>(translations: T[], preferred: string): T {
  return translations.find(item => item.locale === preferred) ?? translations.find(item => item.locale === 'en') ?? translations[0]!;
}

export function learnerLanguageName(locale: string) {
  const known = languageNames[locale as Language];
  if (known) return known;
  try { return new Intl.DisplayNames(locale, { type: 'language' }).of(locale) || locale; }
  catch { return locale; }
}

export function localizedNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export function lowDataConnection() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || /^(?:slow-)?[23]g$/.test(connection?.effectiveType ?? ''));
}

function languageQuery(language?: string) {
  return language ? '?' + new URLSearchParams({ lang: language }).toString() : '';
}

export function coursePath(slug: string, language?: string) {
  return `/courses/${encodeURIComponent(slug)}${languageQuery(language)}`;
}

export function lessonPath(course: string, lesson: string, language?: string) {
  return `/learn/${encodeURIComponent(course)}/${encodeURIComponent(lesson)}${languageQuery(language)}`;
}

export function useContentLanguage() {
  const { i18n } = useTranslation(courseNamespace);
  const [params, setParams] = useSearchParams();
  const explicit = params.get('lang') || undefined;
  return {
    explicit, preferred: explicit ?? i18n.language,
    setLanguage(locale: string) {
      const next = new URLSearchParams(params);
      next.set('lang', locale);
      setParams(next, { preventScrollReset: true });
    },
  };
}

export function ContentLanguageSelect({ label, locales, selected, onSelect }: {
  label: string; locales: string[]; selected: string; onSelect: (locale: string) => void;
}) {
  if (locales.length < 2) return null;
  return <SelectField label={label} value={selected} onChange={event => onSelect(event.target.value)}>
    {locales.map(locale => <option lang={locale} dir="auto" value={locale} key={locale}>{learnerLanguageName(locale)}</option>)}
  </SelectField>;
}

export function LearnerState({ state, retry, missingKey }: { state: 'loading' | 'error'; retry: () => void; missingKey?: string }) {
  const { t } = useTranslation(courseNamespace);
  if (state === 'loading') return <StatePanel kind="loading" title={t('loading')} />;
  return <StatePanel kind="error" title={t(missingKey ?? 'loadError')}>
    {missingKey ? <Button asChild variant="secondary"><Link to="/courses">{t('backToCourses')}</Link></Button>
      : <Button variant="secondary" onClick={retry}>{t('retry')}</Button>}
  </StatePanel>;
}

export function missingContentKey(error: unknown, key: string) {
  return isMissing(error) ? key : undefined;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="learn-back" to={to}><ArrowLeft size={17} className="ui-direction" aria-hidden="true" />{children}</Link>;
}

export function CourseCover({ id }: { id: string | null }) {
  const [failed, setFailed] = useState<string>();
  return <div className="learn-cover" aria-hidden="true">
    {id && id !== failed && !lowDataConnection()
      ? <img src={fileUrl(id)} alt="" loading="lazy" decoding="async" onError={() => setFailed(id)} />
      : <BookOpen size={44} strokeWidth={1.3} />}
  </div>;
}

export function FactName({ records, id }: { records: EducationRecord[]; id: string | null }) {
  const { i18n } = useTranslation(courseNamespace);
  const entry = records.find(record => record.id === id);
  if (!entry) return null;
  const translation = preferredName(entry, i18n.language);
  return <bdi lang={translation.locale}>{translation.name}</bdi>;
}

export function CourseCard({ course, language, subjects, levels }: {
  course: CourseSummary; language?: string; subjects: EducationRecord[]; levels: EducationRecord[];
}) {
  const { t, i18n } = useTranslation(courseNamespace);
  const translation = chooseTranslation(course.translations, language ?? i18n.language);
  const subject = subjects.some(record => record.id === course.subjectId);
  const level = levels.some(record => record.id === course.levelId);
  return <article className="learn-card">
    <CourseCover id={course.thumbnailId} />
    <div className="learn-card-body">
      <div className="learn-card-tags">
        {subject && <span><FactName records={subjects} id={course.subjectId} /></span>}
        {level && <span><FactName records={levels} id={course.levelId} /></span>}
        {!subject && !level && <span>{t('free')}</span>}
      </div>
      <h3><Link to={coursePath(course.slug, language)}><bdi lang={translation.locale}>{translation.title}</bdi></Link></h3>
      {translation.description && <p lang={translation.locale} dir="auto">{translation.description}</p>}
      <div className="learn-card-facts">
        <span>{t('lessonCount', { count: course.lessonCount, number: localizedNumber(course.lessonCount, i18n.language) })}</span>
        {course.estimatedMinutes != null && <span>{t('minutes', { number: localizedNumber(course.estimatedMinutes, i18n.language) })}</span>}
      </div>
      <ul className="learn-languages" aria-label={t('availableLanguages')}>
        {course.translations.map(item => <li key={item.locale}><bdi lang={item.locale}>{learnerLanguageName(item.locale)}</bdi></li>)}
      </ul>
      <div className="learn-card-cta" aria-hidden="true">{t('viewCourse')} <ArrowRight size={16} className="ui-direction" /></div>
    </div>
  </article>;
}

export function Curriculum({ course, preference, explicit, current }: {
  course: PublicCourse; preference: string; explicit?: string; current?: string;
}) {
  const { t, i18n } = useTranslation(courseNamespace);
  if (course.chapters.length === 0) return <p className="learn-muted">{t('emptyCurriculum')}</p>;
  return <div className="learn-chapters">
    {course.chapters.map((chapter, index) => {
      const translation = chooseTranslation(chapter.translations, preference);
      const expanded = current ? chapter.lessons.some(lesson => lesson.slug === current) : index === 0;
      return <details className="learn-chapter" key={chapter.id} open={expanded}>
        <summary>
          <Layers3 size={18} aria-hidden="true" />
          <bdi lang={translation.locale}>{translation.title}</bdi>
          <small>{t('lessonCount', { count: chapter.lessons.length, number: localizedNumber(chapter.lessons.length, i18n.language) })}</small>
          <ChevronDown size={17} className="learn-disclosure" aria-hidden="true" />
        </summary>
        {chapter.lessons.length ? <ol>
          {chapter.lessons.map(lesson => {
            const Icon = lessonIcons[lesson.kind];
            const title = chooseTranslation(lesson.translations, preference);
            return <li key={lesson.id}>
              <Link to={lessonPath(course.slug, lesson.slug, explicit)} aria-current={lesson.slug === current ? 'page' : undefined}>
                <Icon size={17} aria-hidden="true" />
                <bdi lang={title.locale}>{title.title}</bdi>
                <small>{t(lesson.kind)}</small>
              </Link>
            </li>;
          })}
        </ol> : <p className="learn-empty-chapter">{t('emptyCurriculum')}</p>}
      </details>;
    })}
  </div>;
}

export function StartLesson({ slug, lesson, language }: { slug: string; lesson: string; language?: string }) {
  const { t } = useTranslation(courseNamespace);
  return <Button asChild><Link to={lessonPath(slug, lesson, language)}><Play size={17} aria-hidden="true" />{t('start')}</Link></Button>;
}
