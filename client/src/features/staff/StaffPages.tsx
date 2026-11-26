import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, DialogClose, InputField, Pagination, PanelDialog, SectionTabs, SelectField, StatePanel } from '../../components/ui/Primitives';
import { languages } from '../../i18n';
import { authError, authStatus, readIdentity } from '../auth/api';
import { contentDirection, TextArea } from '../courses/admin/EditorFields';
import { chooseTranslation, learnerLanguageName, localizedNumber } from '../courses/student/components';
import { useEducationData } from '../education/useEducationData';
import {
  addAssignment, assignableRoles, assignedCourse, assignments, completeAssignment, lanes, revokeAssignment, saveAssignedCopy,
  staffAudit, staffCourses, staffPageSize, staffUsers, staffWorkspacePath, updateStaff,
  type CopyPatch, type Detail, type Lane, type StaffAccount, type StaffRole,
} from './api';
import './strings';
import './staff.css';

function ErrorPanel({ error, reload }: { error: unknown; reload: () => void }) {
  const { t } = useTranslation('staff');
  return <StatePanel kind="error" title={authStatus(error) === 403 ? t('denied') : t('unavailable')}>
    <Button type="button" onClick={reload}>{t('retry')}</Button>
  </StatePanel>;
}

function Loading() {
  const { t } = useTranslation('staff');
  return <StatePanel kind="loading" title={t('loading')} />;
}

function Nothing() {
  const { t } = useTranslation('staff');
  return <StatePanel kind="empty" title={t('empty')} />;
}

function Pager({ page, total, change }: { page: number; total: number; change: (page: number) => void }) {
  const { t, i18n } = useTranslation('staff');
  const pages = Math.max(1, Math.ceil(total / staffPageSize));
  return pages > 1 || page > 1 ? <Pagination page={page} pages={pages} label={t('page', {
    current: localizedNumber(page, i18n.language), total: localizedNumber(pages, i18n.language),
  })} pageLabel={t('page', { current: page, total: pages })} previous={t('prev')} next={t('next')} onChange={change} /> : null;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'failed' | 'changed'>();
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      await action();
      setFeedback('saved');
    } catch (error) {
      setFeedback(authError(error) === 'STALE_VERSION' ? 'changed' : 'failed');
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, feedback };
}
function Feedback({ code }: { code: ReturnType<typeof useAction>['feedback'] }) {
  const { t } = useTranslation('staff');
  return code ? <p role={code === 'saved' ? 'status' : 'alert'}>{t(code)}</p> : null;
}

function Confirm({ label, onConfirm, busy = false }: { label: string; onConfirm: () => void; busy?: boolean }) {
  const { t } = useTranslation('staff');
  return <PanelDialog title={t('confirmation')} description={label} closeLabel={t('cancel')}
    trigger={<Button type="button" variant="secondary" disabled={busy}>{label}</Button>}>
    <div className="staff-actions">
      <DialogClose asChild><Button type="button" variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button type="button" onClick={onConfirm}>{t('apply')}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

function Accounts() {
  const { t } = useTranslation('staff');
  const [prefix, setPrefix] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const load = useCallback((signal: AbortSignal) => staffUsers(prefix, page, signal), [prefix, page]);
  const { result, reload } = useEducationData(load);
  const account = result.status === 'ready' ? result.data.items.find(item => item.id === selected) : undefined;
  return <section className="staff-page">
    <form className="staff-fields" onSubmit={event => {
      event.preventDefault();
      const search = String(new FormData(event.currentTarget).get('prefix') ?? '').trim();
      setPrefix(search);
      setPage(1);
      setSelected('');
    }}>
      <InputField type="search" label={t('searchUsers')} name="prefix" maxLength={32} dir="ltr" />
      <Button type="submit">{t('search')}</Button>
    </form>
    {result.status === 'loading' && <Loading />}
    {result.status === 'error' && <ErrorPanel error={result.error} reload={reload} />}
    {result.status === 'ready' && <>
      {result.data.items.length > 0 ? <SelectField label={t('learnerAccount')} value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">{t('choose')}</option>
        {result.data.items.map(item => <option key={item.id} value={item.id}>{item.username}</option>)}
      </SelectField> : <Nothing />}
      <Pager page={page} total={result.data.total} change={next => { setPage(next); setSelected(''); }} />
      {account && <AccountEditor key={account.id + account.revision} account={account} reload={reload} />}
    </>}
  </section>;
}
function AccountEditor({ account, reload }: { account: StaffAccount; reload: () => void }) {
  const { t } = useTranslation('staff');
  const [role, setRole] = useState<StaffRole | ''>(assignableRoles.find(value => account.roles.includes(value)) ?? '');
  const [active, setActive] = useState(account.active);
  const { busy, feedback, run } = useAction();
  return <Card className="staff-card staff-page">
    <h2><bdi>{account.username}</bdi></h2>
    {account.roles.includes('super-admin') ? <p>{t('restricted')}</p> : <>
      <SelectField label={t('role')} value={role} onChange={event => setRole(event.target.value as StaffRole | '')}>
        <option value="">{t('learner')}</option>
        {assignableRoles.map(value => <option key={value} value={value}>{t(value)}</option>)}
      </SelectField>
      <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> {t('active')}</label>
      <div className="staff-actions"><Confirm label={t('save')} busy={busy} onConfirm={() => void run(async () => {
        await updateStaff(account, role || null, active);
        reload();
      })} /></div>
      <Feedback code={feedback} />
    </>}
  </Card>;
}

function AssignmentForm({ saved }: { saved: () => void }) {
  const { t, i18n } = useTranslation('staff');
  const [userPrefix, setUserPrefix] = useState('');
  const [courseQuery, setCourseQuery] = useState('');
  const [status, setStatus] = useState<'draft' | 'educational-review' | 'translation-review'>('draft');
  const [lane, setLane] = useState<Lane>('edit');
  const [locale, setLocale] = useState<string>('en');
  const [assigneeId, setAssigneeId] = useState('');
  const [courseId, setCourseId] = useState('');
  const { busy, feedback, run } = useAction();
  const load = useCallback(async (signal: AbortSignal) => {
    const [users, courses] = await Promise.all([staffUsers(userPrefix, 1, signal), staffCourses(courseQuery, status, 1, signal)]);
    return { users, courses };
  }, [userPrefix, courseQuery, status]);
  const { result, reload } = useEducationData(load);
  const eligible = result.status === 'ready' ? result.data.users.items.filter(user => user.active && user.roles.some(role =>
    lane === 'edit' ? role === 'teacher' || role === 'content-manager' : lane === 'translate' ? role === 'translator' : role === 'reviewer')) : [];
  return <Card className="staff-card staff-page">
    <h2>{t('newAssignment')}</h2>
    <form className="staff-fields" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setUserPrefix(String(data.get('username') ?? '').trim());
      setCourseQuery(String(data.get('title') ?? '').trim());
      setAssigneeId('');
      setCourseId('');
    }}>
      <InputField label={t('searchUsers')} name="username" type="search" maxLength={32} dir="ltr" />
      <InputField label={t('courseSearch')} name="title" type="search" maxLength={120} />
      <SelectField label={t('stage')} value={status} onChange={event => { setStatus(event.target.value as typeof status); setCourseId(''); }}>
        {(['draft', 'educational-review', 'translation-review'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}
      </SelectField>
      <Button type="submit" variant="secondary">{t('search')}</Button>
    </form>
    {result.status === 'loading' && <Loading />}
    {result.status === 'error' && <ErrorPanel error={result.error} reload={reload} />}
    {result.status === 'ready' && <form className="staff-form" aria-busy={busy} onSubmit={event => {
      event.preventDefault();
      const instructions = String(new FormData(event.currentTarget).get('instructions') ?? '');
      void run(async () => {
        await addAssignment({ assigneeId, courseId, lane, instructions, locale: lane === 'translate' ? locale : null });
        setAssigneeId('');
        setCourseId('');
        saved();
      });
    }}>
      <div className="staff-fields">
        <SelectField label={t('lane')} value={lane} onChange={event => { setLane(event.target.value as Lane); setAssigneeId(''); }}>
          {lanes.map(value => <option key={value} value={value}>{t(value)}</option>)}
        </SelectField>
        <SelectField label={t('assignee')} value={assigneeId} required onChange={event => setAssigneeId(event.target.value)}>
          <option value="">{t('choose')}</option>
          {eligible.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}
        </SelectField>
        <SelectField label={t('course')} value={courseId} required onChange={event => setCourseId(event.target.value)}>
          <option value="">{t('choose')}</option>
          {result.data.courses.items.map(course =>
            <option key={course.id} value={course.id}>{chooseTranslation(course.translations, i18n.language).title}</option>)}
        </SelectField>
        {lane === 'translate' && <SelectField label={t('locale')} value={locale} onChange={event => setLocale(event.target.value)}>
          {languages.map(value => <option key={value} value={value} lang={value}>{learnerLanguageName(value)}</option>)}
        </SelectField>}
      </div>
      <InputField label={t('note')} name="instructions" maxLength={1000} />
      <Button type="submit" disabled={busy || !assigneeId || !courseId}>{t(busy ? 'busy' : 'assign')}</Button>
      <Feedback code={feedback} />
    </form>}
  </Card>;
}

function AssignmentList({ manage }: { manage: boolean }) {
  const { t } = useTranslation('staff');
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => assignments(manage, page, signal), [manage, page]);
  const { result, reload } = useEducationData(load);
  const { busy, feedback, run } = useAction();
  return <section className="staff-page">
    {manage && <AssignmentForm saved={reload} />}
    {result.status === 'loading' && <Loading />}
    {result.status === 'error' && <ErrorPanel error={result.error} reload={reload} />}
    {result.status === 'ready' && <>
      {result.data.items.length ? <ul className="staff-list">{result.data.items.map(item => <li key={item.id}>
        <Card className="staff-card staff-page">
          <header className="staff-assignment-header"><h2><bdi>{item.courseSlug}</bdi></h2>
            <span>{item.state === 'open' ? t(item.lane) : t(item.state)}</span></header>
          {item.instructions && <p className="staff-note" dir="auto">{item.instructions}</p>}
          {item.locale && <p>{t('locale')} <bdi lang={item.locale}>{learnerLanguageName(item.locale)}</bdi></p>}
          {manage && item.state === 'open' && <div className="staff-actions">
            <Confirm label={t('revoke')} busy={busy} onConfirm={() => void run(async () => { await revokeAssignment(item.id); reload(); })} />
          </div>}
          {!manage && <div className="staff-actions">
            <Button asChild><Link to={staffWorkspacePath + '?assignment=' + item.id}>{t('open')}</Link></Button>
          </div>}
        </Card>
      </li>)}</ul> : <Nothing />}
      <Pager page={page} total={result.data.total} change={setPage} />
    </>}
    <Feedback code={feedback} />
  </section>;
}

function Audit() {
  const { t, i18n } = useTranslation('staff');
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => staffAudit(page, signal), [page]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error') return <ErrorPanel error={result.error} reload={reload} />;
  if (!result.data.items.length && page === 1) return <Nothing />;
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  return <section className="staff-page">
    <p>{t('auditNote')}</p>
    <ul className="staff-list">{result.data.items.map(item => <li key={item.id}><Card className="staff-card">
      <h2>{t(item.event)}</h2>
      <dl className="staff-audit">
        <dt>{t('date')}</dt><dd><time dateTime={item.createdAt}>{format.format(new Date(item.createdAt))}</time></dd>
        <dt>{t('actor')}</dt><dd><bdi>{item.actorId}</bdi></dd>
        <dt>{t('target')}</dt><dd><bdi>{item.targetId}</bdi></dd>
      </dl>
    </Card></li>)}</ul>
    <Pager page={page} total={result.data.total} change={setPage} />
  </section>;
}

function RequireStaff({ permission, children, direct = false }: { permission: string; children: ReactNode; direct?: boolean }) {
  const { t } = useTranslation('staff');
  const { result, reload } = useEducationData(readIdentity);
  useEffect(() => {
    if (!direct) return;
    function restored(event: PageTransitionEvent) {
      if (event.persisted) reload();
    }
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, [direct, reload]);
  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error') return <ErrorPanel error={result.error} reload={reload} />;
  if (!result.data && direct) return <Navigate to="/admin/login" replace />;
  if (!result.data?.permissions.includes(permission)) return <StatePanel kind="error" title={t('denied')} description={t('signInHint')}>
    <Button asChild><Link to="/admin/login">{t('signIn')}</Link></Button>
  </StatePanel>;
  return children;
}

export function StaffAdmin() {
  const { t, i18n } = useTranslation('staff');
  const [tab, setTab] = useState('accounts');
  return <section className="staff-page">
    <h1>{t('adminTitle')}</h1>
    <RequireStaff permission="staff:manage">
      <p>{t('privacy')}</p>
      <SectionTabs label={t('adminTitle')} dir={i18n.dir()} value={tab} onValueChange={setTab} items={[
        { value: 'accounts', label: t('accounts'), content: <Accounts /> },
        { value: 'assignments', label: t('assignments'), content: <AssignmentList manage /> },
        { value: 'audit', label: t('audit'), content: <Audit /> },
      ]} />
    </RequireStaff>
  </section>;
}

type Copy = { locale: string; title: string; description?: string; body?: string; objectives?: string; prerequisites?: string; imageAlt?: string };
type CopyEntry = { id: string; scope: CopyPatch['scope']; translations: Copy[]; mediaId?: string | null };
function courseEntries(course: Detail['course']): CopyEntry[] {
  const entries: CopyEntry[] = [{ id: course.id, scope: 'course', translations: course.translations }];
  for (const chapter of course.chapters) {
    if (chapter.id) entries.push({ id: chapter.id, scope: 'chapter', translations: chapter.translations });
    for (const lesson of chapter.lessons) if (lesson.id) {
      entries.push({ id: lesson.id, scope: 'lesson', translations: lesson.translations, mediaId: lesson.mediaId });
    }
  }
  return entries;
}

function CopyEditor({ entry, detail, reload }: { entry: CopyEntry; detail: Detail; reload: () => void }) {
  const { t } = useTranslation('staff');
  const initial = detail.assignment.locale ?? entry.translations[0]?.locale ?? 'en';
  const [locale, setLocale] = useState(initial);
  const [draft, setDraft] = useState<Copy>(entry.translations.find(copy => copy.locale === initial) ?? { locale: initial, title: '' });
  const { busy, feedback, run } = useAction();
  const dir = contentDirection(locale, []);
  function update<K extends keyof Copy>(key: K, value: Copy[K]) { setDraft(current => ({ ...current, [key]: value })); }
  const field = (key: 'description' | 'objectives' | 'prerequisites' | 'body' | 'imageAlt', maxLength = 2400) =>
    <TextArea label={t(key)} locale={locale} direction={dir} value={draft[key] ?? ''} maxLength={maxLength}
      onChange={value => update(key, value)} />;
  return <form className="staff-form" aria-busy={busy} onSubmit={event => {
    event.preventDefault();
    const base = { entryId: entry.id, version: detail.course.version, locale, title: draft.title };
    const description = draft.description ?? '';
    const patch: CopyPatch = entry.scope === 'course' ? {
      ...base, scope: 'course', description, objectives: draft.objectives ?? '', prerequisites: draft.prerequisites ?? '',
    } : entry.scope === 'lesson' ? {
      ...base, scope: 'lesson', description, body: draft.body ?? '', imageAlt: draft.imageAlt ?? '',
    } : { ...base, scope: 'chapter' };
    void run(async () => { await saveAssignedCopy(detail.assignment.id, patch); reload(); });
  }}>
    {detail.assignment.lane === 'edit' && <SelectField label={t('language')} value={locale} onChange={event => {
      const next = event.target.value;
      setLocale(next);
      setDraft(entry.translations.find(copy => copy.locale === next) ?? { locale: next, title: '' });
    }}>
      {entry.translations.map(copy => <option key={copy.locale} value={copy.locale} lang={copy.locale}>{learnerLanguageName(copy.locale)}</option>)}
    </SelectField>}
    <InputField label={t('title')} required maxLength={150} lang={locale} dir={dir} value={draft.title} onChange={event => update('title', event.target.value)} />
    {entry.scope !== 'chapter' && field('description')}
    {entry.scope === 'course' && <>{field('objectives')}{field('prerequisites')}</>}
    {entry.scope === 'lesson' && <>{field('body', 12000)}{field('imageAlt', 500)}</>}
    <Button disabled={busy} type="submit">{t(busy ? 'busy' : 'save')}</Button>
    <Feedback code={feedback} />
  </form>;
}

function SourceCopy({ entry }: { entry: CopyEntry }) {
  const { t } = useTranslation('staff');
  return <details>
    <summary>{t('sourceCopy')}</summary>
    {entry.translations.map(copy => <section className="staff-copy" key={copy.locale} lang={copy.locale} dir={contentDirection(copy.locale, [])}>
      <h3>{copy.title} · <bdi>{learnerLanguageName(copy.locale)}</bdi></h3>
      {[copy.description, copy.objectives, copy.prerequisites, copy.body, copy.imageAlt].filter(Boolean).map((value, index) =>
        <p key={index}>{value}</p>)}
    </section>)}
    {entry.mediaId && <Link reloadDocument to={'/api/v1/media/' + entry.mediaId + '/file'}>{t('lesson')}</Link>}
  </details>;
}

function AssignmentContent({ detail, reload }: { detail: Detail; reload: () => void }) {
  const { t, i18n } = useTranslation('staff');
  const [, setQuery] = useSearchParams();
  const [selectedId, setSelectedId] = useState(detail.course.id);
  const { busy, feedback, run } = useAction();
  const entries = courseEntries(detail.course);
  const item = entries.find(entry => entry.id === selectedId) ?? entries[0]!;
  const review = detail.assignment.lane === 'review';
  const inReview = detail.course.status === 'educational-review' || detail.course.status === 'translation-review';
  function complete(action: 'submit' | 'approve' | 'return') {
    void run(async () => { await completeAssignment(detail.assignment.id, action, detail.course.version); setQuery({}); });
  }
  return <>
    <div className="staff-actions"><Button asChild variant="secondary"><Link to={staffWorkspacePath}>{t('back')}</Link></Button></div>
    <Card className="staff-card staff-page">
      <h2>{chooseTranslation(detail.course.translations, i18n.language).title}</h2>
      <p>{t(detail.assignment.lane)} · {t(detail.course.status)}</p>
      {detail.assignment.instructions && <p className="staff-note" dir="auto">{detail.assignment.instructions}</p>}
      <SelectField label={t('section')} value={item.id} onChange={event => setSelectedId(event.target.value)}>
        {entries.map(entry => <option key={entry.id} value={entry.id}>
          {t(entry.scope)} · {chooseTranslation(entry.translations, i18n.language).title}
        </option>)}
      </SelectField>
      <SourceCopy entry={item} />
      {review ? (inReview ? <div className="staff-actions">
        <Confirm label={t('approve')} busy={busy} onConfirm={() => complete('approve')} />
        <Confirm label={t('return')} busy={busy} onConfirm={() => complete('return')} />
      </div> : <p>{t('reviewUnavailable')}</p>) : <>
        <CopyEditor key={item.id + detail.course.version} entry={item} detail={detail} reload={reload} />
        <div className="staff-actions"><Confirm label={t('finish')} busy={busy} onConfirm={() => complete('submit')} /></div>
      </>}
      <Feedback code={feedback} />
    </Card>
  </>;
}

function StaffDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => assignedCourse(id, signal), [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'loading') return <Loading />;
  if (result.status === 'error') return <ErrorPanel error={result.error} reload={reload} />;
  return <AssignmentContent detail={result.data} reload={reload} />;
}

export function StaffWorkspace() {
  const { t } = useTranslation('staff');
  const [query] = useSearchParams();
  const id = query.get('assignment');
  return <section className="staff-page">
    <h1>{t('workspaceTitle')}</h1>
    <RequireStaff direct permission="staff:workspace">
      <p>{t('privacy')}</p>
      {id ? <StaffDetail key={id} id={id} /> : <AssignmentList manage={false} />}
    </RequireStaff>
  </section>;
}

