import { ExternalLink, Save } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, SectionTabs, StatePanel } from '../../../components/ui/Primitives';
import { useEducationData } from '../../education/useEducationData';
import { ConfirmQuizAction, useQuizUnsaved } from '../../quizzes/AdminFields';
import {
  homepageSettingsError, loadHomepageSettings, saveHomepageSettings, type HomepageSelections, type HomepageSettings,
  type HomepageSettingsResponse, type SelectedChoice,
} from './api';
import { AnnouncementFields, BrandingFields, SectionFields, SelectionField } from './Fields';
import { homepageAdminNamespace as ns } from './strings';
import './admin-homepage.css';

function selectionTitles(selected?: HomepageSelections) {
  return Object.fromEntries([...(selected?.featuredCourses ?? []), ...(selected?.recommendedBooks ?? [])]
    .map(item => [item.id, item]));
}

function normalizedSettings(draft: HomepageSettings): HomepageSettings {
  return {
    ...draft,
    branding: {
      ...draft.branding,
      name: draft.branding.name.trim(),
      translations: draft.branding.translations.map(copy => ({ ...copy, slogan: copy.slogan.trim(), mission: copy.mission.trim() })),
    },
    announcements: draft.announcements.map(item => ({
      ...item,
      translations: item.translations.map(copy => ({ ...copy, title: copy.title.trim(), body: copy.body.trim() })),
    })),
  };
}

function HomepageSettingsForm({ initial, reload, onSaved }: {
  initial: HomepageSettingsResponse; reload: () => void; onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation(ns);
  const [saved, setSaved] = useState(initial.settings);
  const [draft, setDraft] = useState(initial.settings);
  const [tab, setTab] = useState('sections');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [titles, setTitles] = useState(() => selectionTitles(initial.selected));
  const request = useRef<AbortController>(undefined);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useQuizUnsaved(dirty);
  useEffect(() => () => request.current?.abort(), []);

  function update<Key extends keyof HomepageSettings>(key: Key, value: HomepageSettings[Key]) {
    setDraft(current => ({ ...current, [key]: value }));
    setNotice('');
    if (error !== 'stale') setError('');
  }

  function remember(choice: SelectedChoice) {
    setTitles(current => ({ ...current, [choice.id]: choice }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || request.current || error === 'stale') return;
    setNotice('');
    setError('');
    const settings = normalizedSettings(draft);
    if (!settings.branding.name) {
      setTab('branding');
      setError('nameRequired');
      return;
    }
    if (settings.announcements.some(item => item.translations.some(copy => !copy.title || !copy.body))) {
      setTab('announcements');
      setError('announcementRequired');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    try {
      const response = await saveHomepageSettings(settings, controller.signal);
      if (controller.signal.aborted) return;
      setSaved(response.settings);
      setDraft(response.settings);
      if (response.selected) setTitles(selectionTitles(response.selected));
      setNotice('saved');
    } catch (cause) {
      if (!controller.signal.aborted) setError(homepageSettingsError(cause, 'saveError'));
      return;
    } finally {
      if (!controller.signal.aborted) setSaving(false);
      request.current = undefined;
    }
    onSaved?.();
  }

  const blocked = saving || error === 'stale' || error === 'noPermission' || error === 'sessionExpired';
  return <form className="homepage-admin" aria-busy={saving} noValidate onSubmit={event => { void submit(event); }}>
    <div className="homepage-admin-toolbar">
      <Button type="submit" disabled={!dirty || blocked}>
        <Save size={17} aria-hidden="true" />{t(saving ? 'saving' : 'save')}
      </Button>
      <Button asChild variant="secondary"><Link to="/" target="_blank" rel="noopener noreferrer">
        <ExternalLink size={17} aria-hidden="true" />{t('view')}
      </Link></Button>
      {!!notice && <p role="status">{t(notice)}</p>}
    </div>
    {error && <StatePanel kind="error" title={t(error)}>
      {error === 'stale' && <ConfirmQuizAction label={t('reload')} title={t('reloadTitle')} onConfirm={reload} />}
      {error === 'sessionExpired' && <Button variant="secondary" asChild><Link to="/admin/login">{t('signIn')}</Link></Button>}
    </StatePanel>}
    <SectionTabs label={t('title')} value={tab} onValueChange={setTab} dir={i18n.dir()} items={[
      { value: 'sections', label: t('sections'), content:
        <fieldset className="homepage-admin-panel" disabled={blocked}>
          <legend className="admin-sr">{t('sections')}</legend>
          <SectionFields values={draft.sections} change={value => update('sections', value)} disabled={blocked} />
        </fieldset>,
      },
      { value: 'branding', label: t('branding'), content:
        <fieldset className="homepage-admin-panel" disabled={blocked}>
          <legend className="admin-sr">{t('branding')}</legend>
          <BrandingFields value={draft.branding} change={value => update('branding', value)} />
        </fieldset>,
      },
      { value: 'selections', label: t('selections'), content:
        <fieldset className="homepage-admin-panel" disabled={blocked}>
          <legend className="admin-sr">{t('selections')}</legend>
          <div className="homepage-admin-stack">
            <p className="homepage-admin-hint">{t('selectionHelp')}</p>
            <SelectionField kind="course" ids={draft.featuredCourseIds} titles={titles}
              change={ids => update('featuredCourseIds', ids)} remember={remember} />
            <SelectionField kind="book" ids={draft.recommendedBookIds} titles={titles}
              change={ids => update('recommendedBookIds', ids)} remember={remember} />
          </div>
        </fieldset>,
      },
      { value: 'announcements', label: t('announcements'), content:
        <fieldset className="homepage-admin-panel" disabled={blocked}>
          <legend className="admin-sr">{t('announcements')}</legend>
          <AnnouncementFields values={draft.announcements} change={value => update('announcements', value)} />
        </fieldset>,
      },
    ]} />
  </form>;
}

export function HomepageAdmin({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation(ns);
  const { result, reload } = useEducationData(loadHomepageSettings);
  const error = result.status === 'error' ? homepageSettingsError(result.error, 'loadError') : null;
  return <>
    <header className="admin-section-heading">
      <div><h1>{t('title')}</h1><p>{t('intro')}</p></div>
    </header>
    {result.status === 'loading' && <StatePanel kind="loading" title={t('loading')} />}
    {error && <StatePanel kind="error" title={t(error)}>
      {error === 'loadError' && <Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
      {error === 'sessionExpired' && <Button variant="secondary" asChild><Link to="/admin/login">{t('signIn')}</Link></Button>}
    </StatePanel>}
    {result.status === 'ready' && <HomepageSettingsForm initial={result.data} reload={reload} onSaved={onSaved} />}
  </>;
}
