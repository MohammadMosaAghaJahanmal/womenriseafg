import { FileText, Image } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button, StatePanel } from '../../../components/ui/Primitives';
import { fetchTranscript, fileUrl } from '../../courses/student/api';
import { AvailableLanguages, chooseTranslation, ContentLanguageNotice, ContentLanguageSelect, useContentLanguage } from '../../courses/student/components';
import { LessonMedia, MediaActions, sizeLabel } from '../../courses/student/LessonMedia';
import type { EducationRecord } from '../../education/api';
import { useEducationData } from '../../education/useEducationData';
import { Recommendations } from '../../discovery/Cards';
import type { LearningResource } from '../../engagement/local';
import { SaveResource } from '../../engagement/SaveResource';
import { offlineMediaFile } from '../../offline/media';
import { OfflineSave } from '../../offline/OfflineSave';
import { offlineResourceKey } from '../../offline/types';
import { loadCategories, readLearning, type Collection, type LearningDetail, type StudyMedia } from './api';
import { BackToCollection, CollectionState, ItemTags, MediaDetails, RelatedLearning } from './Components';
import { ShortPlayer } from './ShortPlayer';
import { learningMediaNamespace } from './strings';

function TextPreview({ media }: { media: StudyMedia }) {
  const { t } = useTranslation(learningMediaNamespace);
  const load = useCallback((signal: AbortSignal) => fetchTranscript(media.id, signal), [media.id]);
  const { result, reload } = useEducationData(load);
  if (result.status !== 'ready') {
    return <CollectionState loading={result.status === 'loading'} error={result.status === 'error' ? result.error : undefined} retry={reload} />;
  }
  return <div className="lm-resource-text">
    <pre className="learn-prose" dir="auto" lang={media.language ?? undefined}>{result.data.text}</pre>
    {result.data.truncated && <p className="learn-muted">{t('truncated')}</p>}
  </div>;
}

function ResourceMedia({ media, alt, locale }: { media: StudyMedia; alt: string; locale: string }) {
  const { t } = useTranslation(learningMediaNamespace);
  const [show, setShow] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = media.kind === 'image';
  return <div className="learn-panel lm-resource">
    {!show && <div className="learn-actions"><Button onClick={() => setShow(true)}>
      {image ? <Image size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
      {t(image ? 'showImage' : 'readFile')}
    </Button></div>}
    {show && (image
      ? failed ? <StatePanel kind="error" title={t('imageUnavailable')}>
        <Button variant="secondary" onClick={() => setFailed(false)}>{t('retry')}</Button>
      </StatePanel> : <img src={fileUrl(media.id)} alt={alt} lang={locale} decoding="async" onError={() => setFailed(true)} />
      : <TextPreview media={media} />)}
    <MediaActions media={media} />
  </div>;
}

type Step = -1 | 1;

export function MediaArticle({ detail, categories, contentLanguage, feed, move }: {
  detail: LearningDetail; categories: EducationRecord[]; contentLanguage?: string; feed?: boolean;
  move?: (step: Step, fromKeyboard?: boolean) => void;
}) {
  const { t, i18n } = useTranslation(learningMediaNamespace);
  const { item, media, related } = detail;
  const language = useContentLanguage();
  const preference = language.explicit ?? contentLanguage ?? language.preferred;
  const translation = chooseTranslation(item.translations, preference);
  const locales = item.translations.map(entry => entry.locale);
  const Heading = feed ? 'h2' : 'h1';
  const short = item.kind === 'short';
  const { kind } = media;
  const playable = kind === 'video' || kind === 'audio' || kind === 'pdf';
  const study: LearningResource = { kind: item.kind === 'resource' ? 'ai' : item.kind, id: item.id, slug: item.slug,
    locale: translation.locale, title: translation.title };
  const offlineKind = item.kind === 'resource' ? 'ai' : item.kind;
  const offlineFile = offlineMediaFile(media);

  return <article className={'lm-item' + (short ? ' lm-item-short' : '')}>
    <header className="lm-item-heading">
      <div>
        <ItemTags item={item} categories={categories} />
        <Heading lang={translation.locale} dir="auto">{translation.title}</Heading>
        {translation.description && <p className="learn-prose" lang={translation.locale} dir="auto">{translation.description}</p>}
        <div className="learning-actions"><SaveResource resource={study} />
          {offlineFile && <OfflineSave resource={{ key: offlineResourceKey(offlineKind, item.id, translation.locale),
            kind: offlineKind, title: translation.title, description: translation.description,
            locale: translation.locale, file: offlineFile }} />}
        </div>
        <ContentLanguageNotice preferred={preference} actual={translation.locale} />
      </div>
      {locales.length === 1 ? <AvailableLanguages label={t('availableLanguages')} locales={locales} />
        : <ContentLanguageSelect label={t('language')} locales={locales}
          selected={translation.locale} onSelect={language.setLanguage} />}
    </header>
    <div className="lm-item-layout">
      <div className="lm-item-media">
        {short && kind === 'video' ? <ShortPlayer key={media.id} item={item} media={media} locale={translation.locale} move={move} study={study} />
          : playable ? <LessonMedia key={media.id} media={media} kind={kind} locale={translation.locale} study={study} />
            : <ResourceMedia key={media.id} media={media} alt={translation.imageAlt?.trim() || translation.title} locale={translation.locale} />}
      </div>
      <div className="lm-item-info">
        <MediaDetails item={item} media={media} fileSize={short && media.sizeBytes != null ? sizeLabel(media.sizeBytes, i18n.language) : undefined} />
        <RelatedLearning related={related} preferred={preference} language={language.explicit ?? contentLanguage} />
        {!feed && <Recommendations kind={study.kind === 'ai' ? 'ai' : short ? 'short' : 'video'} id={item.id} language={translation.locale} />}
      </div>
    </div>
  </article>;
}

export default function MediaDetailPage({ collection }: { collection: Collection }) {
  const { slug = '' } = useParams();
  const load = useCallback((signal: AbortSignal) => readLearning(collection, slug, signal), [collection, slug]);
  const { result, reload } = useEducationData(load);
  const { result: categories } = useEducationData(loadCategories);
  return <div className="learn-page lm-page lm-detail">
    <BackToCollection collection={collection} />
    {result.status === 'ready' ? <MediaArticle key={result.data.item.id} detail={result.data}
      categories={categories.status === 'ready' ? categories.data : []} />
      : <CollectionState loading={result.status === 'loading'} error={result.status === 'error' ? result.error : undefined}
        retry={reload} collection={collection} />}
  </div>;
}
