import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, InputField, ProgressIndicator, SelectField, StatePanel } from '../../components/ui/Primitives';
import { AvailableLanguages, BackLink, chooseTranslation, contentLocale, ContentLanguageNotice, ContentLanguageSelect,
  localizedNumber, useContentLanguage } from '../courses/student/components';
import { useEducationData } from '../education/useEducationData';
import { useLearning } from '../engagement/local';
import { SaveResource } from '../engagement/SaveResource';
import { QuizPager } from '../quizzes/AdminFields';
import { loadPaths, pathDetails, resultKinds,
  searchContent, searchSuggestions, type DiscoveryGroup, type ResultKind, type SearchEntry } from './api';
import { discoveryNamespace as ns } from './strings';
import { DiscoveryState, EntryLink, EntryList } from './Cards';
import { TaxonomyFilter } from './TaxonomyFilter';

const taxonomies = [['subjectId', 'subjects', 'subjectLabel'], ['categoryId', 'categories', 'categoryLabel'],
  ['levelId', 'levels', 'level'], ['gradeId', 'grades', 'grade'], ['language', 'languages', 'language']] as const;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

function SearchTerms({ query, language, preferred, suggestions, apply }: {
  query: string; language?: string; preferred: string; suggestions: boolean; apply: (query: string) => void;
}) {
  const { t } = useTranslation(ns);
  const [input, setInput] = useState(query);
  const [settled, setSettled] = useState('');
  const [focused, setFocused] = useState(false);
  const { state } = useLocation();
  useEffect(() => {
    if (!state?.focusSearch || !suggestions) return;
    const frame = window.requestAnimationFrame(() => document.getElementById('global-search-input')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [state, suggestions]);
  const term = input.trim();
  useEffect(() => {
    if (!suggestions || term === query || term.length < 2) return;
    const timer = window.setTimeout(() => setSettled(term), 300);
    return () => window.clearTimeout(timer);
  }, [suggestions, query, term]);
  const eligible = focused && suggestions && term !== query && term.length >= 2 && settled === term;
  const load = useCallback((signal: AbortSignal) => eligible ? searchSuggestions(settled, language, preferred, signal)
    : Promise.resolve([]), [eligible, settled, language, preferred]);
  const { result } = useEducationData(load);
  return <div className="discovery-search" onFocus={() => setFocused(true)} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }} onKeyDown={event => { if (event.key === 'Escape') setFocused(false); }}>
    <form role="search" className="course-search" onSubmit={event => { event.preventDefault(); apply(term); setFocused(false); }}>
      <InputField id="global-search-input" type="search" dir="auto" label={t('query')} value={input} maxLength={120}
        onChange={event => { setInput(event.target.value); setFocused(true); }} />
      <Button type="submit">{t('find')}</Button>
    </form>
    {eligible && result.status === 'ready' && result.data.length > 0 && <section aria-label={t('suggestions')} className="learn-panel discovery-suggestions">
      <h2>{t('suggestions')}</h2><EntryList items={result.data} />
    </section>}
  </div>;
}

export function DiscoveryCatalog({ group }: { group?: DiscoveryGroup }) {
  const { t } = useTranslation(ns);
  const [parameters, setParameters] = useSearchParams();
  const content = useContentLanguage();
  const q = (parameters.get('q') ?? '').trim().slice(0, 120);
  const page = Math.min(10000, Math.max(1, Number.parseInt(parameters.get('page') ?? '', 10) || 1));
  const kindValue = parameters.get('kind') as ResultKind;
  const kind = resultKinds.includes(kindValue) ? kindValue : undefined;
  function filter(key: string) {
    const value = parameters.get(key);
    return value && uuid.test(value) ? value : undefined;
  }
  const language = contentLocale(parameters.get('language')) ?? (group ? content.explicit : undefined);
  const subjectId = filter('subjectId'), categoryId = filter('categoryId');
  const levelId = filter('levelId'), gradeId = filter('gradeId');
  const preferred = content.preferred;
  const languageFilterLabel = kind === 'book' ? 'fileLanguage' : kind === 'video' || kind === 'short' || kind === 'ai' ? 'metadataLanguage' : 'language';
  const filters = { subjectId, categoryId, levelId, gradeId, language };
  const load = useCallback((signal: AbortSignal) => group ? loadPaths(q, page, language, preferred, signal, group)
    : searchContent({ q, page, kind, language, preferred, subjectId, categoryId, levelId, gradeId }, signal),
  [group, q, page, kind, language, preferred, subjectId, categoryId, levelId, gradeId]);
  const { result, reload } = useEducationData(load);
  function update(key: string, value: string) {
    const next = new URLSearchParams(parameters);
    if (key !== 'page') next.delete('page');
    if (group && key === 'language') next.delete('lang');
    if (value) next.set(key, value);
    else next.delete(key);
    setParameters(next);
  }
  return <div className="learn-page discovery-page">
    <h1>{t(group ?? 'search')}</h1>
    <SearchTerms key={q} query={q} language={language} preferred={preferred} suggestions={!group} apply={value => update('q', value)} />
    <div className="discovery-filters">
      {!group && <SelectField label={t('kind')} value={kind ?? ''} onChange={event => update('kind', event.target.value)}>
        <option value="">{t('all')}</option>
        {resultKinds.map(value => <option key={value} value={value}>{t(value)}</option>)}
      </SelectField>}
      {taxonomies.filter(([key]) => !group || key === 'language').map(([key, family, label]) => <TaxonomyFilter key={key} kind={family}
        label={t(key === 'language' ? languageFilterLabel : label)}
        value={filters[key] ?? ''} change={value => update(key, value)} />)}
    </div>
    {parameters.size > 0 && <Button className="discovery-action" variant="ghost" onClick={() => setParameters({})}>{t('clear')}</Button>}
    {result.status !== 'ready' ? <DiscoveryState failed={result.status === 'error'} retry={reload} /> : <>
      {result.data.items.length ? <EntryList items={result.data.items} /> : <StatePanel kind="empty"
        title={t(group && !q && !language ? (group === 'paths' ? 'pathEmpty' : 'collectionEmpty') : 'empty')} />}
      {result.data.total > result.data.pageSize && <QuizPager page={page}
        pages={Math.ceil(result.data.total / result.data.pageSize)} change={value => update('page', String(value))} />}
    </>}
  </div>;
}

export function LearningPath({ group = 'paths' }: { group?: DiscoveryGroup }) {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation(ns);
  const language = useContentLanguage();
  const preferred = language.preferred;
  const load = useCallback((signal: AbortSignal) => pathDetails(slug, preferred, signal, group), [slug, preferred, group]);
  const { result, reload } = useEducationData(load);
  const { enabled, completedCourses, completedLessons, completedItems } = useLearning();
  function completed(activity: SearchEntry) {
    if (activity.kind === 'course') return completedCourses.includes(activity.id);
    if (activity.kind === 'lesson') return completedLessons.includes(activity.id);
    return completedItems.includes(activity.kind + ':' + activity.id);
  }
  let content: ReactNode;
  if (result.status !== 'ready') content = <DiscoveryState failed={result.status === 'error'} retry={reload} />;
  else {
    const path = result.data;
    const copy = chooseTranslation(path.translations, language.preferred);
    const locales = path.translations.map(item => item.locale);
    const done = path.activities.filter(completed).length;
    const total = path.activities.length;
    const count = t('progress', { done: localizedNumber(done, i18n.language), total: localizedNumber(total, i18n.language) });
    content = <>
      <header className="discovery-heading"><div><h1 lang={copy.locale} dir="auto">{copy.title}</h1>
        <ContentLanguageNotice preferred={preferred} actual={copy.locale} />
        <p lang={copy.locale} dir="auto">{copy.description}</p></div>
        {locales.length === 1 ? <AvailableLanguages locales={locales} label={t('language')} />
          : <ContentLanguageSelect label={t('language')} locales={locales} selected={copy.locale} onSelect={language.setLanguage} />}
      </header>
      {group === 'paths' && <SaveResource resource={{ kind: 'path', id: path.id, slug: path.slug, title: copy.title, locale: copy.locale }} />}
      <section className="learn-panel discovery-page" aria-label={t('activityList')}>
        <h2>{t('activityList')}</h2>
        {enabled && total > 0 && <><ProgressIndicator label={count} value={100 * done / total} /><p>{count}</p></>}
        {total ? <ol className="learning-resource-list discovery-ordered">{path.activities.map(activity =>
          <li key={activity.kind + ':' + activity.id}><EntryLink entry={activity} />
            {enabled && completed(activity) && <Badge>{t('completed')}</Badge>}</li>)}</ol>
          : <StatePanel kind="empty" title={t(group === 'paths' ? 'pathEmpty' : 'collectionEmpty')} />}
      </section>
    </>;
  }
  return <div className="learn-page discovery-page"><BackLink to={group === 'paths' ? '/learning-paths' : '/collections'}>{t(group)}</BackLink>{content}</div>;
}
