import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Button, StatePanel } from '../../components/ui/Primitives';
import { chooseTranslation, learnerLanguageName } from '../courses/student/components';
import { publishedTaxonomy } from '../discovery/api';
import { useEducationData } from '../education/useEducationData';
import { homepageNamespace as ns } from '../homepage/strings';
import './discover.css';
import '../homepage/homepage.css';

const load = (signal: AbortSignal) => publishedTaxonomy('subjects', signal);
const previousSubjects: Record<string, string> = { math: 'general-mathematics', science: 'life-science', languages: 'english', digital: 'computer-basics' };

export function ExplorePage() {
  const { t, i18n } = useTranslation(ns);
  const [parameters] = useSearchParams();
  const { result, reload } = useEducationData(load);
  const slug = parameters.get('subject');
  const query = (id: string) => '/search?' + new URLSearchParams({ subjectId: id });
  if (slug && result.status === 'ready') {
    const subject = result.data.find(item => item.slug === (Object.hasOwn(previousSubjects, slug) ? previousSubjects[slug] : slug));
    if (subject) return <Navigate to={query(subject.id)} replace />;
  }
  return <div className="discover-page discover-explore">
    <header className="discover-explore-intro">
      <h1>{t('explore')}</h1>
      <p>{t('exploreHint')}</p>
    </header>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('failed')}>
      <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && (result.data.length ? <ul className="home-grid" data-layout="subjects">
      {result.data.map(item => {
        const copy = chooseTranslation(item.translations, i18n.language);
        return <li key={item.id}><Link to={query(item.id)} className="home-subject-link">
          <span className="home-subject-icon"><BookOpen size={22} aria-hidden="true" /></span>
          <span><strong><bdi lang={copy.locale}>{copy.name}</bdi></strong>
            {copy.locale !== i18n.language && <small>{t('showingLanguage', { language: learnerLanguageName(copy.locale) })}</small>}
            {copy.description && <small lang={copy.locale} dir="auto">{copy.description}</small>}
          </span>
        </Link></li>;
      })}
    </ul> : <StatePanel kind="empty" title={t('noSubjects')} />)}
  </div>;
}
