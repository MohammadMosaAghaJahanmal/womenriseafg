import { Bell, BookOpen, HeartHandshake } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, SelectField, StatePanel } from '../../components/ui/Primitives';
import { chooseTranslation, learnerLanguageName, lowDataConnection } from '../courses/student/components';
import { publishedTaxonomy } from '../discovery/api';
import { useEducationData } from '../education/useEducationData';
import { ContinueLearning } from '../engagement/ContinueLearning';
import { loadHomepage, type Branding, type Homepage, type SectionKey } from './api';
import { brandCopy, useBranding } from './Branding';
import { HomeSection } from './HomeCards';
import { homepageNamespace as ns } from './strings';
import '../discover/discover.css';
import './homepage.css';

const languageFilter = /^[a-z]{2,8}(?:-[a-z\d]{1,8})*$/i;
const loadLanguages = (signal: AbortSignal) => publishedTaxonomy('languages', signal);

function Hero({ branding }: { branding: Branding }) {
  const { t, i18n } = useTranslation(ns);
  const slogan = brandCopy(branding, i18n.language, 'slogan');
  const showDefault = !slogan || slogan === t('heroTitle') + ' ' + t('heroAccent');
  return <header className="discover-hero">
    <div className="discover-hero__copy">
      <h1>{showDefault ? <>{t('heroTitle')}{' '}<span>{t('heroAccent')}</span></> : slogan}</h1>
      <p>{t('heroDescription')}</p>
      <Link to="/courses" className="discover-start"><BookOpen size={18} aria-hidden="true" />{t('start')}</Link>
    </div>
    {!lowDataConnection() && <div className="discover-hero__art" aria-hidden="true">
      <img src="/art/study.webp" alt="" fetchPriority="high" decoding="async" />
    </div>}
  </header>;
}

function Announcements({ entries }: { entries: Homepage['announcements'] }) {
  const { t, i18n } = useTranslation(ns);
  return <section className="home-announcements" aria-labelledby="home-announcements-title" data-home-section="announcements">
    <h2 id="home-announcements-title"><Bell size={18} aria-hidden="true" />{t('announcements')}</h2>
    <ul>{entries.map((entry, index) => {
      const copy = chooseTranslation(entry.translations, i18n.language);
      return <li key={index}>
        <h3 lang={copy.locale} dir="auto">{copy.title}</h3>
        {copy.locale !== i18n.language && <small>{t('showingLanguage', { language: learnerLanguageName(copy.locale) })}</small>}
        <p lang={copy.locale} dir="auto">{copy.body}</p>
      </li>;
    })}</ul>
  </section>;
}

function Mission({ branding }: { branding: Branding }) {
  const { t, i18n } = useTranslation(ns);
  const copy = brandCopy(branding, i18n.language, 'mission');
  return <section className="home-mission" aria-labelledby="home-mission-title" data-home-section="mission">
    <span className="home-mission-mark"><HeartHandshake size={26} aria-hidden="true" /></span>
    <div><h2 id="home-mission-title">{t('mission')}</h2><p>{copy || t('missionText', { name: branding.name })}</p></div>
  </section>;
}

function Section({ section, data, preferred, language }: {
  section: SectionKey; data: Homepage; preferred: string; language?: string;
}) {
  if (section === 'continue') return <ContinueLearning />;
  if (section === 'mission') return <Mission branding={data.branding} />;
  if (section === 'announcements') {
    return data.announcements.length ? <Announcements entries={data.announcements} /> : null;
  }
  return <HomeSection section={section} items={data.content[section] ?? []}
    requested={section === 'subjects' ? preferred : language ?? preferred} language={language} />;
}

function LanguageFilter({ value, change }: { value?: string; change: (value: string) => void }) {
  const { t } = useTranslation(ns);
  const { result, reload } = useEducationData(loadLanguages);
  return <div className="home-discovery-filter">
    <SelectField label={t('language')} value={value ?? ''} disabled={result.status !== 'ready'}
      onChange={event => change(event.target.value)}>
      <option value="">{t('allLanguages')}</option>
      {result.status === 'ready' && result.data.filter(item => item.locale).map(item =>
        <option value={item.locale} key={item.id} lang={item.locale}>{learnerLanguageName(item.locale!)}</option>)}
    </SelectField>
    {result.status === 'error' && <Button variant="ghost" onClick={reload}>{t('retry')}</Button>}
  </div>;
}

const isCatalogSection = (key: SectionKey) => !['announcements', 'continue', 'subjects', 'mission'].includes(key);

export default function HomePage() {
  const { t, i18n } = useTranslation(ns);
  const { branding } = useBranding();
  const [parameters, setParameters] = useSearchParams();
  const parameter = parameters.get('language');
  const language = parameter && languageFilter.test(parameter) ? parameter : undefined;
  const preferred = i18n.language;
  const load = useCallback((signal: AbortSignal) => loadHomepage(preferred, language, signal), [preferred, language]);
  const { result, reload } = useEducationData(load);
  const data = result.status === 'ready' ? result.data : undefined;
  const hasCatalog = data?.sections.some(item => item.enabled && isCatalogSection(item.key));
  const filteredOut = hasCatalog && language && !data?.sections.some(item =>
    item.enabled && isCatalogSection(item.key) && data.content[item.key]?.length);
  function setLanguage(next: string) {
    const query = new URLSearchParams(parameters);
    if (next) query.set('language', next);
    else query.delete('language');
    setParameters(query, { preventScrollReset: true });
  }
  return <div className="discover-page home-page">
    <Hero branding={data?.branding ?? branding} />
    {(hasCatalog || language) && <LanguageFilter value={language} change={setLanguage} />}
    {data && data.sections.filter(item => item.enabled).map(({ key }) =>
      <Section section={key} data={data} preferred={preferred} language={language} key={key} />)}
    {filteredOut && <StatePanel kind="empty" title={t('noContent')}>
      <Button variant="secondary" onClick={() => setLanguage('')}>{t('clearLanguage')}</Button>
    </StatePanel>}
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('failed')}>
      <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
  </div>;
}
