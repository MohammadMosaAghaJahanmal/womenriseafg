import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, DialogClose, InputField, Pagination, PanelDialog, StatePanel } from '../../components/ui/Primitives';
import { chooseTranslation } from '../courses/student/components';
import { type EducationRecord, type Status } from '../education/api';
import { useEducationData } from '../education/useEducationData';
import { type Page, type QuestionKind } from './api';
import { quizNamespace as ns } from './strings';

export function defaultQuizLocale(languages: EducationRecord[], preferred: string) {
  return languages.find(item => item.locale === preferred)?.locale ??
    languages.find(item => item.locale === 'en')?.locale ?? languages[0]?.locale ?? 'en';
}

export function QuizStatus({ status }: { status: Status }) {
  const { t } = useTranslation(ns);
  return <Badge>{t(status)}</Badge>;
}

export function QuizPager({ page, pages, change }: { page: number; pages: number; change: (page: number) => void }) {
  const { t, i18n } = useTranslation(ns);
  const number = new Intl.NumberFormat(i18n.language);
  return <Pagination page={page} pages={pages}
    pageLabel={t('page', { page: number.format(page), total: number.format(pages) })}
    previous={t('prev')} next={t('next')} label={t('pages')} onChange={change} />;
}

export function ConfirmQuizAction({ label, title, description, disabled, children, onConfirm, variant = 'secondary' }: {
  label: string; title: string; description?: string; disabled?: boolean;
  children?: ReactNode; onConfirm: () => void; variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { t } = useTranslation(ns);
  return <PanelDialog title={title} description={description} closeLabel={t('close')}
    trigger={<Button variant={variant} disabled={disabled}>{label}</Button>}>
    {children}
    <div className="admin-dialog-actions">
      <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
      <DialogClose asChild><Button onClick={onConfirm}>{t('confirm')}</Button></DialogClose>
    </div>
  </PanelDialog>;
}

export interface QuizChoice { id: string; title: string; locale?: string; description?: string }
type LoadChoices = (q: string, page: number, signal: AbortSignal) => Promise<Page<QuizChoice>>;

function PickerItems({ searchLabel, noMatches, load, onSelect, excluded }: {
  searchLabel: string; noMatches: string; load: LoadChoices; onSelect: (item: QuizChoice) => void; excluded: readonly string[];
}) {
  const { t } = useTranslation(ns);
  const [{ q, page }, setQuery] = useState({ q: '', page: 1 });
  const results = useCallback((signal: AbortSignal) => load(q, page, signal), [load, q, page]);
  const { result, reload } = useEducationData(results);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setQuery({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim(), page: 1 });
  }

  return <>
    <form className="course-search" role="search" onSubmit={search}>
      <InputField type="search" label={searchLabel} name="q" maxLength={120} defaultValue={q} />
      <Button type="submit" variant="secondary"><Search size={16} aria-hidden="true" />{t('searchAction')}</Button>
    </form>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('waiting')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('loadFailed')}>
      <Button onClick={reload} variant="secondary">{t('retry')}</Button>
    </StatePanel>}
    {result.status === 'ready' && <>
      {result.data.items.some(item => !excluded.includes(item.id))
        ? <ul className="course-pick-list">{result.data.items.filter(item => !excluded.includes(item.id)).map(item => <li key={item.id}>
          <DialogClose asChild><Button onClick={() => onSelect(item)} variant="ghost">
            <bdi lang={item.locale}>{item.title}</bdi>
            {item.description && <small>{item.description}</small>}
          </Button></DialogClose>
        </li>)}</ul>
        : <StatePanel kind="empty" title={noMatches}>
          {page > 1 && <Button variant="secondary" onClick={() => setQuery({ q, page: 1 })}>{t('prev')}</Button>}
        </StatePanel>}
      {result.data.total > result.data.pageSize && <QuizPager page={page} pages={Math.ceil(result.data.total / result.data.pageSize)}
        change={next => setQuery({ q, page: next })} />}
    </>}
  </>;
}

export function QuizPicker({ label, searchLabel, noMatches, load, select, excluded = [], disabled }: {
  label: string; searchLabel: string; noMatches: string; load: LoadChoices; select: (item: QuizChoice) => void;
  excluded?: readonly string[]; disabled?: boolean;
}) {
  const { t } = useTranslation(ns);
  return <PanelDialog title={label} closeLabel={t('close')} trigger={<Button variant="secondary" disabled={disabled}>
    <Plus size={17} aria-hidden="true" />{label}
  </Button>}>
    <PickerItems searchLabel={searchLabel} noMatches={noMatches} load={load} onSelect={select} excluded={excluded} />
  </PanelDialog>;
}

export function questionChoice(question: { id: string; kind: QuestionKind; translations: { locale: string; prompt: string }[] }, locale: string): QuizChoice {
  const copy = chooseTranslation(question.translations, locale);
  return { id: question.id, title: copy.prompt, locale: copy.locale };
}

export function useQuizUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
