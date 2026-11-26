import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Primitives';
import { privacyNamespace as ns } from './strings';
import '../../pages/workspace.css';
import './privacy.css';

const sections = ['guest', 'account', 'local', 'visible', 'certificate', 'corrections', 'storage'] as const;

export default function PrivacyPage() {
  const { t } = useTranslation(ns);
  return <article className="workspace-page privacy-page">
    <h1>{t('noticeTitle')}</h1>
    <p className="workspace-intro">{t('noticeIntro')}</p>
    {sections.map(section => <section key={section}>
      <h2>{t(section + 'Title')}</h2>
      <p>{t(section)}</p>
    </section>)}
    <div className="privacy-actions">
      <Button asChild variant="secondary"><Link to="/settings">{t('settingsLink')}</Link></Button>
      <Button asChild variant="ghost"><Link to="/account">{t('accountLink')}</Link></Button>
    </div>
  </article>;
}
