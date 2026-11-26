import { useCallback, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, DialogClose, InputField, Pagination, PanelDialog, StatePanel } from '../../../components/ui/Primitives';
import { preferredName, type EducationRecord } from '../../education/api';
import { useEducationData } from '../../education/useEducationData';
import type { MediaKind } from '../../media/api';
import { getCourse, getCourseAsset, listCourseAssets, listCourses, preferredTitle, type Page } from './api';

interface Choice {
  id: string;
  title: string;
  locale?: string | null;
  description?: string;
}
type LoadChoices = (q: string, page: number, signal: AbortSignal) => Promise<Page<Choice>>;
type LoadChoice = (id: string, signal: AbortSignal) => Promise<Choice | null>;
const pageSize = 10;

export function CoursePager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { t, i18n } = useTranslation('courseAdmin');
  const number = new Intl.NumberFormat(i18n.language);
  return <Pagination page={page} pages={pages} onChange={onChange}
    pageLabel={t('page', { page: number.format(page), pages: number.format(pages) })}
    previous={t('previous')} next={t('next')} label={t('pages')} />;
}

function ChoiceResults({ load, select, exclude }: {
  load: LoadChoices;
  select: (choice: Choice) => void;
  exclude: readonly string[];
}) {
  const { t } = useTranslation('courseAdmin');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ q: '', page: 1 });
  const { result, reload } = useEducationData(useCallback(signal => load(query.q, query.page, signal), [load, query]));
  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setQuery({ q: search.trim(), page: 1 });
  }
  const choices = result.status === 'ready' ? result.data.items.filter(item => !exclude.includes(item.id)) : [];
  return <>
    <form className="course-search" onSubmit={submit} role="search">
      <InputField autoComplete="off" type="search" label={t('searchAction')} value={search} maxLength={120} onChange={event => setSearch(event.target.value)} />
      <Button type="submit" variant="secondary">{t('searchAction')}</Button>
    </form>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('optionsLoading')} />}
    {result.status === 'error' && <StatePanel kind="error" title={t('optionsError')}><Button variant="secondary" onClick={reload}>{t('retry')}</Button></StatePanel>}
    {result.status === 'ready' && <>
      {choices.length ? <ul className="course-pick-list">{choices.map(choice => <li key={choice.id}>
        <DialogClose asChild>
          <Button variant="ghost" onClick={() => select(choice)}>
            <span lang={choice.locale ?? undefined} dir="auto">{choice.title}</span>
            {choice.description && <small dir="auto">{choice.description}</small>}
          </Button>
        </DialogClose>
      </li>)}</ul> : <StatePanel kind="empty" title={t('pickerEmpty')} />}
      {result.data.total > result.data.pageSize && <CoursePager page={result.data.page} pages={Math.ceil(result.data.total / result.data.pageSize)}
        onChange={page => setQuery(current => ({ ...current, page }))} />}
    </>}
  </>;
}

function ChoicePicker({ label, load, select, exclude, add = false }: {
  label: string;
  load: LoadChoices;
  select: (choice: Choice) => void;
  exclude: readonly string[];
  add?: boolean;
}) {
  const { t } = useTranslation('courseAdmin');
  return <PanelDialog title={label} closeLabel={t('close')}
    trigger={<Button variant="secondary" className="course-picker-trigger">{add && <Plus size={17} aria-hidden="true" />}{label}</Button>}>
    <ChoiceResults load={load} select={select} exclude={exclude} />
  </PanelDialog>;
}

function SelectedChoice({ id, load, choice, onRemove }: { id: string; load: LoadChoice; choice?: Choice; onRemove?: () => void }) {
  const { t } = useTranslation('courseAdmin');
  const { result } = useEducationData(useCallback(signal => choice ? Promise.resolve(choice) : load(id, signal), [choice, id, load]));
  const selection = choice ?? (result.status === 'ready' ? result.data : null);
  const label = selection?.title ?? (result.status === 'loading' ? t('loadingSelection') : t('unavailableSelection'));
  return <span className="course-selection">
    <bdi lang={selection?.locale ?? undefined}>{label}</bdi>
    {onRemove && <Button variant="ghost" className="ui-icon-btn" title={t('clearValue')} aria-label={t('removeNamed', { name: label })} onClick={onRemove}><X size={16} aria-hidden="true" /></Button>}
  </span>;
}

const loadAsset: LoadChoice = async (id, signal) => {
  const media = await getCourseAsset(id, signal);
  return media ? { ...media, locale: media.language } : null;
};
export function AssetSelection({ label, picker, kind, value, onChange, disabled }: {
  label: string;
  picker: string;
  kind?: MediaKind;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('courseAdmin');
  const [picked, setPicked] = useState<Choice>();
  const list = useCallback<LoadChoices>(async (q, page, signal) => {
    const result = await listCourseAssets({ q, kind, page, pageSize }, signal);
    return { ...result, items: result.items.map(asset => ({ ...asset, locale: asset.language, description: asset.originalName })) };
  }, [kind]);
  return <div className="course-choice" role="group" aria-label={label}>
    <span className="course-label">{label}</span>
    {value ? <SelectedChoice id={value} load={loadAsset} choice={picked?.id === value ? picked : undefined}
      onRemove={disabled ? undefined : () => onChange(null)} /> : disabled ? <small>{t('none')}</small> : null}
    {!disabled && <ChoicePicker label={picker} load={list} select={choice => { setPicked(choice); onChange(choice.id); }} exclude={value ? [value] : []} />}
  </div>;
}

export function RelatedSelection({ courseId, values, onChange, disabled }: {
  courseId?: string;
  values: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation('courseAdmin');
  const [picked, setPicked] = useState<Record<string, Choice>>({});
  const locale = i18n.language;
  const list = useCallback<LoadChoices>(async (q, page, signal) => {
    const result = await listCourses({ q, page, pageSize, status: 'published' }, signal);
    return { ...result, items: result.items.map(course => {
      const translation = preferredTitle(course.translations, locale);
      return { id: course.id, title: translation?.title ?? course.slug, locale: translation?.locale, description: course.slug };
    }) };
  }, [locale]);
  const load = useCallback<LoadChoice>(async (id, signal) => {
    const course = await getCourse(id, signal);
    const translation = preferredTitle(course.translations, locale);
    return { id, title: translation?.title ?? course.slug, locale: translation?.locale };
  }, [locale]);
  return <div className="course-choice" role="group" aria-label={t('related')}>
    <span className="course-label">{t('related')}</span>
    {values.length ? <ul className="course-selections">{values.map(id => <li key={id}><SelectedChoice id={id} load={load}
      choice={picked[id]} onRemove={disabled ? undefined : () => onChange(values.filter(value => value !== id))} /></li>)}</ul> : disabled ? <small>{t('none')}</small> : null}
    {!disabled && values.length < 8 && <ChoicePicker label={t('relatedSearch')} load={list} exclude={courseId ? [...values, courseId] : values} add
      select={choice => { setPicked(current => ({ ...current, [choice.id]: choice })); onChange([...values, choice.id]); }} />}
  </div>;
}

export function taxonomyName(value: EducationRecord, locale: string) {
  const fallback = value.gradeNumber === undefined ? value.slug : new Intl.NumberFormat(locale).format(value.gradeNumber);
  return preferredName(value, locale)?.name || fallback;
}
