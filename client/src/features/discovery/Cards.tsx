import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, StatePanel } from '../../components/ui/Primitives';
import { learnerLanguageName, useContentLanguage } from '../courses/student/components';
import { useEducationData } from '../education/useEducationData';
import '../engagement/engagement.css';
import { dailyActivity, relatedLearning, type ResultKind, type SearchEntry } from './api';
import { discoveryNamespace as ns } from './strings';
import './discovery.css';

export function DiscoveryState({ failed, retry }: { failed?: boolean; retry: () => void }) {
  const { t } = useTranslation(ns);
  return failed ? <StatePanel kind="error" title={t('failed')}><Button variant="secondary" onClick={retry}>{t('retry')}</Button></StatePanel>
    : <StatePanel kind="loading" title={t('loading')} />;
}

export function EntryLink({ entry }: { entry: SearchEntry }) {
  const { t } = useTranslation(ns);
  const join = entry.href.includes('?') ? '&' : '?';
  const to = entry.kind === 'category' || entry.kind === 'subject' ? entry.href
    : entry.href + join + new URLSearchParams({ lang: entry.locale });
  return <Link to={to}><span>
    <small>{t(entry.kind)} · <bdi lang={entry.locale}>{learnerLanguageName(entry.locale)}</bdi></small>
    <bdi lang={entry.locale}>{entry.title}</bdi>
    {entry.fileLanguage && entry.fileLanguage !== entry.locale && <small>
      {t('fileLanguage')} · <bdi lang={entry.fileLanguage}>{learnerLanguageName(entry.fileLanguage)}</bdi>
    </small>}
    {entry.description && <small lang={entry.locale} dir="auto">{entry.description}</small>}</span></Link>;
}

export function EntryList({ items }: { items: SearchEntry[] }) {
  return <ul className="learning-resource-list">{items.map(entry =>
    <li key={entry.kind + ':' + entry.id}><EntryLink entry={entry} /></li>)}</ul>;
}

export function DailyLearning({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation(ns);
  const language = useContentLanguage().preferred;
  const load = useCallback((signal: AbortSignal) => dailyActivity(language, signal), [language]);
  const { result, reload } = useEducationData(load);
  if (compact && (result.status !== 'ready' || !result.data.item)) return null;
  const Title = compact ? 'h2' : 'h1';
  return <section className={compact ? 'learn-panel discovery-page' : 'learn-page discovery-page'} aria-label={t('daily')}>
    <Title>{t('daily')}</Title>
    {result.status !== 'ready' ? <DiscoveryState failed={result.status === 'error'} retry={reload} />
      : result.data.item ? <EntryList items={[result.data.item]} /> : <StatePanel kind="empty" title={t('dailyEmpty')} />}
  </section>;
}

export function Recommendations({ kind, id, language }: { kind: ResultKind; id: string; language: string }) {
  const { t } = useTranslation(ns);
  const load = useCallback((signal: AbortSignal) => relatedLearning(kind, id, language, signal), [kind, id, language]);
  const { result } = useEducationData(load);
  return result.status === 'ready' && result.data.length > 0 ? <section className="learn-panel discovery-page" aria-label={t('related')}>
    <h2>{t('related')}</h2><EntryList items={result.data} />
  </section> : null;
}
