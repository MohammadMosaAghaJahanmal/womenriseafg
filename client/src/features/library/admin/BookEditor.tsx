import { ArrowLeft, ExternalLink, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, DialogClose, InputField, PanelDialog, SectionTabs, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { readIdentity } from '../../auth/api';
import { preferredTitle } from '../../courses/admin/api';
import { contentLanguageName, TextArea, TranslationFields } from '../../courses/admin/EditorFields';
import { canDelete, canEdit, preferredName, statusTransitions, type EducationRecord, type Status } from '../../education/api';
import { EducationStatus } from '../../education/EducationList';
import { useEducationData } from '../../education/useEducationData';
import { BookFileField } from './BookFiles';
import {
  bookAdminPath, bookError, bookManagePermission, bookPublishPermission, bookTaxonomy,
  changeBookStatus, deleteBook, readBook, saveBook, type BookInput, type BookRecord, type BookTranslation,
} from './api';
import { bookAdminNamespace as ns } from './strings';

const transitionLabels = {
  draft: 'returnDraft', 'educational-review': 'review', 'translation-review': 'translate',
  approved: 'approve', published: 'publish', archived: 'archive',
} as const;

const blankTranslation = (locale: string): BookTranslation => ({ locale, title: '', description: '' });
type BookDraft = Omit<BookInput, 'publicationYear'> & { publicationYear: string };
function draftFrom(locale: string, entry?: BookRecord): BookDraft {
  if (!entry) return {
    slug: '', pdfId: null, coverId: null, categoryId: null, levelId: null, gradeId: null, contentLanguage: null,
    author: '', publisher: '', publicationYear: '', edition: '', translations: [blankTranslation(locale)],
  };
  const { slug, pdfId, coverId, categoryId, levelId, gradeId, contentLanguage,
    author, publisher, publicationYear, edition, translations } = entry;
  return { slug, pdfId, coverId, categoryId, levelId, gradeId, contentLanguage, author, publisher,
    publicationYear: publicationYear?.toString() ?? '', edition, translations };
}

function Confirm({ label, title, description, disabled, onConfirm, mayConfirm = true, children, destructive }: {
  label: string; title: string; description: string; disabled: boolean; onConfirm: () => void;
  mayConfirm?: boolean; children?: ReactNode; destructive?: boolean;
}) {
  const { t } = useTranslation(ns);
  return <PanelDialog title={title} description={description} closeLabel={t('close')}
    trigger={<Button variant={destructive ? 'ghost' : 'secondary'} disabled={disabled}>{label}</Button>}>
    {children}
    <div className="admin-dialog-actions">
      <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button disabled={!mayConfirm} onClick={onConfirm}>{label}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

function BookReview({ entry, canPublish, busy, dirty, onStatus, onDelete }: {
  entry: BookRecord; canPublish: boolean; busy: boolean; dirty: boolean;
  onStatus: (status: Status, note?: string) => void; onDelete: () => void;
}) {
  const { t, i18n } = useTranslation(ns);
  const [note, setNote] = useState('');
  const transitions = statusTransitions[entry.status];
  const requiresPublish = (status: Status) => status === 'approved' || status === 'published' || status === 'archived';
  const locked = busy || dirty;
  return <Card className="course-publication">
    <h2>{t('publication')}</h2><EducationStatus status={entry.status} />
    {dirty && <p className="course-note">{t('saveBeforeStatus')}</p>}
    {!canPublish && transitions.some(requiresPublish) && <p className="course-note">{t('restricted')}</p>}
    {entry.reviewedAt && <dl className="book-admin-facts">
      <div><dt>{t('reviewedAt')}</dt><dd><time dateTime={entry.reviewedAt}>
        {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.reviewedAt))}
      </time></dd></div>
      {entry.reviewNote && <div><dt>{t('reviewNote')}</dt><dd dir="auto">{entry.reviewNote}</dd></div>}
    </dl>}
    <div className="course-row-footer">
      {transitions.filter(status => canPublish || !requiresPublish(status)).map(status => {
        const label = t(transitionLabels[status]);
        if (status === 'approved') return <Confirm key={status} label={label} title={t('approveTitle')} description={t('reviewHelp')}
          disabled={locked} mayConfirm={Boolean(note.trim())} onConfirm={() => onStatus(status, note.trim())}>
          <TextArea label={t('reviewNote')} value={note} onChange={setNote}
            locale={i18n.language} direction={i18n.dir()} maxLength={1200} />
        </Confirm>;
        if (status === 'published' || status === 'archived') {
          const action = status === 'published' ? 'publish' : 'archive';
          return <Confirm key={status} label={label} title={t(action + 'Title')} description={t(action + 'Description')}
            disabled={locked} onConfirm={() => onStatus(status)} />;
        }
        return <Button key={status} variant="secondary" disabled={locked} onClick={() => onStatus(status)}>{label}</Button>;
      })}
      {entry.status === 'published' && <Button variant="ghost" asChild><Link to={'/library/' + entry.slug}>
        <ExternalLink size={16} aria-hidden="true" />{t('publicPage')}
      </Link></Button>}
    </div>
    {canDelete(entry.status) && <div className="course-publication-delete"><Confirm label={t('delete')}
      title={t('deleteTitle')} description={t('deleteDescription')} onConfirm={onDelete} disabled={locked} destructive />
    </div>}
  </Card>;
}

function TaxonomyField({ label, items, value, change }: {
  label: string; items: EducationRecord[]; value: string | null; change: (id: string | null) => void;
}) {
  const { t, i18n } = useTranslation(ns);
  return <SelectField label={label} value={value ?? ''} onChange={event => change(event.target.value || null)}>
    <option value="">{t('none')}</option>
    {value && !items.some(item => item.id === value) && <option value={value}>{t('unavailable')}</option>}
    {items.map(item => {
      const name = preferredName(item, i18n.language);
      return <option key={item.id} value={item.id} lang={name?.locale}>{name?.name ?? item.slug}</option>;
    })}
  </SelectField>;
}

interface EditorData {
  entry?: BookRecord;
  languages: EducationRecord[];
  categories: EducationRecord[];
  levels: EducationRecord[];
  grades: EducationRecord[];
  canPublish: boolean;
  canManageMedia: boolean;
}

function BookForm({ data, reload }: { data: EditorData; reload: () => void }) {
  const { t, i18n } = useTranslation(ns);
  const navigate = useNavigate();
  const { search, state } = useLocation();
  const back = bookAdminPath + search;
  const locale = data.languages.find(entry => entry.locale === i18n.language)?.locale ??
    data.languages.find(entry => entry.locale === 'en')?.locale ?? data.languages[0]?.locale ?? 'en';
  const [entry, setEntry] = useState(data.entry);
  const [draft, setDraft] = useState(() => draftFrom(locale, data.entry));
  const [section, setSection] = useState('details');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'status' | 'delete'>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(state?.message === 'created' ? 'created' : '');
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

  function change(patch: Partial<BookDraft>) {
    setDraft(current => ({ ...current, ...patch }));
    setDirty(true);
    setNotice('');
    if (!stale) setError('');
  }

  function apply(next: BookRecord, message: string) {
    setEntry(next);
    setDraft(draftFrom(locale, next));
    setDirty(false);
    setNotice(message);
  }

  function invalid(message: string, tab: string) {
    setSection(tab);
    setNotice('');
    if (error === message) alert.current?.focus();
    setError(message);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const slug = draft.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return invalid('invalid', 'details');
    if (draft.translations.some(translation => !translation.title.trim())) return invalid('needTranslation', 'translations');
    const publicationYear = draft.publicationYear.trim() ? Number(draft.publicationYear) : null;
    if (publicationYear !== null && (!Number.isInteger(publicationYear) || publicationYear < 1 || publicationYear > 9999)) {
      return invalid('yearInvalid', 'details');
    }
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const saved = await saveBook({ ...draft, slug, publicationYear }, entry);
      if (entry) apply(saved, 'saved');
      else {
        setDirty(false);
        void navigate(bookAdminPath + '/' + saved.id + search, { replace: true, state: { message: 'created' } });
      }
    } catch (failure) {
      setError(bookError(failure));
    } finally {
      setBusy(undefined);
    }
  }

  async function move(status: Status, note?: string) {
    if (!entry || dirty || busy || stale) return;
    setBusy('status');
    setNotice('');
    setError('');
    try {
      apply(await changeBookStatus(entry, status, note), 'statusSaved');
    } catch (failure) {
      const message = bookError(failure);
      setError(status === 'published' && message === 'needReview' ? 'needFreshReview' : message);
    } finally {
      setBusy(undefined);
    }
  }

  async function remove() {
    if (!entry || dirty || busy || stale) return;
    setBusy('delete');
    setNotice('');
    setError('');
    try {
      await deleteBook(entry);
      void navigate(back, { replace: true, state: { message: 'deleted' } });
    } catch (failure) {
      setError(bookError(failure));
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
      <InputField label={t('author')} value={draft.author} dir="auto" maxLength={150}
        onChange={event => change({ author: event.target.value })} />
      <div className="book-admin-fields">
        <InputField label={t('publisher')} value={draft.publisher} dir="auto" maxLength={150}
          onChange={event => change({ publisher: event.target.value })} />
        <InputField label={t('year')} type="number" inputMode="numeric" min={1} max={9999} value={draft.publicationYear} dir="ltr"
          onChange={event => change({ publicationYear: event.target.value })} />
      </div>
      <InputField label={t('edition')} value={draft.edition} dir="auto" maxLength={100}
        onChange={event => change({ edition: event.target.value })} />
      <SelectField label={t('language')} value={draft.contentLanguage ?? ''}
        onChange={event => change({ contentLanguage: event.target.value || null })}>
        <option value="">{t('chooseLanguage')}</option>
        {draft.contentLanguage && !data.languages.some(item => item.locale === draft.contentLanguage) &&
          <option value={draft.contentLanguage}>{t('unavailable')}</option>}
        {data.languages.flatMap(item => item.locale ? [<option key={item.id} value={item.locale} lang={item.locale}>
          {contentLanguageName(item.locale, i18n.language)}
        </option>] : [])}
      </SelectField>
      <TaxonomyField label={t('category')} items={data.categories} value={draft.categoryId} change={categoryId => change({ categoryId })} />
      <div className="book-admin-fields">
        <TaxonomyField label={t('level')} items={data.levels} value={draft.levelId} change={levelId => change({ levelId })} />
        <TaxonomyField label={t('grade')} items={data.grades} value={draft.gradeId} change={gradeId => change({ gradeId })} />
      </div>
    </fieldset>
    <div className="course-form-card book-files">
      <BookFileField id={draft.pdfId} kind="pdf" editable={!disabled} canManageMedia={data.canManageMedia} change={pdfId => change({ pdfId })} />
      <BookFileField id={draft.coverId} kind="image" editable={!disabled} canManageMedia={data.canManageMedia} change={coverId => change({ coverId })} />
    </div>
  </div>;
  const translationLanguages = draft.translations.length >= 6
    ? data.languages.filter(language => draft.translations.some(translation => translation.locale === language.locale))
    : data.languages;
  const translations = <fieldset className="course-form-card" disabled={disabled}>
    <legend>{t('translations')}</legend>
    <p className="course-note">{t('translationHint')}</p>
    <TranslationFields records={translationLanguages} values={draft.translations} onChange={translations => change({ translations })}
      blank={blankTranslation} titleLabel={t('titleField')} disabled={disabled} render={(translation, direction, patch) =>
        <TextArea label={t('description')} locale={translation.locale} direction={direction} maxLength={1000}
          value={translation.description} onChange={description => patch({ description })} />} />
  </fieldset>;

  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={back} onClick={event => {
      if (dirty && !window.confirm(t('discard'))) event.preventDefault();
    }}><ArrowLeft className="ui-direction" size={18} aria-hidden="true" />{t('back')}</Link></Button>
    <div className="admin-section-heading course-heading"><div><h1>{t(entry ? 'edit' : 'create')}</h1>
      {entry && <div className="course-record-heading"><bdi lang={title?.locale}>{title?.title ?? entry.slug}</bdi>
        <EducationStatus status={entry.status} /></div>}
    </div></div>
    <form className="course-builder book-editor" noValidate aria-busy={Boolean(busy)} onSubmit={handleSave}>
      <div className="course-builder-actions">
        {editable ? <Button type="submit" disabled={disabled}><Save size={17} aria-hidden="true" />{t(busy === 'save' ? 'saving' : 'save')}</Button>
          : <p className="course-note">{t('locked')}</p>}
        <span role="status" aria-live="polite">{notice && t(notice)}</span>
      </div>
      {error && <div ref={alert} tabIndex={-1} className="course-error" role="alert">{t(error)}
        {stale && <Button variant="secondary" onClick={reload}>{t('reload')}</Button>}
      </div>}
      <SectionTabs label={t('sections')} value={section} onValueChange={setSection} dir={i18n.dir()} items={[
        { value: 'details', label: t('details'), content: details },
        { value: 'translations', label: t('translations'), content: translations },
        ...(entry ? [{ value: 'publication', label: t('publication'), content: <BookReview entry={entry} canPublish={data.canPublish}
          busy={Boolean(busy) || stale} dirty={dirty} onStatus={(status, note) => { void move(status, note); }}
          onDelete={() => { void remove(); }} /> }] : []),
      ]} />
    </form>
  </>;
}

export function BookEditor({ id }: { id?: string }) {
  const { t } = useTranslation(ns);
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal): Promise<EditorData | null> => {
    const identity = await readIdentity(signal);
    if (!identity?.permissions.includes(bookManagePermission)) return null;
    const [entry, languages, categories, levels, grades] = await Promise.all([
      id ? readBook(id, signal) : Promise.resolve(undefined), bookTaxonomy('languages', signal), bookTaxonomy('categories', signal),
      bookTaxonomy('levels', signal), bookTaxonomy('grades', signal),
    ]);
    return { entry, languages, categories, levels, grades, canPublish: identity.permissions.includes(bookPublishPermission),
      canManageMedia: identity.permissions.includes('media:manage') };
  }, [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'ready' && result.data) return <BookForm data={result.data} reload={reload} />;
  const error = result.status === 'error' ? bookError(result.error) : 'noAccess';
  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={bookAdminPath + search}>
      <ArrowLeft className="ui-direction" size={18} aria-hidden="true" />{t('back')}</Link></Button>
    <h1>{t(id ? 'edit' : 'create')}</h1>
    {result.status === 'loading' ? <StatePanel kind="loading" title={t('editorLoading')} />
      : <StatePanel kind="error" title={t(error)}>
        {error !== 'noAccess' && error !== 'sessionEnded' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
      </StatePanel>}
  </>;
}
