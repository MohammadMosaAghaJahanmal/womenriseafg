import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, InputField, SelectField, StatePanel } from '../../components/ui/Primitives';
import { usePageOrder } from '../admin/PageOrder';
import { readIdentity } from '../auth/api';
import { contentDirection, TextArea } from '../courses/admin/EditorFields';
import { BackLink, chooseTranslation, learnerLanguageName, localizedNumber } from '../courses/student/components';
import { canDelete, canEdit, statuses, statusTransitions, type EducationRecord, type Status } from '../education/api';
import { useEducationData } from '../education/useEducationData';
import { ConfirmQuizAction, QuizPager, QuizStatus, useQuizUnsaved } from '../quizzes/AdminFields';
import { activityKinds, adminPath, adminPaths, dailyModes, deletePath, editError, pathStatus, publishedTaxonomy,
  readDailySettings, saveDailySettings, savePath, searchContent, type ActivityKind, type DailySettings,
  type DiscoveryGroup, type DiscoveryText, type PathActivity, type PathRecord } from './api';
import { DiscoveryState } from './Cards';
import { TaxonomyFilter } from './TaxonomyFilter';
import { discoveryNamespace as ns } from './strings';

export const pathsAdminPath = '/admin/discovery/paths';
export const collectionsAdminPath = '/admin/discovery/collections';
const groupPaths = { paths: pathsAdminPath, collections: collectionsAdminPath };
const dailyAdminPath = '/admin/discovery/daily-learning';
const reviewPermission = 'discovery:publish';
const managePermission = 'discovery:manage';

function PathsAdminList({ group }: { group: DiscoveryGroup }) {
  const { t, i18n } = useTranslation([ns, 'quiz']);
  const [{ q, page, status }, setQuery] = useState<{ q: string; page: number; status: Status | '' }>({ q: '', page: 1, status: '' });
  const load = useCallback((signal: AbortSignal) => adminPaths(q, status, page, signal, group), [q, page, status, group]);
  const { result, reload } = useEducationData(load);
  const order = usePageOrder(result.status === 'ready' ? result.data.items : [],
    (item, locale) => chooseTranslation(item.translations, locale).title);
  const base = groupPaths[group];
  return <section className="discovery-admin">
    <h1>{t(group)}</h1>
    <div className="learning-actions">
      <Button asChild><Link to={base + '/new'}><Plus aria-hidden="true" size={17} />{t(group === 'paths' ? 'addPath' : 'addCollection')}</Link></Button>
      {group === 'paths' && <Button asChild variant="secondary"><Link to={dailyAdminPath}>{t('daily')}</Link></Button>}
    </div>
    <form className="course-search" onSubmit={event => {
      event.preventDefault();
      setQuery({ page: 1, status, q: String(new FormData(event.currentTarget).get('q') ?? '').trim() });
    }}>
      <InputField name="q" type="search" label={t('query')} maxLength={120} />
      <SelectField label={t('quiz:status')} value={status}
        onChange={event => setQuery({ q, page: 1, status: event.target.value as Status | '' })}>
        <option value="">{t('quiz:allStatuses')}</option>
        {statuses.map(value => <option key={value} value={value}>{t('quiz:' + value)}</option>)}
      </SelectField>
      <Button type="submit" variant="secondary">{t('find')}</Button>
    </form>
    {result.status !== 'ready' ? <DiscoveryState failed={result.status === 'error'} retry={reload} /> : <>
      {result.data.items.length > 0 && <div className="admin-page-order">{order.field}</div>}
      {result.data.items.length ? <ul className="learning-resource-list">{order.items.map(path => {
        const label = chooseTranslation(path.translations, i18n.language);
        return <li key={path.id}><Link to={base + '/' + path.id}><span><bdi lang={label.locale}>{label.title}</bdi>
          <small>{localizedNumber(path.activityCount, i18n.language)} · {t('activityList')}</small></span></Link>
          <QuizStatus status={path.status} /></li>;
      })}</ul> : <StatePanel kind="empty" title={t(group === 'paths' ? 'pathEmpty' : 'collectionEmpty')} />}
      {result.data.total > result.data.pageSize && <QuizPager page={page} pages={Math.ceil(result.data.total / result.data.pageSize)}
        change={next => setQuery({ q, status, page: next })} />}
    </>}
  </section>;
}

function ActivityPicker({ items, change, courses = false }: { items: PathActivity[]; change: (next: PathActivity[]) => void; courses?: boolean }) {
  const { t, i18n } = useTranslation(ns);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ q: string; kind: ActivityKind; page: number }>();
  const [kind, setKind] = useState<ActivityKind>(courses ? 'course' : 'lesson');
  const load = useCallback((signal: AbortSignal) => search ? searchContent(search, signal) : Promise.resolve(null), [search]);
  const { result, reload } = useEducationData(load);
  function move(index: number, difference: number) {
    const next = [...items];
    const [value] = next.splice(index, 1);
    next.splice(index + difference, 0, value);
    change(next);
  }
  return <section className="learn-panel discovery-editor" aria-label={t('selected')}>
    <h2>{t('selected')}</h2>
    {items.length > 0 && <ol className="learning-resource-list discovery-ordered">{items.map(({ reference, activity }, index) => {
      const position = localizedNumber(index + 1, i18n.language);
      return <li key={reference.kind + ':' + reference.id}>
        <bdi lang={activity?.locale}>{activity?.title ?? t('unavailable')}</bdi>
        <div className="learning-actions">
          <Button variant="ghost" aria-label={t('earlier', { position })} disabled={index === 0}
            onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" size={17} /></Button>
          <Button variant="ghost" aria-label={t('later', { position })} disabled={index === items.length - 1}
            onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" size={17} /></Button>
          <Button variant="ghost" aria-label={t('remove', { position })}
            onClick={() => change(items.filter((_, itemIndex) => index !== itemIndex))}><X aria-hidden="true" size={17} /></Button>
        </div>
      </li>;
    })}</ol>}
    {items.length < 24 && <>
      <div className="discovery-filters">
        {!courses && <SelectField label={t('kind')} value={kind} onChange={event => setKind(event.target.value as ActivityKind)}>
          {activityKinds.map(value => <option value={value} key={value}>{t(value)}</option>)}
        </SelectField>}
        <InputField label={t('chooseActivity')} type="search" value={query} maxLength={120}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); setSearch({ q: query.trim(), kind, page: 1 }); }
          }} onChange={event => setQuery(event.target.value)} />
      </div>
      <Button className="discovery-action" variant="secondary" onClick={() => setSearch({ q: query.trim(), kind, page: 1 })}>{t('find')}</Button>
      {search && result.status !== 'ready' && <DiscoveryState failed={result.status === 'error'} retry={reload} />}
      {search && result.status === 'ready' && result.data && <>
        {result.data.items.length ? <ul className="learning-resource-list">{result.data.items.map(activity => {
          const reference = { kind: activity.kind as ActivityKind, id: activity.id };
          return <li key={activity.id}><Button variant="ghost"
            disabled={items.some(item => item.reference.kind === reference.kind && item.reference.id === reference.id)}
            onClick={() => change([...items, { reference, activity }])}>
            <Plus size={16} aria-hidden="true" /><bdi lang={activity.locale}>{activity.title}</bdi>
          </Button></li>;
        })}</ul> : <StatePanel kind="empty" title={t('empty')} />}
        {result.data.total > result.data.pageSize && <QuizPager page={search.page} pages={Math.ceil(result.data.total / result.data.pageSize)}
          change={page => setSearch({ ...search, page })} />}
      </>}
    </>}
  </section>;
}

function PathEditor({ record, languages, publish, group }: {
  record?: PathRecord; languages: string[]; publish: boolean; group: DiscoveryGroup;
}) {
  const { t, i18n } = useTranslation([ns, 'quiz']);
  const navigate = useNavigate();
  const base = groupPaths[group];
  const [current, setCurrent] = useState(record);
  const [slug, setSlug] = useState(record?.slug ?? '');
  const [subjectId, setSubject] = useState(record?.subjectId ?? '');
  const [levelId, setLevel] = useState(record?.levelId ?? '');
  const initialLocale = languages.includes(i18n.language) ? i18n.language : languages[0];
  const [translations, setTranslations] = useState<DiscoveryText[]>(record?.translations ?? [{ locale: initialLocale, title: '', description: '' }]);
  const [activities, setActivities] = useState(record?.activities ?? []);
  const [newLocale, setNewLocale] = useState('');
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const editable = !current || canEdit(current.status);
  const available = languages.filter(value => !translations.some(copy => copy.locale === value));
  useQuizUnsaved(dirty);

  function edit(index: number, next: Partial<DiscoveryText>) {
    setTranslations(items => items.map((item, n) => n === index ? { ...item, ...next } : item));
    setDirty(true);
  }

  async function update(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setMessage('');
    setError(false);
    try {
      await action();
      setMessage('saved');
    } catch (failure) {
      setError(true);
      setMessage(editError(failure));
    } finally { setPending(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;
    void update(async () => {
      const item = await savePath({ slug, subjectId: subjectId || null, levelId: levelId || null,
        translations, activities: activities.map(value => value.reference) }, group, current);
      setCurrent(item);
      setSlug(item.slug);
      setTranslations(item.translations);
      setActivities(item.activities);
      setDirty(false);
      if (!current) navigate(base + '/' + item.id);
    });
  }
  return <section className="discovery-admin">
    <BackLink to={base}>{t(group)}</BackLink>
    <h1>{current ? <bdi>{chooseTranslation(current.translations, i18n.language).title}</bdi>
      : t(group === 'paths' ? 'addPath' : 'addCollection')}</h1>
    {message && <p role={error ? 'alert' : 'status'}>{t(message)}</p>}
    <form className="discovery-editor" onSubmit={save}>
      <InputField label={t('code')} value={slug} onChange={event => { setSlug(event.target.value); setDirty(true); }}
        required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" dir="ltr" disabled={pending || !editable} />
      <div className="discovery-filters">
        <TaxonomyFilter label={t('subjectLabel')} kind="subjects" value={subjectId} disabled={pending || !editable}
          change={next => { setSubject(next); setDirty(true); }} />
        <TaxonomyFilter label={t('level')} kind="levels" value={levelId} disabled={pending || !editable}
          change={next => { setLevel(next); setDirty(true); }} />
      </div>
      {translations.map((copy, index) => <fieldset key={copy.locale} className="discovery-editor discovery-translation" disabled={pending || !editable}>
        <legend>{learnerLanguageName(copy.locale)}</legend>
        <InputField label={t('title')} value={copy.title} required maxLength={150}
          lang={copy.locale} dir={contentDirection(copy.locale, [])} onChange={event => edit(index, { title: event.target.value })} />
        <TextArea label={t('description')} value={copy.description} maxLength={1000}
          locale={copy.locale} direction={contentDirection(copy.locale, [])} onChange={value => edit(index, { description: value })} />
        {translations.length > 1 && <Button className="discovery-action" variant="secondary"
          onClick={() => { setTranslations(values => values.filter(item => item.locale !== copy.locale)); setDirty(true); }}>{t('dropTranslation')}</Button>}
      </fieldset>)}
      {editable && available.length > 0 && translations.length < 6 && <div className="course-search">
        <SelectField value={newLocale} label={t('quiz:translationLanguage')} onChange={event => setNewLocale(event.target.value)} disabled={pending}>
          <option value="">{t('quiz:languagePlaceholder')}</option>
          {available.map(value => <option key={value} value={value}>{learnerLanguageName(value)}</option>)}
        </SelectField>
        <Button variant="secondary" disabled={!newLocale || pending} onClick={() => {
          setTranslations(values => [...values, { locale: newLocale, title: '', description: '' }]);
          setNewLocale('');
          setDirty(true);
        }}>{t('addTranslation')}</Button>
      </div>}
      {editable ? <fieldset className="discovery-translation" disabled={pending}>
        <ActivityPicker courses={group === 'collections'} items={activities} change={next => { setActivities(next); setDirty(true); }} />
      </fieldset> : <ol className="learning-resource-list discovery-ordered">{activities.map(item => <li key={item.reference.kind + ':' + item.reference.id}>
        <bdi lang={item.activity?.locale}>{item.activity?.title ?? t('unavailable')}</bdi></li>)}</ol>}
      {editable && <Button type="submit" className="discovery-action" disabled={pending}>{t(pending ? 'saving' : 'save')}</Button>}
    </form>
    {current && <section className="learn-panel discovery-editor" aria-label={t('publication')}>
      <h2>{t('publication')}</h2><div><QuizStatus status={current.status} /></div>
      <div className="learning-actions">{statusTransitions[current.status]
        .filter(status => publish || !['approved', 'published', 'archived'].includes(status))
        .map(status => <ConfirmQuizAction key={status} label={t('quiz:' + status)} disabled={dirty || pending}
          title={t('confirmStatus', { status: t('quiz:' + status) })} onConfirm={() => void update(async () => {
            setCurrent(await pathStatus(current, status, group));
          })} />)}
        {canDelete(current.status) && <ConfirmQuizAction label={t('delete')} title={t('confirmDelete')} disabled={pending}
          onConfirm={() => void update(async () => { await deletePath(current, group); navigate(base); })} />}
        {current.status === 'published' && <Button asChild variant="secondary">
          <Link to={(group === 'paths' ? '/learning-paths/' : '/collections/') + current.slug}>{t(group === 'paths' ? 'path' : 'collection')}</Link>
        </Button>}
      </div>
    </section>}
  </section>;
}

function DailyEditor({ initial, previews, publish }: { initial: DailySettings; previews: PathActivity[]; publish: boolean }) {
  const { t } = useTranslation(ns);
  const [settings, setSettings] = useState(initial);
  const [activities, setActivities] = useState(previews);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  useQuizUnsaved(dirty);
  return <section className="discovery-admin">
    <BackLink to={pathsAdminPath}>{t('paths')}</BackLink>
    <h1>{t('daily')}</h1>
    {!publish && <StatePanel kind="empty" title={t('permission')} />}
    {message && <p role={message === 'saved' ? 'status' : 'alert'}>{t(message)}</p>}
    <form className="discovery-editor" onSubmit={async event => {
      event.preventDefault();
      if (!publish || pending) return;
      setPending(true);
      setMessage('');
      try {
        setSettings(await saveDailySettings({ ...settings,
          activities: settings.mode === 'curated' ? activities.map(item => item.reference) : [] }));
        setDirty(false);
        setMessage('saved');
      } catch (failure) { setMessage(editError(failure)); }
      finally { setPending(false); }
    }}>
      <SelectField label={t('mode')} value={settings.mode} disabled={!publish || pending} onChange={event => {
        setSettings({ ...settings, mode: event.target.value as DailySettings['mode'] });
        setDirty(true);
      }}>
        {dailyModes.map(mode => <option value={mode} key={mode}>{t(mode)}</option>)}
      </SelectField>
      {settings.mode === 'curated' && <fieldset className="discovery-translation" disabled={!publish || pending}>
        <ActivityPicker items={activities} change={next => { setActivities(next); setDirty(true); }} />
      </fieldset>}
      {publish && <Button className="discovery-action" type="submit" disabled={pending || !dirty}>{t(pending ? 'saving' : 'save')}</Button>}
    </form>
  </section>;
}

export function AdminDiscovery({ route }: { route: string }) {
  const { t } = useTranslation(ns);
  const group = route === collectionsAdminPath || route.startsWith(collectionsAdminPath + '/') ? 'collections' : 'paths';
  const base = groupPaths[group];
  const list = route === base;
  const daily = route === dailyAdminPath;
  const id = route.slice(base.length + 1);
  const fresh = id === 'new';
  const valid = list || daily || (route.startsWith(base + '/') && (fresh || /^[a-f0-9-]{36}$/i.test(id)));
  const load = useCallback(async (signal: AbortSignal) => {
    const user = await readIdentity(signal);
    const manage = user?.permissions.includes(managePermission) ?? false;
    const publish = user?.permissions.includes(reviewPermission) ?? false;
    const permissions = { manage, publish };
    if (!manage || !valid || list) return permissions;
    if (daily) return { ...permissions, daily: await readDailySettings(signal) };
    const [record, translations] = await Promise.all([
      fresh ? Promise.resolve(undefined) : adminPath(id, signal, group), publishedTaxonomy('languages', signal),
    ]);
    return { ...permissions, record, translations: translations.map((value: EducationRecord) => value.locale).filter((value): value is string => !!value) };
  }, [daily, fresh, group, id, list, valid]);
  const { result, reload } = useEducationData(load);
  if (result.status !== 'ready') return <DiscoveryState failed={result.status === 'error'} retry={reload} />;
  const data = result.data;
  if (!valid) return <StatePanel kind="error" title={t('unavailable')} />;
  if (!data.manage) return <StatePanel kind="error" title={t('permission')} />;
  if (list) return <PathsAdminList group={group} />;
  if ('daily' in data && data.daily) return <DailyEditor initial={data.daily.settings} publish={data.publish}
    previews={data.daily.settings.activities.map((reference, index) => ({ reference, activity: data.daily.previews[index] ?? null }))} />;
  if ('translations' in data && data.translations?.length) {
    return <PathEditor record={data.record} languages={data.translations} publish={data.publish} group={group} />;
  }
  return <StatePanel kind="empty" title={t('reference')} />;
}
