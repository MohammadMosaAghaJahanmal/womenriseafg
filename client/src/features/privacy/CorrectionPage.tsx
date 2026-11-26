import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, StatePanel } from '../../components/ui/Primitives';
import { reportablePath } from './links';
import { privacyNamespace as ns } from './strings';
import '../../pages/workspace.css';
import './privacy.css';

export default function CorrectionPage() {
  const { t } = useTranslation(ns);
  const [query] = useSearchParams();
  const resource = query.get('resource') ?? '';
  if (!reportablePath(resource)) return <section className="workspace-page">
    <h1>{t('reportTitle')}</h1>
    <StatePanel kind="empty" title={t('unavailable')}>
      <Button asChild variant="secondary"><Link to="/explore">{t('choose')}</Link></Button>
    </StatePanel>
  </section>;

  return <CorrectionForm key={resource} resource={resource} />;
}

function CorrectionForm({ resource }: { resource: string }) {
  const { t } = useTranslation(ns);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const submitted = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state === 'sent') submitted.current?.focus();
  }, [state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== 'idle') return;
    setState('sending');
    setError('');
    try {
      const result = await fetch('/api/v1/corrections', {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource, message }),
      });
      if (result.status === 201) {
        setMessage('');
        setState('sent');
        return;
      }
      setError(result.status === 429 ? 'rate' : result.status === 400 ? 'invalid' : result.status === 404 ? 'unavailable' : 'failed');
    } catch {
      setError('failed');
    }
    setState('idle');
  }

  return <section className="workspace-page">
    <h1>{t('reportTitle')}</h1>
    <p className="workspace-intro">{t('reportIntro')}</p>
    <Card className="workspace-panel">
      {state === 'sent' ? <p ref={submitted} tabIndex={-1} role="status" className="privacy-success">{t('sent')}</p> :
        <form className="correction-form" autoComplete="off" onSubmit={event => void submit(event)}>
          <p>{t('reportTarget')}{' '}<bdi dir="ltr" className="correction-path">{resource}</bdi></p>
          <p id="correction-safety">{t('reportSafety')}</p>
          <div className="ui-field">
            <label htmlFor="correction-message">{t('reportField')}</label>
            <textarea id="correction-message" value={message} onChange={event => setMessage(event.target.value)}
              dir="auto" rows={5} required minLength={12} maxLength={1200} disabled={state === 'sending'} spellCheck={false}
              aria-describedby="correction-safety correction-length" aria-invalid={error === 'invalid' || undefined} />
            <p id="correction-length" className="privacy-note">{t('reportLength')}</p>
          </div>
          {error && <p role="alert" className="privacy-error">{t(error)}</p>}
          <Button type="submit" disabled={state === 'sending'}>{t(state === 'sending' ? 'sending' : 'submit')}</Button>
        </form>}
      <div className="privacy-actions">
        <Button asChild variant="ghost"><Link to={resource}>{t('back')}</Link></Button>
      </div>
    </Card>
  </section>;
}
