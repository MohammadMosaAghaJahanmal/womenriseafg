import { useTranslation } from 'react-i18next';
import { Button, InputField, SelectField } from '../../components/ui/Primitives';
import { i18n } from '../../i18n';

const namespace = 'editorialProvenance';
const origins = ['human', 'ai-assisted', 'ai-generated'] as const;
export interface PublicProvenance {
  source: string;
  creator: string;
  license: string;
  attribution: string;
  origin: typeof origins[number];
  tool: string;
}

export interface ContentProvenance extends PublicProvenance {
  notes: string;
}

export const blankProvenance: ContentProvenance = {
  source: '', creator: '', license: '', attribution: '', origin: 'human', tool: '', notes: '',
};

const en = {
  rights: 'Source and rights', override: 'Rights for this translation', add: 'Add separate rights',
  remove: 'Use shared rights',
  scope: 'Record the creator, source and license before approval. Add separate rights for a translation or lesson if they differ.',
  source: 'Source', creator: 'Author or creator', license: 'License', attribution: 'Attribution',
  origin: 'How the content was made', human: 'Human-authored', 'ai-assisted': 'AI-assisted', 'ai-generated': 'AI-generated',
  tool: 'AI tool', notes: 'Internal review notes',
};
const ps: typeof en = {
  rights: 'سرچینه او د کارونې حقونه', override: 'د دې ژباړې حقونه', add: 'جلا حقونه ورزیات کړئ',
  remove: 'ګډ حقونه وکاروئ',
  scope: 'له تصویب مخکې لیکوال، سرچینه او جواز ثبت کړئ. که د ژباړې یا درس حقونه توپیر لري، جلا یې ثبت کړئ.',
  source: 'سرچینه', creator: 'لیکوال یا جوړوونکی', license: 'جواز', attribution: 'د سرچینې او لیکوال یادونه',
  origin: 'منځپانګه څنګه جوړه شوې', human: 'د انسان لیکنه', 'ai-assisted': 'د مصنوعي ځیرکتیا په مرسته',
  'ai-generated': 'د مصنوعي ځیرکتیا له خوا جوړه شوې', tool: 'د مصنوعي ځیرکتیا وسیله', notes: 'د کتنې داخلي یادښتونه',
};
const fa: typeof en = {
  rights: 'منبع و حقوق استفاده', override: 'حقوق این ترجمه', add: 'افزودن حقوق جداگانه',
  remove: 'استفاده از حقوق مشترک',
  scope: 'پیش از تأیید، پدیدآورنده، منبع و جواز را ثبت کنید. اگر حقوق ترجمه یا درس متفاوت است، آن را جداگانه ثبت کنید.',
  source: 'منبع', creator: 'نویسنده یا پدیدآورنده', license: 'جواز', attribution: 'ذکر منبع و پدیدآورنده',
  origin: 'روش تهیهٔ محتوا', human: 'نوشتهٔ انسان', 'ai-assisted': 'با کمک هوش مصنوعی',
  'ai-generated': 'تولیدشده با هوش مصنوعی', tool: 'ابزار هوش مصنوعی', notes: 'یادداشت‌های داخلی بازبینی',
};
for (const [locale, messages] of [['en', en], ['ps', ps], ['fa-AF', fa]] as const) {
  i18n.addResourceBundle(locale, namespace, messages);
}

const creditFields = [['source', 500], ['creator', 150], ['license', 150], ['attribution', 500]] as const;

function Fields({ value, onChange }: { value: ContentProvenance; onChange: (value: ContentProvenance) => void }) {
  const { t } = useTranslation(namespace);
  function set<K extends keyof ContentProvenance>(key: K, field: ContentProvenance[K]) {
    onChange({ ...value, [key]: field });
  }
  return <div className="course-fields-grid">
    {creditFields.map(([field, limit]) => <InputField key={field} label={t(field)} dir="auto" value={value[field]} maxLength={limit}
      onChange={event => set(field, event.target.value)} />)}
    <SelectField label={t('origin')} value={value.origin} onChange={event => set('origin', event.target.value as ContentProvenance['origin'])}>
      {origins.map(origin => <option key={origin} value={origin}>{t(origin)}</option>)}
    </SelectField>
    {value.origin !== 'human' && <>
      <InputField label={t('tool')} value={value.tool} maxLength={150} dir="auto" onChange={event => set('tool', event.target.value)} />
      <InputField label={t('notes')} value={value.notes} maxLength={1200} dir="auto" onChange={event => set('notes', event.target.value)} />
    </>}
  </div>;
}

export function RightsFields({ value, onChange, optional = false, disabled = false }: {
  value: ContentProvenance | null | undefined;
  onChange: (value: ContentProvenance | null) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation(namespace);
  if (!optional) return <fieldset className="course-translation" disabled={disabled}>
    <legend>{t('rights')}</legend>
    <small>{t('scope')}</small>
    <Fields value={value ?? blankProvenance} onChange={onChange} />
  </fieldset>;
  return <details className="course-choice">
    <summary>{t('override')}</summary>
    {value ? <>
      <Fields value={value} onChange={onChange} />
      <Button variant="ghost" disabled={disabled} onClick={() => onChange(null)}>{t('remove')}</Button>
    </> : <Button variant="secondary" disabled={disabled} onClick={() => onChange({ ...blankProvenance })}>{t('add')}</Button>}
  </details>;
}

export function ProvenanceNote({ value }: { value?: PublicProvenance | null }) {
  const { t } = useTranslation(namespace);
  if (!value) return null;
  return <details className="learn-panel">
    <summary>{t('rights')}</summary>
    <dl>
      {creditFields.map(([field]) => value[field] && <div key={field}><dt>{t(field)}</dt>
        <dd className="learn-prose" dir="auto">{value[field]}</dd></div>)}
      <div><dt>{t('origin')}</dt><dd>{t(value.origin)}</dd></div>
      {value.tool && value.origin !== 'human' && <div><dt>{t('tool')}</dt><dd className="learn-prose" dir="auto">{value.tool}</dd></div>}
    </dl>
  </details>;
}
