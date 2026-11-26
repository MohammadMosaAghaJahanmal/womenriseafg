import { FileDown, FolderOpen, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Button, DialogClose, PanelDialog, StatePanel } from '../../components/ui/Primitives';
import { useEducationData } from '../education/useEducationData';
import { ClearLocalLearning, OfflineControls } from './OfflineControls';
import { useOnlineStatus } from './online';
import { displaySize, offlineFailure, offlinePath } from './presentation';
import { cancelOfflineDownload, clearOfflineResources, readOfflineResource, refreshOfflineDownloads,
  removeOfflineResource, useOfflineDownloads } from './store';
import { offlineNamespace as ns } from './strings';
import type { OfflineJob, OfflineRecord, OfflineSummary } from './types';
import './offline.css';

function ConfirmRemoval({ trigger, all, run }: { trigger: ReactNode; all?: boolean; run: () => void }) {
  const { t } = useTranslation(ns);
  return <PanelDialog title={t(all ? 'removeAllTitle' : 'removeTitle')}
    description={t(all ? 'removeAllDescription' : 'removeDescription')} closeLabel={t('close')}
    trigger={<Button variant="secondary">{trigger}</Button>}>
    <div className="offline-actions">
      <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button onClick={run}>{t(all ? 'removeAll' : 'remove')}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

function DownloadJob({ job }: { job: OfflineJob }) {
  const { t, i18n } = useTranslation(ns);
  const loaded = displaySize(job.loadedBytes, i18n.language);
  const total = job.totalBytes && job.totalBytes > 0 ? displaySize(job.totalBytes, i18n.language) : null;
  const description = total ? t('progress', { loaded, total }) : t('received', { loaded });
  return <li className="offline-row">
    <div>
      <bdi lang={job.locale}>{job.title}</bdi>
      <progress max={job.totalBytes || undefined} value={total ? job.loadedBytes : undefined} aria-label={description} />
      <small>{job.loadedBytes ? description : t('preparing')}</small>
    </div>
    <Button variant="secondary" onClick={() => cancelOfflineDownload(job.key)}>{t('cancel')}</Button>
  </li>;
}

function DownloadRow({ item, remove }: { item: OfflineSummary; remove: () => void }) {
  const { t, i18n } = useTranslation(ns);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(item.savedAt);
  return <li className="offline-row">
    <div>
      <small>{t(item.kind)}</small>
      <Link className="offline-link" to={offlinePath(item.key)}><bdi lang={item.locale}>{item.title}</bdi></Link>
      <small>{displaySize(item.sizeBytes, i18n.language)} · {t('savedAt', { date })}</small>
    </div>
    <ConfirmRemoval trigger={t('remove')} run={remove} />
  </li>;
}

function Downloads() {
  const { t, i18n } = useTranslation(ns);
  const { records, active, loading, error, storage } = useOfflineDownloads();
  const online = useOnlineStatus();
  const [notice, setNotice] = useState('');
  const [alert, setAlert] = useState('');
  const Icon = online ? Wifi : WifiOff;
  const size = (bytes: number) => displaySize(bytes, i18n.language);
  const room = storage.quotaBytes === null || storage.usageBytes === null ? null
    : Math.max(0, storage.quotaBytes - storage.usageBytes);

  async function remove(key?: string) {
    setNotice('');
    setAlert('');
    try {
      if (key) await removeOfflineResource(key);
      else await clearOfflineResources();
      setNotice(key ? 'removed' : 'cleared');
    } catch (failure) {
      setAlert(offlineFailure(failure));
    }
  }

  return <div className="learn-page offline-page">
    <header className="offline-header">
      <div><h1>{t('title')}</h1><p>{t('intro')}</p></div>
      <p className="offline-connectivity"><Icon size={18} aria-hidden="true" />{t(online ? 'online' : 'offline')}</p>
    </header>
    <section className="learn-panel offline-device" aria-label={t('storage')}>
      <h2>{t('storage')}</h2>
      <dl className="offline-storage">
        <div><dt>{t('downloadStorage')}</dt><dd>{size(storage.downloadBytes)}</dd></div>
        <div><dt>{t('downloadLimit')}</dt><dd>{size(storage.limitBytes)}</dd></div>
        <div><dt>{t('deviceStorage')}</dt><dd>{room === null ? t('spaceUnknown') : size(room)}</dd></div>
      </dl>
    </section>
    {alert && <p role="alert">{t(alert)}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    {loading && <StatePanel kind="loading" title={t('waiting')} />}
    {error && <StatePanel kind="error" title={t(error)}>
      <Button variant="secondary" onClick={() => void refreshOfflineDownloads()}>{t('retry')}</Button>
    </StatePanel>}
    {active.length > 0 && <section className="learn-panel offline-device" aria-label={t('inFlight')}>
      <h2>{t('inFlight')}</h2>
      <ul className="offline-list">{active.map(job => <DownloadJob key={job.key} job={job} />)}</ul>
    </section>}
    {records.length > 0 && <ul className="offline-list" aria-label={t('downloadStorage')}>
      {records.map(item => <DownloadRow key={item.key} item={item} remove={() => void remove(item.key)} />)}
    </ul>}
    {!loading && !error && records.length === 0 && active.length === 0 && <StatePanel kind="empty" title={t('empty')}>
      {online && <Button variant="secondary" asChild><Link to="/courses">{t('explore')}</Link></Button>}
    </StatePanel>}
    {(records.length > 0 || active.length > 0) && <div className="offline-actions">
      <ConfirmRemoval all trigger={t('removeAll')} run={() => void remove()} />
    </div>}
    <OfflineControls />
    <ClearLocalLearning />
  </div>;
}

function LocalFile({ record }: { record: OfflineRecord }) {
  const { t } = useTranslation(ns);
  const [source, setSource] = useState<{ blob: Blob; url: string }>();
  const [text, setText] = useState('');
  const data = record.blob;
  const file = record.file;
  useEffect(() => {
    if (!data) return;
    const url = URL.createObjectURL(data);
    setSource({ blob: data, url });
    let active = true;
    if (data.type.startsWith('text/')) void data.text().then(value => { if (active) setText(value); }, () => undefined);
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [data]);
  const url = source?.blob === data ? source?.url : undefined;
  if (!file || !url) return null;
  const { mimeType } = file;
  return <section className="learn-panel offline-file">
    {mimeType.startsWith('video/') && <video key={url} src={url} aria-label={record.title} controls playsInline preload="none" />}
    {mimeType.startsWith('audio/') && <audio key={url} src={url} aria-label={record.title} controls preload="none" />}
    {mimeType.startsWith('image/') && <img src={url} alt={record.title} />}
    {mimeType.startsWith('text/') && <pre lang={record.locale} dir="auto">{text}</pre>}
    <div className="offline-actions">
      {mimeType === 'application/pdf' && <Button asChild><a href={url} target="_blank" rel="noopener noreferrer">
        <FolderOpen size={17} aria-hidden="true" />{t('openFile')}
      </a></Button>}
      <Button variant="secondary" asChild><a href={url} download={file.name}>
        <FileDown size={17} aria-hidden="true" />{t('exportFile')}
      </a></Button>
    </div>
  </section>;
}

function Copy({ resourceKey }: { resourceKey: string }) {
  const { t } = useTranslation(ns);
  const { records, loading, error } = useOfflineDownloads();
  const item = records.find(record => record.key === resourceKey);
  const load = useCallback(() => item ? readOfflineResource(resourceKey) : Promise.resolve(null), [resourceKey, item]);
  const { result, reload } = useEducationData(load);
  const record = item && result.status === 'ready' ? result.data : null;
  const pending = loading || (item && result.status === 'loading');
  return <div className="learn-page offline-page">
    <Link className="offline-link" to="/downloads">{t('title')}</Link>
    {record ? <>
      <header className="offline-header"><div>
        <small>{t(record.kind)}</small><h1 lang={record.locale} dir="auto">{record.title}</h1>
        {record.description && <p lang={record.locale} dir="auto">{record.description}</p>}
      </div></header>
      {record.body && <article className="learn-panel offline-body" lang={record.locale} dir="auto">{record.body}</article>}
      {record.blob && <LocalFile key={record.key} record={record} />}
    </> : <>
      <h1>{t('title')}</h1>
      {pending ? <StatePanel kind="loading" title={t('waiting')} />
        : (error || result.status === 'error') ? <StatePanel kind="error" title={t(error ?? offlineFailure(result.status === 'error' ? result.error : null))}>
          <Button variant="secondary" onClick={() => { void refreshOfflineDownloads(); reload(); }}>{t('retry')}</Button>
        </StatePanel> : <StatePanel kind="empty" title={t('missing')} />}
    </>}
  </div>;
}

export default function OfflinePage() {
  const { key } = useParams();
  return key ? <Copy key={key} resourceKey={key} /> : <Downloads />;
}
