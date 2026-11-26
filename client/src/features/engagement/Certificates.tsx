import axios, { isAxiosError } from 'axios';
import { Award, Printer } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button, InputField, SelectField, StatePanel } from '../../components/ui/Primitives';
import { findCourse } from '../courses/student/api';
import { BackLink, chooseTranslation, coursePath, useContentLanguage } from '../courses/student/components';
import { useEducationData } from '../education/useEducationData';
import { courseCompletion, useLearning } from './local';
import { LearningPreference } from './Preference';
import { learningNamespace } from './strings';
import './certificate.css';

interface Certificate {
  code: string;
  courseSlug: string;
  courseTitle: string;
  locale: string;
  issuedAt: string;
  publicVerification: boolean;
}

const api = axios.create({ baseURL: '/api/v1/certificates', timeout: 12_000 });
const verifyPath = (code: string) => '/certificates/verify/' + encodeURIComponent(code);

function CertificatePaper({ certificate, recipient, template }: {
  certificate: Certificate; recipient: string; template: 'classic' | 'simple';
}) {
  const { t, i18n } = useTranslation(learningNamespace);
  const date = new Intl.DateTimeFormat(i18n.language, { timeZone: 'UTC', dateStyle: 'long' });
  return <article className={'certificate-paper certificate-' + template}>
    <Award size={42} aria-hidden="true" /><bdi className="certificate-brand" lang="en">womenriseafg</bdi>
    <h2>{t('certificateFor')}</h2>
    {recipient.trim() && <p className="certificate-recipient"><bdi>{recipient.trim()}</bdi></p>}
    <p className="certificate-course" lang={certificate.locale} dir="auto">{certificate.courseTitle}</p>
    <p>{t('selfReported')}</p>
    <dl>
      <div><dt>{t('awardDate')}</dt><dd>{date.format(new Date(certificate.issuedAt))}</dd></div>
      <div><dt>{t(certificate.publicVerification ? 'verificationCode' : 'unit')}</dt><dd><bdi>{certificate.code}</bdi></dd></div>
    </dl>
    {certificate.publicVerification && <a href={verifyPath(certificate.code)}>{t('verifyLink')}</a>}
  </article>;
}

export function CourseCertificate() {
  const { t } = useTranslation(learningNamespace);
  const { slug = '' } = useParams();
  const { preferred, explicit } = useContentLanguage();
  const learning = useLearning();
  const load = useCallback((signal: AbortSignal) => findCourse(slug, signal), [slug]);
  const { result, reload } = useEducationData(load);
  const [recipient, setRecipient] = useState('');
  const [template, setTemplate] = useState<'classic' | 'simple'>('classic');
  const [publicVerification, setPublicVerification] = useState(false);
  const [receipt, setReceipt] = useState<Certificate>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const course = result.status === 'ready' ? result.data.course : undefined;
  const translation = course && chooseTranslation(course.translations, preferred);
  const lessons = course?.chapters.flatMap(chapter => chapter.lessons.map(lesson => lesson.id)) ?? [];
  const { count, total } = courseCompletion(lessons, learning.completedLessons);
  const ready = learning.enabled && total > 0 && count === total;
  const current = ready && receipt?.courseSlug === slug ? receipt : undefined;

  async function issue(event: FormEvent) {
    event.preventDefault();
    if (!ready || !course || !translation || pending) return;
    setError('');
    setPending(true);
    try {
      const { data } = await api.post<{ certificate: Certificate }>('', {
        courseSlug: course.slug, completedLessonIds: lessons, locale: translation.locale, publicVerification,
      });
      setReceipt(data.certificate);
    } catch (failure) {
      setError(isAxiosError(failure) && failure.response?.status === 422 ? 'certCurrent' : 'downloadError');
    } finally { setPending(false); }
  }

  return <div className="learn-page learning-workspace certificate-page">
    <div className="certificate-controls"><BackLink to={coursePath(slug, explicit)}>{t('courseBack')}</BackLink>
      <h1>{t('certificateFor')}</h1></div>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('certMissing')}><Button onClick={reload}>{t('retry')}</Button></StatePanel>}
    {course && !ready && <p className="certificate-controls">{t('certificateHelp')}</p>}
    {course && !learning.enabled && <LearningPreference />}
    {ready && <form className="learn-panel certificate-controls certificate-options" onSubmit={issue}>
      <InputField label={t('recipient')} value={recipient} autoComplete="off" maxLength={120}
        onChange={event => setRecipient(event.currentTarget.value)} />
      <SelectField label={t('template')} value={template} onChange={event => setTemplate(event.currentTarget.value as 'classic' | 'simple')}>
        <option value="classic">{t('classic')}</option><option value="simple">{t('simple')}</option>
      </SelectField>
      <label className="certificate-check"><input type="checkbox" checked={publicVerification}
        onChange={event => setPublicVerification(event.currentTarget.checked)} />{t('publicVerification')}</label>
      <p>{t('verificationHelp')}</p>
      {current && current.publicVerification !== publicVerification && <p role="status">{t('certificateUpdated')}</p>}
      <div className="learning-actions">
        <Button type="submit" disabled={pending}>{t(pending ? 'loading' : 'issue')}</Button>
        {current && <Button variant="secondary" onClick={() => window.print()}><Printer size={17} aria-hidden="true" />{t('print')}</Button>}
      </div>
      {error && <p role="alert">{t(error)}</p>}
    </form>}
    {current && <CertificatePaper certificate={current} recipient={recipient} template={template} />}
  </div>;
}

export function VerifyCertificate() {
  const { t } = useTranslation(learningNamespace);
  const { code = '' } = useParams();
  const load = useCallback(async (signal: AbortSignal) =>
    (await api.get<{ certificate: Certificate }>('/' + encodeURIComponent(code), { signal })).data.certificate, [code]);
  const { result, reload } = useEducationData(load);
  return <div className="learn-page learning-workspace certificate-page">
    <div className="certificate-controls"><BackLink to="/courses">{t('explore')}</BackLink><h1>{t('verification')}</h1></div>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('certMissing')}>
      {!isAxiosError(result.error) || ![400, 404].includes(result.error.response?.status ?? 0) ? <Button onClick={reload}>{t('retry')}</Button> : null}
    </StatePanel>}
    {result.status === 'ready' && <>
      <p>{t('verifyStatus')}</p><CertificatePaper certificate={result.data} recipient="" template="simple" />
    </>}
  </div>;
}
