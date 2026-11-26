import { ArrowDown, ArrowUp, ClipboardCheck, ExternalLink, Save, X } from 'lucide-react';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, InputField, SectionTabs, StatePanel } from '../../components/ui/Primitives';
import { readIdentity } from '../auth/api';
import { TextArea, TranslationFields } from '../courses/admin/EditorFields';
import { blankProvenance, RightsFields } from '../courses/Provenance';
import { findCourse, listCourses, type CourseSummary } from '../courses/student/api';
import { chooseTranslation } from '../courses/student/components';
import { canDelete, canEdit, statusTransitions, type EducationRecord, type Status } from '../education/api';
import { useEducationData } from '../education/useEducationData';
import { ConfirmQuizAction, defaultQuizLocale, questionChoice, QuizPicker, QuizStatus, useQuizUnsaved, type QuizChoice } from './AdminFields';
import {
  changeQuizStatus, deleteQuiz, getAdminQuiz, listBankQuestions, loadQuizLanguages, questionBankPath, quizAdminPath, quizError, quizPath,
  saveQuiz, type AdminQuiz, type QuizInput, type QuizTranslation,
} from './api';
import { quizNamespace as ns } from './strings';

const transitionLabels: Record<Status, string> = {
  draft: 'returnDraft', 'educational-review': 'sendReview', 'translation-review': 'sendTranslation',
  approved: 'approve', published: 'publish', archived: 'archive',
};

const blank = (locale: string): QuizTranslation => ({ locale, title: '', description: '' });

type QuizDraft = Omit<QuizInput, 'passingScore'> & { passingScore: string };
function fromRecord(locale: string, record?: AdminQuiz): QuizDraft {
  if (!record) return { slug: '', passingScore: '70', courseId: null, questionIds: [],
    translations: [blank(locale)], provenance: { ...blankProvenance } };
  const { slug, passingScore, courseId, questionIds, translations, provenance } = record;
  return { slug, passingScore: String(passingScore), courseId, questionIds, translations, provenance };
}

function Review({ entry, canPublish, locked, dirty, onStatus, onDelete }: {
  entry: AdminQuiz; canPublish: boolean; locked: boolean; dirty: boolean; onStatus: (status: Status) => void; onDelete: () => void;
}) {
  const { t } = useTranslation(ns);
  const grants = (status: Status) => status === 'approved' || status === 'published' || status === 'archived';
  const transitions = statusTransitions[entry.status];
  return <Card className="course-publication">
    <h2>{t('publication')}</h2>
    <QuizStatus status={entry.status} />
    {dirty && <p className="course-note">{t('saveFirst')}</p>}
    {!canPublish && transitions.some(grants) && <p className="course-note">{t('denied')}</p>}
    <div className="course-row-footer">
      {transitions.filter(status => canPublish || !grants(status)).map(status => {
        const label = t(transitionLabels[status]);
        return grants(status)
          ? <ConfirmQuizAction label={label} title={label} description={status === 'approved' ? t('reviewHelp') : undefined}
            disabled={locked || dirty} onConfirm={() => onStatus(status)} key={status} />
          : <Button variant="secondary" disabled={locked || dirty} onClick={() => onStatus(status)} key={status}>{label}</Button>;
      })}
      {entry.status === 'published' && <Button variant="ghost" asChild><Link to={quizPath(entry.slug)}>
        <ExternalLink size={16} aria-hidden="true" />{t('viewPublished')}
      </Link></Button>}
    </div>
    {canDelete(entry.status) && <ConfirmQuizAction label={t('delete')} title={t('deleteQuiz')} variant="ghost"
      disabled={locked || dirty} onConfirm={onDelete} />}
  </Card>;
}

interface EditorData { entry?: AdminQuiz; languages: EducationRecord[]; course?: CourseSummary; canPublish: boolean }
function courseChoice(course: CourseSummary, locale: string): QuizChoice {
  const copy = chooseTranslation(course.translations, locale);
  return { id: course.id, title: copy.title, locale: copy.locale };
}

function QuizForm({ data, reload }: { data: EditorData; reload: () => void }) {
  const { t, i18n } = useTranslation(ns);
  const currentLocale = i18n.language;
  const navigate = useNavigate();
  const { search, state } = useLocation();
  const back = quizAdminPath + search;
  const locale = defaultQuizLocale(data.languages, currentLocale);
  const [entry, setEntry] = useState(data.entry);
  const [draft, setDraft] = useState(() => fromRecord(locale, entry));
  const [course, setCourse] = useState(() => data.course && courseChoice(data.course, currentLocale));
  const [selected, setSelected] = useState(() => new Map(data.entry?.questions?.map(item => [item.id, questionChoice(item, currentLocale)])));
  const [view, setView] = useState('details');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(state?.message === 'created' ? 'loaded' : '');
  const [orderNotice, setOrderNotice] = useState<{ message: string; serial: number }>();
  const feedback = useRef<HTMLDivElement>(null);
  const changing = useRef(false);
  const stale = error === 'conflict';
  const editable = !entry || canEdit(entry.status);
  const locked = busy || stale || !editable;
  useQuizUnsaved(dirty);
  const number = new Intl.NumberFormat(currentLocale);
  const questionLoad = useCallback(async (q: string, page: number, signal: AbortSignal) => {
    const result = await listBankQuestions({ q, page, pageSize: 10 }, signal);
    return { ...result, items: result.items.map(item => questionChoice(item, currentLocale)) };
  }, [currentLocale]);
  const courseLoad = useCallback(async (q: string, page: number, signal: AbortSignal) => {
    const result = await listCourses({ q, page, language: '', subjectId: '', levelId: '' }, signal);
    return { ...result, items: result.items.map(item => courseChoice(item, currentLocale)) };
  }, [currentLocale]);

  function change(changes: Partial<QuizDraft>) {
    setDraft(current => ({ ...current, ...changes }));
    setDirty(true);
    setNotice('');
    if (!stale) setError('');
  }

  function updateQuestions(ids: string[], message: string) {
    change({ questionIds: ids });
    setOrderNotice(current => ({ message, serial: (current?.serial ?? 0) + 1 }));
  }

  function reorder(index: number, offset: number) {
    const move = index + offset;
    const ids = [...draft.questionIds];
    [ids[index], ids[move]] = [ids[move]!, ids[index]!];
    updateQuestions(ids, 'orderUpdated');
  }

  function errorMessage(message: string) {
    setError(message);
    window.requestAnimationFrame(() => feedback.current?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || changing.current) return;
    const passingScore = Number(draft.passingScore);
    const slug = draft.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isInteger(passingScore) || passingScore < 1 || passingScore > 100) {
      setView('details'); errorMessage('invalidQuiz'); return;
    }
    const translations = draft.translations.map(copy => ({ ...copy, title: copy.title.trim(), description: copy.description.trim() }));
    if (translations.some(copy => !copy.title)) { setView('details'); errorMessage('invalidTranslations'); return; }
    const input: QuizInput = { ...draft, passingScore, slug, translations };
    changing.current = true;
    setBusy(true);
    setError('');
    try {
      const item = await saveQuiz(input, entry);
      setEntry(item);
      setDraft(fromRecord(locale, item));
      setDirty(false);
      setNotice('saved');
      if (!entry) void navigate(quizAdminPath + '/' + item.id + search, { replace: true, state: { message: 'created' } });
    } catch (failure) {
      errorMessage(quizError(failure, 'createFailed'));
    } finally {
      changing.current = false;
      setBusy(false);
    }
  }

  async function status(next: Status) {
    if (!entry || dirty || stale || changing.current) return;
    changing.current = true;
    setBusy(true);
    setError('');
    try {
      const item = await changeQuizStatus(entry, next);
      setEntry(item);
      setNotice('publicationSaved');
    } catch (failure) {
      errorMessage(quizError(failure, 'createFailed'));
    } finally {
      changing.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || dirty || stale || changing.current) return;
    changing.current = true;
    setBusy(true);
    setError('');
    try {
      await deleteQuiz(entry);
      void navigate(back, { replace: true });
    } catch (failure) {
      errorMessage(quizError(failure, 'deleteFailed'));
    } finally {
      changing.current = false;
      setBusy(false);
    }
  }

  const details = <div className="quiz-admin-details">
    <fieldset className="course-form-card" disabled={locked}>
      <legend>{t('details')}</legend>
      <div className="book-admin-fields">
        <InputField label={t('code')} value={draft.slug} maxLength={80} dir="ltr" autoComplete="off" spellCheck={false}
          onChange={event => change({ slug: event.target.value })} />
        <InputField label={t('passingScore')} type="number" min={1} max={100} value={draft.passingScore}
          onChange={event => change({ passingScore: event.target.value })} />
      </div>
      <p className="course-note">{t('codeHint')}</p>
      <RightsFields value={draft.provenance} onChange={provenance => change({ provenance })} disabled={locked} />
      <div className="course-choice">
        <h2>{t('course')}</h2>
        {draft.courseId ? <p><bdi lang={course?.locale}>{course?.title ?? t('unavailableReference')}</bdi></p> :
          <p className="course-note">{t('noLinkedCourse')}</p>}
        {!locked && <div className="quiz-actions">
          <QuizPicker label={t('chooseCourse')} searchLabel={t('searchCourses')} noMatches={t('noCourses')}
            load={courseLoad} select={item => { setCourse(item); change({ courseId: item.id }); }} />
          {draft.courseId && <Button variant="ghost" onClick={() => { setCourse(undefined); change({ courseId: null }); }}>
            <X size={16} aria-hidden="true" />{t('removeCourse')}
          </Button>}
        </div>}
      </div>
    </fieldset>
    <fieldset className="course-form-card" disabled={locked}>
      <legend>{t('contentLanguages')}</legend>
      <TranslationFields records={data.languages} values={draft.translations} onChange={translations => change({ translations })}
        blank={blank} titleLabel={t('name')} disabled={locked}
        render={(value, direction, update) => <>
          <TextArea label={t('description')} value={value.description}
            onChange={description => update({ description })} locale={value.locale} direction={direction} maxLength={500} />
          <RightsFields value={value.provenance} onChange={provenance => update({ provenance })} optional disabled={locked} />
        </>} />
    </fieldset>
  </div>;

  const questions = <section className="course-form-card quiz-question-order" aria-labelledby="quiz-order-title">
    <h2 id="quiz-order-title">{t('questionList')}</h2>
    {!draft.questionIds.length && <p className="course-note">{t('selectedQuestionsEmpty')}</p>}
    <ol className="quiz-order-list">{draft.questionIds.map((id, index) => {
      const choice = selected.get(id);
      const position = number.format(index + 1);
      return <li className="quiz-order-item" key={id}>
        <div><span>{t('position', { number: position })}</span><bdi lang={choice?.locale}>{choice?.title ?? t('unavailableReference')}</bdi></div>
        {!locked && <div className="quiz-actions">
          <Button variant="secondary" className="ui-icon-btn" disabled={index === 0} onClick={() => reorder(index, -1)}
            aria-label={t('moveEarlier', { number: position })}><ArrowUp size={16} aria-hidden="true" /></Button>
          <Button variant="secondary" className="ui-icon-btn" disabled={index + 1 === draft.questionIds.length} onClick={() => reorder(index, 1)}
            aria-label={t('moveLater', { number: position })}><ArrowDown size={16} aria-hidden="true" /></Button>
          <Button variant="ghost" className="ui-icon-btn" onClick={() => updateQuestions(draft.questionIds.filter(value => value !== id), 'questionRemoved')}
            aria-label={t('removeQuestion', { number: position })}><X size={16} aria-hidden="true" /></Button>
        </div>}
      </li>;
    })}</ol>
    {orderNotice && <div className="admin-sr" role="status" key={orderNotice.serial}>{t(orderNotice.message)}</div>}
    {!locked && draft.questionIds.length < 30 && <div className="quiz-actions">
      <QuizPicker label={t('selectQuestions')} searchLabel={t('searchQuestions')} noMatches={t('noQuestions')}
        load={questionLoad} excluded={draft.questionIds} select={item => {
          setSelected(current => new Map(current).set(item.id, item));
          updateQuestions([...draft.questionIds, item.id], 'questionSelected');
        }} />
      <Button asChild variant="ghost"><Link to={questionBankPath} target="_blank" rel="noopener noreferrer">
        <ClipboardCheck size={17} aria-hidden="true" />{t('bank')}
      </Link></Button>
    </div>}
  </section>;

  return <>
    <Button asChild variant="ghost" className="course-back">
      <Link to={back} onClick={event => { if (dirty && !window.confirm(t('discard'))) event.preventDefault(); }}>{t('backAdmin')}</Link>
    </Button>
    <div className="admin-section-heading course-heading"><div>
      <h1>{t(entry ? 'editQuiz' : 'addQuiz')}</h1>
      {entry && <div className="course-record-heading"><QuizStatus status={entry.status} /></div>}
    </div></div>
    <form className="course-builder quiz-editor" aria-busy={busy} onSubmit={save} noValidate>
      <div className="course-builder-actions">
        {editable && <Button type="submit" disabled={locked}><Save size={17} aria-hidden="true" />{t(busy ? 'saving' : 'save')}</Button>}
        {notice && <span role="status">{t(notice)}</span>}
      </div>
      {error && <div className="course-error" role="alert" tabIndex={-1} ref={feedback}>{t(error)}
        {stale && <Button variant="secondary" onClick={reload}>{t('reload')}</Button>}
      </div>}
      <SectionTabs label={t('adminTitle')} value={view} onValueChange={setView} dir={i18n.dir()} items={[
        { value: 'details', label: t('details'), content: details },
        { value: 'questions', label: t('questionList'), content: questions },
        ...(entry ? [{ value: 'review', label: t('publication'), content: <Review entry={entry} canPublish={data.canPublish}
          locked={busy || stale} dirty={dirty} onStatus={next => void status(next)} onDelete={() => void remove()} /> }] : []),
      ]} />
    </form>
  </>;
}

export function QuizEditor({ id }: { id?: string }) {
  const { t } = useTranslation(ns);
  const { search } = useLocation();
  const load = useCallback(async (signal: AbortSignal) => {
    const identity = await readIdentity(signal);
    if (!identity?.permissions.includes('quiz:manage')) return { denied: true as const };
    const [entry, languages] = await Promise.all([id ? getAdminQuiz(id, signal) : Promise.resolve(undefined), loadQuizLanguages(signal)]);
    const course = entry?.courseSlug ? await findCourse(entry.courseSlug, signal).then(result => result.course).catch(() => undefined) : undefined;
    return { denied: false as const, entry, languages, course, canPublish: identity.permissions.includes('quiz:publish') };
  }, [id]);
  const { result, reload } = useEducationData(load);
  if (result.status === 'ready' && !result.data.denied) return <QuizForm data={result.data} reload={reload} />;
  return <>
    <Button asChild variant="ghost" className="course-back"><Link to={quizAdminPath + search}>{t('backAdmin')}</Link></Button>
    <div className="admin-section-heading"><h1>{t(id ? 'editQuiz' : 'addQuiz')}</h1></div>
    {result.status === 'loading' ? <StatePanel kind="loading" title={t('waiting')} />
      : <StatePanel kind="error" title={t(result.status === 'error' ? quizError(result.error, 'loadFailed') : 'denied')}>
        {result.status === 'error' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
      </StatePanel>}
  </>;
}
