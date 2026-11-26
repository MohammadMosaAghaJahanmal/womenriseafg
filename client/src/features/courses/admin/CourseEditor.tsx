import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ExternalLink, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, DialogClose, PanelDialog, SectionTabs, StatePanel } from '../../../components/ui/Primitives';
import { readIdentity } from '../../auth/api';
import { canDelete, canEdit, statusTransitions, type Status } from '../../education/api';
import { EducationStatus } from '../../education/EducationList';
import { useEducationData } from '../../education/useEducationData';
import { CurriculumFields } from './CurriculumFields';
import { DetailsFields } from './EditorFields';
import { changeCourseStatus, courseAdminPath, courseError, deleteCourse, getCourse, loadTaxonomy, preferredTitle, saveCourse, type CourseRecord, type CourseTaxonomy } from './api';
import { prepareCourse, toDraft, type CourseDraft } from './draft';

const statusActions: Record<Status, string> = {
  draft: 'toDraft',
  'educational-review': 'submitReview',
  'translation-review': 'translationReview',
  approved: 'approve',
  published: 'publish',
  archived: 'archive',
};

function ConfirmAction({ label, title, description, action, disabled, variant = 'secondary' }: {
  label: string;
  title: string;
  description?: string;
  action: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { t } = useTranslation('courseAdmin');
  return <PanelDialog title={title} description={description} closeLabel={t('close')}
    trigger={<Button variant={variant} disabled={disabled}>{label}</Button>}>
    <div className="admin-dialog-actions">
      <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button onClick={action}>{label}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

function Publication({ record, canPublish, blocked, dirty, onStatus, remove }: {
  record: CourseRecord;
  canPublish: boolean;
  blocked: boolean;
  dirty: boolean;
  onStatus: (status: Status) => void;
  remove: () => void;
}) {
  const { t } = useTranslation('courseAdmin');
  const transitions = statusTransitions[record.status];
  const limited = transitions.some(status => status === 'published' || status === 'archived') && !canPublish;
  return <Card className="course-publication">
    <h2>{t('publication')}</h2>
    <EducationStatus status={record.status} />
    <p className="course-note">{t(dirty ? 'saveBeforeStatus' : limited ? 'permission' : 'optionalReview')}</p>
    <div className="course-row-footer">
      {transitions.map(status => {
        const label = t(statusActions[status]);
        if (status === 'published' || status === 'archived') {
          if (!canPublish) return null;
          const key = status === 'published' ? 'publish' : 'archive';
          return <ConfirmAction key={status} label={label} title={t(key + 'Title')} description={t(key + 'Description')}
            action={() => onStatus(status)} disabled={blocked || dirty} />;
        }
        return <Button key={status} variant="secondary" disabled={blocked || dirty} onClick={() => onStatus(status)}>{label}</Button>;
      })}
      {record.status === 'published' && <Button variant="ghost" asChild><Link to={'/courses/' + record.slug}>
        <ExternalLink size={17} aria-hidden="true" />{t('publishedView')}
      </Link></Button>}
    </div>
    {canDelete(record.status) && <div className="course-publication-delete"><ConfirmAction label={t('delete')} title={t('deleteTitle')}
      description={t('deleteDescription')} action={remove} disabled={blocked || dirty} variant="ghost" /></div>}
  </Card>;
}

interface EditorData {
  record: CourseRecord | undefined;
  taxonomy: CourseTaxonomy;
  canManage: boolean;
  canPublish: boolean;
}

function RecordEditor({ data, onReload }: { data: EditorData; onReload: () => void }) {
  const { t, i18n } = useTranslation('courseAdmin');
  const navigate = useNavigate();
  const { search, state } = useLocation();
  const back = courseAdminPath + search;
  const locale = data.taxonomy.languages.find(item => item.locale === i18n.language)?.locale ??
    data.taxonomy.languages.find(item => item.locale === 'en')?.locale ?? data.taxonomy.languages[0]?.locale ?? 'en';
  const [record, setRecord] = useState(data.record);
  const [draft, setDraft] = useState(() => toDraft(record, locale));
  const [tab, setTab] = useState('details');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'status' | 'delete'>();
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(state?.message === 'created' ? 'created' : '');
  const notice = useRef<HTMLDivElement>(null);
  const stale = error === 'stale';
  const editable = !record || canEdit(record.status);
  const blocked = Boolean(busy || stale);
  const title = record && preferredTitle(record.translations, i18n.language);

  useEffect(() => {
    if (!dirty) return;
    const confirm = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', confirm);
    return () => window.removeEventListener('beforeunload', confirm);
  }, [dirty]);
  useEffect(() => {
    if (error) notice.current?.focus();
  }, [error]);

  function change<T extends keyof CourseDraft>(key: T, value: CourseDraft[T]) {
    setDraft(current => ({ ...current, [key]: value }));
    setDirty(true);
    setFeedback('');
    if (!stale) setError('');
  }

  function apply(next: CourseRecord, message: string) {
    setRecord(next);
    setDraft(current => toDraft(next, locale, current));
    setDirty(false);
    setFeedback(message);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || !editable) return;
    setFeedback('');
    const prepared = prepareCourse(draft);
    if ('error' in prepared) {
      setTab(prepared.tab);
      if (error === prepared.error) notice.current?.focus();
      setError(prepared.error);
      return;
    }
    setBusy('save');
    setError('');
    try {
      const saved = await saveCourse(prepared.input, record);
      if (!record) {
        setDirty(false);
        void navigate(courseAdminPath + '/' + saved.id + search, { replace: true, state: { message: 'created' } });
      } else apply(saved, 'saved');
    } catch (failure) {
      setError(courseError(failure));
    } finally {
      setBusy(undefined);
    }
  }

  async function moveStatus(status: Status) {
    if (!record || blocked || dirty) return;
    setBusy('status');
    setError('');
    setFeedback('');
    try {
      apply(await changeCourseStatus(record, status), 'statusSaved');
    } catch (failure) {
      setError(courseError(failure));
    } finally {
      setBusy(undefined);
    }
  }

  async function remove() {
    if (!record || blocked || dirty) return;
    setBusy('delete');
    setError('');
    setFeedback('');
    try {
      await deleteCourse(record);
      void navigate(back, { replace: true, state: { message: 'deleted' } });
    } catch (failure) {
      setError(courseError(failure));
    } finally {
      setBusy(undefined);
    }
  }

  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={back} onClick={event => {
      if (dirty && !window.confirm(t('leave'))) event.preventDefault();
    }}><ArrowLeft className="ui-direction" size={18} aria-hidden="true" />{t('back')}</Link></Button>
    <div className="admin-section-heading course-heading"><div>
      <h1>{record ? t('edit') : t('new')}</h1>
      {record && <div className="course-record-heading"><bdi lang={title?.locale}>{title?.title ?? record.slug}</bdi><EducationStatus status={record.status} /></div>}
    </div></div>
    <form className="course-builder" onSubmit={save} noValidate aria-busy={Boolean(busy)}>
      <div className="course-builder-actions">
        {!editable && <p className="course-note">{t('locked')}</p>}
        {editable && <Button type="submit" disabled={blocked}><Save size={17} aria-hidden="true" />{t(busy === 'save' ? 'saving' : 'save')}</Button>}
        <span role="status" aria-live="polite">{feedback && t(feedback)}</span>
      </div>
      {error && <div ref={notice} tabIndex={-1} className="course-error" role="alert">{t(error)}
        {stale && <Button variant="secondary" onClick={onReload}>{t('reload')}</Button>}
      </div>}
      <SectionTabs label={t('tabs')} value={tab} onValueChange={setTab} dir={i18n.dir()} items={[
        { value: 'details', label: t('details'), content: <DetailsFields draft={draft} taxonomy={data.taxonomy}
          courseId={record?.id} disabled={blocked || !editable} change={change} /> },
        { value: 'curriculum', label: t('curriculum'), content: <CurriculumFields chapters={draft.chapters} languages={data.taxonomy.languages}
          locale={draft.translations[0]?.locale ?? locale} disabled={blocked || !editable} change={chapters => change('chapters', chapters)} /> },
        ...(record ? [{ value: 'publication', label: t('publication'), content: <Publication record={record}
          canPublish={data.canPublish} blocked={blocked} dirty={dirty} onStatus={status => { void moveStatus(status); }} remove={() => { void remove(); }} /> }] : []),
      ]} />
    </form>
  </>;
}

export function CourseEditor({ id }: { id?: string }) {
  const { t } = useTranslation('courseAdmin');
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal): Promise<EditorData> => {
    const [record, taxonomy, identity] = await Promise.all([
      id ? getCourse(id, signal) : Promise.resolve(undefined), loadTaxonomy(signal), readIdentity(signal),
    ]);
    const permissions = identity?.permissions ?? [];
    return { record, taxonomy, canManage: permissions.includes('course:manage'), canPublish: permissions.includes('course:publish') };
  }, [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'ready' && result.data.canManage) return <RecordEditor data={result.data} onReload={reload} />;
  const message = result.status === 'error' ? courseError(result.error) : 'noAccess';
  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={courseAdminPath + search}><ArrowLeft className="ui-direction" size={18} aria-hidden="true" />{t('back')}</Link></Button>
    <h1>{id ? t('edit') : t('new')}</h1>
    {result.status === 'loading' ? <StatePanel kind="loading" title={t('loadingEditor')} /> : <StatePanel kind="error" title={t(message)}>
      {message !== 'noAccess' && message !== 'sessionExpired' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
    </StatePanel>}
  </>;
}
