import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, InputField, SelectField, StatePanel } from '../../components/ui/Primitives';
import { chooseTranslation } from '../courses/student/components';
import { statuses, type Status } from '../education/api';
import { useEducationData } from '../education/useEducationData';
import { questionChoice, QuizPager, QuizStatus } from './AdminFields';
import { listAdminQuizzes, listBankQuestions, questionBankPath, questionKinds, questionLabels, quizAdminPath, type QuestionKind } from './api';
import { QuestionEditor } from './QuestionEditor';
import { QuizEditor } from './QuizEditor';
import { quizNamespace as ns } from './strings';
import './quiz.css';

function QuizList({ bank }: { bank: boolean }) {
  const { t, i18n } = useTranslation(ns);
  const [{ q, page, filter }, setQuery] = useState({ q: '', page: 1, filter: '' });
  const load = useCallback(async (signal: AbortSignal) => {
    const options = { q, page, pageSize: 12 };
    if (bank) {
      const data = await listBankQuestions({ ...options, kind: filter as QuestionKind || undefined }, signal);
      return { ...data, items: data.items.map(item => ({
        ...questionChoice(item, i18n.language), description: t(questionLabels[item.kind]), status: undefined,
      })) };
    }
    const data = await listAdminQuizzes({ ...options, status: filter as Status || undefined }, signal);
    return { ...data, items: data.items.map(item => ({ id: item.id, status: item.status,
      ...chooseTranslation(item.translations, i18n.language) })) };
  }, [bank, q, page, filter, i18n.language, t]);
  const { result, reload } = useEducationData(load);
  const base = bank ? questionBankPath : quizAdminPath;
  return <section className="quiz-admin">
    <h1>{t(bank ? 'bank' : 'adminTitle')}</h1>
    <div className="learning-actions">
      <Button asChild><Link to={base + '/new'}>{t(bank ? 'addQuestion' : 'addQuiz')}</Link></Button>
      <Button asChild variant="secondary"><Link to={bank ? quizAdminPath : questionBankPath}>{t(bank ? 'quizzes' : 'bank')}</Link></Button>
    </div>
    <form className="course-search" role="search" onSubmit={event => {
      event.preventDefault();
      setQuery({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim(), page: 1, filter });
    }}>
      <InputField name="q" type="search" label={t(bank ? 'searchQuestions' : 'search')} maxLength={120} />
      <SelectField label={t(bank ? 'type' : 'status')} value={filter} onChange={event => setQuery({ q, page: 1, filter: event.target.value })}>
        <option value="">{t(bank ? 'allTypes' : 'allStatuses')}</option>
        {bank ? questionKinds.map(kind => <option key={kind} value={kind}>{t(questionLabels[kind])}</option>)
          : statuses.map(status => <option key={status} value={status}>{t(status)}</option>)}
      </SelectField>
      <Button type="submit" variant="secondary">{t('searchAction')}</Button>
    </form>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('waiting')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('loadFailed')}><Button onClick={reload}>{t('retry')}</Button></StatePanel>}
    {result.status === 'ready' && <>
      {result.data.items.length ? <ul className="learning-resource-list">{result.data.items.map(item => <li key={item.id}>
        <Link to={base + '/' + item.id}><span><bdi lang={item.locale}>{item.title}</bdi>
          {item.description && <small dir="auto">{item.description}</small>}</span></Link>
        {item.status && <QuizStatus status={item.status} />}
      </li>)}</ul> : <StatePanel kind="empty" title={t(bank ? 'noQuestions' : 'noMatches')} />}
      {result.data.total > result.data.pageSize && <QuizPager page={page} pages={Math.ceil(result.data.total / result.data.pageSize)}
        change={next => setQuery({ q, filter, page: next })} />}
    </>}
  </section>;
}

export function AdminQuizzes({ route }: { route: string }) {
  const { t } = useTranslation(ns);
  if (route === quizAdminPath || route === questionBankPath) return <QuizList key={route} bank={route === questionBankPath} />;
  const bank = route.startsWith(questionBankPath + '/');
  const id = route.slice((bank ? questionBankPath : quizAdminPath).length + 1);
  if (id !== 'new' && !/^[a-f0-9-]{36}$/i.test(id)) return <StatePanel kind="error" title={t('unavailable')} />;
  if (bank) return <QuestionEditor key={route} id={id === 'new' ? undefined : id} />;
  return <QuizEditor key={route} id={id === 'new' ? undefined : id} />;
}
