import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from '../../components/ui/Primitives';
import { i18n } from '../../i18n';

const namespace = 'adminPageOrder';
const en = { label: 'Sort this page', recent: 'Default order', ascending: 'Title, ascending', descending: 'Title, descending' };
const ps: typeof en = { label: 'دا مخ ترتیب کړئ', recent: 'اصلي ترتیب', ascending: 'سرلیک، پورته ترتیب', descending: 'سرلیک، ښکته ترتیب' };
const fa: typeof en = { label: 'ترتیب همین صفحه', recent: 'ترتیب پیش‌فرض', ascending: 'عنوان، صعودی', descending: 'عنوان، نزولی' };
for (const [locale, labels] of [['en', en], ['ps', ps], ['fa-AF', fa]] as const) i18n.addResourceBundle(locale, namespace, labels);

export function usePageOrder<T>(records: T[], title: (item: T, locale: string) => string) {
  const { t, i18n } = useTranslation(namespace);
  const [order, setOrder] = useState('recent');
  const compare = new Intl.Collator(i18n.language, { sensitivity: 'base', numeric: true });
  const items = order === 'recent' ? records : [...records].sort((first, second) => {
    const sign = order === 'ascending' ? 1 : -1;
    return sign * compare.compare(title(first, i18n.language), title(second, i18n.language));
  });
  return { items, field: <SelectField label={t('label')} value={order} onChange={event => setOrder(event.currentTarget.value)}>
    {(['recent', 'ascending', 'descending'] as const).map(option => <option key={option} value={option}>{t(option)}</option>)}
  </SelectField> };
}
