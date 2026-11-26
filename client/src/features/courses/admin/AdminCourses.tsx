import { LibraryBig, Plus } from 'lucide-react';
import { useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button, Card, InputField, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { usePageOrder } from '../../admin/PageOrder';
import { statuses, type Status } from '../../education/api';
import { EducationStatus } from '../../education/EducationList';
import { useEducationData } from '../../education/useEducationData';
import { CoursePager } from './Choices';
import { CourseEditor } from './CourseEditor';
import { contentLanguageName } from './EditorFields';
import { courseAdminPath, courseError, listCourses, preferredTitle, type CourseSummary } from './api';
import './strings';
import './courses-admin.css';

type CourseRoute = { view: 'list' | 'new' } | { view: 'edit'; id: string };

export function matchCourseRoute(pathname: string): CourseRoute | undefined {
  if (pathname === courseAdminPath) return { view: 'list' };
  if (pathname === courseAdminPath + '/new') return { view: 'new' };
  const id = pathname.slice(courseAdminPath.length + 1);
  if (pathname.startsWith(courseAdminPath + '/') && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return { view: 'edit', id };
}

function CourseRow({ course, search }: { course: CourseSummary; search: string }) {
  const { t, i18n } = useTranslation('courseAdmin');
  const title = preferredTitle(course.translations, i18n.language);
  const number = new Intl.NumberFormat(i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(course.updatedAt));
  return <li className="course-list-row">
    <span className="course-list-icon"><LibraryBig size={22} aria-hidden="true" /></span>
    <div className="course-list-detail">
      <h2><bdi lang={title?.locale}>{title?.title ?? course.slug}</bdi></h2>
      <div className="course-list-metadata"><bdi dir="ltr">{course.slug}</bdi>
        <span>{t('lessonTotal', { count: course.lessonCount, amount: number.format(course.lessonCount) })}</span>
        <span className="course-row-date"><time dateTime={course.updatedAt}>{date}</time></span>
      </div>
      <span className="course-list-metadata">{course.translations.map(translation => <bdi key={translation.locale} lang={translation.locale}>
        {contentLanguageName(translation.locale, i18n.language)}
      </bdi>)}</span>
    </div>
    <div className="course-list-action"><EducationStatus status={course.status} />
      <Button asChild variant="secondary"><Link to={courseAdminPath + '/' + course.id + search}>{t('edit')}</Link></Button>
    </div>
  </li>;
}

function CourseList() {
  const { t, i18n } = useTranslation('courseAdmin');
  const { search, state } = useLocation();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, 120);
  const status = statuses.find(value => value === params.get('status'));
  const requested = Number(params.get('page') ?? 1);
  const page = Number.isInteger(requested) && requested >= 1 && requested <= 100000 ? requested : 1;
  const load = useCallback((signal: AbortSignal) => listCourses({ q, status, page, pageSize: 12 }, signal), [q, status, page]);
  const { result, reload } = useEducationData(load);
  const order = usePageOrder(result.status === 'ready' ? result.data.items : [],
    (item, locale) => preferredTitle(item.translations, locale)?.title ?? item.slug);
  const denied = result.status === 'error' && ['noAccess', 'sessionExpired'].includes(courseError(result.error));
  const filtered = Boolean(q || status);
  const number = new Intl.NumberFormat(i18n.language);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const query = String(form.get('q') ?? '').trim();
    const filter = form.get('status') as Status;
    if (query) next.set('q', query);
    if (statuses.includes(filter)) next.set('status', filter);
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
      {result.status === 'ready' && <Button asChild><Link to={courseAdminPath + '/new' + search}><Plus size={19} aria-hidden="true" />{t('new')}</Link></Button>}
    </div>
    {state?.message === 'deleted' && <p className="course-note" role="status">{t('deleted')}</p>}
    {!denied && <Card className="course-filter-panel">
      <form key={q + '|' + (status ?? '')} className="course-filters" onSubmit={applyFilters} role="search">
        <InputField type="search" name="q" label={t('search')} placeholder={t('searchHint')} defaultValue={q} maxLength={120} autoComplete="off" />
        <SelectField name="status" label={t('status')} defaultValue={status ?? ''}>
          <option value="">{t('allStatuses')}</option>
          {statuses.map(value => <option value={value} key={value}>{t(value)}</option>)}
        </SelectField>
        <Button type="submit" variant="secondary">{t('searchAction')}</Button>
        {filtered && <Button variant="ghost" onClick={() => setParams({})}>{t('clear')}</Button>}
      </form>
    </Card>}
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t(courseError(result.error, 'loadFailed'))}>
      {!denied && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
    </StatePanel>}
    {result.status === 'ready' && (result.data.items.length ? <>
      <p className="course-results-count" role="status">{t('results', { count: result.data.total, amount: number.format(result.data.total) })}</p>
      <div className="admin-page-order">{order.field}</div>
      <ul className="course-list" aria-label={t('title')}>{order.items.map(course => <CourseRow key={course.id} course={course} search={search} />)}</ul>
      {result.data.total > result.data.pageSize && <CoursePager page={result.data.page}
        pages={Math.ceil(result.data.total / result.data.pageSize)} onChange={setPage} />}
    </> : <StatePanel kind="empty" title={t(filtered || result.data.total > 0 ? 'noResults' : 'empty')}
      description={filtered || result.data.total > 0 ? undefined : t('emptyHint')}>
      {page > 1 && <Button variant="secondary" onClick={() => setPage(1)}>{t('previous')}</Button>}
    </StatePanel>)}
  </>;
}

export function AdminCourses({ route }: { route: CourseRoute }) {
  if (route.view === 'list') return <CourseList />;
  return <CourseEditor key={route.view === 'edit' ? route.id : 'new'} id={route.view === 'edit' ? route.id : undefined} />;
}
