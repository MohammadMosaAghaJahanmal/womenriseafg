import { ChevronDown, Search } from 'lucide-react';
import { useCallback, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button, InputField, Pagination, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { learnerLanguageName, localizedNumber } from '../../courses/student/components';
import { preferredName, type EducationRecord } from '../../education/api';
import { useEducationData } from '../../education/useEducationData';
import { listLearning, loadFacets, type CatalogQuery } from './api';
import { CollectionBanner, CollectionState, StudyCard } from './Components';
import { learningMediaNamespace } from './strings';

const emptyRecords: EducationRecord[] = [];
const categoryPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function validLocale(value: string) {
  if (!value || value.length > 35) return '';
  try { return new Intl.Locale(value).baseName; }
  catch { return ''; }
}

export function useCatalogQuery() {
  const [params, setParams] = useSearchParams();
  const rawCategory = params.get('categoryId') ?? '';
  const rawLanguage = params.get('language') ?? '';
  const query: CatalogQuery = {
    q: params.get('q')?.trim().slice(0, 120) ?? '',
    categoryId: categoryPattern.test(rawCategory) ? rawCategory : '',
    language: validLocale(rawLanguage),
    page: Math.min(100000, Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
  };
  return {
    query, filtered: Boolean(query.q || query.categoryId || query.language),
    change(key: 'q' | 'categoryId' | 'language', value: string) {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page');
      setParams(next, { preventScrollReset: true });
    },
    changePage(page: number) {
      const next = new URLSearchParams(params);
      if (page === 1) next.delete('page');
      else next.set('page', String(page));
      setParams(next, { preventScrollReset: true });
    },
    clear() {
      const next = new URLSearchParams(params);
      for (const key of ['q', 'language', 'categoryId', 'page']) next.delete(key);
      setParams(next, { preventScrollReset: true });
    },
  };
}

export function useLearningFacets() {
  const { result, reload } = useEducationData(loadFacets);
  return { categories: result.status === 'ready' ? result.data.categories : emptyRecords,
    languages: result.status === 'ready' ? result.data.languages : emptyRecords, failed: result.status === 'error', reload };
}

type CatalogControls = ReturnType<typeof useCatalogQuery>;
type Facets = ReturnType<typeof useLearningFacets>;

export function CatalogFilters({ catalog, facets, compact }: { catalog: CatalogControls; facets: Facets; compact?: boolean }) {
  const { t, i18n } = useTranslation(learningMediaNamespace);
  const { q, language, categoryId } = catalog.query;
  const { categories, languages, failed, reload } = facets;
  const locales = [...new Set([...(language ? [language] : []), ...languages.flatMap(entry => entry.locale ? [entry.locale] : [])])];
  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    catalog.change('q', String(new FormData(event.currentTarget).get('q') ?? '').trim());
  };
  const change = (key: 'categoryId' | 'language') => (event: ChangeEvent<HTMLSelectElement>) => catalog.change(key, event.target.value);

  const filters = <>
    <div className="learn-filters lm-filters">
      <form className="learn-search" role="search" aria-label={t('search')} onSubmit={search}>
        <InputField key={q} name="q" type="search" label={t('search')} maxLength={120} placeholder={t('searchPlaceholder')} defaultValue={q} />
        <Button type="submit" variant="secondary" aria-label={t('search')}><Search size={18} aria-hidden="true" /></Button>
      </form>
      <SelectField label={t('category')} value={categoryId} onChange={change('categoryId')} disabled={!categories.length && !categoryId}>
        <option value="">{t('anyCategory')}</option>
        {categoryId && !categories.some(entry => entry.id === categoryId) && <option value={categoryId}>{t('category')}</option>}
        {categories.map(entry => {
          const translation = preferredName(entry, i18n.language);
          return <option key={entry.id} value={entry.id} lang={translation.locale} dir="auto">{translation.name}</option>;
        })}
      </SelectField>
      <SelectField label={t('language')} value={language} onChange={change('language')} disabled={!locales.length}>
        <option value="">{t('anyLanguage')}</option>
        {locales.map(locale => <option key={locale} value={locale} lang={locale} dir="auto">{learnerLanguageName(locale)}</option>)}
      </SelectField>
      {catalog.filtered && <Button variant="ghost" onClick={catalog.clear}>{t('clear')}</Button>}
    </div>
    {failed && <p className="learn-facet-error" role="status">{t('facetsFailed')} <button type="button" onClick={reload}>{t('retry')}</button></p>}
  </>;

  return compact ? <details className="lm-short-filters">
    <summary><Search size={17} aria-hidden="true" />{t('search')}<ChevronDown size={17} aria-hidden="true" /></summary>
    {filters}
  </details> : filters;
}

export default function MediaCatalog({ collection }: { collection: 'videos' | 'ai-learning' }) {
  const { t, i18n } = useTranslation(learningMediaNamespace);
  const catalog = useCatalogQuery();
  const { q, categoryId, language, page } = catalog.query;
  const facets = useLearningFacets();
  const load = useCallback((signal: AbortSignal) => listLearning(collection, { q, categoryId, language, page }, signal),
    [collection, q, categoryId, language, page]);
  const { result, reload } = useEducationData(load);
  const number = (value: number) => localizedNumber(value, i18n.language);

  return <div className="learn-page lm-page lm-catalog">
    <CollectionBanner collection={collection} />
    <CatalogFilters catalog={catalog} facets={facets} />
    {result.status !== 'ready'
      ? <CollectionState loading={result.status === 'loading'} retry={reload} error={result.status === 'error' ? result.error : undefined} />
      : <section className="learn-results" aria-label={t(collection)}>
        <h2 className="learn-result-count" aria-live="polite">{t('count', { count: result.data.total, countText: number(result.data.total) })}</h2>
        {result.data.items.length > 0 ? <div className="learn-grid lm-grid">
          {result.data.items.map(item => <StudyCard key={item.id} item={item} collection={collection}
            language={language || undefined} categories={facets.categories} />)}
        </div> : <StatePanel kind="empty" title={t(catalog.filtered || result.data.total ? 'noMatches' : 'noItems')}>
          {catalog.filtered && <Button variant="secondary" onClick={catalog.clear}>{t('clear')}</Button>}
          {result.data.total > 0 && page > 1 && <Button variant="secondary" onClick={() => catalog.changePage(1)}>{t('firstPage')}</Button>}
        </StatePanel>}
        {result.data.total > result.data.pageSize && <Pagination page={result.data.page} pages={Math.ceil(result.data.total / result.data.pageSize)}
          pageLabel={t('page', { page: number(result.data.page), total: number(Math.ceil(result.data.total / result.data.pageSize)) })}
          previous={t('previousPage')} next={t('nextPage')} label={t('pages')} onChange={catalog.changePage} />}
      </section>}
  </div>;
}
