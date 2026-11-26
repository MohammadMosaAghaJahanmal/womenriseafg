import { useCallback, type FormEvent } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button, InputField, Pagination, SelectField, StatePanel } from '../../../components/ui/Primitives';
import { preferredName } from '../../education/api';
import { useEducationData } from '../../education/useEducationData';
import { listCourses, loadCourseFacets } from './api';
import { contentLocale, CourseCard, LearnerState, learnerLanguageName, localizedNumber } from './components';
import { courseNamespace } from './strings';

export default function CourseCatalog() {
  const { t, i18n } = useTranslation(courseNamespace);
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim().slice(0, 120) ?? '';
  const language = contentLocale(params.get('language')) ?? '';
  const subjectId = params.get('subjectId') ?? '';
  const levelId = params.get('levelId') ?? '';
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1));
  const load = useCallback((signal: AbortSignal) => listCourses({ q, language, subjectId, levelId, page }, signal),
    [q, language, subjectId, levelId, page]);
  const { result, reload } = useEducationData(load);
  const { result: facets, reload: reloadFacets } = useEducationData(loadCourseFacets);
  const subjects = facets.status === 'ready' ? facets.data.subjects : [];
  const levels = facets.status === 'ready' ? facets.data.levels : [];
  const languages = facets.status === 'ready' ? facets.data.languages : [];
  const locales = [...new Set([...(language ? [language] : []), ...languages.flatMap(item => item.locale ? [item.locale] : [])])];
  const filtered = Boolean(q || language || subjectId || levelId);
  const number = (value: number) => localizedNumber(value, i18n.language);

  function updateFilter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    setParams(next);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('q');
    updateFilter('q', String(value ?? '').trim());
  }

  function changePage(value: number) {
    const next = new URLSearchParams(params);
    if (value > 1) next.set('page', String(value));
    else next.delete('page');
    setParams(next);
  }

  return <div className="learn-page learn-catalog">
    <header className="learn-banner">
      <div><h1>{t('catalog')}</h1><p>{t('catalogIntro')}</p></div>
      <span className="learn-banner-icon" aria-hidden="true"><BookOpen size={54} strokeWidth={1.3} /></span>
    </header>
    <div className="learn-filters">
      <form className="learn-search" role="search" aria-label={t('search')} onSubmit={search}>
        <InputField key={q} type="search" name="q" dir="auto" label={t('search')} maxLength={120} placeholder={t('searchHint')} defaultValue={q} />
        <Button type="submit" variant="secondary" aria-label={t('search')} title={t('search')}><Search size={18} aria-hidden="true" /></Button>
      </form>
      <SelectField label={t('contentLanguage')} value={language} onChange={event => updateFilter('language', event.target.value)}>
        <option value="">{t('anyLanguage')}</option>
        {locales.map(locale => <option key={locale} lang={locale} dir="auto" value={locale}>{learnerLanguageName(locale)}</option>)}
      </SelectField>
      <SelectField label={t('subject')} value={subjectId} disabled={!subjects.length && !subjectId}
        onChange={event => updateFilter('subjectId', event.target.value)}>
        <option value="">{t('anySubject')}</option>
        {subjectId && !subjects.some(item => item.id === subjectId) && <option value={subjectId}>{t('subject')}</option>}
        {subjects.map(item => {
          const title = preferredName(item, i18n.language);
          return <option key={item.id} lang={title.locale} dir="auto" value={item.id}>{title.name}</option>;
        })}
      </SelectField>
      <SelectField label={t('level')} value={levelId} disabled={!levels.length && !levelId}
        onChange={event => updateFilter('levelId', event.target.value)}>
        <option value="">{t('anyLevel')}</option>
        {levelId && !levels.some(item => item.id === levelId) && <option value={levelId}>{t('level')}</option>}
        {levels.map(item => {
          const title = preferredName(item, i18n.language);
          return <option key={item.id} lang={title.locale} dir="auto" value={item.id}>{title.name}</option>;
        })}
      </SelectField>
      {filtered && <Button variant="ghost" onClick={() => setParams(new URLSearchParams())}>{t('reset')}</Button>}
    </div>
    {facets.status === 'error' && <p className="learn-facet-error" role="status">{t('facetError')} <button type="button" onClick={reloadFacets}>{t('retry')}</button></p>}
    {result.status !== 'ready' ? <LearnerState state={result.status} retry={reload} /> :
      <section className="learn-results" aria-label={t('catalog')}>
        <h2 className="learn-result-count" aria-live="polite">{t('count', { count: result.data.total, number: number(result.data.total) })}</h2>
        {result.data.items.length ? <div className="learn-grid">
          {result.data.items.map(course => <CourseCard key={course.id} course={course} language={language || undefined} subjects={subjects} levels={levels} />)}
        </div> : <StatePanel kind="empty" title={t(filtered || result.data.total ? 'noMatches' : 'noCourses')}>
          {filtered && <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>{t('reset')}</Button>}
          {result.data.total > 0 && !filtered && <Button variant="secondary" onClick={() => changePage(1)}>{t('backToCourses')}</Button>}
        </StatePanel>}
        {result.data.total > result.data.pageSize && <Pagination page={result.data.page}
          pages={Math.ceil(result.data.total / result.data.pageSize)}
          pageLabel={t('page', { page: number(result.data.page), pages: number(Math.ceil(result.data.total / result.data.pageSize)) })}
          previous={t('previousPage')} next={t('nextPage')} label={t('pagination')} onChange={changePage} />}
      </section>}
  </div>;
}
