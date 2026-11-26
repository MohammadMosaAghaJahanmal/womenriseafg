import { useCallback, useState, type FormEvent } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, DialogClose, InputField, Pagination, PanelDialog, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { preferredTitle, type Page } from '../../courses/admin/api';
import { contentLanguageName } from '../../courses/admin/EditorFields';
import { fileUrl, findCourse, listCourses, type CourseSummary } from '../../courses/student/api';
import { useEducationData } from '../../education/useEducationData';
import { mediaFileUrl, mediaPath, type MediaKind } from '../../media/api';
import {
  assetChoices, learningResourceKinds, selectedAsset, type Asset, type AssetStatus, type LearningMediaKind,
} from './api';
import { learningMediaAdminNamespace as ns } from './strings';

export function PageControls({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { t, i18n } = useTranslation(ns);
  const number = new Intl.NumberFormat(i18n.language);
  return <Pagination page={page} pages={pages} onChange={onChange} label={t('pages')} previous={t('prev')} next={t('next')}
    pageLabel={t('page', { page: number.format(page), pages: number.format(pages) })} />;
}

function Results<T extends { id: string }>({ load, select, itemText }: {
  load: (q: string, page: number, signal: AbortSignal) => Promise<Page<T>>;
  select: (item: T) => void;
  itemText: (item: T) => { title: string; locale?: string | null; description: string };
}) {
  const { t } = useTranslation(ns);
  const [{ q, page }, setQuery] = useState({ q: '', page: 1 });
  const query = useCallback((signal: AbortSignal) => load(q, page, signal), [load, q, page]);
  const { result, reload } = useEducationData(query);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setQuery({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim(), page: 1 });
  }
  return <>
    <form className="course-search learning-media-picker-search" role="search" onSubmit={search}>
      <InputField type="search" name="q" label={t('searchAction')} maxLength={120} autoComplete="off" />
      <Button type="submit" variant="secondary">{t('searchAction')}</Button>
    </form>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loadingChoices')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('optionsError')}>
      <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && (result.data.items.length ? <>
      <ul className="course-pick-list">{result.data.items.map(item => {
        const { title, locale, description } = itemText(item);
        return <li key={item.id}><DialogClose asChild>
          <Button variant="ghost" onClick={() => select(item)}>
            <bdi lang={locale ?? undefined}>{title}</bdi><small dir="auto">{description}</small>
          </Button>
        </DialogClose></li>;
      })}</ul>
      {result.data.total > result.data.pageSize && <PageControls page={result.data.page}
        pages={Math.ceil(result.data.total / result.data.pageSize)} onChange={next => setQuery({ q, page: next })} />}
    </> : <StatePanel kind="empty" title={t('noChoices')}>
      {page > 1 && <Button variant="secondary" onClick={() => setQuery({ q, page: 1 })}>{t('prev')}</Button>}
    </StatePanel>)}
  </>;
}

function assetFacts(asset: Asset, language: string) {
  const number = new Intl.NumberFormat(language);
  const seconds = asset.durationMs != null
    ? ' · ' + new Intl.NumberFormat(language, { style: 'unit', unit: 'second', maximumFractionDigits: 1 }).format(asset.durationMs / 1000)
    : '';
  const size = asset.width && asset.height ? ' · ' + number.format(asset.width) + ' × ' + number.format(asset.height) : '';
  return seconds + size;
}

function AssetResults({ kind, canManageMedia, select }: {
  kind: LearningMediaKind; canManageMedia: boolean; select: (asset: Asset) => void;
}) {
  const { t, i18n } = useTranslation([ns, 'media']);
  const [assetKind, setAssetKind] = useState<MediaKind>(kind === 'resource' ? 'image' : 'video');
  const [status, setStatus] = useState<AssetStatus>('published');
  const load = useCallback((q: string, page: number, signal: AbortSignal) =>
    assetChoices({ q, page, pageSize: 12, kind: assetKind, status }, signal), [assetKind, status]);
  return <>
    <div className="course-inline-fields">
      {kind === 'resource' && <SelectField label={t('type')} value={assetKind} onChange={event => setAssetKind(event.target.value as MediaKind)}>
        {learningResourceKinds.map(key => <option value={key} key={key}>{t('media:' + key)}</option>)}
      </SelectField>}
      {canManageMedia && <SelectField label={t('fileStatus')} value={status} onChange={event => setStatus(event.target.value as AssetStatus)}>
        <option value="published">{t('media:published')}</option><option value="draft">{t('media:draft')}</option>
      </SelectField>}
    </div>
    <Results key={assetKind + '/' + status} load={load} select={select} itemText={asset => ({
      title: asset.title, locale: asset.language, description: asset.originalName + assetFacts(asset, i18n.language),
    })} />
  </>;
}

function Preview({ asset }: { asset: Asset }) {
  const { t, i18n } = useTranslation(ns);
  const [failed, setFailed] = useState(false);
  const url = asset.status === 'draft' ? mediaFileUrl : fileUrl;
  const file = url(asset.id);
  const cover = asset.links.find(link => link.relation === 'thumbnail');
  const tracks = asset.links.filter(link => link.relation === 'subtitle');
  if (failed) return <StatePanel kind="error" title={t('previewError')} />;
  if (asset.kind === 'video') return <video controls playsInline preload="none" src={file} poster={cover ? url(cover.assetId) : undefined}
    aria-label={asset.title} onError={() => setFailed(true)}>
    {tracks.map(track => <track key={track.slot} kind="captions" src={url(track.assetId)} srcLang={track.slot}
      label={contentLanguageName(track.slot, i18n.language)} />)}
    {t('previewError')}
  </video>;
  if (asset.kind === 'audio') return <audio controls preload="none" src={file} aria-label={asset.title} onError={() => setFailed(true)}>
    {t('previewError')}
  </audio>;
  if (asset.kind === 'image') return <img src={file} alt={asset.title} decoding="async" onError={() => setFailed(true)} />;
  return <Button variant="secondary" asChild><a href={file} target="_blank" rel="noopener noreferrer">
    <ExternalLink size={16} aria-hidden="true" />{t('openFile')}
  </a></Button>;
}

function CurrentAsset({ id, editable, canManageMedia, clear }: {
  id: string; editable: boolean; canManageMedia: boolean; clear: () => void;
}) {
  const { t, i18n } = useTranslation([ns, 'media']);
  const load = useCallback((signal: AbortSignal) => selectedAsset(id, signal), [id]);
  const { result, reload } = useEducationData(load);
  const [preview, setPreview] = useState(false);
  const asset = result.status === 'ready' ? result.data : null;
  const cover = asset?.links.find(link => link.relation === 'thumbnail');
  const url = asset?.status === 'draft' ? mediaFileUrl : fileUrl;
  const count = (relation: string) => new Intl.NumberFormat(i18n.language).format(asset?.links.filter(link => link.relation === relation).length ?? 0);
  return <div className="learning-media-selected">
    {result.status === 'loading' && <p role="status">{t('loadingChoices')}</p>}
    {result.status === 'error' && <p role="status">{t('unavailableMedia')}</p>}
    {asset && <>
      {cover && <img className="learning-media-admin-cover" src={url(cover.assetId)} alt="" decoding="async" />}
      <strong><bdi lang={asset.language ?? undefined}>{asset.title}</bdi></strong>
      <p><bdi>{asset.originalName + assetFacts(asset, i18n.language)}</bdi></p>
      <dl className="learning-media-asset-facts">
        <div><dt>{t('fileStatus')}</dt><dd>{t('media:' + asset.status)}</dd></div>
        {asset.license && <div><dt>{t('license')}</dt><dd><bdi>{asset.license}</bdi></dd></div>}
        {asset.source && <div><dt>{t('source')}</dt><dd><bdi>{asset.source}</bdi></dd></div>}
        {asset.author && <div><dt>{t('author')}</dt><dd><bdi>{asset.author}</bdi></dd></div>}
        {asset.kind === 'video' && <>
          <div><dt>{t('renditionCount')}</dt><dd>{count('video-variant')}</dd></div>
          <div><dt>{t('captionCount')}</dt><dd>{count('subtitle')}</dd></div>
          <div><dt>{t('transcriptCount')}</dt><dd>{count('transcript')}</dd></div>
        </>}
      </dl>
      {asset.status === 'draft' && <p>{t('draftAssetHelp')}</p>}
      {preview && <Preview key={asset.id + '/' + asset.status} asset={asset} />}
    </>}
    <div className="course-row-footer">
      {asset && <Button variant="secondary" onClick={() => setPreview(value => !value)} aria-expanded={preview}>
        {!preview && <Play size={16} aria-hidden="true" />}{t(preview ? 'hidePreview' : 'preview')}
      </Button>}
      {(result.status === 'error' || asset?.status === 'draft') && <Button variant="ghost" onClick={reload}>{t('reloadAsset')}</Button>}
      {canManageMedia && <Button variant="ghost" asChild><Link to={mediaPath + '/' + id} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden="true" />{t('editAsset')}
      </Link></Button>}
      {editable && <Button variant="ghost" onClick={clear}>{t('remove')}</Button>}
    </div>
  </div>;
}

export function MainFile({ kind, id, editable, canManageMedia, change }: {
  kind: LearningMediaKind; id: string | null; editable: boolean; canManageMedia: boolean; change: (id: string | null) => void;
}) {
  const { t } = useTranslation(ns);
  return <div className="course-choice" role="group" aria-label={t('media')}>
    <span className="course-label">{t('media')}</span>
    {id ? <CurrentAsset key={id} id={id} editable={editable} canManageMedia={canManageMedia} clear={() => change(null)} />
      : !editable && <small>{t('noSelection')}</small>}
    <div className="course-row-footer">
      {editable && <PanelDialog title={t('selectFile')} closeLabel={t('close')}
        trigger={<Button variant="secondary">{t('selectFile')}</Button>}>
        <AssetResults kind={kind} canManageMedia={canManageMedia} select={asset => change(asset.id)} />
      </PanelDialog>}
      {editable && canManageMedia && <Button variant="ghost" asChild><Link to={mediaPath + '/upload'} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden="true" />{t('openLibrary')}
      </Link></Button>}
    </div>
  </div>;
}

const loadCourses = (q: string, page: number, signal: AbortSignal) => listCourses({ q, page, language: '', subjectId: '', levelId: '' }, signal);

function CourseLessons({ slug, lessonId, editable, choose }: {
  slug: string; lessonId: string | null; editable: boolean; choose: (id: string | null) => void;
}) {
  const { t, i18n } = useTranslation(ns);
  const load = useCallback((signal: AbortSignal) => findCourse(slug, signal), [slug]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'loading') return <p role="status">{t('lessonsLoading')}</p>;
  if (result.status === 'error') return <div className="course-row-footer"><p role="status">{t('unavailable')}</p>
    <Button variant="ghost" onClick={reload}>{t('retry')}</Button></div>;
  const { course } = result.data;
  const name = preferredTitle(course.translations, i18n.language);
  const lessons = course.chapters.flatMap(chapter => chapter.lessons);
  return <>
    <bdi lang={name?.locale}>{name?.title ?? slug}</bdi>
    <SelectField label={t('lesson')} value={lessonId ?? ''} disabled={!editable} onChange={event => choose(event.target.value || null)}>
      <option value="">{t('noLesson')}</option>
      {lessonId && !lessons.some(lesson => lesson.id === lessonId) && <option value={lessonId}>{t('unavailable')}</option>}
      {lessons.map(lesson => {
        const title = preferredTitle(lesson.translations, i18n.language);
        return <option key={lesson.id} value={lesson.id} lang={title?.locale}>{title?.title ?? lesson.slug}</option>;
      })}
    </SelectField>
  </>;
}

export function CurriculumChoice({ courseId, slug, lessonId, editable, chooseCourse, chooseLesson }: {
  courseId: string | null; slug?: string | null; lessonId: string | null; editable: boolean;
  chooseCourse: (course: CourseSummary | null) => void; chooseLesson: (id: string | null) => void;
}) {
  const { t, i18n } = useTranslation(ns);
  return <div className="course-choice" role="group" aria-label={t('course')}>
    <span className="course-label">{t('course')}</span>
    {slug ? <CourseLessons slug={slug} lessonId={lessonId} editable={editable} choose={chooseLesson} />
      : courseId && <small>{t('unavailable')}</small>}
    <div className="course-row-footer">
      {editable && <PanelDialog title={t('selectCourse')} closeLabel={t('close')}
        trigger={<Button variant="secondary">{t('selectCourse')}</Button>}>
        <Results load={loadCourses} select={chooseCourse} itemText={course => {
          const title = preferredTitle(course.translations, i18n.language);
          return { title: title?.title ?? course.slug, locale: title?.locale, description: course.slug };
        }} />
      </PanelDialog>}
      {editable && courseId && <Button variant="ghost" onClick={() => chooseCourse(null)}>{t('remove')}</Button>}
      {!editable && !courseId && <small>{t('noSelection')}</small>}
    </div>
  </div>;
}
