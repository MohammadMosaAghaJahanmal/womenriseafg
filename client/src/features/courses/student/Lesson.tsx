import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useEducationData } from '../../education/useEducationData';
import { findLesson, type LessonResponse } from './api';
import {
  BackLink, chooseTranslation, ContentLanguageSelect, coursePath, Curriculum, LearnerState, learnerLanguageName,
  lessonIcons, lessonPath, localizedNumber, missingContentKey, useContentLanguage,
} from './components';
import { LessonMedia, MediaActions } from './LessonMedia';
import { courseNamespace } from './strings';

function LessonCurriculum({ course, lesson, preference, explicit }: Pick<LessonResponse, 'course' | 'lesson'> & {
  preference: string; explicit?: string;
}) {
  const { t } = useTranslation(courseNamespace);
  const [wide, setWide] = useState(() => matchMedia('(min-width: 1120px)').matches);
  useEffect(() => {
    const query = matchMedia('(min-width: 1120px)');
    const resized = () => setWide(query.matches);
    query.addEventListener('change', resized);
    return () => query.removeEventListener('change', resized);
  }, []);
  return <aside className="learn-rail" aria-label={t('curriculum')}>
    <details className="learn-rail-disclosure" open={wide}>
      <summary><BookOpen size={19} aria-hidden="true" />{t('curriculum')}
        <ChevronDown size={17} className="learn-disclosure" aria-hidden="true" /></summary>
      <Curriculum course={course} current={lesson.slug} preference={preference} explicit={explicit} />
    </details>
  </aside>;
}

function LessonNavigation({ course, previous, next, preference, explicit }: Pick<LessonResponse, 'course' | 'previous' | 'next'> & {
  preference: string; explicit?: string;
}) {
  const { t } = useTranslation(courseNamespace);
  const ordered = course.chapters.flatMap(chapter => chapter.lessons);
  const previousLesson = ordered.find(lesson => lesson.slug === previous);
  const nextLesson = ordered.find(lesson => lesson.slug === next);
  if (!previousLesson && !nextLesson) return null;
  return <nav className="learn-sequence" aria-label={t('lessonNav')}>
    {[{ lesson: previousLesson, label: 'previousLesson', icon: ArrowLeft }, { lesson: nextLesson, label: 'nextLesson', icon: ArrowRight }]
      .map(({ lesson, label, icon: Icon }) => {
        if (!lesson) return null;
        const title = chooseTranslation(lesson.translations, preference);
        return <Link key={label} to={lessonPath(course.slug, lesson.slug, explicit)} className={'learn-sequence-' + label}>
          <Icon size={19} className="ui-direction" aria-hidden="true" />
          <span><small>{t(label)}</small><bdi lang={title.locale}>{title.title}</bdi></span>
        </Link>;
      })}
  </nav>;
}

export default function LessonPage() {
  const { t, i18n } = useTranslation(courseNamespace);
  const { courseSlug = '', lessonSlug = '' } = useParams();
  const language = useContentLanguage();
  const load = useCallback((signal: AbortSignal) => findLesson(courseSlug, lessonSlug, signal), [courseSlug, lessonSlug]);
  const { result, reload } = useEducationData(load);
  if (result.status !== 'ready') return <div className="learn-page learn-lesson">
    <BackLink to={coursePath(courseSlug, language.explicit)}>{t('backToCourse')}</BackLink>
    <LearnerState state={result.status} retry={reload} missingKey={result.status === 'error' ? missingContentKey(result.error, 'missingLesson') : undefined} />
  </div>;

  const { course, lesson, media, resources, previous, next } = result.data;
  const translation = chooseTranslation(lesson.translations, language.preferred);
  const courseName = chooseTranslation(course.translations, language.preferred);
  const ordered = course.chapters.flatMap(chapter => chapter.lessons);
  const position = ordered.findIndex(item => item.id === lesson.id) + 1;
  const Icon = lessonIcons[lesson.kind];
  const lessonLocales = lesson.translations.map(item => item.locale);
  return <div className="learn-page learn-lesson">
    <BackLink to={coursePath(course.slug, language.explicit)}><bdi lang={courseName.locale}>{courseName.title}</bdi></BackLink>
    <header className="learn-lesson-header">
      <div>
        <div className="learn-lesson-meta"><span><Icon size={17} aria-hidden="true" />{t(lesson.kind)}</span>
          {position > 0 && <span>{t('lessonPosition', { position: localizedNumber(position, i18n.language), total: localizedNumber(ordered.length, i18n.language) })}</span>}
        </div>
        <h1 lang={translation.locale} dir="auto">{translation.title}</h1>
        {translation.description && <p className="learn-prose" lang={translation.locale} dir="auto">{translation.description}</p>}
        {language.explicit && language.explicit !== translation.locale && <p className="learn-muted">
          {t('fallbackLanguage', { language: learnerLanguageName(translation.locale) })}
        </p>}
      </div>
      <ContentLanguageSelect label={t('lessonLanguages')} locales={lessonLocales} selected={translation.locale} onSelect={language.setLanguage} />
    </header>
    <div className="learn-lesson-layout">
      <LessonCurriculum course={course} lesson={lesson} preference={language.preferred} explicit={language.explicit} />
      <div className="learn-lesson-content">
        {lesson.kind !== 'text' && <LessonMedia key={lesson.id} media={media} kind={lesson.kind} locale={translation.locale} />}
        {translation.body && <article className="learn-panel learn-article" lang={translation.locale}>
          {translation.body.split(/\r?\n[ \t]*\r?\n/).filter(Boolean).map((paragraph, index) =>
            <p className="learn-prose" dir="auto" key={index}>{paragraph}</p>)}
        </article>}
        {resources.length > 0 && <section className="learn-panel learn-resources" aria-labelledby="learn-resources-heading">
          <h2 id="learn-resources-heading">{t('resources')}</h2>
          <ul>{resources.map(resource => <li key={resource.mediaId}>
            <FileText size={19} aria-hidden="true" /><bdi>{resource.label || resource.media.title}</bdi>
            <MediaActions media={resource.media} compact />
          </li>)}</ul>
        </section>}
        <LessonNavigation course={course} previous={previous} next={next} preference={language.preferred} explicit={language.explicit} />
      </div>
    </div>
  </div>;
}
