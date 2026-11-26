import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SelectField } from '../../../components/ui/Primitives';
import { fileUrl } from '../../courses/student/api';
import { learnerLanguageName } from '../../courses/student/components';
import { Transcripts } from '../../courses/student/LessonMedia';
import { useDataSaving } from '../../data-saving/preferences';
import type { LearningResource } from '../../engagement/local';
import { usePlaybackProgress } from '../../engagement/playback';
import type { LearningItem, StudyMedia } from './api';
import { StudyThumbnail } from './Components';
import { learningMediaNamespace } from './strings';

type Step = -1 | 1;

export function ShortPlayer({ item, media, locale, move, study }: {
  item: LearningItem; media: StudyMedia; locale: string; move?: (step: Step, fromKeyboard?: boolean) => void; study?: LearningResource;
}) {
  const { t, i18n } = useTranslation(learningMediaNamespace);
  const { enabled: saving } = useDataSaving();
  const variants = media.links.filter(link => link.relation === 'video-variant')
    .sort((first, second) => Number.parseInt(first.slot, 10) - Number.parseInt(second.slot, 10));
  const tracks = media.links.filter(link => link.relation === 'subtitle');
  const [requestedQuality, setQuality] = useState<string>();
  const quality = requestedQuality ?? (saving ? variants[0]?.assetId ?? media.id : media.id);
  const [selectedCaption, setSelectedCaption] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number }>(null);
  const visible = useRef(true);
  const help = useId();
  const caption = selectedCaption ?? tracks.find(link => link.slot === locale)?.assetId ?? '';
  const progress = usePlaybackProgress(study);

  useEffect(() => {
    const player = video.current;
    const stage = frame.current;
    if (!player || !stage) return;
    function pauseWhenHidden() {
      if (document.hidden) player?.pause();
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry?.isIntersecting === true;
      if (!visible.current) player.pause();
    });
    observer.observe(stage);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      observer.disconnect();
      player.pause();
      if (player.hasAttribute('src')) {
        player.removeAttribute('src');
        player.load();
      }
    };
  }, []);

  useEffect(() => {
    const player = video.current;
    player?.querySelectorAll('track').forEach(track => {
      track.track.mode = track.dataset.asset === caption ? 'showing' : 'disabled';
    });
  }, [caption, loaded]);

  function play() {
    const player = video.current;
    if (!player) return;
    const url = fileUrl(quality);
    if (player.getAttribute('src') !== url || error) player.setAttribute('src', url);
    setQuality(quality);
    setLoaded(true);
    setError(false);
    void player.play().catch((failure: unknown) => {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      if (video.current === player) setError(true);
    });
  }

  function changeQuality(id: string) {
    const player = video.current;
    if (player?.hasAttribute('src')) {
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
    setQuality(id);
    setLoaded(false);
    setPlaying(false);
    setError(false);
  }

  function changeMuted() {
    if (!video.current) return;
    video.current.muted = !video.current.muted;
    setMuted(video.current.muted);
  }

  function switchWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!move || event.target !== event.currentTarget || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    move(event.key === 'ArrowUp' ? -1 : 1, true);
  }

  function startGesture(event: PointerEvent<HTMLDivElement>) {
    if (!move || !event.isPrimary || event.pointerType !== 'touch') return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function finishGesture(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!move || start?.id !== event.pointerId) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) >= 55 && Math.abs(x) >= Math.abs(y) * 1.45) {
      const advance = i18n.dir() === 'rtl' ? x > 0 : x < 0;
      move(advance ? 1 : -1);
    }
  }

  return <div className="lm-short-player">
    <div className="lm-short-stage" ref={frame} role="region" aria-label={t('shortLabel')}
      aria-describedby={move ? help : undefined} tabIndex={move ? 0 : undefined}
      aria-keyshortcuts={move ? 'ArrowUp ArrowDown' : undefined} onKeyDown={switchWithKeyboard}
      onPointerDown={startGesture} onPointerUp={finishGesture} onPointerCancel={() => { gesture.current = null; }}>
      {!loaded && <StudyThumbnail id={item.thumbnailId} kind="short" />}
      <video ref={video} preload="none" playsInline aria-label={media.title} hidden={!loaded || error} {...progress}
        onPlay={event => {
          if (!visible.current || document.hidden) event.currentTarget.pause();
          else setPlaying(true);
        }}
        onPause={event => { progress.onPause(event); setPlaying(false); }}
        onEnded={event => { progress.onEnded(event); setPlaying(false); }} onError={() => {
          if (video.current?.hasAttribute('src')) setError(true);
        }}>
        {loaded && tracks.map(track => <track key={track.assetId} data-asset={track.assetId} kind="captions"
          src={fileUrl(track.assetId)} srcLang={track.slot} label={learnerLanguageName(track.slot)} />)}
      </video>
      {error && <p className="lm-short-failure" role="alert">{t('playbackFailed')}</p>}
    </div>
    <div className="lm-short-tools" role="group" aria-label={t('shortControls')}>
      <Button className={!loaded ? 'lm-short-start' : undefined} variant={loaded ? 'secondary' : 'primary'}
        onClick={playing ? () => video.current?.pause() : play}>
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        {t(error ? 'retry' : playing ? 'pause' : loaded ? 'play' : 'loadShort')}
      </Button>
      <Button variant="secondary" onClick={changeMuted}>
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}{t(muted ? 'unmute' : 'mute')}
      </Button>
      {tracks.length > 0 && <SelectField label={t('captions')} value={caption} onChange={event => setSelectedCaption(event.target.value)}>
        <option value="">{t('captionsOff')}</option>
        {tracks.map(track => <option key={track.assetId} value={track.assetId} lang={track.slot}>{learnerLanguageName(track.slot)}</option>)}
      </SelectField>}
      {variants.length > 0 && <SelectField label={t('quality')} value={quality} onChange={event => changeQuality(event.target.value)}>
        {variants.map(variant => <option key={variant.assetId} value={variant.assetId}>{variant.slot}</option>)}
        <option value={media.id}>{t('original')}</option>
      </SelectField>}
    </div>
    <Transcripts media={media} locale={locale} />
    {move && <p id={help} className="learn-muted lm-short-help">{t('playerHelp')}</p>}
  </div>;
}
