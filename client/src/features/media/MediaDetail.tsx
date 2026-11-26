import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, DialogClose, PanelDialog, StatePanel } from '../../components/ui/Primitives';
import { readIdentity } from '../auth/api';
import { useEducationData } from '../education/useEducationData';
import {
  attachMedia, changeMediaStatus, contentLanguageName, deleteMedia, detachMedia, getMedia, mediaBytes,
  mediaError, mediaPath, saveMedia, type MediaLink, type MediaMetadata, type MediaRecord, type MediaStatus,
} from './api';
import { MediaHeading, MediaStatusBadge } from './MediaLibrary';
import { MediaPreview } from './MediaPreview';
import { MediaMetadataForm } from './MediaUpload';
import { RelatedMedia } from './RelatedMedia';

function MetadataRows({ record }: { record: MediaRecord }) {
  const { t, i18n } = useTranslation('media');
  const number = new Intl.NumberFormat(i18n.language);
  const rows = [
    { key: 'filename', value: record.originalName },
    { key: 'kind', value: t(record.kind) },
    { key: 'format', value: record.mimeType },
    { key: 'size', value: mediaBytes(record.sizeBytes, i18n.language) },
    { key: 'dimensions', value: record.width && record.height ? number.format(record.width) + ' × ' + number.format(record.height) : null },
    { key: 'duration', value: record.durationMs === null ? null :
      new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'second', maximumFractionDigits: 1 }).format(record.durationMs / 1000) },
    { key: 'date', value: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(record.createdAt)) },
  ];
  return <Card className="media-facts">
    <h2>{t('detail')}</h2>
    <dl>{rows.map(({ key, value }) => value != null && <div key={key}><dt>{t(key)}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl>
  </Card>;
}

function LockedRights({ record }: { record: MediaRecord }) {
  const { t, i18n } = useTranslation('media');
  const rows = [
    { key: 'fileTitle', value: record.title },
    { key: 'license', value: record.license },
    { key: 'source', value: record.source },
    { key: 'author', value: record.author },
    { key: 'language', value: contentLanguageName(record.language, i18n.language) },
    { key: 'downloads', value: t(record.downloadAllowed ? 'yes' : 'no') },
  ];
  return <dl className="media-facts">{rows.map(({ key, value }) =>
    <div key={key}><dt>{t(key)}</dt><dd><bdi>{value || t('none')}</bdi></dd></div>)}</dl>;
}

type Area = 'metadata' | 'links' | 'status' | 'delete';

function MediaRecordPage({ initial, canPublish, reload }: {
  initial: MediaRecord; canPublish: boolean; reload: () => void;
}) {
  const { t } = useTranslation('media');
  const location = useLocation();
  const navigate = useNavigate();
  const [record, setRecord] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Area>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [feedback, setFeedback] = useState<{ error: string; area: Area }>();
  const [message, setMessage] = useState((location.state as { message?: string } | null)?.message);
  const operation = useRef<AbortController | null>(null);
  const back = mediaPath + location.search;
  const editable = record.status === 'draft';

  useEffect(() => () => operation.current?.abort(), []);

  async function run(area: Area, apply: (signal: AbortSignal) => Promise<void>, success?: string) {
    if (operation.current) return false;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(area);
    setFeedback(undefined);
    setMessage(undefined);
    try {
      await apply(controller.signal);
      if (controller.signal.aborted) return false;
      setMessage(success);
      return true;
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ area, error: mediaError(error, area) });
      return false;
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(undefined);
    }
  }

  async function save(metadata: MediaMetadata) {
    return run('metadata', async signal => setRecord(await saveMedia(record, metadata, signal)), 'saved');
  }

  async function status(next: MediaStatus) {
    const updated = await run('status', async signal => setRecord(await changeMediaStatus(record, next, signal)), 'statusSaved');
    if (updated) setConfirmPublish(false);
  }

  const attach = (link: MediaLink) =>
    run('links', async signal => setRecord(await attachMedia(record, link, signal)), 'linked');
  const remove = (link: MediaLink) =>
    run('links', async signal => setRecord(await detachMedia(record, link, signal)), 'unlinked');

  async function deleteFile() {
    await run('delete', async signal => {
      const result = await deleteMedia(record, signal);
      if (!signal.aborted) void navigate(back, { replace: true, state: { message: result.cleanupPending ? 'cleanupPending' : 'deleted' } });
    });
  }

  function errorFor(area: Area) {
    return feedback?.area === area ? <p role="alert" className="media-message media-message-error">{t(feedback.error)}</p> : null;
  }

  return <div className="media-module">
    <MediaHeading title={record.title} navigation={<Link className="media-parent" to={back}>{t('back')}</Link>}
      action={<MediaStatusBadge status={record.status} />} />
    {message && <p role="status" className="media-message">{t(message)}</p>}
    {feedback?.error === 'stale' && !confirmPublish && !confirmDelete &&
      <div className="media-actions"><Button variant="secondary" onClick={reload}>{t('retry')}</Button></div>}
    <div className="media-detail-grid">
      <MediaPreview record={record} />
      <MetadataRows record={record} />
      <Card className="media-rights">
        <h2>{t('rights')}</h2>
        {editable ? <MediaMetadataForm initial={{ ...record, language: record.language || '' }} save={save}
          onDirty={setDirty} disabled={Boolean(busy)} /> : <LockedRights record={record} />}
        {errorFor('metadata')}
      </Card>
      <Card className="media-workflow">
        <h2>{t('status')}</h2>
        <MediaStatusBadge status={record.status} />
        <p className="media-note">{t(record.status === 'published' ? 'locked' : record.status === 'archived' ? 'archivedHint' : 'publishHint')}</p>
        {dirty && <p className="media-note">{t('saveBeforePublish')}</p>}
        {!canPublish && record.status !== 'archived' && <p className="media-note">{t('publishRequired')}</p>}
        {editable && canPublish && <PanelDialog title={t('publishTitle')} description={t('publishHint')} closeLabel={t('close')}
          open={confirmPublish} onOpenChange={value => { if (!busy) { setConfirmPublish(value); setFeedback(undefined); } }}
          trigger={<Button disabled={Boolean(busy) || dirty}>{t('publish')}</Button>}>
          {errorFor('status')}
          <div className="media-actions">
            <DialogClose asChild><Button variant="secondary" disabled={Boolean(busy)}>{t('cancel')}</Button></DialogClose>
            {feedback?.error === 'stale' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
            <Button onClick={() => void status('published')} disabled={Boolean(busy)}>{t(busy ? 'statusChanging' : 'publish')}</Button>
          </div>
        </PanelDialog>}
        {record.status === 'published' && canPublish && <Button variant="secondary" disabled={Boolean(busy)}
          onClick={() => void status('archived')}>{t(busy === 'status' ? 'statusChanging' : 'archive')}</Button>}
        {record.status === 'archived' && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void status('draft')}>
          {t(busy === 'status' ? 'statusChanging' : 'restore')}
        </Button>}
        {!confirmPublish && errorFor('status')}
        <div className="media-delete">
          <p className="media-note">{t('deleteRestricted')}</p>
          {record.status !== 'published' && <PanelDialog title={t('deleteTitle')} description={t('deleteDescription')} closeLabel={t('close')}
            open={confirmDelete} onOpenChange={value => { if (!busy) { setConfirmDelete(value); setFeedback(undefined); } }}
            trigger={<Button className="media-danger" variant="secondary" disabled={Boolean(busy)}>{t('danger')}</Button>}>
            <p className="media-note"><bdi>{record.title}</bdi></p>
            {errorFor('delete')}
            <div className="media-actions">
              <DialogClose asChild><Button variant="secondary" disabled={Boolean(busy)}>{t('cancel')}</Button></DialogClose>
              {feedback?.error === 'stale' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
              <Button className="media-danger" variant="secondary" onClick={() => void deleteFile()} disabled={Boolean(busy)}>
                {t(busy === 'delete' ? 'deleting' : 'danger')}
              </Button>
            </div>
          </PanelDialog>}
        </div>
      </Card>
      <RelatedMedia record={record} editable={editable} busy={Boolean(busy)} attach={attach} remove={remove}
        error={feedback?.area === 'links' ? feedback.error : undefined} />
    </div>
  </div>;
}

export function MediaDetail({ id }: { id: string }) {
  const { t } = useTranslation('media');
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal) => {
    const [item, account] = await Promise.all([getMedia(id, signal), readIdentity(signal)]);
    return { item, canPublish: account?.permissions.includes('media:publish') ?? false };
  }, [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'ready') return <MediaRecordPage key={id} initial={result.data.item} canPublish={result.data.canPublish} reload={reload} />;
  return <div className="media-module">
    <MediaHeading title={t('detail')} navigation={<Link className="media-parent" to={mediaPath + search}>{t('back')}</Link>} />
    {result.status === 'loading' ? <StatePanel kind="loading" title={t('loading')} /> :
      <StatePanel kind="error" title={t(mediaError(result.error))}><Button onClick={reload} variant="secondary">{t('retry')}</Button></StatePanel>}
  </div>;
}
