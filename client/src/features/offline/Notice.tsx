import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Primitives';
import { offlineNamespace as ns } from './strings';
import './offline.css';

export function OfflineNotice() {
  const { t } = useTranslation(ns);
  return <div className="learn-page offline-page">
    <section className="learn-panel">
      <CloudOff size={28} aria-hidden="true" />
      <h1>{t('offline')}</h1>
      <p>{t('offlineHint')}</p>
      <Button asChild><Link to="/downloads">{t('title')}</Link></Button>
    </section>
  </div>;
}
