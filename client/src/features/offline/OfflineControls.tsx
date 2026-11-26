import { Download, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, DialogClose, PanelDialog } from '../../components/ui/Primitives';
import { usePreferences } from '../../preferences';
import { clearDataSavingPreference } from '../data-saving/preferences';
import { useEducationData } from '../education/useEducationData';
import { setLearningEnabled } from '../engagement/local';
import { clearOfflineShell, enableOfflineShell, offlineShellReady, offlineShellSupported, useInstallPrompt } from '../pwa/shell';
import { useOnlineStatus } from './online';
import { clearOfflineResources, refreshOfflineDownloads } from './store';
import { offlineNamespace as ns } from './strings';
import './offline.css';

const getShell = async () => Boolean(await offlineShellReady());

export function OfflineControls() {
  const { t } = useTranslation(ns);
  const online = useOnlineStatus();
  const { result, reload } = useEducationData(getShell);
  const { canInstall, promptInstall } = useInstallPrompt();
  const supported = offlineShellSupported();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const ready = result.status === 'ready' && result.data;
  useEffect(() => {
    window.addEventListener('womenriseafg-offline-shell', reload);
    return () => window.removeEventListener('womenriseafg-offline-shell', reload);
  }, [reload]);

  async function setup(install: boolean) {
    if (!online || pending) return;
    setPending(true);
    setMessage('');
    try {
      if (install && !await promptInstall()) return;
      await enableOfflineShell();
      reload();
      void refreshOfflineDownloads();
      setMessage('enabled');
    } catch {
      setMessage('unavailable');
    } finally {
      setPending(false);
    }
  }
  return <>
    <section className="learn-panel offline-device" aria-label={t('device')}>
      <h2>{t('device')}</h2>
      <p>{t('deviceHelp')}</p>
      <p>{t('setupHelp')}</p>
      <div className="offline-actions">
        {!ready && supported && <Button variant="secondary" disabled={!online || pending} onClick={() => void setup(false)}>
          <Download size={17} aria-hidden="true" />{t(pending ? 'preparing' : 'enable')}
        </Button>}
        {online && <Link className="offline-link" to="/settings">{t('settings')}</Link>}
      </div>
      {!supported ? <p>{t('unavailable')}</p> : !online && !ready && <p>{t('connect')}</p>}
      {(ready || message) && <p role={message === 'unavailable' ? 'alert' : 'status'}>{t(message || 'enabled')}</p>}
    </section>
    <section className="learn-panel offline-device" aria-label={t('app')}>
      <h2>{t('app')}</h2><p>{t('installHelp')}</p>
      {canInstall && <Button variant="secondary" disabled={!online || pending} onClick={() => void setup(true)}>
        <Smartphone size={17} aria-hidden="true" />{t('install')}
      </Button>}
    </section>
  </>;
}

export function ClearLocalLearning() {
  const { t } = useTranslation(ns);
  const { clearPreferences } = usePreferences();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('');
  async function clear() {
    if (pending) return;
    setPending(true);
    setResult('');
    const learning = setLearningEnabled(false);
    const appearance = clearPreferences();
    const dataSaving = clearDataSavingPreference();
    const states = await Promise.allSettled([clearOfflineResources(), clearOfflineShell()]);
    setResult(learning && appearance && dataSaving && states.every(state => state.status === 'fulfilled') ? 'clearedAll' : 'clearFailed');
    setPending(false);
  }
  return <section className="auth-settings workspace-panel offline-device" aria-label={t('clearTitle')}>
    <h2>{t('clearTitle')}</h2>
    <p>{t('clearHelp')}</p>
    <PanelDialog title={t('clearConfirm')} description={t('clearDescription')} closeLabel={t('close')}
      trigger={<Button variant="secondary" disabled={pending}>{t(pending ? 'busy' : 'clearAction')}</Button>}>
      <div className="offline-actions">
        <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
        <DialogClose asChild><Button onClick={() => void clear()}>{t('clearAction')}</Button></DialogClose>
      </div>
    </PanelDialog>
    {result && <p role={result === 'clearedAll' ? 'status' : 'alert'}>{t(result)}</p>}
  </section>;
}
