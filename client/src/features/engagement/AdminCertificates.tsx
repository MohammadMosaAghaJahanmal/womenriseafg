import { isAxiosError } from 'axios';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InputField, StatePanel } from '../../components/ui/Primitives';
import { learnerLanguageName } from '../courses/student/components';
import { useEducationData } from '../education/useEducationData';
import { ConfirmQuizAction } from '../quizzes/AdminFields';
import { certificateSettingsNamespace as ns, readCertificateReceipt, readCertificateSettings, saveCertificateSettings, templateLanguages,
  updateCertificateReceipt, type CertificateReceipt, type CertificateSettings, type CertificateTemplate } from './certificateSettings';
import { learningNamespace } from './strings';

function Templates({ initial, reload }: { initial: CertificateSettings; reload: () => void }) {
  const { t } = useTranslation([ns, learningNamespace]);
  const [current, setCurrent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const available = current.templates.some(template => template.enabled);
  function change(layout: CertificateTemplate['layout'], edit: Partial<CertificateTemplate>) {
    setCurrent({ ...current, templates: current.templates.map(template => template.layout === layout ? { ...template, ...edit } : template) });
    setMessage('');
  }
  return <form className="learn-panel discovery-editor" onSubmit={async event => {
    event.preventDefault();
    if (!available || busy) return;
    setBusy(true);
    try { setCurrent(await saveCertificateSettings(current)); setMessage('saved'); }
    catch (error) { setMessage(isAxiosError(error) && error.response?.status === 409 ? 'stale' : 'failure'); }
    finally { setBusy(false); }
  }}>
    <h2>{t('templates')}</h2>
    {current.templates.map(template => <fieldset className="discovery-translation discovery-editor" key={template.layout} disabled={busy}>
      <legend>{t('engagement:' + template.layout)}</legend>
      <label className="certificate-check"><input type="checkbox" checked={template.enabled}
        onChange={event => change(template.layout, { enabled: event.currentTarget.checked })} />{t('enabled')}</label>
      {templateLanguages.map(locale => <InputField key={locale} label={t('customTitle') + ' · ' + learnerLanguageName(locale)}
        lang={locale} dir="auto" maxLength={120} value={template.titles[locale]}
        onChange={event => change(template.layout, { titles: { ...template.titles, [locale]: event.currentTarget.value } })} />)}
    </fieldset>)}
    {!available && <p role="status">{t('leastOne')}</p>}
    {message && <p role={message === 'saved' ? 'status' : 'alert'}>{t(message)}</p>}
    <div className="learning-actions"><Button type="submit" disabled={!available || busy || message === 'stale'}>
      {t(busy ? 'saving' : 'save')}</Button>
      {message === 'stale' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
    </div>
  </form>;
}

function ReceiptLookup() {
  const { t, i18n } = useTranslation(ns);
  const [code, setCode] = useState('');
  const [receipt, setReceipt] = useState<CertificateReceipt>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <section className="learn-panel discovery-editor">
    <h2>{t('lookup')}</h2><p>{t('lookupHelp')}</p>
    <form className="course-search" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      setReceipt(undefined);
      setMessage('');
      try { setReceipt(await readCertificateReceipt(code.trim().toLowerCase())); }
      catch (error) { setMessage(isAxiosError(error) && error.response?.status === 404 ? 'notFound' : 'failure'); }
      finally { setBusy(false); }
    }}>
      <InputField required maxLength={36} pattern="[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}"
        dir="ltr" autoComplete="off" label={t('code')} value={code}
        onChange={event => setCode(event.currentTarget.value)} />
      <Button type="submit" disabled={busy}>{t('find')}</Button>
    </form>
    {message && <p role={message === 'changed' ? 'status' : 'alert'}>{t(message)}</p>}
    {receipt && <div className="discovery-editor">
      <p><bdi>{receipt.code}</bdi> · <bdi>{receipt.courseSlug}</bdi> · {' '}
        {new Intl.DateTimeFormat(i18n.language, { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(receipt.issuedAt))}</p>
      <p>{t(receipt.withdrawn ? 'withdrawn' : 'available')}</p>
      <ConfirmQuizAction disabled={busy} label={t(receipt.withdrawn ? 'reinstate' : 'withdraw')}
        title={t(receipt.withdrawn ? 'confirmReinstate' : 'confirmWithdraw')} onConfirm={() => void (async () => {
          setBusy(true);
          setMessage('');
          try { setReceipt(await updateCertificateReceipt(receipt.code, !receipt.withdrawn)); setMessage('changed'); }
          catch { setMessage('failure'); }
          finally { setBusy(false); }
        })()} />
    </div>}
  </section>;
}

export default function AdminCertificates() {
  const { t } = useTranslation(ns);
  const { result, reload } = useEducationData(readCertificateSettings);
  return <div className="discovery-admin">
    <h1>{t('title')}</h1>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('load')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('failure')}>
      <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && <><Templates key={result.data.version} initial={result.data} reload={reload} /><ReceiptLookup /></>}
  </div>;
}
