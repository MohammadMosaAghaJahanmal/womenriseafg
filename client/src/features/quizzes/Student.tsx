import { CheckCircle2, ClipboardCheck, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, InputField, Pagination, ProgressIndicator, StatePanel } from '../../components/ui/Primitives';
import { authError, authStatus } from '../auth/api';
import { BackLink, chooseTranslation, ContentLanguageSelect, learnerLanguageName, useContentLanguage } from '../courses/student/components';
import { useEducationData } from '../education/useEducationData';
import { Recommendations } from '../discovery/Cards';
import { recordQuizResult } from '../engagement/local';
import { SaveResource } from '../engagement/SaveResource';
import { getPublishedQuiz, listPublishedQuizzes, quizPath, submitQuiz,
  type Answer, type PublicQuestion, type PublicQuiz, type QuizResult } from './api';
import { quizNamespace as ns } from './strings';
import './quiz.css';

function QuizState({ error, retry }: { error?: unknown; retry: () => void }) {
  const { t } = useTranslation(ns);
  if (!error) return <StatePanel kind="loading" title={t('waiting')} />;
  const unavailable = [400, 404].includes(authStatus(error) ?? 0);
  return <StatePanel kind="error" title={t(unavailable ? 'unavailable' : 'loadFailed')}>
    {unavailable ? <Button asChild variant="secondary"><Link to="/quizzes">{t('back')}</Link></Button>
      : <Button variant="secondary" onClick={retry}>{t('retry')}</Button>}
  </StatePanel>;
}

export function QuizCatalog() {
  const { t, i18n } = useTranslation(ns);
  const [parameters, setParameters] = useSearchParams();
  const q = (parameters.get('q') ?? '').trim().slice(0, 120);
  const page = Math.min(10000, Math.max(1, Number.parseInt(parameters.get('page') ?? '', 10) || 1));
  const linkedCourse = parameters.get('courseId');
  const courseId = linkedCourse && /^[a-f0-9-]{36}$/i.test(linkedCourse) ? linkedCourse : undefined;
  const load = useCallback((signal: AbortSignal) => listPublishedQuizzes({ q, page, pageSize: 12, courseId }, signal), [q, page, courseId]);
  const { result, reload } = useEducationData(load);
  const number = new Intl.NumberFormat(i18n.language);

  function update(query: string, next = 1) {
    setParameters({ ...(courseId ? { courseId } : {}), ...(query ? { q: query } : {}),
      ...(next > 1 ? { page: String(next) } : {}) });
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    update(query);
  }

  return <div className="learn-page quiz-page">
    <header className="learn-banner"><div><h1>{t('title')}</h1><p>{t('catalogIntro')}</p></div>
      <ClipboardCheck className="learn-banner-art" size={48} aria-hidden="true" />
    </header>
    <form className="learn-search quiz-search" role="search" aria-label={t('search')} onSubmit={search}>
      <InputField type="search" label={t('search')} name="q" defaultValue={q} maxLength={120} key={q} />
      <Button type="submit">{t('searchAction')}</Button>
      {q && <Button variant="ghost" onClick={() => update('')}>{t('clear')}</Button>}
    </form>
    {result.status !== 'ready' ? <QuizState error={result.status === 'error' ? result.error : undefined} retry={reload} />
      : <>
        {result.data.items.length ? <div className="quiz-grid">{result.data.items.map(quiz => {
          const copy = chooseTranslation(quiz.translations, i18n.language);
          return <Card className="quiz-card" key={quiz.id}>
            <h2><Link to={quizPath(quiz.slug)}><bdi lang={copy.locale}>{copy.title}</bdi></Link></h2>
            {copy.description && <p dir="auto" lang={copy.locale}>{copy.description}</p>}
            <div className="quiz-meta"><Badge>{t('questions', { count: quiz.questionCount, countText: number.format(quiz.questionCount) })}</Badge>
              <span>{t('passingScore')} {t('percentage', { amount: number.format(quiz.passingScore) })}</span>
            </div>
            <div className="quiz-meta" aria-label={t('contentLanguages')}>
              {quiz.translations.map(translation => <bdi key={translation.locale} lang={translation.locale}>{learnerLanguageName(translation.locale)}</bdi>)}
            </div>
          </Card>;
        })}</div> : <StatePanel kind="empty" title={t(q ? 'noMatches' : 'empty')}>
          {page > 1 && <Button variant="secondary" onClick={() => update(q)}>{t('prev')}</Button>}
        </StatePanel>}
        {result.data.total > result.data.pageSize && <Pagination page={page} pages={Math.ceil(result.data.total / result.data.pageSize)}
          pageLabel={t('page', { page: number.format(page), total: number.format(Math.ceil(result.data.total / result.data.pageSize)) })}
          previous={t('prev')} next={t('next')} label={t('pages')}
          onChange={next => update(q, next)} />}
      </>}
  </div>;
}

function emptyAnswer(questionId: string): Answer {
  return { questionId, options: [], text: '' };
}

function isAnswered(answer: Answer) {
  return Boolean(answer.options.length || answer.text.trim());
}

function QuizQuestion({ question, number, locale, answer, disabled, change }: {
  question: PublicQuestion; number: string; locale: string; answer: Answer; disabled: boolean; change: (answer: Answer) => void;
}) {
  const { t } = useTranslation(ns);
  const copy = chooseTranslation(question.translations, locale);
  const multiple = question.kind === 'multiple-choice';
  return <fieldset className="quiz-question" id={'quiz-question-' + question.id} disabled={disabled} tabIndex={-1}>
    <legend><span>{t('questionNumber', { number })}</span><bdi lang={copy.locale}>{copy.prompt}</bdi></legend>
    {question.kind === 'short-answer' ? <InputField label={t('reply')} value={answer.text} dir="auto" lang={copy.locale}
      maxLength={200} onChange={event => change({ ...answer, text: event.target.value })} />
      : <>
        {multiple && <p className="quiz-help">{t('chooseMultiple')}</p>}
        <div className="quiz-options">{copy.options.map((label, index) => <label className="quiz-option" key={index}>
          <input type={multiple ? 'checkbox' : 'radio'} name={'answer-' + question.id} checked={answer.options.includes(index)}
            onChange={event => change({ ...answer, options: multiple
              ? event.target.checked ? [...answer.options, index] : answer.options.filter(option => option !== index) : [index] })} />
          <bdi lang={copy.locale}>{label}</bdi>
        </label>)}</div>
      </>}
  </fieldset>;
}

function QuizResults({ quiz, result, submitted, retake }: {
  quiz: PublicQuiz; result: QuizResult; submitted: Answer[]; retake: () => void;
}) {
  const { t, i18n } = useTranslation(ns);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const number = new Intl.NumberFormat(i18n.language);
  return <section className="quiz-results" aria-labelledby="quiz-result-title">
    <Card className="quiz-score">
      <div><h2 id="quiz-result-title" ref={heading} tabIndex={-1}>{t('quizResults')}</h2>
        <p>{t(result.passed ? 'passed' : 'notPassed')}</p>
        <p>{t('resultCount', { correct: number.format(result.correctCount), total: number.format(result.totalQuestions) })}</p>
      </div>
      <div className="quiz-score-summary"><span>{t('score')}</span><strong>{t('percentage', { amount: number.format(result.scorePercent) })}</strong>
        <span>{t('passingScore')} {t('percentage', { amount: number.format(result.passingScore) })}</span>
      </div>
      <Button variant="secondary" onClick={retake}><RotateCcw size={17} aria-hidden="true" />{t('retake')}</Button>
    </Card>
    <ol className="quiz-review-items">{result.answers.map((outcome, index) => {
      const question = quiz.questions.find(item => item.id === outcome.questionId);
      if (!question) return null;
      const copy = chooseTranslation(question.translations, outcome.locale);
      const answer = submitted.find(item => item.questionId === question.id);
      const chosen = question.kind === 'short-answer' ? answer?.text :
        answer?.options.map(option => copy.options[option]).join(' · ');
      const solution = question.kind === 'short-answer' ? outcome.acceptedAnswers.join(' · ') :
        outcome.correctOptions.map(option => copy.options[option]).join(' · ');
      return <li className="quiz-review" key={outcome.questionId}>
        <div className="quiz-review-header"><h3><span>{t('questionNumber', { number: number.format(index + 1) })}</span>
          <bdi lang={copy.locale}>{copy.prompt}</bdi></h3>
          <Badge>{t(outcome.correct ? 'correct' : 'incorrect')}</Badge>
        </div>
        <dl><div><dt>{t('resultAnswer')}</dt><dd dir="auto">{chosen || t('unanswered')}</dd></div>
          {solution && <div><dt>{t('correctAnswer')}</dt><dd dir="auto" lang={outcome.locale}>{solution}</dd></div>}
          {outcome.explanation && <div><dt>{t('explanation')}</dt><dd dir="auto" lang={outcome.locale}>{outcome.explanation}</dd></div>}
        </dl>
      </li>;
    })}</ol>
  </section>;
}

function QuizAttempt({ quiz, reload }: { quiz: PublicQuiz; reload: () => void }) {
  const { t, i18n } = useTranslation(ns);
  const language = useContentLanguage();
  const copy = chooseTranslation(quiz.translations, language.preferred);
  const [started, setStarted] = useState(false);
  const [focusAttempt, setFocusAttempt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [completed, setCompleted] = useState<{ result: QuizResult; submitted: Answer[] }>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const number = new Intl.NumberFormat(i18n.language);
  const answered = Object.values(answers).filter(isAnswered).length;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (focusAttempt) questionHeading.current?.focus(); }, [focusAttempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const submitted = quiz.questions.map(question => answers[question.id] ?? emptyAnswer(question.id));
    const missing = submitted.find(answer => !isAnswered(answer));
    if (missing) {
      setError('answerRequired');
      event.currentTarget.querySelector<HTMLElement>('#quiz-question-' + CSS.escape(missing.questionId))?.focus();
      return;
    }
    setError('');
    setPending(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await submitQuiz(quiz, copy.locale, submitted, controller.signal);
      if (controller.signal.aborted) return;
      setCompleted({ result, submitted });
      recordQuizResult({ kind: 'quiz', id: quiz.id, slug: quiz.slug, title: copy.title, locale: copy.locale },
        { score: result.scorePercent, passed: result.passed });
    } catch (failure) {
      if (controller.signal.aborted) return;
      const code = authError(failure);
      setError(code === 'STALE_VERSION' || authStatus(failure) === 409 ? 'staleQuiz'
        : authStatus(failure) === 404 ? 'unavailable' : 'submitFailed');
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  function startAgain() {
    setStarted(true);
    setCompleted(undefined);
    setAnswers({});
    setError('');
    setFocusAttempt(value => value + 1);
  }

  return <>
    <header className="quiz-header">
      <div>
        <h1 lang={copy.locale} dir="auto">{copy.title}</h1>
        {copy.description && <p lang={copy.locale} dir="auto">{copy.description}</p>}
        <div className="quiz-meta">
          <Badge>{t('questions', { count: quiz.questionCount, countText: number.format(quiz.questionCount) })}</Badge>
          <span>{t('passingScore')} {t('percentage', { amount: number.format(quiz.passingScore) })}</span>
        </div>
      </div>
      {!answered && !completed && !pending && <ContentLanguageSelect label={t('contentLanguage')}
        locales={quiz.translations.map(item => item.locale)} selected={copy.locale} onSelect={language.setLanguage} />}
    </header>
    <SaveResource resource={{ kind: 'quiz', id: quiz.id, slug: quiz.slug, title: copy.title, locale: copy.locale }} />
    {completed ? <QuizResults quiz={quiz} result={completed.result} submitted={completed.submitted} retake={startAgain} />
      : !started ? <Button onClick={startAgain}><Play size={18} aria-hidden="true" />{t('start')}</Button>
        : <form className="quiz-attempt" onSubmit={submit}>
          <h2 tabIndex={-1} ref={questionHeading}>{t('attempt')}</h2>
          <div className="quiz-attempt-progress"><ProgressIndicator value={100 * answered / Math.max(1, quiz.questions.length)} label={t('progress', { answered: number.format(answered), total: number.format(quiz.questions.length) })} />
            <span aria-live="polite">{t('progress', { answered: number.format(answered), total: number.format(quiz.questions.length) })}</span>
          </div>
          {quiz.questions.map((question, index) => <QuizQuestion question={question} key={question.id} locale={copy.locale}
            answer={answers[question.id] ?? emptyAnswer(question.id)} number={number.format(index + 1)} disabled={pending}
            change={answer => setAnswers(current => ({ ...current, [question.id]: answer }))} />)}
          {error && <StatePanel kind="error" title={t(error)}>
            {(error === 'staleQuiz' || error === 'unavailable') && <Button variant="secondary" onClick={reload}>{t('refreshQuiz')}</Button>}
          </StatePanel>}
          <Button type="submit" disabled={pending || error === 'staleQuiz' || error === 'unavailable'}>
            <CheckCircle2 size={18} aria-hidden="true" />{t(pending ? 'submitting' : 'submit')}
          </Button>
        </form>}
    <Recommendations kind="quiz" id={quiz.id} language={copy.locale} />
  </>;
}

export function QuizDetail() {
  const { slug = '' } = useParams();
  const { t } = useTranslation(ns);
  const load = useCallback((signal: AbortSignal) => getPublishedQuiz(slug, signal), [slug]);
  const { result, reload } = useEducationData(load);
  return <div className="learn-page quiz-page">
    <BackLink to="/quizzes">{t('back')}</BackLink>
    {result.status === 'ready' ? <QuizAttempt key={result.data.slug + ':' + result.data.version} quiz={result.data} reload={reload} />
      : <QuizState error={result.status === 'error' ? result.error : undefined} retry={reload} />}
  </div>;
}
