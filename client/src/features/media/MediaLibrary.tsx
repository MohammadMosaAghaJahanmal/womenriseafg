import { Files, FileText, HardDrive, Link2Off, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button, Card, DialogClose, InputField, Pagination, PanelDialog, SelectField, StatePanel } from '../../components/ui/Primitives';
import { useEducationData } from '../education/useEducationData';
import { cleanupMedia, listMedia, loadMediaUsage, mediaBytes, mediaError, mediaKinds, mediaPath, mediaStatuses, type MediaRecord, type MediaStatus } from './api';

export function MediaHeading({ title, description, navigation, action }: {
  title: string; description?: string; navigation?: ReactNode; action?: ReactNode;
}) {
  return <header className="media-heading">
    <div className="media-heading-copy">
      <span className="media-mark"><Files aria-hidden="true" size={23} /></span>
      <div>{navigation}<h1 dir="auto">{title}</h1>{description && <p>{description}</p>}</div>
    </div>
    {action}
  </header>;
}

export function MediaStatusBadge({ status }: { status: MediaStatus }) {
  const { t } = useTranslation('media');
  return <span className={'media-status media-status-' + status}>{t(status)}</span>;
}

function Usage() {
  const { t, i18n } = useTranslation('media');
  const { result, reload } = useEducationData(loadMediaUsage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ done?: { removed: number; pending: number }; error?: string }>();
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => operation.current?.abort(), []);

  async function cleanup() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setFeedback(undefined);
    try {
      const done = await cleanupMedia(controller.signal);
      if (controller.signal.aborted) return;
      setFeedback({ done });
      setConfirmOpen(false);
      reload();
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ error: mediaError(error) });
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (result.status === 'loading') return <Card><StatePanel kind="loading" title={t('loading')} /></Card>;
  if (result.status === 'error') return <Card><StatePanel kind="error" title={t(mediaError(result.error))}>
    <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
  </StatePanel></Card>;

  const counts = result.data;
  const number = new Intl.NumberFormat(i18n.language);
  const metrics = [
    { name: 'filesStored', value: number.format(counts.assets), Icon: FileText },
    { name: 'bytesStored', value: mediaBytes(counts.usedBytes, i18n.language), Icon: HardDrive },
    { name: 'freeSpace', value: mediaBytes(counts.freeBytes, i18n.language), Icon: HardDrive },
    { name: 'orphanFilter', value: number.format(counts.orphanAssets), Icon: Link2Off },
  ];
  return <section aria-label={t('storage')} className="media-usage">
    <div className="media-metrics">{metrics.map(({ name, value, Icon }) => <Card className="media-metric" key={name}>
      <span className="media-metric-icon"><Icon size={20} aria-hidden="true" /></span>
      <div><p>{t(name)}</p><strong><bdi>{value}</bdi></strong></div>
    </Card>)}</div>
    <div className="media-maintenance">
      <div>
        <p>{t('pending')} <bdi className="media-count">{number.format(counts.pendingDeletes)}</bdi></p>
        {counts.orphanFiles !== undefined && <p>{t('untracked')} <bdi className="media-count">{number.format(counts.orphanFiles)}</bdi></p>}
      </div>
      <PanelDialog title={t('cleanupTitle')} description={t('cleanupDescription')} closeLabel={t('close')} open={confirmOpen}
        onOpenChange={value => { if (!busy) { setConfirmOpen(value); setFeedback(undefined); } }}
        trigger={<Button variant="ghost"><RefreshCw size={17} aria-hidden="true" />{t('retryCleanup')}</Button>}>
        {feedback?.error && <p role="alert" className="media-message media-message-error">{t(feedback.error)}</p>}
        <div className="media-actions">
          <DialogClose asChild><Button variant="secondary" disabled={busy}>{t('cancel')}</Button></DialogClose>
          <Button onClick={() => void cleanup()} disabled={busy}>{t(busy ? 'statusChanging' : 'confirm')}</Button>
        </div>
      </PanelDialog>
    </div>
    {feedback?.done && <p className="media-message" role="status">{t('cleanupDone', {
      removed: number.format(feedback.done.removed), pending: number.format(feedback.done.pending),
    })}</p>}
  </section>;
}

function FileName({ item }: { item: MediaRecord }) {
  return <span className="media-filename"><bdi>{item.title}</bdi><small><bdi>{item.originalName}</bdi></small></span>;
}

function FileLink({ item }: { item: MediaRecord }) {
  const { t } = useTranslation('media');
  const { search } = useLocation();
  return <Button asChild variant="ghost" className="media-details-link">
    <Link to={mediaPath + '/' + item.id + search} aria-label={t('openNamed', { title: item.title })}>{t('open')}</Link>
  </Button>;
}

function MediaRows({ items }: { items: MediaRecord[] }) {
  const { t, i18n } = useTranslation('media');
  return <>
    <table className="media-table">
      <caption className="admin-sr">{t('title')}</caption>
      <thead><tr><th scope="col">{t('file')}</th><th scope="col">{t('kind')}</th><th scope="col">{t('size')}</th>
        <th scope="col">{t('status')}</th><th scope="col">{t('detail')}</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.id}>
        <th scope="row"><FileName item={item} /></th><td>{t(item.kind)}</td>
        <td><bdi>{mediaBytes(item.sizeBytes, i18n.language)}</bdi></td><td><MediaStatusBadge status={item.status} /></td>
        <td><FileLink item={item} /></td>
      </tr>)}</tbody>
    </table>
    <ul className="media-rows" aria-label={t('title')}>{items.map(item => <li key={item.id} className="media-row">
      <FileName item={item} /><dl>
        <div><dt>{t('kind')}</dt><dd>{t(item.kind)}</dd></div>
        <div><dt>{t('size')}</dt><dd><bdi>{mediaBytes(item.sizeBytes, i18n.language)}</bdi></dd></div>
        <div><dt>{t('status')}</dt><dd><MediaStatusBadge status={item.status} /></dd></div>
      </dl><FileLink item={item} />
    </li>)}</ul>
  </>;
}

export function MediaLibrary() {
  const { t, i18n } = useTranslation('media');
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, 120);
  const kind = mediaKinds.find(value => value === params.get('kind'));
  const status = mediaStatuses.find(value => value === params.get('status'));
  const orphans = params.get('orphans') === 'true';
  const pageValue = Number(params.get('page')) || 1;
  const page = Number.isSafeInteger(pageValue) ? Math.max(1, Math.min(pageValue, 100000)) : 1;
  const load = useCallback((signal: AbortSignal) =>
    listMedia({ q: q || undefined, status, kind, page, pageSize: 10, orphans: orphans || undefined }, signal),
  [q, status, kind, page, orphans]);
  const { result, reload } = useEducationData(load);
  const pages = result.status === 'ready' ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;
  const number = new Intl.NumberFormat(i18n.language);
  const filtered = q || status || kind || orphans;
  const message = (location.state as { message?: string } | null)?.message;

  useEffect(() => {
    if (result.status !== 'ready' || page <= pages) return;
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (pages > 1) next.set('page', String(pages));
      else next.delete('page');
      return next;
    }, { replace: true });
  }, [page, pages, result.status, setParams]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'kind', 'status', 'orphans']) {
      const value = String(fields.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    setParams(next);
  }

  function toPage(value: number) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value > 1) next.set('page', String(value));
      else next.delete('page');
      return next;
    });
  }

  return <div className="media-module">
    <MediaHeading title={t('title')} description={t('intro')} action={result.status === 'ready' &&
      <Button asChild><Link to={mediaPath + '/upload'}><Plus size={19} aria-hidden="true" />{t('uploadTitle')}</Link></Button>} />
    {message && <p className="media-message" role="status">{t(message)}</p>}
    <Usage />
    <Card className="media-list">
      <form className="media-filter" onSubmit={search} key={[q, kind, status, orphans].join('/')}>
        <InputField label={t('search')} name="q" type="search" maxLength={120} defaultValue={q} dir="auto" placeholder={t('searchPlaceholder')} />
        <SelectField label={t('kind')} name="kind" defaultValue={kind ?? ''}>
          <option value="">{t('allKinds')}</option>{mediaKinds.map(value => <option key={value} value={value}>{t(value)}</option>)}
        </SelectField>
        <SelectField label={t('status')} name="status" defaultValue={status ?? ''}>
          <option value="">{t('allStatuses')}</option>{mediaStatuses.map(value => <option key={value} value={value}>{t(value)}</option>)}
        </SelectField>
        <label className="media-check"><input type="checkbox" name="orphans" value="true" defaultChecked={orphans} />{t('orphanFilter')}</label>
        <div className="media-filter-actions">
          <Button variant="secondary" type="submit">{t('searchAction')}</Button>
          {filtered && <Button variant="ghost" onClick={() => setParams({})}>{t('clear')}</Button>}
        </div>
      </form>
      {orphans && <p className="media-note">{t('orphanHint')}</p>}
      <div className="media-results" aria-busy={result.status === 'loading'}>
        {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
        {result.status === 'error' && <StatePanel kind="error" title={t(mediaError(result.error))}>
          <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
        </StatePanel>}
        {result.status === 'ready' && (result.data.items.length ? <>
          <p className="media-note" role="status">{t('results', { count: result.data.total, countText: number.format(result.data.total) })}</p>
          <MediaRows items={result.data.items} />
          <Pagination page={page} pages={pages} pageLabel={t('page', { page: number.format(page), pages: number.format(pages) })}
            label={t('pagination')} previous={t('previous')} next={t('next')} onChange={toPage} />
        </> : <StatePanel kind="empty" title={t('empty')} description={t(orphans ? 'orphanEmpty' : 'emptyHint')} />)}
      </div>
    </Card>
  </div>;
}
