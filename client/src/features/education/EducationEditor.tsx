import { useCallback, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, DialogClose, InputField, PanelDialog, SelectField, StatePanel } from '../../components/ui/Primitives';
import { readIdentity } from '../auth/api';
import {
  canDelete, canEdit, deleteEducation, educationError, educationPath, getEducation, loadChoices, localeName, preferredName,
  saveEducation, setEducationStatus, statusTransitions, type EducationInput, type EducationRecord, type Kind, type Status, type Translation,
} from './api';
import { EducationHeading, EducationNavigation } from './EducationIndex';
import { EducationStatus } from './EducationList';
import { useEducationData } from './useEducationData';

interface EditorData {
  record?: EducationRecord;
  languages: EducationRecord[];
  categories: EducationRecord[];
  canPublish: boolean;
}
interface Draft {
  slug: string;
  categoryId: string;
  gradeNumber: string;
  locale: string;
  direction: 'ltr' | 'rtl';
  translations: Translation[];
}

function toDraft(record: EducationRecord | undefined, defaultLocale: string | undefined): Draft {
  return {
    slug: record?.slug ?? '',
    categoryId: record?.categoryId ?? '',
    gradeNumber: record?.gradeNumber?.toString() ?? '',
    locale: record?.locale ?? '',
    direction: record?.direction ?? 'ltr',
    translations: record?.translations ?? (defaultLocale ? [{ locale: defaultLocale, name: '', description: '' }] : []),
  };
}

function prepareInput(kind: Kind, fields: Draft): { input: EducationInput } | { error: string } {
  const slug = fields.slug.trim();
  if (slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { error: 'invalidSlug' };
  if (!fields.translations.length || fields.translations.some(item => !item.name.trim())) return { error: 'invalidTranslation' };
  if (fields.translations.some(item => item.name.trim().length > 120 || item.description.trim().length > 1200)) return { error: 'invalidLength' };
  const input: EducationInput = {
    slug,
    translations: fields.translations.map(item => ({ ...item, name: item.name.trim(), description: item.description.trim() })),
  };
  if (kind === 'subjects') input.categoryId = fields.categoryId || null;
  if (kind === 'grades') {
    const grade = Number(fields.gradeNumber);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) return { error: 'invalidGrade' };
    input.gradeNumber = grade;
  }
  if (kind === 'languages') {
    try {
      input.locale = new Intl.Locale(fields.locale.trim()).toString();
      if (input.locale.length > 35) return { error: 'invalidLocale' };
      input.direction = fields.direction;
    } catch { return { error: 'invalidLocale' }; }
  }
  return { input };
}

function RecordEditor({ kind, data }: { kind: Kind; data: EditorData }) {
  const { t, i18n } = useTranslation('education');
  const navigate = useNavigate();
  const { search } = useLocation();
  const { languages, categories, canPublish } = data;
  const defaultLocale = languages.find(language => language.status !== 'archived' && language.locale === i18n.language)?.locale ??
    languages.find(language => language.status !== 'archived' && language.locale === 'en')?.locale ??
    languages.find(language => language.status !== 'archived')?.locale;
  const [record, setRecord] = useState(data.record);
  const [draft, setDraft] = useState(() => toDraft(data.record, defaultLocale));
  const [dirty, setDirty] = useState(false);
  const [newLocale, setNewLocale] = useState('');
  const [nextStatus, setNextStatus] = useState<Status | ''>('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<'save' | 'status' | 'delete'>();
  const [error, setError] = useState<{ area: 'form' | 'status' | 'delete'; message: string }>();
  const [success, setSuccess] = useState('');
  const fieldId = useId();
  const numeric = new Intl.NumberFormat(i18n.language);
  const back = educationPath(kind) + search;
  const editable = !record || canEdit(record.status);
  const availableTranslations = languages.filter(language => language.locale && language.status !== 'archived' &&
    !draft.translations.some(translation => translation.locale === language.locale));
  const currentName = record && (preferredName(record, i18n.language)?.name ?? record.slug);

  function change<T extends keyof Draft>(key: T, value: Draft[T]) {
    setDraft(current => ({ ...current, [key]: value }));
    setDirty(true);
    setSuccess('');
    if (error?.area === 'form') setError(undefined);
  }

  function addTranslation() {
    if (!newLocale || draft.translations.length >= 32) return;
    change('translations', [...draft.translations, { locale: newLocale, name: '', description: '' }]);
    setNewLocale('');
  }

  function updateTranslation(locale: string, key: 'name' | 'description', value: string) {
    change('translations', draft.translations.map(item => item.locale === locale ? { ...item, [key]: value } : item));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editable) return;
    const prepared = prepareInput(kind, draft);
    setSuccess('');
    if ('error' in prepared) {
      setError({ area: 'form', message: prepared.error });
      return;
    }
    setBusy('save');
    setError(undefined);
    try {
      const saved = await saveEducation(kind, prepared.input, record);
      setRecord(saved);
      setDraft(toDraft(saved, defaultLocale));
      setDirty(false);
      setSuccess(record ? 'refreshed' : 'created');
      if (!record) {
        void navigate(`${educationPath(kind)}/${saved.id}/edit${search}`, { replace: true, state: { message: 'created' } });
      }
    } catch (failure) {
      setError({ area: 'form', message: educationError(failure, 'saveFailed') });
    } finally {
      setBusy(undefined);
    }
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || !nextStatus || busy || dirty) return;
    setBusy('status');
    setError(undefined);
    setSuccess('');
    try {
      const changed = await setEducationStatus(kind, record, nextStatus);
      setRecord(changed);
      setDraft(toDraft(changed, defaultLocale));
      setNextStatus('');
      setSuccess('statusSaved');
    } catch (failure) {
      setError({ area: 'status', message: educationError(failure, 'saveFailed') });
    } finally {
      setBusy(undefined);
    }
  }

  async function remove() {
    if (!record || busy || !canDelete(record.status)) return;
    setBusy('delete');
    setError(undefined);
    try {
      await deleteEducation(kind, record);
      void navigate(back, { replace: true, state: { message: 'removed' } });
    } catch (failure) {
      setError({ area: 'delete', message: educationError(failure, 'deleteFailed') });
    } finally {
      setBusy(undefined);
    }
  }

  const { state } = useLocation();
  const message = success || ((state as { message?: string } | null)?.message === 'created' && !dirty && !error ? 'created' : '');
  const transitions = record ? statusTransitions[record.status] : [];
  return <div className="education-editor">
    {message && <p role="status" className="education-success">{t(message)}</p>}
    <Card className="education-edit-card">
      <h2>{t('details')}</h2>
      {!editable && <p className="education-note">{t('editLocked')}</p>}
      <form onSubmit={save} noValidate aria-busy={busy === 'save'}>
        <fieldset className="education-fields" disabled={Boolean(busy) || !editable}>
          <InputField label={t('slug')} required maxLength={80} dir="ltr" value={draft.slug} spellCheck={false}
            onChange={event => change('slug', event.target.value)} aria-describedby={fieldId + '-slug'} />
          <p className="education-note" id={fieldId + '-slug'}>{t('slugHint')}</p>
          {kind === 'subjects' && <SelectField label={t('category')} value={draft.categoryId} onChange={event => change('categoryId', event.target.value)}>
            <option value="">{t('noCategory')}</option>
            {categories.filter(category => category.status !== 'archived' || category.id === draft.categoryId).map(category => {
              const label = preferredName(category, i18n.language);
              const source = label && label.locale !== i18n.language ? ' — ' + localeName(label.locale, i18n.language) : '';
              return <option value={category.id} key={category.id}>{(label?.name ?? category.slug) + source}</option>;
            })}
          </SelectField>}
          {kind === 'grades' && <SelectField label={t('gradeNumber')} required value={draft.gradeNumber} onChange={event => change('gradeNumber', event.target.value)}>
            <option value="">{t('invalidGrade')}</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option value={value} key={value}>{numeric.format(value)}</option>)}
          </SelectField>}
          {kind === 'languages' && <div className="education-language-fields">
            <InputField label={t('locale')} dir="ltr" required readOnly={Boolean(record)} maxLength={35} spellCheck={false} value={draft.locale}
              onChange={event => change('locale', event.target.value)} aria-describedby={fieldId + '-locale'} />
            <SelectField label={t('direction')} value={draft.direction} onChange={event => change('direction', event.target.value as 'ltr' | 'rtl')}>
              <option value="ltr">{t('ltr')}</option><option value="rtl">{t('rtl')}</option>
            </SelectField>
            <p className="education-note" id={fieldId + '-locale'}>{t('localeHint')}</p>
          </div>}
          <section className="education-translation-section" aria-labelledby={fieldId + '-translation-heading'}>
            <h3 id={fieldId + '-translation-heading'}>{t('translations')}</h3>
            <p className="education-note">{t('translationHint')}</p>
            {!defaultLocale && !draft.translations.length && <p className="education-note">{t('noLanguages')}</p>}
            {draft.translations.map(item => {
              const direction = languages.find(language => language.locale === item.locale)?.direction ?? 'auto';
              const language = localeName(item.locale, i18n.language);
              return <fieldset className="education-translation" key={item.locale}>
                <legend>{language} <bdi dir="ltr">({item.locale})</bdi></legend>
                <InputField label={t('name')} maxLength={120} value={item.name} lang={item.locale} dir={direction}
                  onChange={event => updateTranslation(item.locale, 'name', event.target.value)} required />
                <label className="ui-field education-description">
                  <span>{t('description')}</span>
                  <textarea value={item.description} maxLength={1200} rows={3} lang={item.locale} dir={direction}
                    onChange={event => updateTranslation(item.locale, 'description', event.target.value)} />
                </label>
                {editable && <Button variant="ghost" aria-label={t('removeLanguage', { language })} onClick={() =>
                  change('translations', draft.translations.filter(translation => item.locale !== translation.locale))
                }>{t('removeTranslation')}</Button>}
              </fieldset>;
            })}
            {editable && availableTranslations.length > 0 && draft.translations.length < 32 && <div className="education-add-translation">
              <SelectField label={t('selectLanguage')} value={newLocale} onChange={event => setNewLocale(event.target.value)}>
                <option value="">{t('chooseLanguage')}</option>
                {availableTranslations.map(language => <option value={language.locale} key={language.id}>
                  {localeName(language.locale!, i18n.language)} ({language.locale})
                </option>)}
              </SelectField>
              <Button variant="secondary" disabled={!newLocale} onClick={addTranslation}>{t('addTranslation')}</Button>
            </div>}
            {draft.translations.length >= 32 && <p className="education-note">{t('translationLimit')}</p>}
          </section>
        </fieldset>
        {error?.area === 'form' && <p role="alert" className="education-error">{t(error.message)}</p>}
        {editable && <div className="education-form-actions">
          <Button type="submit" disabled={Boolean(busy)}>{t(busy === 'save' ? 'saving' : 'save')}</Button>
          <Button variant="ghost" asChild><Link to={back}>{t('cancel')}</Link></Button>
        </div>}
      </form>
    </Card>
    {record && <Card className="education-workflow">
      <h2>{t('workflow')}</h2>
      <EducationStatus status={record.status} />
      <p className="education-note">{t('publishedOnly')}</p>
      {dirty && <p className="education-note">{t('saveBeforeStatus')}</p>}
      {!canPublish && transitions.includes('published') && <p className="education-note">{t('publishPermission')}</p>}
      <form className="education-status-form" onSubmit={changeStatus} aria-busy={busy === 'status'}>
        <SelectField label={t('nextStatus')} disabled={Boolean(busy) || dirty} value={nextStatus}
          onChange={event => setNextStatus(event.target.value as Status | '')}>
          <option value="">{t('chooseStatus')}</option>
          {transitions.map(status => <option disabled={status === 'published' && !canPublish} value={status} key={status}>
            {t('status-' + status)}
          </option>)}
        </SelectField>
        <Button type="submit" variant="secondary" disabled={Boolean(busy) || !nextStatus || dirty}>{t(busy === 'status' ? 'working' : 'changeStatus')}</Button>
      </form>
      {error?.area === 'status' && <p role="alert" className="education-error">{t(error.message)}</p>}
      <div className="education-delete">
        {canDelete(record.status)
          ? <PanelDialog title={t('deleteTitle')} closeLabel={t('close')} description={t('deleteHelp')} open={deleteOpen}
              onOpenChange={open => { if (busy !== 'delete') {setDeleteOpen(open); if (error?.area === 'delete') setError(undefined);} }}
              trigger={<Button className="education-danger" variant="secondary" disabled={Boolean(busy)}>{t('delete')}</Button>}>
            {currentName && <p className="education-dialog-name"><bdi>{currentName}</bdi></p>}
            {error?.area === 'delete' && <p role="alert" className="education-error">{t(error.message)}</p>}
            <div className="education-form-actions">
              <DialogClose asChild><Button variant="secondary" disabled={busy === 'delete'}>{t('cancel')}</Button></DialogClose>
              <Button className="education-danger" variant="secondary" onClick={() => void remove()} disabled={busy === 'delete'}>
                {t(busy === 'delete' ? 'deleting' : 'delete')}
              </Button>
            </div>
          </PanelDialog>
          : <p className="education-note">{t('deleteLocked')}</p>}
      </div>
    </Card>}
  </div>;
}

export function EducationEditor({ kind, id }: { kind: Kind; id?: string }) {
  const { t } = useTranslation('education');
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal): Promise<EditorData> => {
    const [record, languages, categories, account] = await Promise.all([
      id ? getEducation(kind, id, signal) : undefined,
      loadChoices('languages', signal),
      kind === 'subjects' ? loadChoices('categories', signal) : [],
      readIdentity(signal),
    ]);
    return { record, languages, categories, canPublish: Boolean(account?.permissions.includes('education:publish')) };
  }, [id, kind]);
  const { result, reload } = useEducationData(load);
  return <div className="education-module">
    <EducationHeading kind={kind} title={t(id ? 'edit' : 'createTitle')} details={t(kind + 'Hint')}>
      <Button variant="secondary" asChild><Link to={educationPath(kind) + search}>{t('back')}</Link></Button>
    </EducationHeading>
    <EducationNavigation />
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loadingDetails')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t(educationError(result.error, 'loadError'))}>
      <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && <RecordEditor data={result.data} kind={kind} key={kind + ':' + (id ?? 'new')} />}
  </div>;
}
