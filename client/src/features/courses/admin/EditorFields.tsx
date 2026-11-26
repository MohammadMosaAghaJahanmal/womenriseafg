import { useId, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, InputField, SelectField } from '../../../components/ui/Primitives';
import { languageNames, type Language } from '../../../i18n';
import { localeName, type EducationRecord } from '../../education/api';
import { AssetSelection, RelatedSelection, taxonomyName } from './Choices';
import { type ChapterTranslation, type CourseTaxonomy } from './api';
import { emptyCourseTranslation, type CourseDraft } from './draft';

export function contentLanguageName(locale: string, interfaceLanguage: string) {
  return languageNames[locale as Language] ?? localeName(locale, interfaceLanguage);
}

export function contentDirection(locale: string, records: EducationRecord[]): 'ltr' | 'rtl' {
  const record = records.find(item => item.locale === locale);
  return record?.direction ?? (/^(ar|fa|he|ps|ur|yi)(-|$)/i.test(locale) ? 'rtl' : 'ltr');
}

export function TextArea({ label, value, onChange, locale, direction, maxLength = 2400, rows = 3 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale: string;
  direction: 'ltr' | 'rtl';
  maxLength?: number;
  rows?: number;
}) {
  const id = useId();
  return <label className="ui-field" htmlFor={id}><span>{label}</span>
    <textarea id={id} value={value} onChange={event => onChange(event.target.value)} lang={locale} dir={direction}
      maxLength={maxLength} rows={rows} />
  </label>;
}

export function TranslationFields<T extends ChapterTranslation>({ records, values, onChange, blank, titleLabel, render, disabled }: {
  records: EducationRecord[];
  values: T[];
  onChange: (values: T[]) => void;
  blank: (locale: string) => T;
  titleLabel: string;
  render?: (value: T, direction: 'ltr' | 'rtl', patch: (value: Partial<T>) => void) => ReactNode;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation('courseAdmin');
  const [newLocale, setNewLocale] = useState('');
  const languages = records.flatMap(record =>
    record.locale && !values.some(value => value.locale === record.locale) ? [record.locale] : []);
  function patch(locale: string, value: Partial<T>) {
    onChange(values.map(item => item.locale === locale ? { ...item, ...value } : item));
  }
  return <div className="course-translations">
    {values.map(value => {
      const direction = contentDirection(value.locale, records);
      const name = contentLanguageName(value.locale, i18n.language);
      return <fieldset className="course-translation" key={value.locale} disabled={disabled}>
        <legend><bdi lang={value.locale}>{name}</bdi></legend>
        <InputField label={titleLabel} value={value.title} maxLength={150} lang={value.locale} dir={direction} autoComplete="off" aria-required
          onChange={event => onChange(values.map(item => item.locale === value.locale ? { ...item, title: event.target.value } : item))} />
        {render?.(value, direction, next => patch(value.locale, next))}
        {!disabled && values.length > 1 && <Button variant="ghost" className="course-remove" aria-label={t('removeNamed', { name })}
          onClick={() => onChange(values.filter(item => item.locale !== value.locale))}><X size={17} aria-hidden="true" />{t('remove')}</Button>}
      </fieldset>;
    })}
    {!disabled && languages.length > 0 && values.length < 12 && <div className="course-inline-fields">
      <SelectField label={t('locale')} value={newLocale} onChange={event => setNewLocale(event.target.value)}>
        <option value="">{t('chooseLanguage')}</option>
        {languages.map(locale => <option key={locale} lang={locale} value={locale}>{contentLanguageName(locale, i18n.language)}</option>)}
      </SelectField>
      <Button variant="secondary" disabled={!newLocale} onClick={() => {
        onChange([...values, blank(newLocale)]);
        setNewLocale('');
      }}><Plus size={17} aria-hidden="true" />{t('addLanguage')}</Button>
    </div>}
  </div>;
}

type DetailsProps = {
  draft: CourseDraft;
  taxonomy: CourseTaxonomy;
  courseId?: string;
  disabled: boolean;
  change: <T extends keyof CourseDraft>(key: T, value: CourseDraft[T]) => void;
};

function TaxonomyField({ label, values, value, onChange }: {
  label: string;
  values: EducationRecord[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t, i18n } = useTranslation('courseAdmin');
  return <SelectField label={label} value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
    <option value="">{t('none')}</option>
    {value && !values.some(item => item.id === value) && <option value={value}>{t('unavailableSelection')}</option>}
    {values.map(item => <option key={item.id} value={item.id}>{taxonomyName(item, i18n.language)}</option>)}
  </SelectField>;
}

function TagsField({ values, selected, change, disabled }: {
  values: EducationRecord[];
  selected: string[];
  change: (values: string[]) => void;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation('courseAdmin');
  const available = values.filter(item => !selected.includes(item.id));
  return <div className="course-choice" role="group" aria-label={t('tags')}>
    <span className="course-label">{t('tags')}</span>
    {selected.length ? <ul className="course-selections">{selected.map(id => {
      const entry = values.find(item => item.id === id);
      const name = entry ? taxonomyName(entry, i18n.language) : t('unavailableSelection');
      return <li className="course-selection" key={id}><bdi>{name}</bdi>
        {!disabled && <Button variant="ghost" className="ui-icon-btn" aria-label={t('removeNamed', { name })}
          onClick={() => change(selected.filter(value => value !== id))}><X aria-hidden="true" size={16} /></Button>}
      </li>;
    })}</ul> : null}
    {!disabled && selected.length < 20 && available.length > 0 && <SelectField value="" label={t('addTag')}
      onChange={event => { if (event.target.value) change([...selected, event.target.value]); }}>
      <option value="">{t('none')}</option>
      {available.map(item => <option key={item.id} value={item.id}>{taxonomyName(item, i18n.language)}</option>)}
    </SelectField>}
    {!selected.length && (disabled || !available.length) && <small>{t('none')}</small>}
  </div>;
}

export function DetailsFields({ draft, taxonomy, courseId, disabled, change }: DetailsProps) {
  const { t } = useTranslation('courseAdmin');
  return <div className="course-editor-grid">
    <fieldset className="course-form-card" disabled={disabled}>
      <legend>{t('details')}</legend>
      <div className="course-fields-grid">
        <InputField label={t('code')} value={draft.slug} maxLength={80} dir="ltr" autoComplete="off" spellCheck={false} aria-required
          onChange={event => change('slug', event.target.value)} />
        <InputField label={t('instructor')} value={draft.instructor} maxLength={150} dir="auto"
          onChange={event => change('instructor', event.target.value)} />
        <TaxonomyField label={t('subject')} values={taxonomy.subjects} value={draft.subjectId} onChange={id => change('subjectId', id)} />
        <TaxonomyField label={t('level')} values={taxonomy.levels} value={draft.levelId} onChange={id => change('levelId', id)} />
        <TaxonomyField label={t('grade')} values={taxonomy.grades} value={draft.gradeId} onChange={id => change('gradeId', id)} />
        <InputField label={t('minutes')} value={draft.estimatedMinutes} type="number" min={1} max={14400} step={1} inputMode="numeric"
          onChange={event => change('estimatedMinutes', event.target.value)} />
      </div>
      <small>{t('codeHint')}</small>
      <AssetSelection label={t('thumbnail')} picker={t('thumbnailSearch')} kind="image" value={draft.thumbnailId} disabled={disabled}
        onChange={id => change('thumbnailId', id)} />
      <TagsField values={taxonomy.tags} selected={draft.tagIds} change={ids => change('tagIds', ids)} disabled={disabled} />
      <RelatedSelection courseId={courseId} values={draft.relatedCourseIds} onChange={ids => change('relatedCourseIds', ids)} disabled={disabled} />
    </fieldset>
    <fieldset className="course-form-card" disabled={disabled}>
      <legend>{t('translation')}</legend>
      <TranslationFields records={taxonomy.languages} values={draft.translations} onChange={values => change('translations', values)}
        blank={emptyCourseTranslation} titleLabel={t('titleField')} disabled={disabled} render={(translation, direction, patch) => <>
          <TextArea label={t('description')} value={translation.description} onChange={description => patch({ description })} locale={translation.locale} direction={direction} />
          <TextArea label={t('objectives')} value={translation.objectives} onChange={objectives => patch({ objectives })} locale={translation.locale} direction={direction} />
          <TextArea label={t('prerequisites')} value={translation.prerequisites} onChange={prerequisites => patch({ prerequisites })} locale={translation.locale} direction={direction} />
        </>} />
    </fieldset>
  </div>;
}
