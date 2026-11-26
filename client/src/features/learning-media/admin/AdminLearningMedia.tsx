import { Film, Image, Plus, Video } from 'lucide-react';
import { useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button, Card, InputField, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { preferredTitle } from '../../courses/admin/api';
import { contentLanguageName } from '../../courses/admin/EditorFields';
import { statuses } from '../../education/api';
import { EducationStatus } from '../../education/EducationList';
import { useEducationData } from '../../education/useEducationData';
import { LearningMediaEditor } from './Editor';
import { PageControls } from './Picker';
import {
  entryError, learningMediaAdminPath, learningMediaKinds, listEntries, type LearningMediaRecord,
} from './api';
import { learningMediaAdminNamespace as ns } from './strings';
import './learning-media-admin.css';

type AdminRoute = { view: 'list' | 'new' } | { view: 'detail'; id: string };

export function matchLearningMediaRoute(path: string): AdminRoute | undefined {
  if (path === learningMediaAdminPath) return { view: 'list' };
  if (path === learningMediaAdminPath + '/new') return { view: 'new' };
  const id = path.slice(learningMediaAdminPath.length + 1);
  if (path.startsWith(learningMediaAdminPath + '/') && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return { view: 'detail', id };
}

function EntryRow({ entry, search }: { entry: LearningMediaRecord; search: string }) {
  const { t, i18n } = useTranslation(ns);
  const name = preferredTitle(entry.translations, i18n.language);
  const Icon = entry.kind === 'short' ? Film : entry.kind === 'video' ? Video : Image;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const seconds = new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'second', maximumFractionDigits: 0 });
  return <li className="course-list-row">
    <span className="course-list-icon"><Icon size={22} aria-hidden="true" /></span>
    <div className="course-list-detail">
      <h2><bdi lang={name?.locale}>{name?.title ?? entry.slug}</bdi></h2>
      <div className="course-list-metadata">
        <span>{t(entry.kind)}</span>
        {entry.aiOrigin !== 'human' && <span>{t(entry.aiOrigin)}</span>}
        {entry.durationMs != null && <span>{seconds.format(entry.durationMs / 1000)}</span>}
        <time dateTime={entry.updatedAt}>{date.format(new Date(entry.updatedAt))}</time>
        <bdi dir="ltr">{entry.slug}</bdi>
      </div>
      <div className="course-list-metadata">{entry.translations.map(value => <bdi key={value.locale} lang={value.locale}>
        {contentLanguageName(value.locale, i18n.language)}
      </bdi>)}</div>
    </div>
    <div className="course-list-action">
      <EducationStatus status={entry.status} />
      <Button asChild variant="secondary"><Link to={learningMediaAdminPath + '/' + entry.id + search}>{t('edit')}</Link></Button>
    </div>
  </li>;
}

function LearningMediaList() {
  const { t } = useTranslation([ns, 'education']);
  const { search, state } = useLocation();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, 120);
  const kind = learningMediaKinds.find(key => key === params.get('kind'));
  const status = statuses.find(key => key === params.get('status'));
  const aiOnly = params.get('aiOnly') === 'true';
  const requested = Number(params.get('page') ?? 1);
  const page = Number.isInteger(requested) && requested >= 1 && requested <= 100000 ? requested : 1;
  const filtered = Boolean(q || kind || status || aiOnly);
  const load = useCallback((signal: AbortSignal) => listEntries({ q, kind, status, aiOnly: aiOnly || undefined, page, pageSize: 12 }, signal),
    [q, kind, status, aiOnly, page]);
  const { result, reload } = useEducationData(load);
  const error = result.status === 'error' ? entryError(result.error, 'loadFailed') : '';
  const denied = error === 'sessionEnded' || error === 'noAccess';

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of ['q', 'kind', 'status', 'aiOnly']) {
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
      {result.status === 'ready' && <Button asChild><Link to={learningMediaAdminPath + '/new' + search}>
        <Plus size={19} aria-hidden="true" />{t('create')}
      </Link></Button>}
    </div>
    {state?.message === 'deleted' && <p role="status">{t('deleted')}</p>}
    {!denied && <Card className="learning-media-filter">
      <form key={[q, kind, status, aiOnly].join('|')} className="course-filters" role="search" onSubmit={apply}>
        <InputField type="search" name="q" label={t('search')} defaultValue={q} maxLength={120} autoComplete="off" />
        <SelectField name="kind" label={t('type')} defaultValue={kind ?? ''}>
          <option value="">{t('allTypes')}</option>
          {learningMediaKinds.map(key => <option value={key} key={key}>{t(key)}</option>)}
        </SelectField>
        <SelectField name="status" label={t('status')} defaultValue={status ?? ''}>
          <option value="">{t('allStatuses')}</option>
          {statuses.map(key => <option value={key} key={key}>{t('education:status-' + key)}</option>)}
        </SelectField>
        <SelectField name="aiOnly" label={t('origin')} defaultValue={aiOnly ? 'true' : ''}>
          <option value="">{t('allOrigins')}</option><option value="true">{t('aiOnly')}</option>
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
      <ul className="course-list learning-media-list" aria-label={t('title')}>
        {result.data.items.map(entry => <EntryRow key={entry.id} entry={entry} search={search} />)}
      </ul>
      {result.data.total > result.data.pageSize && <PageControls page={result.data.page}
        pages={Math.ceil(result.data.total / result.data.pageSize)} onChange={setPage} />}
    </> : <StatePanel kind="empty" title={t(filtered || page > 1 ? 'noMatches' : 'noEntries')}>
      {page > 1 && <Button variant="secondary" onClick={() => setPage(1)}>{t('prev')}</Button>}
    </StatePanel>)}
  </>;
}

export function AdminLearningMedia({ route }: { route: AdminRoute }) {
  if (route.view === 'list') return <LearningMediaList />;
  const id = route.view === 'detail' ? route.id : undefined;
  return <LearningMediaEditor key={id ?? 'new'} id={id} />;
}
