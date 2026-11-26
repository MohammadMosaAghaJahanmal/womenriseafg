import { lazy, Suspense, useCallback, useState } from 'react';
import { Download, ExternalLink, FileText, Headphones, Play, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { useDataSaving } from '../../data-saving/preferences';
import { useEducationData } from '../../education/useEducationData';
import type { LearningResource } from '../../engagement/local';
import { usePlaybackProgress } from '../../engagement/playback';
import { fetchTranscript, fileUrl, type PublicMedia } from './api';
import { learnerLanguageName } from './components';
import { courseNamespace } from './strings';

function PdfUnavailable() {
  const { t } = useTranslation(courseNamespace);
  return <StatePanel kind="error" title={t('pdfError')} />;
}

const PdfPreview = lazy(() => import('./PdfPreview').catch(() => ({ default: PdfUnavailable })));

export function sizeLabel(bytes: number, locale: string) {
  const unit = bytes < 1_000_000 ? 'kilobyte' : 'megabyte';
  return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(
    bytes / (unit === 'kilobyte' ? 1_000 : 1_000_000));
}

export function MediaActions({ media, compact = false }: { media: PublicMedia; compact?: boolean }) {
  const { t, i18n } = useTranslation(courseNamespace);
  return <div className="learn-actions learn-media-actions">
    {media.kind !== 'attachment' && <Button asChild variant={compact ? 'ghost' : 'secondary'}>
      <a href={fileUrl(media.id)} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden="true" />{t(media.kind === 'pdf' ? 'openPdf' : 'openFile')}
      </a>
    </Button>}
    {media.downloadAllowed && <Button asChild variant="ghost">
      <a href={fileUrl(media.id, true)}><Download size={16} aria-hidden="true" />{t('downloadFile')}</a>
    </Button>}
    {media.sizeBytes != null && <small className="learn-muted">{sizeLabel(media.sizeBytes, i18n.language)}</small>}
  </div>;
}

function TranscriptText({ id, locale }: { id: string; locale?: string }) {
  const { t } = useTranslation(courseNamespace);
  const load = useCallback((signal: AbortSignal) => fetchTranscript(id, signal), [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'loading') return <StatePanel kind="loading" title={t('loading')} />;
  if (result.status === 'error') return <StatePanel kind="error" title={t('loadError')}>
    <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
  </StatePanel>;
  return <>
    <pre className="learn-prose learn-transcript-content" lang={locale} dir="auto" tabIndex={0}>{result.data.text}</pre>
    {result.data.truncated && <p className="learn-muted">{t('previewTruncated')}</p>}
    <Button asChild variant="ghost"><a href={fileUrl(id)} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={16} aria-hidden="true" />{t('openTranscript')}
    </a></Button>
  </>;
}

export function Transcripts({ media, locale }: { media: PublicMedia; locale: string }) {
  const { t } = useTranslation(courseNamespace);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState('');
  const tracks = media.links.filter(link => link.relation === 'transcript');
  if (!tracks.length) return null;
  const track = tracks.find(link => link.assetId === selection) ?? tracks.find(link => link.slot === locale) ?? tracks[0]!;
  return <details className="learn-transcripts" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><FileText size={17} aria-hidden="true" />{t('transcript')}</summary>
    {open && <div>
      {tracks.length > 1 && <SelectField label={t('transcriptLanguage')} value={track.assetId} onChange={event => setSelection(event.target.value)}>
        {tracks.map(link => <option key={link.assetId} value={link.assetId}>
          {link.slot === 'default' ? t('defaultTranscript') : learnerLanguageName(link.slot)}
        </option>)}
      </SelectField>}
      <TranscriptText id={track.assetId} locale={track.slot === 'default' ? undefined : track.slot} />
    </div>}
  </details>;
}

function Player({ media, locale, study }: { media: PublicMedia; locale: string; study?: LearningResource }) {
  const { t } = useTranslation(courseNamespace);
  const { enabled: saving } = useDataSaving();
  const video = media.kind === 'video';
  const alternatives = media.links.filter(link => link.relation === 'audio');
  const variants = media.links.filter(link => link.relation === 'video-variant')
    .sort((a, b) => Number.parseInt(a.slot, 10) - Number.parseInt(b.slot, 10));
  const [requestedVariant, setVariant] = useState<string>();
  const variant = requestedVariant ?? (saving ? variants[0]?.assetId ?? media.id : media.id);
  const [audio, setAudio] = useState('');
  const [active, setActive] = useState<'video' | 'audio'>();
  const [failed, setFailed] = useState('');
  const selectedAudio = alternatives.find(link => link.assetId === audio) ?? alternatives.find(link => link.slot === locale) ?? alternatives[0];
  const activeId = active === 'audio' ? (video ? selectedAudio?.assetId : media.id) : variant;
  const activeError = activeId === failed;
  const poster = media.links.find(link => link.relation === 'thumbnail');
  const captions = media.links.filter(link => link.relation === 'subtitle');
  const progress = usePlaybackProgress(study);

  return <div className="learn-player">
    {video && (variants.length > 0 || alternatives.length > 0) && <div className="learn-playback-options">
      {variants.length > 0 && <SelectField label={t('videoQuality')} value={variant} onChange={event => setVariant(event.target.value)}>
        {variants.map(link => <option key={link.assetId} value={link.assetId}>{link.slot}</option>)}
        <option value={media.id}>{t('original')}</option>
      </SelectField>}
      {alternatives.length > 1 && <SelectField label={t('audioVersion')} value={selectedAudio?.assetId} onChange={event => setAudio(event.target.value)}>
        {alternatives.map(link => <option key={link.assetId} value={link.assetId}>
          {link.slot === 'default' ? t('defaultAudio') : learnerLanguageName(link.slot)}
        </option>)}
      </SelectField>}
      <p className="learn-muted">{[selectedAudio ? t('audioData') : '', variants.length > 0 ? t('qualityData') : ''].filter(Boolean).join(' ')}</p>
    </div>}
    <div className="learn-actions">
      {video && <Button variant={saving && selectedAudio ? 'secondary' : 'primary'}
        onClick={() => { setFailed(''); setVariant(variant); setActive('video'); }} aria-pressed={active === 'video' && !activeError}>
        <Play size={17} aria-hidden="true" />{t('playVideo')}
      </Button>}
      {(!video || selectedAudio) && <Button variant={video && !saving ? 'secondary' : 'primary'}
        onClick={() => { setFailed(''); setActive('audio'); }} aria-pressed={active === 'audio' && !activeError}>
        <Headphones size={17} aria-hidden="true" />{t(video ? 'audioVersion' : 'playAudio')}
      </Button>}
    </div>
    <div className="learn-player-stage" data-kind={active ?? media.kind}>
      {active && activeId && !activeError ? active === 'video'
        ? <video key={activeId} controls playsInline preload="none" src={fileUrl(activeId)} {...progress}
            poster={poster && !saving ? fileUrl(poster.assetId) : undefined} aria-label={media.title} onError={() => setFailed(activeId)}>
            {captions.map(link => <track key={link.assetId} kind="captions" src={fileUrl(link.assetId)} srcLang={link.slot}
              label={t('captions', { language: learnerLanguageName(link.slot) })} />)}
            {t('mediaUnavailable')}
          </video>
        : <audio key={activeId} controls preload="none" src={fileUrl(activeId)} {...progress} aria-label={media.title} onError={() => setFailed(activeId)}>
            {t('mediaUnavailable')}
          </audio>
        : <div className="learn-player-placeholder">
          {video ? <Video size={32} aria-hidden="true" /> : <Headphones size={32} aria-hidden="true" />}
          <p role={activeError ? 'alert' : undefined}>{t(activeError ? 'mediaUnavailable' : 'loadMediaHelp')}</p>
        </div>}
    </div>
    <Transcripts media={media} locale={locale} />
    <MediaActions media={media} />
  </div>;
}

function PdfLesson({ media }: { media: PublicMedia }) {
  const { t } = useTranslation(courseNamespace);
  const [preview, setPreview] = useState(false);
  return <div className="learn-pdf">
    <div className="learn-actions learn-pdf-actions">
      {!preview && <Button onClick={() => setPreview(true)}><FileText size={17} aria-hidden="true" />{t('previewPdf')}</Button>}
      <MediaActions media={media} />
    </div>
    {preview && <Suspense fallback={<StatePanel kind="loading" title={t('loading')} />}>
      <PdfPreview url={fileUrl(media.id)} />
    </Suspense>}
  </div>;
}

function ImageLesson({ media, alt, locale }: { media: PublicMedia; alt: string; locale: string }) {
  const { enabled: saving } = useDataSaving();
  const { t } = useTranslation(courseNamespace);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className="learn-panel learn-image-lesson">
    {failed ? <StatePanel kind="error" title={t('mediaUnavailable')}>
      <Button variant="secondary" onClick={() => setFailed(false)}>{t('retry')}</Button>
    </StatePanel> : (opened || !saving)
      ? <img src={fileUrl(media.id)} alt={alt} lang={locale} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <Button variant="secondary" onClick={() => setOpened(true)}>{t('loadImage')}</Button>}
    <MediaActions media={media} />
  </div>;
}

export function LessonMedia({ media, kind, locale, study, imageAlt }: {
  media: PublicMedia | null; kind: 'audio' | 'video' | 'pdf' | 'image'; locale: string;
  study?: LearningResource; imageAlt?: string;
}) {
  const { t } = useTranslation(courseNamespace);
  if (!media || media.kind !== kind) return <StatePanel kind="error" title={t('mediaUnavailable')} />;
  if (kind === 'pdf') return <PdfLesson media={media} />;
  if (kind === 'image') return <ImageLesson media={media} alt={imageAlt ?? media.title} locale={locale} />;
  return <Player media={media} locale={locale} study={study} />;
}
