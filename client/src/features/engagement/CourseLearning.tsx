import { CheckCircle2, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Primitives';
import type { PublicCourse } from '../courses/student/api';
import { lessonPath, StartLesson } from '../courses/student/components';
import { courseCompletion, rememberResource, savedPosition, syncCourseCompletion, toggleLesson, useLearning, type LearningResource } from './local';
import { DeviceConsent } from './Preference';
import { SaveResource } from './SaveResource';
import { learningNamespace } from './strings';

export function CourseLearning({ course, title, locale, language }: { course: PublicCourse; title: string; locale: string; language?: string }) {
  const { t, i18n } = useTranslation(learningNamespace);
  const { enabled, completedLessons, recent } = useLearning();
  const lessons = useMemo(() => course.chapters.flatMap(chapter => chapter.lessons), [course.chapters]);
  const ids = useMemo(() => lessons.map(lesson => lesson.id), [lessons]);
  useEffect(() => { if (enabled) syncCourseCompletion(course.id, ids); }, [course.id, ids, enabled]);
  const { count, total } = courseCompletion(ids, completedLessons);
  const complete = enabled && total > 0 && count === total;
  const previous = enabled && recent.find(({ resource }) => resource.kind === 'lesson' &&
    resource.parentSlug === course.slug && ids.includes(resource.id) && !completedLessons.includes(resource.id));
  const next = previous ? lessons.find(lesson => lesson.id === previous.resource.id)
    : count > 0 ? lessons.find(lesson => !completedLessons.includes(lesson.id)) : undefined;
  const number = new Intl.NumberFormat(i18n.language);
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  return <>
    <div className="learn-actions">
      {next ? <Button asChild><Link to={lessonPath(course.slug, next.slug, language)}>
        <Play size={17} aria-hidden="true" />{t('continue')}
      </Link></Button> : lessons[0] && <StartLesson slug={course.slug} lesson={lessons[0].slug} language={language} />}
      <SaveResource resource={{ kind: 'course', id: course.id, slug: course.slug, title, locale }} />
      {complete && <Button variant="secondary" asChild><Link to={'/courses/' + encodeURIComponent(course.slug) + '/certificate?lang=' + encodeURIComponent(locale)}>
        {t('certificate')}
      </Link></Button>}
    </div>
    {enabled && total > 0 && <div className="learning-course-progress">
      <progress max={total} value={count} aria-label={t('courseProgress')} />
      <span>{complete ? t('complete') : t('completion', { count: number.format(count), total: number.format(total) })}
        {' · '}{percent.format(count / total)}</span>
    </div>}
  </>;
}

export function LessonLearning({ course, item }: { course: PublicCourse; item: LearningResource }) {
  const { t } = useTranslation(learningNamespace);
  const { enabled, completedLessons } = useLearning();
  const [error, setError] = useState(false);
  const { id, slug, parentSlug, title, locale, kind } = item;
  const ids = useMemo(() => course.chapters.flatMap(chapter => chapter.lessons.map(lesson => lesson.id)), [course.chapters]);
  const complete = completedLessons.includes(id);
  const label = t(complete ? 'undo' : 'mark');
  useEffect(() => {
    if (enabled) {
      const resource = { id, slug, parentSlug, title, locale, kind };
      const saved = savedPosition(resource);
      rememberResource(resource, saved?.position, saved?.total);
    }
  }, [enabled, id, slug, parentSlug, title, locale, kind]);
  function mark() { setError(!toggleLesson(course.id, ids, id)); }
  return <div className="learning-actions">
    {enabled ? <Button variant={complete ? 'secondary' : 'primary'} onClick={mark}>
      <CheckCircle2 size={18} aria-hidden="true" />{label}
    </Button> : <DeviceConsent trigger={<Button><CheckCircle2 size={18} aria-hidden="true" />{label}</Button>}
      onEnable={mark} onFailure={() => setError(true)} />}
    {enabled && ids.length > 0 && ids.every(value => completedLessons.includes(value)) &&
      <Button asChild variant="secondary"><Link to={'/courses/' + encodeURIComponent(course.slug) + '/certificate?lang=' + encodeURIComponent(locale)}>
        {t('certificate')}
      </Link></Button>}
    {error && <small role="alert">{t('unavailable')}</small>}
  </div>;
}
