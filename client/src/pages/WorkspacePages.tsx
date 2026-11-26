import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { animate } from 'motion/mini';
import { CheckCircle2, Compass, Monitor } from 'lucide-react';
import { Badge, Button, Card, SelectField, StatePanel } from '../components/ui/Primitives';
import { languageNames, languages, type Language } from '../i18n';
import { usePreferences, type Theme } from '../preferences';
import { checkApiHealth } from '../services/health';
import { LearningPreference } from '../features/engagement/Preference';
import './strings';
import './workspace.css';
import '../features/auth/auth.css';

import { sectionLabel } from './routes';

function PreviewPage({ section }: { section: string }) {
  const { t } = useTranslation(['pages', 'shell']);
  return <div className="workspace-page"><Badge>{t('preview')}</Badge><h1>{t('shell:' + section)}</h1>
    <p className="workspace-intro">{t(section)}</p>
    <Button asChild><Link to="/explore"><Compass size={18} aria-hidden="true"/>{t('explore')}</Link></Button>
  </div>;
}

export function SettingsPage() {
  const { t } = useTranslation(['pages', 'shell', 'auth']);
  const { language, setLanguage, theme, setTheme, clearPreferences } = usePreferences();
  const [clearResult, setClearResult] = useState<boolean>();
  return <div className="workspace-page"><h1>{t('shell:settings')}</h1><p className="workspace-intro">{t('settingsIntro')}</p>
    <Card className="workspace-panel workspace-options">
      <SelectField label={t('shell:language')} value={language} onChange={e => setLanguage(e.target.value as Language)}>
        {languages.map(lang => <option key={lang} value={lang} lang={lang}>{languageNames[lang]}</option>)}
      </SelectField>
      <SelectField label={t('shell:appearance')} value={theme} onChange={e => setTheme(e.target.value as Theme)}>
        {(['system','light','dark'] as const).map(item => <option key={item} value={item}>{t('shell:' + item)}</option>)}
      </SelectField>
      <p>{t('follows')}</p>
    </Card><p className="workspace-note">{t('local')}</p>
    <section className="auth-settings workspace-panel">
      <h2>{t('auth:clearPreferences')}</h2>
      <p>{t('auth:clearDescription')}</p>
      <Button variant="secondary" onClick={() => setClearResult(clearPreferences())}>{t('auth:clearAction')}</Button>
      {clearResult !== undefined && <p role="status">{t(clearResult ? 'auth:cleared' : 'auth:unavailable')}</p>}
    </section>
    <LearningPreference />
  </div>;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function StatusPage() {
  const { t } = useTranslation(['pages', 'shell']);
  const health = useQuery({
    queryKey: ['public-api-health'],
    queryFn: async ({ signal }) => { await checkApiHealth(signal); return true; },
    networkMode: 'always',
  });
  const success = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (health.isFetching || !success.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = animate(success.current, { opacity: [.45, 1] }, { duration: .18 });
    return () => animation.stop();
  }, [health.isFetching, health.dataUpdatedAt]);
  return <div className="workspace-page"><h1>{t('shell:status')}</h1>
    <Card className="workspace-panel workspace-status">
      <h2><Monitor size={22} aria-hidden="true"/>{t('connection')}</h2>
      {health.isFetching ? <StatePanel kind="loading" title={t('checking')}/> :
        health.isError ? <StatePanel kind="error" title={t('failed')}/> :
        <p role="status" ref={success} className="workspace-ok"><CheckCircle2 size={20} aria-hidden="true"/>{t('available')}</p>}
      <Button variant="secondary" disabled={health.isFetching} onClick={() => void health.refetch()}>{t(health.isError ? 'retry' : 'again')}</Button>
    </Card>
  </div>;
}

export function NotFoundPage() {
  const { t } = useTranslation('pages');
  return <div className="workspace-page"><h1>{t('notFound')}</h1><p className="workspace-intro">{t('missing')}</p>
    <Button asChild><Link to="/">{t('back')}</Link></Button></div>;
}

export default function WorkspacePage() {
  const { pathname } = useLocation();
  const section = sectionLabel(pathname);
  if (section === 'settings') return <SettingsPage />;
  if (section === 'status') return <QueryClientProvider client={queryClient}><StatusPage /></QueryClientProvider>;
  return section ? <PreviewPage section={section} /> : <NotFoundPage />;
}
