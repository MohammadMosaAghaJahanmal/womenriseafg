import { ExternalLink, FilePlus2, Search, Upload } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, DialogClose, InputField, PanelDialog, ProgressIndicator, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { fileUrl } from '../../courses/student/api';
import { useEducationData } from '../../education/useEducationData';
import { MediaMetadataForm } from '../../media/MediaUpload';
import { loadMediaUsage, mediaBytes, mediaError, mediaFileUrl, mediaPath, uploadMedia, type MediaMetadata } from '../../media/api';
import { BookPager } from './BookPager';
import { listBookAssets, readBookAsset, type BookAsset, type BookAssetKind, type BookAssetStatus } from './api';
import { bookAdminNamespace as ns } from './strings';

const PdfPreview = lazy(() => import('../../courses/student/PdfPreview'));

function AssetResults({ kind, status, select }: { kind: BookAssetKind; status: BookAssetStatus; select: (asset: BookAsset) => void }) {
  const { t, i18n } = useTranslation(ns);
  const [{ q, page }, setQuery] = useState({ q: '', page: 1 });
  const load = useCallback((signal: AbortSignal) => listBookAssets({ kind, status, q, page, pageSize: 10 }, signal), [kind, status, q, page]);
  const { result, reload } = useEducationData(load);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setQuery({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim(), page: 1 });
  }

  return <>
    <form className="course-search book-asset-search" role="search" onSubmit={search}>
      <InputField type="search" name="q" label={t('fileSearch')} autoComplete="off" maxLength={120} />
      <Button type="submit" variant="secondary"><Search size={16} aria-hidden="true" />{t('searchAction')}</Button>
    </form>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loadingFiles')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('fileError')}><Button variant="secondary" onClick={reload}>{t('retry')}</Button></StatePanel>}
    {result.status === 'ready' && <>
      {result.data.items.length ? <ul className="course-pick-list">{result.data.items.map(asset =>
        <li key={asset.id}><DialogClose asChild><Button variant="ghost" onClick={() => select(asset)}>
          <bdi lang={asset.language ?? undefined}>{asset.title}</bdi>
          <small dir="auto">{asset.originalName} · {mediaBytes(asset.sizeBytes, i18n.language)}</small>
        </Button></DialogClose></li>)}</ul> : <StatePanel kind="empty" title={t('noFiles')}>
        {page > 1 && <Button variant="secondary" onClick={() => setQuery({ q, page: page - 1 })}>{t('previous')}</Button>}
      </StatePanel>}
      {result.data.total > result.data.pageSize && <BookPager page={page} pages={Math.ceil(result.data.total / result.data.pageSize)}
        onChange={value => setQuery({ q, page: value })} />}
    </>}
  </>;
}

function AssetPicker({ kind, canManageMedia, select }: {
  kind: BookAssetKind; canManageMedia: boolean; select: (asset: BookAsset) => void;
}) {
  const { t } = useTranslation([ns, 'media']);
  const [status, setStatus] = useState<BookAssetStatus>('published');
  return <>
    {canManageMedia && <SelectField label={t('fileStatus')} value={status} onChange={event => setStatus(event.target.value as BookAssetStatus)}>
      <option value="published">{t('media:published')}</option>
      <option value="draft">{t('media:draft')}</option>
    </SelectField>}
    <AssetResults key={status} kind={kind} status={status} select={select} />
  </>;
}

function UploadForm({ kind, select }: { kind: BookAssetKind; select: (asset: BookAsset) => void }) {
  const { t, i18n } = useTranslation([ns, 'media']);
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState<number>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<AbortController | null>(null);
  const { result: usage } = useEducationData(loadMediaUsage);
  const limit = usage.status === 'ready' ? usage.data.maxUploadBytes : undefined;
  useEffect(() => () => operation.current?.abort(), []);

  async function send(metadata: MediaMetadata) {
    setError('');
    setNotice('');
    if (!file) { setError('chooseFile'); return false; }
    if (limit && file.size > limit) { setError('limitError'); return false; }
    if (operation.current) return false;
    const controller = new AbortController();
    operation.current = controller;
    setPending(true);
    setProgress(0);
    try {
      const asset = await uploadMedia(file, { ...metadata, kind }, controller.signal, event => {
        if (!controller.signal.aborted && event.total) setProgress(Math.min(100, Math.round(100 * event.loaded / event.total)));
      });
      if (controller.signal.aborted) return false;
      select(asset);
      return true;
    } catch (failure) {
      if (!controller.signal.aborted) setError(mediaError(failure));
      return false;
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setPending(false);
        setProgress(undefined);
      }
    }
  }

  function cancel() {
    const controller = operation.current;
    operation.current = null;
    controller?.abort();
    setProgress(undefined);
    setPending(false);
    setNotice('cancelled');
  }

  return <div className="book-upload" onSubmit={event => event.stopPropagation()}>
    <MediaMetadataForm save={send} submit={t(pending ? 'media:uploading' : 'uploadTitle')} disabled={pending}>
      <InputField label={t('media:chooseFile')} type="file" accept={kind === 'pdf' ? '.pdf,application/pdf' : '.png,.jpg,.jpeg,.webp'}
        onChange={event => { setFile(event.target.files?.[0]); setNotice(''); setError(''); }} />
      {limit && <p className="course-note">{t('media:uploadLimitBytes', { limit: mediaBytes(limit, i18n.language) })}</p>}
    </MediaMetadataForm>
    {pending && <div className="book-upload-status">
      <ProgressIndicator value={progress ?? 0} label={t('media:progress')} />
      {progress === 100 && <p role="status">{t('media:processing')}</p>}
      <Button variant="secondary" onClick={cancel}>{t('media:cancelUpload')}</Button>
    </div>}
    {error && <p role="alert" className="media-field-error">{t('media:' + error)}</p>}
    {notice && <p role="status">{t('media:' + notice)}</p>}
  </div>;
}

function AssetPreview({ asset, label }: { asset: BookAsset; label: string }) {
  const { t } = useTranslation(ns);
  const [failed, setFailed] = useState(false);
  const url = (asset.status === 'draft' ? mediaFileUrl : fileUrl)(asset.id);
  if (asset.kind === 'pdf') return <Suspense fallback={<StatePanel kind="loading" title={t('loadingFiles')} />}>
    <PdfPreview url={url} />
  </Suspense>;
  if (failed) return <StatePanel kind="error" title={t('previewError')} />;
  return <img className="book-cover-preview" src={url} alt={label} decoding="async" onError={() => setFailed(true)} />;
}

function SelectedFile({ id, kind, editable, canManageMedia, clear }: {
  id: string; kind: BookAssetKind; editable: boolean; canManageMedia: boolean; clear: () => void;
}) {
  const { t, i18n } = useTranslation([ns, 'media']);
  const load = useCallback((signal: AbortSignal) => readBookAsset(id, signal), [id]);
  const { result, reload } = useEducationData(load);
  const [preview, setPreview] = useState(false);
  const asset = result.status === 'ready' ? result.data : null;
  const facts = asset ? [
    { label: t('fileStatus'), value: t('media:' + asset.status) },
    { label: t('license'), value: asset.license },
    { label: t('source'), value: asset.source },
    { label: t('fileSize'), value: mediaBytes(asset.sizeBytes, i18n.language) },
    ...(kind === 'pdf' ? [{ label: t('downloads'), value: t(asset.downloadAllowed ? 'media:yes' : 'media:no') }] : []),
  ] : [];
  return <div className="book-asset-selected">
    {result.status === 'loading' && <p role="status">{t('loadingFiles')}</p>}
    {result.status === 'error' && <p role="status">{t('fileError')}</p>}
    {asset && <>
      <strong><bdi lang={asset.language ?? undefined}>{asset.title}</bdi></strong>
      <p><bdi>{asset.originalName}</bdi></p>
      <dl className="book-admin-facts">{facts.filter(fact => fact.value).map(({ label, value }) =>
        <div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>
      {asset.status === 'draft' && <p className="course-note">{t('fileStatusHint')}</p>}
      {preview && <AssetPreview key={asset.id + '/' + asset.status} asset={asset} label={asset.title} />}
    </>}
    <div className="course-row-footer">
      {asset && <Button variant="secondary" aria-expanded={preview} onClick={() => setPreview(value => !value)}>
        {t(preview ? 'closePreview' : kind === 'pdf' ? 'previewPdf' : 'previewCover')}
      </Button>}
      {(result.status === 'error' || asset?.status === 'draft') && <Button variant="ghost" onClick={reload}>{t('refreshFile')}</Button>}
      {canManageMedia && <Button variant="ghost" asChild><Link to={mediaPath + '/' + id} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden="true" />{t('openMedia')}
      </Link></Button>}
      {editable && <Button variant="ghost" onClick={clear}>{t(kind === 'pdf' ? 'removePdf' : 'removeCover')}</Button>}
    </div>
  </div>;
}

export function BookFileField({ id, kind, editable, canManageMedia, change }: {
  id: string | null; kind: BookAssetKind; editable: boolean; canManageMedia: boolean; change: (id: string | null) => void;
}) {
  const { t } = useTranslation(ns);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadedId, setUploadedId] = useState<string>();
  const role = t(kind === 'pdf' ? 'pdf' : 'cover');
  const chooseLabel = t(kind === 'pdf' ? 'choosePdf' : 'chooseCover');
  const uploadLabel = t(kind === 'pdf' ? 'uploadPdf' : 'uploadCover');
  return <div className="course-choice book-file" role="group" aria-label={role}>
    <h2>{role}</h2>
    {id ? <SelectedFile key={id} id={id} kind={kind} editable={editable} canManageMedia={canManageMedia} clear={() => change(null)} />
      : <p className="course-note">{t('noSelection')}</p>}
    {id && id === uploadedId && <p role="status">{t('fileUploaded')}</p>}
    {editable && <div className="course-row-footer">
      <PanelDialog title={chooseLabel} closeLabel={t('close')} trigger={<Button variant="secondary">
        <FilePlus2 size={16} aria-hidden="true" />{chooseLabel}</Button>}>
        <AssetPicker kind={kind} canManageMedia={canManageMedia} select={asset => change(asset.id)} />
      </PanelDialog>
      {canManageMedia && <PanelDialog open={uploadOpen} onOpenChange={setUploadOpen} title={uploadLabel}
        closeLabel={t('close')} trigger={<Button variant="ghost"><Upload size={16} aria-hidden="true" />{uploadLabel}</Button>}>
        <UploadForm kind={kind} select={asset => { change(asset.id); setUploadedId(asset.id); setUploadOpen(false); }} />
      </PanelDialog>}
    </div>}
  </div>;
}
