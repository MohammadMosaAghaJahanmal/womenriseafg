import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from '../../components/ui/Primitives';
import { useDataSaving, type DataSavingPreference as Preference } from './preferences';
import { dataSavingNamespace } from './strings';

export function DataSavingPreference() {
  const { t } = useTranslation(dataSavingNamespace);
  const { enabled, preference, setPreference } = useDataSaving();
  const [unavailable, setUnavailable] = useState(false);

  return <section className="workspace-panel workspace-options auth-settings" aria-labelledby="data-saving-title">
    <h2 id="data-saving-title">{t('title')}</h2>
    <p>{t('description')}</p>
    <SelectField label={t('setting')} value={preference} onChange={event => {
      setUnavailable(!setPreference(event.target.value as Preference));
    }}>
      {(['auto', 'on', 'off'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}
    </SelectField>
    <p role="status">{t(enabled ? 'enabled' : 'disabled')}</p>
    {unavailable && <p role="alert">{t('notSaved')}</p>}
  </section>;
}
