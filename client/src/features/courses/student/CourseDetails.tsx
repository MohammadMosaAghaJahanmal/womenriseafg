import { useCallback } from 'react';
import { BookOpen, Clock3, FileText, GraduationCap, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useEducationData } from '../../education/useEducationData';
import { findCourse, loadCourseFacts } from './api';
import {
  BackLink, chooseTranslation, ContentLanguageSelect, CourseCard, CourseCover, Curriculum, FactName,
  LearnerState, learnerLanguageName, lessonPath, localizedNumber, missingContentKey, StartLesson, useContentLanguage,
} from './components';
import { courseNamespace } from './strings';

export default function CourseDetails() {
  const { t, i18n } = useTranslation(courseNamespace);
  const { slug = '' } = useParams();
  const language = useContentLanguage();
  const load = useCallback((signal: AbortSignal) => findCourse(slug, signal), [slug]);
  const { result, reload } = useEducationData(load);
  const { result: facts } = useEducationData(loadCourseFacts);

  if (result.status !== 'ready') return <div className="learn-page">
    <BackLink to="/courses">{t('backToCourses')}</BackLink>
    <LearnerState state={result.status} retry={reload} missingKey={result.status === 'error' ? missingContentKey(result.error, 'missingCourse') : undefined} />
  </div>;

  const { course, related } = result.data;
  const translation = chooseTranslation(course.translations, language.preferred);
  const lessons = course.chapters.flatMap(chapter => chapter.lessons);
  const firstLesson = lessons[0];
  const resourceLessons = lessons.filter(lesson => lesson.resourceLabels?.length);
  const { subjects, levels, grades } = facts.status === 'ready' ? facts.data : { subjects: [], levels: [], grades: [] };
  const subject = subjects.some(record => record.id === course.subjectId);
  const level = levels.some(record => record.id === course.levelId);
  const grade = grades.some(record => record.id === course.gradeId);
  const number = (value: number) => localizedNumber(value, i18n.language);

  return <div className="learn-page learn-details">
    <BackLink to="/courses">{t('backToCourses')}</BackLink>
    <header className="learn-detail-hero">
      <div className="learn-detail-copy">
        <div className="learn-card-tags"><span>{t('free')}</span>{subject && <span><FactName records={subjects} id={course.subjectId} /></span>}</div>
        <h1 lang={translation.locale} dir="auto">{translation.title}</h1>
        {translation.description && <p className="learn-prose" lang={translation.locale} dir="auto">{translation.description}</p>}
        {firstLesson && <div className="learn-actions"><StartLesson slug={course.slug} lesson={firstLesson.slug} language={language.explicit} /></div>}
      </div>
      <CourseCover id={course.thumbnailId} />
    </header>
    <div className="learn-detail-layout">
      <aside className="learn-detail-facts learn-panel" aria-label={t('courseFacts')}>
        <dl>
          <div><BookOpen size={17} aria-hidden="true" /><dt>{t('curriculum')}</dt>
            <dd>{t('lessonCount', { count: course.lessonCount, number: number(course.lessonCount) })}</dd></div>
          {level && <div><GraduationCap size={17} aria-hidden="true" /><dt>{t('level')}</dt><dd><FactName records={levels} id={course.levelId} /></dd></div>}
          {grade && <div><GraduationCap size={17} aria-hidden="true" /><dt>{t('grade')}</dt><dd><FactName records={grades} id={course.gradeId} /></dd></div>}
          {course.estimatedMinutes != null && <div><Clock3 size={17} aria-hidden="true" /><dt>{t('duration')}</dt>
            <dd>{t('minutes', { number: number(course.estimatedMinutes) })}</dd></div>}
          {course.instructor && <div><UserRound size={17} aria-hidden="true" /><dt>{t('instructor')}</dt><dd><bdi>{course.instructor}</bdi></dd></div>}
        </dl>
        <h2>{t('availableLanguages')}</h2>
        <ul className="learn-languages">
          {course.translations.map(item => <li key={item.locale}><bdi lang={item.locale}>{learnerLanguageName(item.locale)}</bdi></li>)}
        </ul>
        <ContentLanguageSelect label={t('contentLanguage')} locales={course.translations.map(item => item.locale)}
          selected={translation.locale} onSelect={language.setLanguage} />
      </aside>
      <div className="learn-detail-content">
        {translation.objectives && <section className="learn-panel" aria-labelledby="learn-objectives">
          <h2 id="learn-objectives">{t('objectives')}</h2>
          <p className="learn-prose" lang={translation.locale} dir="auto">{translation.objectives}</p>
        </section>}
        {translation.prerequisites && <section className="learn-panel" aria-labelledby="learn-prerequisites">
          <h2 id="learn-prerequisites">{t('prerequisites')}</h2>
          <p className="learn-prose" lang={translation.locale} dir="auto">{translation.prerequisites}</p>
        </section>}
        <section aria-labelledby="learn-curriculum" className="learn-curriculum">
          <h2 id="learn-curriculum">{t('curriculum')}</h2>
          <Curriculum course={course} preference={language.preferred} explicit={language.explicit} />
        </section>
        {resourceLessons.length > 0 && <section className="learn-panel learn-resources" aria-labelledby="learn-course-resources">
          <h2 id="learn-course-resources">{t('resources')}</h2>
          <ul>{resourceLessons.map(lesson => {
            const title = chooseTranslation(lesson.translations, language.preferred);
            const labels = lesson.resourceLabels?.filter(Boolean) ?? [];
            return <li key={lesson.id}>
              <FileText size={18} aria-hidden="true" />
              <div className="learn-resource-preview">
                <Link to={lessonPath(course.slug, lesson.slug, language.explicit)}><bdi lang={title.locale}>{title.title}</bdi></Link>
                {labels.length > 0 && <p className="learn-muted">{labels.map((label, index) => <bdi key={`${index}-${label}`}>{label}</bdi>)}</p>}
              </div>
            </li>;
          })}</ul>
        </section>}
      </div>
    </div>
    {related.length > 0 && <section className="learn-related" aria-labelledby="learn-related">
      <h2 id="learn-related">{t('related')}</h2>
      <div className="learn-grid">
        {related.map(item => <CourseCard course={item} key={item.id} language={language.explicit} subjects={subjects} levels={levels} />)}
      </div>
    </section>}
  </div>;
}
