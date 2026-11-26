import { LayoutGrid, List, Search } from 'lucide-react';
import { useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, InputField, Pagination, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { chooseTranslation, contentLocale, learnerLanguageName, localizedNumber } from '../../courses/student/components';
import { preferredName, type EducationRecord } from '../../education/api';
import { useEducationData } from '../../education/useEducationData';
import { bookPath, catalogFacets, listBooks, type PublicBook } from './api';
import { BookCover, BookLanguage, LibraryBanner, LibraryState } from './Components';
import { libraryNamespace } from './strings';

const identifier = /^[da-f]{8}-[da-f]{4}-4[da-f]{3}-[89ab][da-f]{3}-[da-f]{12}$/i;
const emptyTaxonomy = { categories: [], levels: [], languages: [] };

function validId(value: string | null) {
  return value && identifier.test(value) ? value : '';
}

function TaxonomySelect({ label, all, options, value, change }: {
  label: string; all: string; options: EducationRecord[]; value: string; change: (value: string) => void;
}) {
  const { i18n } = useTranslation(libraryNamespace);
  return <SelectField label={label} value={value} onChange={event => change(event.target.value)} disabled={!options.length && !value}>
    <option value="">{all}</option>
    {value && !options.some(item => item.id === value) && <option value={value}>{label}</option>}
    {options.map(item => {
      const name = preferredName(item, i18n.language);
      return <option key={item.id} lang={name.locale} dir="auto" value={item.id}>{name.name}</option>;
    })}
  </SelectField>;
}

function BookCard({ book, categories }: { book: PublicBook; categories: EducationRecord[] }) {
  const { i18n } = useTranslation(libraryNamespace);
  const copy = chooseTranslation(book.translations, i18n.language);
  const category = categories.find(item => item.id === book.categoryId);
  const categoryName = category && preferredName(category, i18n.language);
  return <article className="library-card">
    <BookCover id={book.coverId} />
    <div className="library-card-copy">
      <h3><Link to={bookPath(book.slug)}><bdi lang={copy.locale}>{copy.title}</bdi></Link></h3>
      {book.author && <p className="library-card-author"><bdi>{book.author}</bdi></p>}
      {copy.description && <p className="library-card-description" lang={copy.locale} dir="auto">{copy.description}</p>}
      <div className="learn-card-tags library-card-tags">
        <span><BookLanguage locale={book.contentLanguage} /></span>
        {categoryName && <span><bdi lang={categoryName.locale}>{categoryName.name}</bdi></span>}
      </div>
    </div>
  </article>;
}

export default function LibraryCatalog() {
  const { t, i18n } = useTranslation(libraryNamespace);
  const [parameters, setParameters] = useSearchParams();
  const q = parameters.get('q')?.trim().slice(0, 120) ?? '';
  const categoryId = validId(parameters.get('categoryId'));
  const levelId = validId(parameters.get('levelId'));
  const language = contentLocale(parameters.get('language')) ?? '';
  const page = Math.max(1, Math.min(100000, Number.parseInt(parameters.get('page') ?? '', 10) || 1));
  const list = parameters.get('view') === 'list';
  const filtered = Boolean(q || categoryId || levelId || language);
  const load = useCallback((signal: AbortSignal) => listBooks({ q, categoryId, levelId, language, page }, signal),
    [q, categoryId, levelId, language, page]);
  const { result, reload } = useEducationData(load);
  const { result: facets, reload: reloadFacets } = useEducationData(catalogFacets);
  const { categories, levels, languages } = facets.status === 'ready' ? facets.data : emptyTaxonomy;
  const locales = [...new Set([...(language ? [language] : []), ...languages.flatMap(item => item.locale ? [item.locale] : [])])];
  const number = (amount: number) => localizedNumber(amount, i18n.language);

  function change(key: 'q' | 'categoryId' | 'levelId' | 'language' | 'page' | 'view', value: string) {
    const next = new URLSearchParams(parameters);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'view' && key !== 'page') next.delete('page');
    setParameters(next, { preventScrollReset: true });
  }

  function clear() {
    const next = new URLSearchParams(parameters);
    for (const key of ['q', 'categoryId', 'levelId', 'language', 'page']) next.delete(key);
    setParameters(next, { preventScrollReset: true });
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    change('q', String(new FormData(event.currentTarget).get('q') ?? '').trim());
  }

  return <div className="learn-page library-page library-catalog">
    <LibraryBanner />
    <div className="library-filters">
      <form className="learn-search library-search" role="search" aria-label={t('search')} onSubmit={search}>
        <InputField key={q} name="q" type="search" dir="auto" label={t('search')} maxLength={120} placeholder={t('placeholder')} defaultValue={q} />
        <Button type="submit" variant="secondary" aria-label={t('search')}><Search size={18} aria-hidden="true" /></Button>
      </form>
      <TaxonomySelect label={t('category')} all={t('allCategories')} options={categories} value={categoryId} change={value => change('categoryId', value)} />
      <SelectField label={t('language')} value={language} onChange={event => change('language', event.target.value)} disabled={!locales.length}>
        <option value="">{t('allLanguages')}</option>
        {locales.map(locale => <option key={locale} value={locale} lang={locale} dir="auto">{learnerLanguageName(locale)}</option>)}
      </SelectField>
      <TaxonomySelect label={t('level')} all={t('allLevels')} options={levels} value={levelId} change={value => change('levelId', value)} />
    </div>
    {facets.status === 'error' && <p className="learn-facet-error" role="status">{t('facetsFailed')} <button type="button" onClick={reloadFacets}>{t('retry')}</button></p>}
    {result.status !== 'ready' ? <LibraryState loading={result.status === 'loading'} error={result.status === 'error' ? result.error : undefined} retry={reload} />
      : <section className="library-results" aria-label={t('library')}>
        <div className="library-results-bar">
          <h2 aria-live="polite">{t('count', { count: result.data.total, number: number(result.data.total) })}</h2>
          <div className="library-actions">
            {filtered && <Button variant="ghost" onClick={clear}>{t('clear')}</Button>}
            {result.data.items.length > 0 && <div className="library-display" role="group" aria-label={t('display')}>
              <Button className="ui-icon-btn" variant={list ? 'ghost' : 'secondary'} aria-pressed={!list} aria-label={t('grid')}
                title={t('grid')} onClick={() => change('view', '')}><LayoutGrid size={18} aria-hidden="true" /></Button>
              <Button className="ui-icon-btn" variant={list ? 'secondary' : 'ghost'} aria-pressed={list} aria-label={t('list')}
                title={t('list')} onClick={() => change('view', 'list')}><List size={20} aria-hidden="true" /></Button>
            </div>}
          </div>
        </div>
        {result.data.items.length
          ? <div className={'library-shelf ' + (list ? 'library-shelf-list' : 'library-shelf-grid')}>
            {result.data.items.map(book => <BookCard key={book.id} book={book} categories={categories} />)}
          </div>
          : <StatePanel kind="empty" title={t(filtered || result.data.total > 0 ? 'noMatches' : 'empty')}>
            {result.data.total > 0 && page > 1 && <Button variant="secondary" onClick={() => change('page', '')}>{t('firstPage')}</Button>}
          </StatePanel>}
        {result.data.total > result.data.pageSize && <Pagination page={page} pages={Math.ceil(result.data.total / result.data.pageSize)}
          pageLabel={t('catalogPage', { page: number(page), total: number(Math.ceil(result.data.total / result.data.pageSize)) })}
          label={t('catalogPages')} previous={t('previousPage')} next={t('nextPage')}
          onChange={value => change('page', value > 1 ? String(value) : '')} />}
      </section>}
  </div>;
}
