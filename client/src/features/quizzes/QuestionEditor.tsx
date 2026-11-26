import { Plus, Save, Trash2, X } from 'lucide-react';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, InputField, SelectField, StatePanel } from '../../components/ui/Primitives';
import { readIdentity } from '../auth/api';
import { contentDirection, TextArea } from '../courses/admin/EditorFields';
import { learnerLanguageName } from '../courses/student/components';
import type { EducationRecord } from '../education/api';
import { useEducationData } from '../education/useEducationData';
import { ConfirmQuizAction, defaultQuizLocale, useQuizUnsaved } from './AdminFields';
import {
  deleteQuestion, getBankQuestion, loadQuizLanguages, questionBankPath, questionKinds, questionLabels, quizError, saveQuestion,
  type BankQuestion, type QuestionInput, type QuestionKind, type QuestionTranslation,
} from './api';
import { quizNamespace as ns } from './strings';

const initialKind: QuestionKind = 'single-choice';

function blankQuestion(locale: string, options: string[] = ['', '']): QuestionTranslation {
  return { locale, prompt: '', acceptedAnswers: [], options, explanation: '' };
}

function questionDraft(locale: string, entry?: BankQuestion): QuestionInput {
  return entry ? { kind: entry.kind, correctOptions: entry.correctOptions, translations: entry.translations } :
    { kind: initialKind, correctOptions: [], translations: [blankQuestion(locale)] };
}

function normalizeDraft(input: QuestionInput): QuestionInput | undefined {
  const translations = input.translations.map(item => ({
    ...item, prompt: item.prompt.trim(), explanation: item.explanation.trim(),
    options: item.options.map(option => option.trim()),
    acceptedAnswers: item.acceptedAnswers.map(answer => answer.trim()).filter(Boolean),
  }));
  const short = input.kind === 'short-answer';
  if (translations.some(item => !item.prompt ||
      (short && (!item.acceptedAnswers.length || item.acceptedAnswers.length > 8 || item.acceptedAnswers.some(answer => answer.length > 100))) ||
      (!short && (item.options.some(option => !option) || new Set(item.options).size !== item.options.length)))) return;
  if (!short && input.correctOptions.length < (input.kind === 'multiple-choice' ? 2 : 1)) return;
  return { ...input, translations, correctOptions: [...input.correctOptions].sort((first, second) => first - second) };
}

function QuestionForm({ entry, languages, reload }: { entry?: BankQuestion; languages: EducationRecord[]; reload: () => void }) {
  const { t, i18n } = useTranslation(ns);
  const navigate = useNavigate();
  const { search, state } = useLocation();
  const back = questionBankPath + search;
  const initialLocale = defaultQuizLocale(languages, i18n.language);
  const [record, setRecord] = useState(entry);
  const [draft, setDraft] = useState(() => questionDraft(initialLocale, record));
  const [languageToAdd, setLanguageToAdd] = useState('');
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(state?.message === 'created' ? 'loaded' : '');
  const [error, setError] = useState('');
  const activeMutation = useRef(false);
  const notice = useRef<HTMLDivElement>(null);
  const editable = !record?.referenced;
  const stale = error === 'conflict';
  const locked = pending || !editable || stale;
  const optionCount = draft.translations[0]?.options.length ?? 0;
  const multiple = draft.kind === 'multiple-choice';
  const short = draft.kind === 'short-answer';
  const boolean = draft.kind === 'true-false';
  const available = languages.filter(item => item.locale && !draft.translations.some(copy => copy.locale === item.locale));
  const number = new Intl.NumberFormat(i18n.language);
  useQuizUnsaved(dirty);

  function change(update: (input: QuestionInput) => QuestionInput) {
    setDraft(update);
    setDirty(true);
    setStatus('');
    if (!stale) setError('');
  }

  function initialOptions(kind: QuestionKind, locale: string) {
    if (kind === 'true-false') return [t('true', { lng: locale }), t('false', { lng: locale })];
    return kind === 'short-answer' ? [] : Array.from({ length: Math.max(2, optionCount) }, () => '');
  }

  function changeKind(kind: QuestionKind) {
    const keepChoices = (kind === 'single-choice' || kind === 'multiple-choice') && !short && !boolean;
    change(input => ({
      kind,
      correctOptions: keepChoices ? input.correctOptions.slice(0, kind === 'single-choice' ? 1 : undefined) : [],
      translations: input.translations.map(copy => ({ ...copy, options: keepChoices ? copy.options : initialOptions(kind, copy.locale), acceptedAnswers: [] })),
    }));
  }

  function changeTranslation(locale: string, changes: Partial<QuestionTranslation>) {
    change(input => ({ ...input, translations: input.translations.map(copy => copy.locale === locale ? { ...copy, ...changes } : copy) }));
  }

  function changeOption(option: number, locale: string, value: string) {
    change(input => ({ ...input, translations: input.translations.map(copy => copy.locale === locale
      ? { ...copy, options: copy.options.map((label, index) => index === option ? value : label) } : copy) }));
  }

  function addOption() {
    change(input => ({ ...input, translations: input.translations.map(copy => ({ ...copy, options: [...copy.options, ''] })) }));
  }

  function removeOption(option: number) {
    change(input => ({
      ...input, correctOptions: input.correctOptions.filter(index => index !== option).map(index => index > option ? index - 1 : index),
      translations: input.translations.map(copy => ({ ...copy, options: copy.options.filter((_, index) => index !== option) })),
    }));
  }

  function checkOption(option: number, checked: boolean) {
    change(input => ({ ...input, correctOptions: multiple
      ? checked ? [...input.correctOptions, option] : input.correctOptions.filter(index => index !== option)
      : [option] }));
  }

  function showError(message: string) {
    setError(message);
    window.requestAnimationFrame(() => notice.current?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || activeMutation.current) return;
    const input = normalizeDraft(draft);
    if (!input) { showError('invalidQuestion'); return; }
    activeMutation.current = true;
    setPending(true);
    setError('');
    try {
      const item = await saveQuestion(input, record);
      setRecord(item);
      setDraft(questionDraft(initialLocale, item));
      setDirty(false);
      setStatus('saved');
      if (!record) void navigate(questionBankPath + '/' + item.id + search, { replace: true, state: { message: 'created' } });
    } catch (failure) {
      showError(quizError(failure, 'createFailed'));
    } finally {
      activeMutation.current = false;
      setPending(false);
    }
  }

  async function remove() {
    if (!record || locked || dirty || activeMutation.current) return;
    activeMutation.current = true;
    setPending(true);
    try {
      await deleteQuestion(record);
      void navigate(back, { replace: true });
    } catch (failure) {
      showError(quizError(failure, 'deleteFailed'));
    } finally {
      activeMutation.current = false;
      setPending(false);
    }
  }

  return <>
    <Button asChild variant="ghost" className="course-back">
      <Link to={back} onClick={event => { if (dirty && !window.confirm(t('discard'))) event.preventDefault(); }}>{t('backBank')}</Link>
    </Button>
    <div className="admin-section-heading course-heading"><h1>{t(record ? 'editQuestion' : 'addQuestion')}</h1></div>
    <form className="course-builder quiz-editor" noValidate onSubmit={save} aria-busy={pending}>
      <div className="course-builder-actions">
        {editable && <Button type="submit" disabled={locked}><Save size={17} aria-hidden="true" />{t(pending ? 'saving' : 'save')}</Button>}
        {record && editable && <ConfirmQuizAction variant="ghost" label={t('delete')} title={t('deleteQuestion')} disabled={locked || dirty}
          onConfirm={() => void remove()} />}
        {status && <span role="status">{t(status)}</span>}
      </div>
      {!editable && <p className="course-note">{t('questionInUse')}</p>}
      {error && <div className="course-error" tabIndex={-1} role="alert" ref={notice}>{t(error)}
        {stale && <Button variant="secondary" onClick={reload}>{t('reload')}</Button>}
      </div>}
      <fieldset className="course-form-card quiz-question-settings" disabled={locked}>
        <legend>{t('type')}</legend>
        <SelectField label={t('type')} value={draft.kind} onChange={event => changeKind(event.target.value as QuestionKind)}>
          {questionKinds.map(kind => <option value={kind} key={kind}>{t(questionLabels[kind])}</option>)}
        </SelectField>
        {!short && <div className="quiz-answer-key" role="group" aria-label={t('correctAnswer')}>
          <strong>{t('correctAnswer')}</strong>
          {multiple && <p className="quiz-help">{t('chooseMultiple')}</p>}
          <div className="quiz-options">{Array.from({ length: optionCount }, (_, index) => <label className="quiz-option" key={index}>
            <input type={multiple ? 'checkbox' : 'radio'} name="quiz-answer-key" checked={draft.correctOptions.includes(index)}
              onChange={event => checkOption(index, event.target.checked)} />
            {t('selectCorrect', { number: number.format(index + 1) })}
          </label>)}</div>
          {!boolean && <div className="quiz-actions">
            {optionCount < 8 && !locked && <Button variant="secondary" onClick={addOption}><Plus size={17} aria-hidden="true" />{t('addOption')}</Button>}
            {optionCount > 2 && !locked && <Button variant="ghost" onClick={() => removeOption(optionCount - 1)}>
              <Trash2 size={16} aria-hidden="true" />{t('removeOption', { number: number.format(optionCount) })}
            </Button>}
          </div>}
        </div>}
      </fieldset>
      <div className="quiz-question-translations">
        {draft.translations.map(copy => {
          const direction = contentDirection(copy.locale, languages);
          const language = learnerLanguageName(copy.locale);
          return <fieldset className="course-translation" key={copy.locale} disabled={locked}>
            <legend><bdi lang={copy.locale}>{language}</bdi></legend>
            <TextArea label={t('prompt')} value={copy.prompt} onChange={value => changeTranslation(copy.locale, { prompt: value })}
              locale={copy.locale} direction={direction} maxLength={300} />
            {short ? <>
              <TextArea label={t('acceptedAnswers')} value={copy.acceptedAnswers.join('\n')}
                onChange={value => changeTranslation(copy.locale, { acceptedAnswers: value.split(/\r?\n/) })}
                locale={copy.locale} direction={direction} maxLength={807} />
              <p className="quiz-help">{t('acceptedAnswersHint')}</p>
            </> : <div className="quiz-option-editors">
              {copy.options.map((label, index) => <InputField label={t('option', { number: number.format(index + 1) })}
                lang={copy.locale} dir={direction} maxLength={100} value={label} key={index}
                onChange={event => changeOption(index, copy.locale, event.target.value)} />)}
            </div>}
            <TextArea label={t('questionExplanation')} value={copy.explanation}
              onChange={value => changeTranslation(copy.locale, { explanation: value })}
              locale={copy.locale} direction={direction} maxLength={400} />
            {draft.translations.length > 1 && !locked && <Button variant="ghost" onClick={() => change(input => ({
              ...input, translations: input.translations.filter(item => item.locale !== copy.locale),
            }))}><X size={16} aria-hidden="true" />{t('removeTranslation', { language })}</Button>}
          </fieldset>;
        })}
      </div>
      {available.length > 0 && draft.translations.length < 6 && !locked && <div className="course-inline-fields">
        <SelectField label={t('translationLanguage')} value={languageToAdd} onChange={event => setLanguageToAdd(event.target.value)}>
          <option value="">{t('languagePlaceholder')}</option>
          {available.map(item => <option key={item.id} value={item.locale} lang={item.locale}>
            {learnerLanguageName(item.locale!)}
          </option>)}
        </SelectField>
        <Button variant="secondary" disabled={!languageToAdd} onClick={() => {
          change(input => ({ ...input, translations: [
            ...input.translations, blankQuestion(languageToAdd, initialOptions(input.kind, languageToAdd)),
          ] }));
          setLanguageToAdd('');
        }}><Plus size={16} aria-hidden="true" />{t('addTranslation')}</Button>
      </div>}
    </form>
  </>;
}

export function QuestionEditor({ id }: { id?: string }) {
  const { t } = useTranslation(ns);
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal) => {
    const identity = await readIdentity(signal);
    if (!identity?.permissions.includes('quiz:manage')) return { denied: true as const };
    const [entry, languages] = await Promise.all([id ? getBankQuestion(id, signal) : Promise.resolve(undefined), loadQuizLanguages(signal)]);
    return { denied: false as const, entry, languages };
  }, [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'ready' && !result.data.denied) {
    return <QuestionForm entry={result.data.entry} languages={result.data.languages} reload={reload} />;
  }
  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={questionBankPath + search}>{t('backBank')}</Link></Button>
    <div className="admin-section-heading"><h1>{t(id ? 'editQuestion' : 'addQuestion')}</h1></div>
    {result.status === 'loading' ? <StatePanel kind="loading" title={t('waiting')} />
      : <StatePanel kind="error" title={t(result.status === 'error' ? quizError(result.error, 'loadFailed') : 'denied')}>
        {result.status === 'error' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
      </StatePanel>}
  </>;
}
