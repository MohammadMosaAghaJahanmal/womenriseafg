import { Download, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, DialogClose, PanelDialog } from '../../components/ui/Primitives';
import { enableOfflineShell, offlineShellSupported } from '../pwa/shell';
import { displaySize, offlineFailure, offlinePath } from './presentation';
import { useOnlineStatus } from './online';
import { saveOfflineResource, useOfflineDownloads } from './store';
import { offlineNamespace as ns } from './strings';
import type { OfflineResourceDraft } from './types';
import './offline.css';

export function OfflineSave({ resource }: { resource: OfflineResourceDraft }) {
  const { t, i18n } = useTranslation(ns);
  const online = useOnlineStatus();
  const supported = offlineShellSupported();
  const { records, active } = useOfflineDownloads();
  const [failure, setFailure] = useState('');
  const current = records.find(entry => entry.key === resource.key);
  const job = active.find(entry => entry.key === resource.key);
  const bytes = resource.file?.sizeBytes;

  async function save() {
    setFailure('');
    try {
      await saveOfflineResource(resource, { prepare: enableOfflineShell });
    } catch (error) {
      setFailure(offlineFailure(error));
    }
  }
  return <span className="offline-action">
    {current ? <Button asChild variant="secondary"><Link to={offlinePath(current.key)}>
      <FolderOpen size={17} aria-hidden="true" />{t('open')}
    </Link></Button> : job ? <Button asChild variant="secondary"><Link to="/downloads">
      <Download size={17} aria-hidden="true" />{t(job.loadedBytes > 0 ? 'downloading' : 'preparing')}
    </Link></Button> : !supported ? <small>{t('unavailable')}</small> : <PanelDialog title={t('saveTitle')} description={t('deviceHelp')} closeLabel={t('close')}
      trigger={<Button variant="secondary" disabled={!online}><Download size={17} aria-hidden="true" />{t('save')}</Button>}>
      <p><bdi lang={resource.locale}>{resource.title}</bdi></p>
      {typeof bytes === 'number' && bytes > 0 && <p>{t('size', { size: displaySize(bytes, i18n.language) })}</p>}
      <div className="offline-actions">
        <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
        <DialogClose asChild><Button onClick={() => void save()}>{t('saveNow')}</Button></DialogClose>
      </div>
    </PanelDialog>}
    {failure && !current && !job && <small role="alert">{t(failure)}</small>}
  </span>;
}
