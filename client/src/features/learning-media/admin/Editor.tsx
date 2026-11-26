import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, DialogClose, InputField, PanelDialog, SectionTabs, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { readIdentity } from '../../auth/api';
import { TextArea, TranslationFields } from '../../courses/admin/EditorFields';
import { preferredTitle } from '../../courses/admin/api';
import { canDelete, canEdit, preferredName, statusTransitions, type EducationRecord, type Status } from '../../education/api';
import { EducationStatus } from '../../education/EducationList';
import { useEducationData } from '../../education/useEducationData';
import {
  changeEntryStatus, deleteEntry, entryError, entryPath, learningMediaAdminPath, learningMediaKinds, learningMediaOrigins,
  loadEntry, publicTaxonomy, saveEntry, type LearningMediaInput, type LearningMediaKind, type LearningMediaRecord, type MediaTranslation,
} from './api';
import { CurriculumChoice, MainFile } from './Picker';
import { learningMediaAdminNamespace as ns } from './strings';

const blankTranslation = (locale: string): MediaTranslation => ({ locale, title: '', description: '' });

function draftFrom(locale: string, entry?: LearningMediaRecord): LearningMediaInput {
  if (!entry) return { slug: '', kind: 'video', mediaId: null, categoryId: null, relatedCourseId: null, relatedLessonId: null,
    aiOrigin: 'human', aiTool: '', aiNotes: '', translations: [blankTranslation(locale)] };
  const { slug, kind, mediaId, categoryId, relatedCourseId, relatedLessonId, aiOrigin, aiTool, aiNotes, translations } = entry;
  return { slug, kind, mediaId, categoryId, relatedCourseId, relatedLessonId, aiOrigin, aiTool, aiNotes, translations };
}

const transitionLabels: Record<Status, string> = {
  draft: 'returnDraft', 'educational-review': 'review', 'translation-review': 'translate',
  approved: 'approve', published: 'publish', archived: 'archive',
};

function Confirm({ label, title, description, onConfirm, disabled, children, canConfirm = true, destructive = false }: {
  label: string; title: string; description: string; onConfirm: () => void; disabled: boolean; children?: ReactNode;
  canConfirm?: boolean; destructive?: boolean;
}) {
  const { t } = useTranslation(ns);
  return <PanelDialog title={title} description={description} closeLabel={t('close')}
    trigger={<Button variant={destructive ? 'ghost' : 'secondary'} className={destructive ? 'course-remove' : undefined} disabled={disabled}>
      {label}
    </Button>}>
    {children}
    <div className="admin-dialog-actions">
      <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button disabled={!canConfirm} onClick={onConfirm}>{label}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

function Review({ entry, canPublish, busy, dirty, onStatus, onDelete }: {
  entry: LearningMediaRecord; canPublish: boolean; busy: boolean; dirty: boolean;
  onStatus: (status: Status, note?: string) => void; onDelete: () => void;
}) {
  const { t, i18n } = useTranslation(ns);
  const [note, setNote] = useState('');
  const lock = busy || dirty;
  const requiresPublisher = (status: Status) => status === 'approved' || status === 'published' || status === 'archived';
  const transitions = statusTransitions[entry.status];

  return <Card className="course-publication">
    <h2>{t('publication')}</h2><EducationStatus status={entry.status} />
    {dirty && <p className="course-note">{t('saveBeforeStatus')}</p>}
    {!canPublish && transitions.some(requiresPublisher) && <p className="course-note">{t('restricted')}</p>}
    {entry.reviewedAt && <dl className="learning-media-asset-facts">
      <div><dt>{t('reviewedAt')}</dt><dd><time dateTime={entry.reviewedAt}>
        {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.reviewedAt))}
      </time></dd></div>
      {entry.reviewNote && <div><dt>{t('reviewNote')}</dt><dd className="learning-media-review-note" dir="auto">{entry.reviewNote}</dd></div>}
    </dl>}
    <div className="course-row-footer">
      {transitions.filter(status => canPublish || !requiresPublisher(status)).map(status => {
        const label = t(transitionLabels[status]);
        if (status === 'approved') return <Confirm key={status} label={label} title={t('approveTitle')} description={t('reviewHelp')}
          canConfirm={Boolean(note.trim())} disabled={lock} onConfirm={() => onStatus('approved', note.trim())}>
          <div className="learning-media-review"><TextArea label={t('reviewNote')} value={note} onChange={setNote}
            maxLength={1200} locale={i18n.language} direction={i18n.dir()} /></div>
        </Confirm>;
        if (status === 'published' || status === 'archived') {
          const action = status === 'published' ? 'publish' : 'archive';
          return <Confirm key={status} label={label} title={t(action + 'Title')} description={t(action + 'Description')}
            onConfirm={() => onStatus(status)} disabled={lock} />;
        }
        return <Button key={status} variant="secondary" disabled={lock} onClick={() => onStatus(status)}>{label}</Button>;
      })}
      {entry.status === 'published' && <Button variant="ghost" asChild><Link to={entryPath(entry)}>
        <ExternalLink size={16} aria-hidden="true" />{t('viewPublic')}
      </Link></Button>}
    </div>
    {canDelete(entry.status) && <div className="course-publication-delete">
      <Confirm label={t('delete')} title={t('deleteTitle')} description={t('deleteDescription')} onConfirm={onDelete} disabled={lock} destructive />
    </div>}
  </Card>;
}

interface Choices { languages: EducationRecord[]; categories: EducationRecord[] }
interface EditorData extends Choices { entry?: LearningMediaRecord; canPublish: boolean; canManageMedia: boolean }

function RecordEditor({ data, reload }: { data: EditorData; reload: () => void }) {
  const { t, i18n } = useTranslation(ns);
  const location = useLocation();
  const navigate = useNavigate();
  const back = learningMediaAdminPath + location.search;
  const initial = data.languages.find(entry => entry.locale === i18n.language)?.locale ?? data.languages[0]?.locale ?? 'en';
  const [entry, setEntry] = useState(data.entry);
  const [draft, setDraft] = useState(() => draftFrom(initial, data.entry));
  const [courseSlug, setCourseSlug] = useState(data.entry?.relatedCourseSlug);
  const [tab, setTab] = useState('details');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'status' | 'delete'>();
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(location.state?.message === 'created' ? 'created' : '');
  const alert = useRef<HTMLDivElement>(null);
  const stale = error === 'stale';
  const editable = !entry || canEdit(entry.status);
  const disabled = !editable || Boolean(busy) || stale;
  const title = entry && preferredTitle(entry.translations, i18n.language);

  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);

  function change(patch: Partial<LearningMediaInput>) {
    setDraft(current => ({ ...current, ...patch }));
    setDirty(true);
    setFeedback('');
    if (!stale) setError('');
  }

  function chooseKind(kind: LearningMediaKind) {
    const changesResource = (kind === 'resource') !== (draft.kind === 'resource');
    change({ kind, mediaId: changesResource ? null : draft.mediaId,
      aiOrigin: kind === 'resource' && draft.aiOrigin === 'human' ? 'ai-generated' : draft.aiOrigin });
  }

  function apply(next: LearningMediaRecord, message: string) {
    setEntry(next);
    setDraft(draftFrom(initial, next));
    setCourseSlug(next.relatedCourseSlug);
    setDirty(false);
    setFeedback(message);
  }

  function invalid(message: string, section: string) {
    setTab(section);
    if (error === message) alert.current?.focus();
    setError(message);
    setFeedback('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const slug = draft.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return invalid('invalid', 'details');
    if (draft.translations.some(translation => !translation.title.trim())) return invalid('needTranslation', 'translations');
    if (draft.aiOrigin !== 'human' && (!draft.aiTool.trim() || !draft.aiNotes.trim())) return invalid('needAI', 'details');
    const input = draft.aiOrigin === 'human' ? { ...draft, slug, aiTool: '', aiNotes: '' } : { ...draft, slug };
    setBusy('save');
    setError('');
    setFeedback('');
    try {
      const saved = await saveEntry(input, entry);
      if (!entry) {
        setDirty(false);
        void navigate(learningMediaAdminPath + '/' + saved.id + location.search, { replace: true, state: { message: 'created' } });
      } else {
        apply(saved, 'saved');
      }
    } catch (failure) {
      setError(entryError(failure));
    } finally {
      setBusy(undefined);
    }
  }

  async function move(status: Status, note?: string) {
    if (!entry || dirty || busy || stale) return;
    if (status === 'educational-review' && (!entry.mediaId || (entry.kind !== 'resource' && !entry.categoryId))) return invalid('incomplete', 'details');
    setBusy('status');
    setError('');
    setFeedback('');
    try {
      apply(await changeEntryStatus(entry, status, note), 'statusSaved');
    } catch (failure) {
      const message = entryError(failure);
      if (message === 'missingImageAlt') setTab('translations');
      setError(status === 'published' && message === 'needReview' ? 'needFreshReview' : message);
    } finally {
      setBusy(undefined);
    }
  }

  async function remove() {
    if (!entry || dirty || busy || stale) return;
    setBusy('delete');
    setError('');
    try {
      await deleteEntry(entry);
      void navigate(back, { replace: true, state: { message: 'deleted' } });
    } catch (failure) {
      setError(entryError(failure));
    } finally {
      setBusy(undefined);
    }
  }

  const details = <div className="course-editor-grid">
    <fieldset className="course-form-card" disabled={disabled}>
      <legend>{t('details')}</legend>
      <InputField label={t('slug')} value={draft.slug} dir="ltr" maxLength={80} spellCheck={false} autoComplete="off" aria-required
        onChange={event => change({ slug: event.target.value })} />
      <small>{t('slugHint')}</small>
      <SelectField label={t('type')} value={draft.kind} onChange={event => chooseKind(event.target.value as LearningMediaKind)}>
        {learningMediaKinds.map(kind => <option value={kind} key={kind}>{t(kind)}</option>)}
      </SelectField>
      {draft.kind !== 'video' && <small>{t(draft.kind === 'short' ? 'shortHint' : 'resourceHint')}</small>}
      <SelectField label={t('category')} value={draft.categoryId ?? ''} onChange={event => change({ categoryId: event.target.value || null })}>
        <option value="">{t('noCategory')}</option>
        {draft.categoryId && !data.categories.some(item => item.id === draft.categoryId) && <option value={draft.categoryId}>{t('unavailable')}</option>}
        {data.categories.map(item => {
          const label = preferredName(item, i18n.language);
          return <option key={item.id} value={item.id} lang={label?.locale}>{label?.name ?? item.slug}</option>;
        })}
      </SelectField>
      <CurriculumChoice courseId={draft.relatedCourseId} slug={courseSlug} lessonId={draft.relatedLessonId}
        editable={!disabled} chooseCourse={course => {
          setCourseSlug(course?.slug);
          change({ relatedCourseId: course?.id ?? null, relatedLessonId: null });
        }} chooseLesson={id => change({ relatedLessonId: id })} />
      <SelectField label={t('origin')} value={draft.aiOrigin} onChange={event => change({ aiOrigin: event.target.value as LearningMediaInput['aiOrigin'] })}>
        {learningMediaOrigins.filter(origin => draft.kind !== 'resource' || origin !== 'human')
          .map(origin => <option value={origin} key={origin}>{t(origin)}</option>)}
      </SelectField>
      {draft.aiOrigin !== 'human' && <>
        <InputField label={t('aiTool')} value={draft.aiTool} maxLength={100} dir="auto" aria-required
          onChange={event => change({ aiTool: event.target.value })} />
        <TextArea label={t('aiNotes')} value={draft.aiNotes} maxLength={700} locale={i18n.language} direction={i18n.dir()}
          onChange={aiNotes => change({ aiNotes })} />
        <small>{t('aiHint')}</small>
      </>}
    </fieldset>
    <section className="course-form-card learning-media-file-panel" aria-label={t('media')}>
      <MainFile kind={draft.kind} id={draft.mediaId} editable={!disabled} canManageMedia={data.canManageMedia}
        change={mediaId => change({ mediaId })} />
    </section>
  </div>;
  const translationChoices = draft.translations.length >= 6
    ? data.languages.filter(language => draft.translations.some(translation => translation.locale === language.locale))
    : data.languages;
  const translations = <fieldset className="course-form-card" disabled={disabled}>
    <legend>{t('translations')}</legend>
    <p className="course-note">{t('chooseTranslation')}</p>
    <TranslationFields records={translationChoices} values={draft.translations} onChange={translations => change({ translations })} blank={blankTranslation}
      titleLabel={t('titleField')} disabled={disabled} render={(translation, direction, patch) => <>
        <TextArea label={t('description')} locale={translation.locale} direction={direction} maxLength={1000}
          value={translation.description} onChange={description => patch({ description })} />
        {draft.kind === 'resource' && <TextArea label={t('imageAlt')} locale={translation.locale} direction={direction} maxLength={500}
          value={translation.imageAlt ?? ''} onChange={imageAlt => patch({ imageAlt })} />}
      </>} />
  </fieldset>;

  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={back} onClick={event => {
      if (dirty && !window.confirm(t('discard'))) event.preventDefault();
    }}><ArrowLeft className="ui-direction" size={18} aria-hidden="true" />{t('back')}</Link></Button>
    <div className="admin-section-heading course-heading"><div><h1>{t(entry ? 'edit' : 'create')}</h1>
      {entry && <div className="course-record-heading"><bdi lang={title?.locale}>{title?.title ?? entry.slug}</bdi>
        <EducationStatus status={entry.status} /></div>}
    </div></div>
    <form className="course-builder learning-media-editor" onSubmit={save} noValidate aria-busy={Boolean(busy)}>
      <div className="course-builder-actions">
        {editable ? <Button type="submit" disabled={disabled}><Save size={17} aria-hidden="true" />{t(busy === 'save' ? 'saving' : 'save')}</Button>
          : <p className="course-note">{t('locked')}</p>}
        <span role="status" aria-live="polite">{feedback && t(feedback)}</span>
      </div>
      {error && <div ref={alert} tabIndex={-1} className="course-error" role="alert">{t(error)}
        {stale && <Button variant="secondary" onClick={reload}>{t('reload')}</Button>}
      </div>}
      <SectionTabs label={t('sections')} value={tab} onValueChange={setTab} dir={i18n.dir()} items={[
        { value: 'details', label: t('details'), content: details },
        { value: 'translations', label: t('translations'), content: translations },
        ...(entry ? [{ value: 'publication', label: t('publication'), content: <Review entry={entry} canPublish={data.canPublish} dirty={dirty}
          busy={Boolean(busy) || stale} onStatus={(status, note) => { void move(status, note); }} onDelete={() => { void remove(); }} /> }] : []),
      ]} />
    </form>
  </>;
}

export function LearningMediaEditor({ id }: { id?: string }) {
  const { t } = useTranslation(ns);
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal): Promise<EditorData | null> => {
    const identity = await readIdentity(signal);
    if (!identity?.permissions.includes('learning-media:manage')) return null;
    const [entry, languages, categories] = await Promise.all([
      id ? loadEntry(id, signal) : Promise.resolve(undefined), publicTaxonomy('languages', signal), publicTaxonomy('categories', signal),
    ]);
    return { entry, languages, categories, canPublish: identity.permissions.includes('learning-media:publish'),
      canManageMedia: identity.permissions.includes('media:manage') };
  }, [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'ready' && result.data) return <RecordEditor data={result.data} reload={reload} />;
  const error = result.status === 'error' ? entryError(result.error) : 'noAccess';
  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={learningMediaAdminPath + search}>
      <ArrowLeft className="ui-direction" size={18} aria-hidden="true" />{t('back')}
    </Link></Button>
    <h1>{t(id ? 'edit' : 'create')}</h1>
    {result.status === 'loading' ? <StatePanel kind="loading" title={t('editorLoading')} />
      : <StatePanel kind="error" title={t(error)}>
        {error !== 'noAccess' && error !== 'sessionEnded' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
      </StatePanel>}
  </>;
}
