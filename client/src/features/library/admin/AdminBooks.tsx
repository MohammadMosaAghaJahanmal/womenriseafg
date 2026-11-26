import { BookOpen, Plus } from 'lucide-react';
import { useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button, Card, InputField, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { preferredTitle } from '../../courses/admin/api';
import { usePageOrder } from '../../admin/PageOrder';
import { contentLanguageName } from '../../courses/admin/EditorFields';
import { preferredName, statuses } from '../../education/api';
import { EducationStatus } from '../../education/EducationList';
import { useEducationData } from '../../education/useEducationData';
import { BookEditor } from './BookEditor';
import { BookPager } from './BookPager';
import { bookAdminPath, bookError, bookTaxonomy, listBooks, type BookRecord } from './api';
import { bookAdminNamespace as ns } from './strings';
import './book-admin.css';

type BookRoute = { view: 'list' | 'new' } | { view: 'detail'; id: string };
const bookId = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

export function matchBookRoute(path: string): BookRoute | undefined {
  if (path === bookAdminPath) return { view: 'list' };
  if (path === bookAdminPath + '/new') return { view: 'new' };
  const id = path.slice(bookAdminPath.length + 1);
  if (path.startsWith(bookAdminPath + '/') && bookId.test(id)) return { view: 'detail', id };
}

async function loadFacets(signal: AbortSignal) {
  const [categories, levels, languages] = await Promise.all([
    bookTaxonomy('categories', signal), bookTaxonomy('levels', signal), bookTaxonomy('languages', signal),
  ]);
  return { categories, levels, languages };
}

function BookRow({ book, search }: { book: BookRecord; search: string }) {
  const { t, i18n } = useTranslation(ns);
  const name = preferredTitle(book.translations, i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const year = new Intl.NumberFormat(i18n.language, { useGrouping: false });
  return <li className="course-list-row">
    <span className="course-list-icon"><BookOpen size={22} aria-hidden="true" /></span>
    <div className="course-list-detail">
      <h2><bdi lang={name?.locale}>{name?.title ?? book.slug}</bdi></h2>
      <div className="course-list-metadata">
        {book.author && <bdi>{book.author}</bdi>}
        {book.publicationYear != null && <span>{year.format(book.publicationYear)}</span>}
        {book.contentLanguage && <bdi lang={book.contentLanguage}>{contentLanguageName(book.contentLanguage, i18n.language)}</bdi>}
      </div>
      <div className="course-list-metadata"><bdi dir="ltr">{book.slug}</bdi>
        <time dateTime={book.updatedAt}>{date.format(new Date(book.updatedAt))}</time></div>
    </div>
    <div className="course-list-action">
      <EducationStatus status={book.status} />
      <Button asChild variant="secondary"><Link to={bookAdminPath + '/' + book.id + search}>{t('edit')}</Link></Button>
    </div>
  </li>;
}

function BookList() {
  const { t, i18n } = useTranslation([ns, 'education']);
  const { search, state } = useLocation();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, 120);
  const status = statuses.find(key => key === params.get('status'));
  const category = params.get('categoryId') ?? '';
  const level = params.get('levelId') ?? '';
  const locale = params.get('language') ?? '';
  const categoryId = bookId.test(category) ? category : undefined;
  const levelId = bookId.test(level) ? level : undefined;
  const language = /^[a-z\d-]{1,35}$/i.test(locale) ? locale : undefined;
  const requested = Number(params.get('page') ?? 1);
  const page = Number.isInteger(requested) && requested >= 1 && requested <= 100000 ? requested : 1;
  const filtered = Boolean(q || status || categoryId || levelId || language);
  const load = useCallback((signal: AbortSignal) => listBooks({ q, status, categoryId, levelId, language, page, pageSize: 12 }, signal),
    [q, status, categoryId, levelId, language, page]);
  const { result, reload } = useEducationData(load);
  const order = usePageOrder(result.status === 'ready' ? result.data.items : [],
    (item, locale) => preferredTitle(item.translations, locale)?.title ?? item.slug);
  const { result: facets } = useEducationData(loadFacets);
  const values = facets.status === 'ready' ? facets.data : { categories: [], levels: [], languages: [] };
  const error = result.status === 'error' ? bookError(result.error, 'loadFailed') : '';
  const denied = error === 'sessionEnded' || error === 'noAccess';

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of ['q', 'status', 'categoryId', 'levelId', 'language']) {
      const value = String(form.get(field) ?? '').trim();
      if (value) next.set(field, value);
    }
    setParams(next);
  }
  function setPage(value: number) {
    const next = new URLSearchParams(params);
    if (value > 1) next.set('page', String(value));
    else next.delete('page');
    setParams(next);
  }
  return <>
    <div className="admin-section-heading course-heading"><div><h1>{t('title')}</h1><p>{t('intro')}</p></div>
      {result.status === 'ready' && <Button asChild><Link to={bookAdminPath + '/new' + search}>
        <Plus size={19} aria-hidden="true" />{t('create')}
      </Link></Button>}
    </div>
    {state?.message === 'deleted' && <p role="status">{t('deleted')}</p>}
    {!denied && <Card className="book-admin-filters">
      <form key={[q, status, categoryId, levelId, language].join('|')} className="course-filters" role="search" onSubmit={apply}>
        <InputField type="search" name="q" label={t('search')} defaultValue={q} maxLength={120} autoComplete="off" />
        <SelectField name="status" label={t('status')} defaultValue={status ?? ''}>
          <option value="">{t('allStatuses')}</option>
          {statuses.map(value => <option value={value} key={value}>{t('education:status-' + value)}</option>)}
        </SelectField>
        {([
          { name: 'categoryId', value: categoryId, label: 'category', all: 'allCategories', options: values.categories },
          { name: 'levelId', value: levelId, label: 'level', all: 'allLevels', options: values.levels },
        ] as const).map(filter => <SelectField key={filter.name} name={filter.name} label={t(filter.label)} defaultValue={filter.value ?? ''}>
          <option value="">{t(filter.all)}</option>
          {filter.value && !filter.options.some(item => item.id === filter.value) &&
            <option value={filter.value}>{t('unavailable')}</option>}
          {filter.options.map(item => {
            const name = preferredName(item, i18n.language);
            return <option key={item.id} value={item.id} lang={name?.locale}>{name?.name ?? item.slug}</option>;
          })}
        </SelectField>)}
        <SelectField name="language" label={t('language')} defaultValue={language ?? ''}>
          <option value="">{t('allLanguages')}</option>
          {language && !values.languages.some(item => item.locale === language) && <option value={language}>{t('unavailable')}</option>}
          {values.languages.flatMap(item => item.locale ? [<option key={item.id} value={item.locale} lang={item.locale}>
            {contentLanguageName(item.locale, i18n.language)}
          </option>] : [])}
        </SelectField>
        <Button type="submit" variant="secondary">{t('searchAction')}</Button>
        {filtered && <Button variant="ghost" onClick={() => setParams({})}>{t('clear')}</Button>}
      </form>
    </Card>}
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t(error)}>
      {!denied && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
    </StatePanel>}
    {result.status === 'ready' && (result.data.items.length ? <>
      <div className="admin-page-order">{order.field}</div>
      <ul className="course-list book-admin-list" aria-label={t('title')}>
        {order.items.map(book => <BookRow key={book.id} book={book} search={search} />)}
      </ul>
      {result.data.total > result.data.pageSize && <BookPager page={result.data.page}
        pages={Math.ceil(result.data.total / result.data.pageSize)} onChange={setPage} />}
    </> : <StatePanel kind="empty" title={t(filtered || page > 1 ? 'noMatches' : 'noBooks')}>
      {page > 1 && <Button variant="secondary" onClick={() => setPage(page - 1)}>{t('previous')}</Button>}
    </StatePanel>)}
  </>;
}

export function AdminBooks({ route }: { route: BookRoute }) {
  if (route.view === 'list') return <BookList />;
  const id = route.view === 'detail' ? route.id : undefined;
  return <BookEditor key={id ?? 'new'} id={id} />;
}
