import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, SelectField, StatePanel } from '../../components/ui/Primitives';
import { useEducationData } from '../education/useEducationData';
import { reportablePath } from './links';
import { privacyNamespace as ns } from './strings';
import './privacy.css';

type CorrectionState = 'open' | 'resolved';
interface CorrectionItem {
  id: string;
  resourcePath: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
}
interface Queue {
  items: CorrectionItem[];
  total: number;
  pageSize: number;
}
const queuePath = '/api/v1/admin/corrections';

async function loadQueue(signal: AbortSignal, status: CorrectionState, page: number): Promise<Queue> {
  const response = await fetch(queuePath + '?' + new URLSearchParams({ status, page: String(page) }), { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load corrections');
  return await response.json() as Queue;
}

export default function CorrectionQueue() {
  const { t, i18n } = useTranslation(ns);
  const [status, setStatus] = useState<CorrectionState>('open');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const outcome = useRef<HTMLParagraphElement>(null);
  const load = useCallback((signal: AbortSignal) => loadQueue(signal, status, page), [page, status]);
  const { result, reload } = useEducationData(load);
  useEffect(() => {
    if (notice) outcome.current?.focus();
  }, [notice]);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const number = new Intl.NumberFormat(i18n.language);

  async function change(item: CorrectionItem, visibleItems: number) {
    if (pending) return;
    setPending(item.id);
    setNotice('');
    try {
      const response = await fetch(queuePath + '/' + encodeURIComponent(item.id), {
        method: 'PATCH', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status === 'open' ? 'resolved' : 'open' }),
      });
      if (response.status === 204) {
        setNotice('updated');
        if (visibleItems === 1 && page > 1) setPage(page - 1);
        else reload();
      } else if (response.status === 409) {
        setNotice('stale');
        reload();
      } else setNotice('changeFailed');
    } catch {
      setNotice('changeFailed');
    } finally {
      setPending('');
    }
  }

  const pages = result.status === 'ready' ? Math.ceil(result.data.total / result.data.pageSize) : 0;
  return <section className="correction-queue">
    <h1>{t('queueTitle')}</h1>
    <p>{t('queueIntro')}</p>
    <div className="correction-filter">
      <SelectField label={t('queueState')} value={status} disabled={Boolean(pending)} onChange={event => {
        setStatus(event.target.value as CorrectionState);
        setPage(1);
        setNotice('');
      }}>
        <option value="open">{t('open')}</option>
        <option value="resolved">{t('resolved')}</option>
      </SelectField>
    </div>
    {notice && <p ref={outcome} tabIndex={-1} role={notice === 'changeFailed' ? 'alert' : 'status'}>{t(notice)}</p>}
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('queueFailed')}>
      <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && (result.data.items.length ?
      <ul className="correction-cards">
        {result.data.items.map(item => <li key={item.id}>
          <Card>
            <time dateTime={item.createdAt} className="privacy-note">{date.format(new Date(item.createdAt))}</time>
            <p dir="auto" className="correction-message">{item.message}</p>
            <p><bdi dir="ltr" className="correction-path">{item.resourcePath}</bdi></p>
            <div className="privacy-actions">
              {reportablePath(item.resourcePath) &&
                <Button asChild variant="ghost"><Link to={item.resourcePath}>{t('reviewResource')}</Link></Button>}
              <Button variant="secondary" disabled={Boolean(pending)}
                onClick={() => void change(item, result.data.items.length)}>
                {t(pending === item.id ? 'pending' : status === 'open' ? 'resolve' : 'reopen')}
              </Button>
            </div>
          </Card>
        </li>)}
      </ul> : <StatePanel kind="empty" title={t('queueEmpty')} />)}
    {pages > 1 && <div className="privacy-actions">
      <Button variant="secondary" disabled={page <= 1 || Boolean(pending)} onClick={() => setPage(page - 1)}>{t('previous')}</Button>
      <span>{t('page', { page: number.format(page), pages: number.format(pages) })}</span>
      <Button variant="secondary" disabled={page >= pages || Boolean(pending)} onClick={() => setPage(page + 1)}>{t('next')}</Button>
    </div>}
  </section>;
}
