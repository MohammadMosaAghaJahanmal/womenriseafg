import { ArrowRight, BookOpen, Film, Sparkles, Video } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, StatePanel } from '../../../components/ui/Primitives';
import { fileUrl, isMissing } from '../../courses/student/api';
import { BackLink, chooseTranslation, coursePath, learnerLanguageName, lessonPath, lowDataConnection } from '../../courses/student/components';
import { preferredName, type EducationRecord } from '../../education/api';
import type { Collection, LearningDetail, LearningItem } from './api';
import { learningMediaNamespace } from './strings';
import './learning-media.css';

export const collections = {
  videos: { intro: 'videosIntro', back: 'browseVideos', Icon: Video },
  shorts: { intro: 'shortsIntro', back: 'browseShorts', Icon: Film },
  'ai-learning': { intro: 'aiIntro', back: 'browseAI', Icon: Sparkles },
} as const;

export function itemUrl(collection: Collection, slug: string, language?: string) {
  const route = '/' + collection + '/' + encodeURIComponent(slug);
  return language ? route + '?' + new URLSearchParams({ lang: language }).toString() : route;
}

export function durationLabel(ms: number | null, locale: string) {
  if (!ms || ms < 1) return null;
  const seconds = Math.max(1, Math.round(ms / 1000));
  const format = (value: number, unit: 'minute' | 'second') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
  return seconds >= 60 ? [format(Math.floor(seconds / 60), 'minute'), seconds % 60 ? format(seconds % 60, 'second') : ''].filter(Boolean).join(' ')
    : format(seconds, 'second');
}

export function CollectionBanner({ collection }: { collection: Collection }) {
  const { t } = useTranslation(learningMediaNamespace);
  const { intro, Icon } = collections[collection];
  return <header className={collection === 'shorts' ? 'lm-feed-header' : 'learn-banner lm-banner'}>
    <div><h1>{t(collection)}</h1><p>{t(intro)}</p></div>
    <span className="learn-banner-icon" aria-hidden="true"><Icon size={44} strokeWidth={1.4} /></span>
  </header>;
}

export function CollectionState({ loading, error, retry, collection }: {
  loading: boolean; error?: unknown; retry: () => void; collection?: Collection;
}) {
  const { t } = useTranslation(learningMediaNamespace);
  if (loading) return <StatePanel kind="loading" title={t('loading')} />;
  const missing = collection && isMissing(error);
  return <StatePanel kind="error" title={t(missing ? 'missing' : 'loadFailed')}>
    {missing ? <Button asChild variant="secondary"><Link to={'/' + collection}>{t(collections[collection].back)}</Link></Button>
      : <Button variant="secondary" onClick={retry}>{t('retry')}</Button>}
  </StatePanel>;
}

export function BackToCollection({ collection }: { collection: Collection }) {
  const { t } = useTranslation(learningMediaNamespace);
  return <BackLink to={'/' + collection}>{t(collections[collection].back)}</BackLink>;
}

export function Category({ records, item }: { records: EducationRecord[]; item: LearningItem }) {
  const { i18n } = useTranslation(learningMediaNamespace);
  const entry = records.find(record => record.id === item.categoryId);
  if (!entry) return null;
  const translation = preferredName(entry, i18n.language);
  return <bdi lang={translation.locale}>{translation.name}</bdi>;
}

export function StudyThumbnail({ id, kind }: { id: string | null; kind: LearningItem['kind'] }) {
  const [failed, setFailed] = useState<string>();
  const Icon = kind === 'short' ? Film : kind === 'video' ? Video : BookOpen;
  return <div className="learn-cover lm-cover" aria-hidden="true">
    {id && id !== failed && !lowDataConnection()
      ? <img src={fileUrl(id)} alt="" loading="lazy" decoding="async" onError={() => setFailed(id)} />
      : <Icon size={42} strokeWidth={1.3} />}
  </div>;
}

export function ItemTags({ item, categories }: { item: LearningItem; categories: EducationRecord[] }) {
  const { t } = useTranslation(learningMediaNamespace);
  return <div className="learn-card-tags lm-item-tags">
    <span>{t(item.kind)}</span>
    {categories.some(entry => entry.id === item.categoryId) && <span><Category records={categories} item={item} /></span>}
    {item.aiOrigin !== 'human' && <span className="lm-origin-tag"><Sparkles size={13} aria-hidden="true" />{t(item.aiOrigin)}</span>}
  </div>;
}

export function StudyCard({ item, collection, categories, language }: {
  item: LearningItem; collection: Collection; categories: EducationRecord[]; language?: string;
}) {
  const { t, i18n } = useTranslation(learningMediaNamespace);
  const translation = chooseTranslation(item.translations, language ?? i18n.language);
  const duration = durationLabel(item.durationMs, i18n.language);
  const label = item.kind === 'video' ? 'openVideo' : item.kind === 'short' ? 'openShort' : 'openItem';
  return <article className="learn-card lm-card">
    <StudyThumbnail id={item.thumbnailId} kind={item.kind} />
    <div className="learn-card-body">
      <ItemTags item={item} categories={categories} />
      <h3><Link to={itemUrl(collection, item.slug, language)}><bdi lang={translation.locale}>{translation.title}</bdi></Link></h3>
      {translation.description && <p lang={translation.locale} dir="auto">{translation.description}</p>}
      {duration && <div className="learn-card-facts"><span>{duration}</span></div>}
      <ul className="learn-languages" aria-label={t('availableLanguages')}>
        {item.translations.map(entry => <li key={entry.locale}><bdi lang={entry.locale}>{learnerLanguageName(entry.locale)}</bdi></li>)}
      </ul>
      <div className="learn-card-cta" aria-hidden="true">{t(label)}<ArrowRight size={16} className="ui-direction" /></div>
    </div>
  </article>;
}

export function RelatedLearning({ related, preferred, language }: {
  related: LearningDetail['related']; preferred: string; language?: string;
}) {
  const { t } = useTranslation(learningMediaNamespace);
  if (!related.course) return null;
  const course = chooseTranslation(related.course.translations, preferred);
  const lesson = related.lesson && chooseTranslation(related.lesson.translations, preferred);
  return <section className="learn-panel lm-related" aria-labelledby="lm-related-title">
    <h2 id="lm-related-title">{t('related')}</h2>
    <div className="lm-related-links">
      {lesson && related.lesson && <Link to={lessonPath(related.course.slug, related.lesson.slug, language)}>
        <small>{t('relatedLesson')}</small><bdi lang={lesson.locale}>{lesson.title}</bdi><ArrowRight size={18} className="ui-direction" aria-hidden="true" />
      </Link>}
      <Link to={coursePath(related.course.slug, language)}>
        <small>{t('relatedCourse')}</small><bdi lang={course.locale}>{course.title}</bdi><ArrowRight size={18} className="ui-direction" aria-hidden="true" />
      </Link>
    </div>
  </section>;
}

export function MediaDetails({ item, media, fileSize }: Pick<LearningDetail, 'item' | 'media'> & { fileSize?: string }) {
  const { t, i18n } = useTranslation(learningMediaNamespace);
  const duration = durationLabel(item.durationMs, i18n.language);
  const fields: { key: string; value: ReactNode }[] = [
    { key: 'duration', value: duration },
    { key: 'fileSize', value: fileSize },
    { key: 'mediaLanguage', value: media.language && <bdi lang={media.language}>{learnerLanguageName(media.language)}</bdi> },
    { key: 'author', value: media.author && <bdi>{media.author}</bdi> },
    { key: 'license', value: media.license && <bdi>{media.license}</bdi> },
    { key: 'source', value: media.source && <bdi>{media.source}</bdi> },
    { key: 'aiTool', value: item.aiOrigin !== 'human' && item.aiTool && <bdi>{item.aiTool}</bdi> },
  ].filter(field => field.value);
  if (!fields.length && item.aiOrigin === 'human') return null;
  return <section className="learn-panel lm-media-details" aria-labelledby="lm-media-details-title">
    <h2 id="lm-media-details-title">{t('details')}</h2>
    {item.aiOrigin !== 'human' && <p className="lm-origin-note"><Sparkles size={17} aria-hidden="true" />
      <span><strong>{t(item.aiOrigin)}.</strong>{' '}{t('reviewed')}</span>
    </p>}
    {fields.length > 0 && <dl>{fields.map(({ key, value }) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl>}
  </section>;
}
