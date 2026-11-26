import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SelectField } from '../../components/ui/Primitives';
import { learnerLanguageName } from '../courses/student/components';
import { preferredName, type Kind } from '../education/api';
import { useEducationData } from '../education/useEducationData';
import { publishedTaxonomy } from './api';
import { discoveryNamespace } from './strings';

export function TaxonomyFilter({ kind, label, value, change, disabled }: {
  kind: Kind; label: string; value: string; change: (value: string) => void; disabled?: boolean;
}) {
  const { t, i18n } = useTranslation(discoveryNamespace);
  const load = useCallback((signal: AbortSignal) => publishedTaxonomy(kind, signal), [kind]);
  const { result, reload } = useEducationData(load);
  const language = kind === 'languages';
  const options = result.status === 'ready' ? result.data.map(item => {
    if (language && item.locale) return { value: item.locale, locale: item.locale, name: learnerLanguageName(item.locale) };
    return { ...preferredName(item, i18n.language), value: item.id };
  }) : [];
  return <div className="discovery-field">
    <SelectField label={label} value={value} onChange={event => change(event.target.value)} disabled={disabled || result.status !== 'ready'}>
      <option value="">{t('all')}</option>
      {value && !options.some(option => option.value === value) && <option value={value} lang={language ? value : undefined} dir="auto">
        {language ? learnerLanguageName(value) : label}
      </option>}
      {options.map(option => <option key={option.value} value={option.value} lang={option.locale} dir="auto">
        {option.name}
      </option>)}
    </SelectField>
    {result.status === 'error' && <Button variant="ghost" onClick={reload}>{label} · {t('retry')}</Button>}
  </div>;
}
