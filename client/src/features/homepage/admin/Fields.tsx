import { ArrowDown, ArrowUp, BookOpen, GripVertical, Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InputField, SelectField } from '../../../components/ui/Primitives';
import { languageNames, languages, type Language } from '../../../i18n';
import { TextArea } from '../../courses/admin/EditorFields';
import { fileUrl } from '../../courses/student/api';
import { QuizPicker } from '../../quizzes/AdminFields';
import {
  searchBrandingImages, searchPublishedChoices, type Announcement, type AnnouncementTranslation, type Branding,
  type HomepageSection, type SectionKey, type SelectedChoice,
} from './api';
import { homepageAdminNamespace as ns } from './strings';

function reorder<T>(items: T[], from: number, to: number) {
  if (to === from || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function MoveButtons({ name, position, count, move }: {
  name: string; position: number; count: number; move: (position: number) => void;
}) {
  const { t } = useTranslation(ns);
  return <>
    <Button variant="ghost" className="ui-icon-btn" aria-label={t('moveUp', { section: name })}
      aria-disabled={position === 0} onClick={() => move(position - 1)}>
      <ArrowUp size={18} aria-hidden="true" />
    </Button>
    <Button variant="ghost" className="ui-icon-btn" aria-label={t('moveDown', { section: name })}
      aria-disabled={position + 1 === count} onClick={() => move(position + 1)}>
      <ArrowDown size={18} aria-hidden="true" />
    </Button>
  </>;
}

export function SectionFields({ values, change, disabled }: {
  values: HomepageSection[]; change: (next: HomepageSection[]) => void; disabled: boolean;
}) {
  const { t, i18n } = useTranslation(ns);
  const [dragging, setDragging] = useState<SectionKey>();
  const [target, setTarget] = useState<SectionKey>();
  const [message, setMessage] = useState('');
  function finish() {
    setDragging(undefined);
    setTarget(undefined);
  }
  function move(from: number, to: number) {
    if (disabled) return;
    const updated = reorder(values, from, to);
    if (updated === values) return;
    change(updated);
    setMessage(t('moved', {
      section: t('sectionNames.' + values[from].key),
      position: new Intl.NumberFormat(i18n.language).format(to + 1),
    }));
  }
  return <div className="homepage-admin-stack">
    <p className="homepage-admin-hint">{t('sectionOrder')}</p>
    <ol className="homepage-admin-list" aria-label={t('sections')}>
      {values.map(({ key, enabled }, index) => {
        const title = t('sectionNames.' + key);
        return <li key={key} data-section={key} data-drag-target={target === key || undefined}
          onDragOver={event => {
            if (disabled || !dragging) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setTarget(key);
          }}
          onDrop={event => {
            if (disabled || !dragging) return;
            event.preventDefault();
            move(values.findIndex(section => section.key === dragging), index);
            finish();
          }}>
          <span className="homepage-admin-grip" draggable={!disabled} aria-hidden="true" onDragStart={event => {
            if (disabled) { event.preventDefault(); return; }
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', key);
            setDragging(key);
          }} onDragEnd={finish}><GripVertical size={19} /></span>
          <label className="homepage-admin-toggle">
            <input type="checkbox" checked={enabled} aria-label={t('showSection', { section: title })}
              onChange={event => change(values.map(section => section.key === key
                ? { ...section, enabled: event.currentTarget.checked } : section))} />
            <span>{title}</span>
          </label>
          <div className="homepage-admin-row-actions">
            <MoveButtons name={title} position={index} count={values.length} move={to => move(index, to)} />
          </div>
        </li>;
      })}
    </ol>
    <span className="admin-sr" role="status">{message}</span>
  </div>;
}

function BrandImage({ value, favicon = false }: { value: string | null; favicon?: boolean }) {
  const [unavailable, setUnavailable] = useState(false);
  if (!favicon && (!value || unavailable)) return <BookOpen size={23} aria-hidden="true" />;
  return <img alt="" src={value && !unavailable ? fileUrl(value) : '/favicon.svg'} onError={() => setUnavailable(true)} />;
}

function BrandingImageField({ asset, value, change }: {
  asset: 'logo' | 'favicon'; value: string | null; change: (value: string | null) => void;
}) {
  const { t } = useTranslation(ns);
  const favicon = asset === 'favicon';
  return <div className="homepage-admin-image-field" role="group" aria-label={t(asset)}>
    <span className="homepage-admin-image"><BrandImage key={value} value={value} favicon={favicon} /></span>
    <div className="homepage-admin-stack">
      <strong>{t(asset)}</strong>
      {!value && <small>{t('defaultImage')}</small>}
      <div className="homepage-admin-actions">
        <QuizPicker label={t(favicon ? 'pickFavicon' : 'pickLogo')} searchLabel={t('search')} noMatches={t('noMatches')}
          load={searchBrandingImages} select={choice => change(choice.id)} excluded={value ? [value] : []} />
        {value && <Button variant="ghost" onClick={() => change(null)}>{t(favicon ? 'removeFavicon' : 'removeLogo')}</Button>}
      </div>
    </div>
  </div>;
}

export function BrandingFields({ value, change }: { value: Branding; change: (value: Branding) => void }) {
  const { t, i18n } = useTranslation(ns);
  const preview = value.translations.find(({ locale }) => locale === i18n.language);
  return <div className="homepage-admin-stack">
    <InputField label={t('platformName')} value={value.name} required maxLength={60} dir="auto"
      onChange={event => change({ ...value, name: event.target.value })} />
    <p className="homepage-admin-hint">{t('brandHelp')}</p>
    <div className="homepage-admin-grid">
      <BrandingImageField asset="logo" value={value.logoId} change={logoId => change({ ...value, logoId })} />
      <BrandingImageField asset="favicon" value={value.faviconId} change={faviconId => change({ ...value, faviconId })} />
    </div>
    <section className="homepage-admin-brand-preview" aria-label={t('previewTitle')}>
      <h2>{t('previewTitle')}</h2>
      <div className="homepage-admin-brand-lockup">
        <span className="homepage-admin-image"><BrandImage key={value.logoId} value={value.logoId} /></span>
        <div>
          <strong dir="auto">{value.name.trim() || 'womenriseafg'}</strong>
          {!!preview?.slogan && <p dir="auto" lang={preview.locale}>{preview.slogan}</p>}
        </div>
      </div>
    </section>
    <div className="homepage-admin-grid">
      {value.translations.map(item => {
        const direction = item.locale === 'en' ? 'ltr' : 'rtl';
        function patch(update: { slogan?: string; mission?: string }) {
          change({ ...value, translations: value.translations.map(copy => copy.locale === item.locale ? { ...copy, ...update } : copy) });
        }
        return <fieldset key={item.locale} className="homepage-admin-translation">
          <legend><bdi lang={item.locale}>{languageNames[item.locale]}</bdi></legend>
          <InputField label={t('slogan')} value={item.slogan} lang={item.locale} dir={direction} maxLength={120}
            onChange={event => patch({ slogan: event.target.value })} />
          <TextArea label={t('mission')} value={item.mission} onChange={mission => patch({ mission })}
            locale={item.locale} direction={direction} maxLength={700} />
        </fieldset>;
      })}
    </div>
  </div>;
}

export function SelectionField({ kind, ids, titles, change, remember }: {
  kind: 'course' | 'book'; ids: string[]; titles: Record<string, SelectedChoice>;
  change: (ids: string[]) => void; remember: (choice: SelectedChoice) => void;
}) {
  const { t } = useTranslation(ns);
  const load = useCallback((q: string, page: number, signal: AbortSignal) => searchPublishedChoices(kind, q, page, signal), [kind]);
  const label = t(kind === 'course' ? 'featured' : 'books');
  return <section className="homepage-admin-stack" aria-label={label}>
    <h2>{label}</h2>
    {ids.length === 0 ? <p className="homepage-admin-hint">{t('nothingSelected')}</p> :
      <ol className="homepage-admin-list homepage-admin-selections" aria-label={label}>{ids.map((id, index) => {
        const title = titles[id]?.title ?? t('unavailableItem', { id: id.slice(0, 8) });
        return <li key={id}>
          <bdi lang={titles[id]?.locale ?? undefined}>{title}</bdi>
          <div className="homepage-admin-row-actions">
            <MoveButtons name={title} position={index} count={ids.length} move={to => change(reorder(ids, index, to))} />
            <Button variant="ghost" className="ui-icon-btn" aria-label={t('removeItem', { title })}
              onClick={() => change(ids.filter(value => value !== id))}><X size={18} aria-hidden="true" /></Button>
          </div>
        </li>;
      })}</ol>}
    {ids.length < 8 && <div className="homepage-admin-actions">
      <QuizPicker label={t(kind === 'course' ? 'addCourse' : 'addBook')} searchLabel={t('search')} noMatches={t('noMatches')}
        load={load} excluded={ids} select={choice => { remember(choice); change([...ids, choice.id]); }} />
    </div>}
  </section>;
}

export function AnnouncementFields({ values, change }: { values: Announcement[]; change: (values: Announcement[]) => void }) {
  const { t, i18n } = useTranslation(ns);
  const preferred = languages.find(locale => locale === i18n.language) ?? 'en';
  const number = new Intl.NumberFormat(i18n.language);
  return <div className="homepage-admin-stack">
    {values.length === 0 && <p className="homepage-admin-hint">{t('noAnnouncements')}</p>}
    {values.map((announcement, index) => {
      const name = t('announcementNumber', { number: number.format(index + 1) });
      function patch(value: Partial<Announcement>) {
        change(values.map((item, position) => position === index ? { ...item, ...value } : item));
      }
      function translation(locale: Language, value: Partial<AnnouncementTranslation>) {
        patch({ translations: announcement.translations.map(item => item.locale === locale ? { ...item, ...value } : item) });
      }
      const available = languages.filter(locale => !announcement.translations.some(item => item.locale === locale));
      return <fieldset key={index} className="homepage-admin-announcement">
        <legend>{name}</legend>
        <div className="homepage-admin-actions">
          <label className="homepage-admin-toggle">
            <input type="checkbox" checked={announcement.enabled} onChange={event => patch({ enabled: event.target.checked })} />
            <span>{t('enabled')}</span>
          </label>
          <Button variant="ghost" onClick={() => change(values.filter((_, position) => index !== position))}>
            <X size={18} aria-hidden="true" />{t('removeAnnouncement', { announcement: name })}
          </Button>
        </div>
        <div className="homepage-admin-grid">
          {announcement.translations.map(copy => {
            const direction = copy.locale === 'en' ? 'ltr' : 'rtl';
            return <fieldset key={copy.locale} className="homepage-admin-translation">
              <legend><bdi lang={copy.locale}>{languageNames[copy.locale]}</bdi></legend>
              <InputField label={t('announcementTitle')} value={copy.title} required lang={copy.locale} dir={direction} maxLength={100}
                onChange={event => translation(copy.locale, { title: event.target.value })} />
              <TextArea label={t('announcementBody')} value={copy.body} onChange={body => translation(copy.locale, { body })}
                locale={copy.locale} direction={direction} maxLength={500} />
              {announcement.translations.length > 1 && <Button variant="ghost" onClick={() => {
                patch({ translations: announcement.translations.filter(item => item.locale !== copy.locale) });
              }}>{t('removeTranslation', { language: languageNames[copy.locale] })}</Button>}
            </fieldset>;
          })}
        </div>
        {available.length > 0 && <SelectField label={t('addTranslation')} value="" onChange={event => {
          const locale = available.find(item => item === event.target.value);
          if (locale) patch({ translations: [...announcement.translations, { locale, title: '', body: '' }] });
        }}>
          <option value="">{t('chooseLanguage')}</option>
          {available.map(locale => <option value={locale} lang={locale} key={locale}>{languageNames[locale]}</option>)}
        </SelectField>}
      </fieldset>;
    })}
    {values.length < 5 && <div className="homepage-admin-actions"><Button variant="secondary"
      onClick={() => change([...values, { enabled: true, translations: [{ locale: preferred, title: '', body: '' }] }])}>
      <Plus size={18} aria-hidden="true" />{t('addAnnouncement')}
    </Button></div>}
  </div>;
}
