import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, InputField, ProgressIndicator, SelectField, StatePanel } from '../../components/ui/Primitives';
import { BackLink, chooseTranslation, ContentLanguageSelect, learnerLanguageName, localizedNumber, useContentLanguage } from '../courses/student/components';
import type { Kind } from '../education/api';
import { useEducationData } from '../education/useEducationData';
import { useLearning } from '../engagement/local';
import { SaveResource } from '../engagement/SaveResource';
import { QuizPager } from '../quizzes/AdminFields';
import { loadPaths, pathDetails, publishedTaxonomy, resultKinds,
  searchContent, searchSuggestions, type ResultKind, type SearchEntry } from './api';
import { discoveryNamespace as ns } from './strings';
import { DiscoveryState, EntryLink, EntryList } from './Cards';

const taxonomies = [['subjectId', 'subjects', 'subjectLabel'], ['categoryId', 'categories', 'categoryLabel'],
  ['levelId', 'levels', 'level'], ['gradeId', 'grades', 'grade'], ['language', 'languages', 'language']] as const;
const uuid = /^[a-f\d-]{36}$/i;
const locale = /^[a-z]{2,8}(?:-[a-z\d]{1,8})*$/i;

export function TaxonomyFilter({ kind, label, value, change, disabled }: {
  kind: Kind; label: string; value: string; change: (value: string) => void; disabled?: boolean;
}) {
  const { t, i18n } = useTranslation(ns);
  const load = useCallback((signal: AbortSignal) => publishedTaxonomy(kind, signal), [kind]);
  const { result, reload } = useEducationData(load);
  return <div className="discovery-field">
    <SelectField label={label} value={value} onChange={event => change(event.target.value)} disabled={disabled || result.status !== 'ready'}>
      <option value="">{t('all')}</option>
      {result.status === 'ready' && result.data.map(item => <option key={item.id} value={kind === 'languages' ? item.locale : item.id}>
        {kind === 'languages' && item.locale ? learnerLanguageName(item.locale) : chooseTranslation(item.translations, i18n.language).name}
      </option>)}
    </SelectField>
    {result.status === 'error' && <Button variant="ghost" onClick={reload}>{label} · {t('retry')}</Button>}
  </div>;
}

function SearchTerms({ query, language, suggestions, apply }: {
  query: string; language?: string; suggestions: boolean; apply: (query: string) => void;
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
  const load = useCallback((signal: AbortSignal) => eligible ? searchSuggestions(settled, language, signal)
    : Promise.resolve([]), [eligible, settled, language]);
  const { result } = useEducationData(load);
  return <div className="discovery-search" onFocus={() => setFocused(true)} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }} onKeyDown={event => { if (event.key === 'Escape') setFocused(false); }}>
    <form role="search" className="course-search" onSubmit={event => { event.preventDefault(); apply(term); setFocused(false); }}>
      <InputField id="global-search-input" type="search" label={t('query')} value={input} maxLength={120}
        onChange={event => { setInput(event.target.value); setFocused(true); }} />
      <Button type="submit">{t('find')}</Button>
    </form>
    {eligible && result.status === 'ready' && result.data.length > 0 && <section aria-label={t('suggestions')} className="learn-panel discovery-suggestions">
      <h2>{t('suggestions')}</h2><EntryList items={result.data} />
    </section>}
  </div>;
}

export function DiscoveryCatalog({ paths = false }: { paths?: boolean }) {
  const { t } = useTranslation(ns);
  const [parameters, setParameters] = useSearchParams();
  const content = useContentLanguage();
  const q = (parameters.get('q') ?? '').trim().slice(0, 120);
  const page = Math.min(10000, Math.max(1, Number.parseInt(parameters.get('page') ?? '', 10) || 1));
  const kindValue = parameters.get('kind') as ResultKind;
  const kind = resultKinds.includes(kindValue) ? kindValue : undefined;
  function filter(key: string, pattern: RegExp) {
    const value = parameters.get(key);
    return value && pattern.test(value) ? value : undefined;
  }
  const language = filter('language', locale);
  const subjectId = filter('subjectId', uuid), categoryId = filter('categoryId', uuid);
  const levelId = filter('levelId', uuid), gradeId = filter('gradeId', uuid);
  const pathLanguage = content.explicit;
  const filters = { subjectId, categoryId, levelId, gradeId, language };
  const load = useCallback((signal: AbortSignal) => paths ? loadPaths(q, page, pathLanguage, signal)
    : searchContent({ q, page, kind, language, subjectId, categoryId, levelId, gradeId }, signal),
  [paths, q, page, pathLanguage, kind, language, subjectId, categoryId, levelId, gradeId]);
  const { result, reload } = useEducationData(load);
  function update(key: string, value: string) {
    const next = new URLSearchParams(parameters);
    if (key !== 'page') next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setParameters(next);
  }
  return <div className="learn-page discovery-page">
    <h1>{t(paths ? 'paths' : 'search')}</h1>
    <SearchTerms key={q} query={q} language={language} suggestions={!paths} apply={value => update('q', value)} />
    {!paths && <div className="discovery-filters">
      <SelectField label={t('kind')} value={kind ?? ''} onChange={event => update('kind', event.target.value)}>
        <option value="">{t('all')}</option>
        {resultKinds.map(value => <option key={value} value={value}>{t(value)}</option>)}
      </SelectField>
      {taxonomies.map(([key, family, label]) => <TaxonomyFilter key={key} kind={family} label={t(label)}
        value={filters[key] ?? ''} change={value => update(key, value)} />)}
    </div>}
    {parameters.size > 0 && <Button className="discovery-action" variant="ghost" onClick={() => setParameters({})}>{t('clear')}</Button>}
    {result.status !== 'ready' ? <DiscoveryState failed={result.status === 'error'} retry={reload} /> : <>
      {result.data.items.length ? <EntryList items={result.data.items} /> : <StatePanel kind="empty" title={t(paths ? 'pathEmpty' : 'empty')} />}
      {result.data.total > result.data.pageSize && <QuizPager page={page}
        pages={Math.ceil(result.data.total / result.data.pageSize)} change={value => update('page', String(value))} />}
    </>}
  </div>;
}

export function LearningPath() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation(ns);
  const language = useContentLanguage();
  const load = useCallback((signal: AbortSignal) => pathDetails(slug, language.explicit, signal), [slug, language.explicit]);
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
    const done = path.activities.filter(completed).length;
    const total = path.activities.length;
    const count = t('progress', { done: localizedNumber(done, i18n.language), total: localizedNumber(total, i18n.language) });
    content = <>
      <header className="discovery-heading"><div><h1 lang={copy.locale} dir="auto">{copy.title}</h1>
        <p lang={copy.locale} dir="auto">{copy.description}</p></div>
        <ContentLanguageSelect label={t('language')} locales={path.translations.map(item => item.locale)}
          selected={copy.locale} onSelect={language.setLanguage} />
      </header>
      <SaveResource resource={{ kind: 'path', id: path.id, slug: path.slug, title: copy.title, locale: copy.locale }} />
      <section className="learn-panel discovery-page" aria-label={t('activityList')}>
        <h2>{t('activityList')}</h2>
        {enabled && total > 0 && <><ProgressIndicator label={count} value={100 * done / total} /><p>{count}</p></>}
        {total ? <ol className="learning-resource-list discovery-ordered">{path.activities.map(activity =>
          <li key={activity.kind + ':' + activity.id}><EntryLink entry={activity} />
            {enabled && completed(activity) && <Badge>{t('completed')}</Badge>}</li>)}</ol>
          : <StatePanel kind="empty" title={t('pathEmpty')} />}
      </section>
    </>;
  }
  return <div className="learn-page discovery-page"><BackLink to="/learning-paths">{t('paths')}</BackLink>{content}</div>;
}
