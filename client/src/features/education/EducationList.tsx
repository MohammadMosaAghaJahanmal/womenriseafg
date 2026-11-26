import { Plus } from 'lucide-react';
import { useCallback, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button, Card, InputField, Pagination, SelectField, StatePanel } from '../../components/ui/Primitives';
import { educationError, educationPath, listEducation, localeName, preferredName, statuses, type EducationRecord, type Kind, type Status } from './api';
import { EducationHeading, EducationNavigation } from './EducationIndex';
import { useEducationData } from './useEducationData';

export function EducationStatus({ status }: { status: Status }) {
  const { t } = useTranslation('education');
  return <span className={'education-status education-status-' + status}>{t('status-' + status)}</span>;
}

function RecordName({ record }: { record: EducationRecord }) {
  const { t, i18n } = useTranslation('education');
  const translation = preferredName(record, i18n.language);
  if (!translation) return <bdi dir="ltr">{record.slug}</bdi>;
  return <span className="education-name">
    <bdi lang={translation.locale}>{translation.name}</bdi>
    {translation.locale !== i18n.language && <small>{t('readLanguage', { language: localeName(translation.locale, i18n.language) })}</small>}
  </span>;
}

function RecordCode({ kind, record }: { kind: Kind; record: EducationRecord }) {
  const { i18n, t } = useTranslation('education');
  return <span className="education-code">
    <bdi dir="ltr">{record.slug}</bdi>
    {kind === 'languages' && record.locale && <small><bdi dir="ltr">{record.locale}</bdi> · {t(record.direction ?? 'ltr')}</small>}
    {kind === 'grades' && record.gradeNumber && <small>{t('gradeNumber')} {new Intl.NumberFormat(i18n.language).format(record.gradeNumber)}</small>}
  </span>;
}

function RecordTranslations({ record }: { record: EducationRecord }) {
  const { t, i18n } = useTranslation('education');
  return record.translations.length
    ? <span className="education-locales">{record.translations.map(item =>
      <bdi dir="ltr" key={item.locale} aria-label={localeName(item.locale, i18n.language)}>{item.locale}</bdi>,
    )}</span>
    : <span>{t('noTranslations')}</span>;
}

function RowAction({ kind, record }: { kind: Kind; record: EducationRecord }) {
  const { t, i18n } = useTranslation('education');
  const { search } = useLocation();
  const label = preferredName(record, i18n.language)?.name ?? record.slug;
  return <Button asChild variant="ghost" className="education-edit-link">
    <Link to={educationPath(kind) + '/' + record.id + '/edit' + search} aria-label={t('editName', { label })}>{t('edit')}</Link>
  </Button>;
}

function EducationTable({ kind, records }: { kind: Kind; records: EducationRecord[] }) {
  const { t } = useTranslation('education');
  return <>
    <table className="education-table">
      <caption className="admin-sr">{t(kind)}</caption>
      <thead><tr>
        <th scope="col">{t('name')}</th><th scope="col">{t('slug')}</th><th scope="col">{t('status')}</th>
        <th scope="col">{t('translations')}</th><th scope="col">{t('actions')}</th>
      </tr></thead>
      <tbody>{records.map(record => <tr key={record.id}>
        <th scope="row"><RecordName record={record} /></th>
        <td><RecordCode kind={kind} record={record} /></td>
        <td><EducationStatus status={record.status} /></td>
        <td><RecordTranslations record={record} /></td>
        <td><RowAction kind={kind} record={record} /></td>
      </tr>)}</tbody>
    </table>
    <ul className="education-rows" aria-label={t(kind)}>
      {records.map(record => <li className="education-mobile-record" key={record.id}>
        <RecordName record={record} />
        <dl>
          <div><dt>{t('slug')}</dt><dd><RecordCode kind={kind} record={record} /></dd></div>
          <div><dt>{t('status')}</dt><dd><EducationStatus status={record.status} /></dd></div>
          <div><dt>{t('translations')}</dt><dd><RecordTranslations record={record} /></dd></div>
        </dl>
        <RowAction kind={kind} record={record} />
      </li>)}
    </ul>
  </>;
}

export function EducationList({ kind }: { kind: Kind }) {
  const { t, i18n } = useTranslation('education');
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').slice(0, 120);
  const status = statuses.find(value => value === params.get('status'));
  const pageInput = Number(params.get('page')) || 1;
  const page = Number.isSafeInteger(pageInput) ? Math.max(1, Math.min(pageInput, 10000)) : 1;
  const load = useCallback((signal: AbortSignal) => listEducation(kind, { q: query || undefined, status, page, pageSize: 10 }, signal), [kind, query, status, page]);
  const { result, reload } = useEducationData(load);
  const pages = result.status === 'ready' ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;
  useEffect(() => {
    if (result.status === 'ready' && page > pages) {
      setParams(previous => {
        const next = new URLSearchParams(previous);
        next.set('page', String(pages));
        return next;
      }, { replace: true });
    }
  }, [page, pages, result.status, setParams]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const term = String(fields.get('q') ?? '').trim();
    if (term) next.set('q', term);
    const selection = String(fields.get('status') ?? '');
    if (selection) next.set('status', selection);
    setParams(next);
  }

  function selectPage(value: number) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value > 1) next.set('page', String(value));
      else next.delete('page');
      return next;
    });
  }

  const numeric = new Intl.NumberFormat(i18n.language);
  const matches = query || status;
  const message = (location.state as { message?: string } | null)?.message;
  return <div className="education-module">
    <EducationHeading kind={kind} title={t(kind)} details={t(kind + 'Hint')}>
      <Button asChild><Link to={educationPath(kind) + '/new' + location.search}><Plus size={19} aria-hidden="true" />{t('add')}</Link></Button>
    </EducationHeading>
    <EducationNavigation />
    {message === 'removed' && <p className="education-success" role="status">{t('removed')}</p>}
    <Card className="education-list">
      <form className="education-filters" onSubmit={search} key={query + ':' + (status ?? '')}>
        <InputField label={t('search')} name="q" type="search" placeholder={t('searchPlaceholder')} maxLength={120} defaultValue={query} dir="auto" />
        <SelectField label={t('status')} name="status" defaultValue={status ?? ''}>
          <option value="">{t('allStatuses')}</option>
          {statuses.map(value => <option value={value} key={value}>{t('status-' + value)}</option>)}
        </SelectField>
        <div className="education-filter-actions">
          <Button type="submit" variant="secondary">{t('searchButton')}</Button>
          {matches && <Button variant="ghost" type="reset" onClick={() => setParams({})}>{t('clear')}</Button>}
        </div>
      </form>
      <div aria-busy={result.status === 'loading'}>
        {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
        {result.status === 'error' && <StatePanel kind="error" title={t(educationError(result.error, 'loadError'))}>
          <Button variant="secondary" onClick={reload}>{t('retry')}</Button>
        </StatePanel>}
        {result.status === 'ready' && (result.data.items.length > 0 ? <>
          <p className="education-results" role="status">{t('resultCount', { amount: numeric.format(result.data.total) })}</p>
          <EducationTable kind={kind} records={result.data.items} />
          <Pagination page={page} pages={pages} label={t('pagination')} previous={t('previous')} next={t('next')}
            pageLabel={t('page', { page: numeric.format(page), pages: numeric.format(pages) })} onChange={selectPage} />
        </> : <StatePanel kind="empty" title={t(matches ? 'noResults' : 'empty')} description={t(matches ? 'filterHint' : 'emptyHint')} />)}
      </div>
    </Card>
  </div>;
}
