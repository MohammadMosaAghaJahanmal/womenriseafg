import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownAZ, ArrowUpAZ, BookOpen, Clapperboard, GraduationCap, Route, SquarePlay } from 'lucide-react';
import { Badge, Button, Card, DialogClose, InputField, Pagination, PanelDialog, ProgressIndicator, ResourceCard, SectionTabs, SelectField, StatePanel, Toast } from '../../components/ui/Primitives';
import sampleAudio from './notes.wav?url';

const components = [
  ['button', 'controls'], ['badge', 'content'], ['progress', 'states'], ['searchField', 'controls'],
  ['dialog', 'navigation'], ['tab', 'navigation'], ['drawer', 'navigation'], ['toast', 'states'], ['card', 'content'],
] as const;

const formats = [
  { key: 'course', icon: GraduationCap }, { key: 'video', icon: SquarePlay }, { key: 'book', icon: BookOpen },
  { key: 'short', icon: Clapperboard }, { key: 'path', icon: Route },
] as const;
const pageSize = 4;

function Inventory() {
  const { t, i18n } = useTranslation('admin');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(1);
  const query = search.normalize('NFKC').trim().toLocaleLowerCase(i18n.language);
  const rows = components.filter(([key, family]) => (!group || group === family) &&
    t(key).normalize('NFKC').toLocaleLowerCase(i18n.language).includes(query))
    .sort(([a], [b]) => t(a).localeCompare(t(b), i18n.language) * (ascending ? 1 : -1));
  const pages = Math.ceil(rows.length / pageSize);
  const current = Math.min(page, Math.max(1, pages));
  const nf = new Intl.NumberFormat(i18n.language);
  return <Card>
    <div className="admin-filters">
      <InputField label={t('search')} type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      <SelectField label={t('group')} value={group} onChange={e => { setGroup(e.target.value); setPage(1); }}>
        <option value="">{t('all')}</option>{['controls', 'navigation', 'states', 'content'].map(key => <option key={key} value={key}>{t(key)}</option>)}
      </SelectField>
    </div>
    {rows.length ? <>
      <table className="admin-table">
        <caption className="admin-sr">{t('catalog')}</caption>
        <thead><tr><th scope="col" aria-sort={ascending ? 'ascending' : 'descending'}>
          <button type="button" aria-label={t('sort')} onClick={() => {setAscending(!ascending); setPage(1);}}>
            {t('name')}{ascending ? <ArrowDownAZ size={17} /> : <ArrowUpAZ size={17} />}
          </button></th><th scope="col">{t('group')}</th></tr></thead>
        <tbody>{rows.slice((current - 1) * pageSize, current * pageSize).map(([key, family]) =>
          <tr key={key}><th scope="row">{t(key)}</th><td>{t(family)}</td></tr>)}</tbody>
      </table>
      <Pagination page={current} pages={pages} onChange={setPage} label={t('pagination')} next={t('next')} previous={t('prev')}
        pageLabel={t('page', { page: nf.format(current), total: nf.format(pages) })} />
    </> : <StatePanel kind="empty" title={t('noMatch')} description={t('changeFilter')}>
      <Button variant="secondary" onClick={() => {setSearch(''); setGroup(''); setPage(1);}}>{t('clear')}</Button>
    </StatePanel>}
  </Card>;
}

function ResourceExamples() {
  const { t } = useTranslation('admin');
  const [selected, setSelected] = useState<string | null>(null);
  const selectedKey = selected ?? 'course';
  return <div className="admin-samples">
    <p>{t('sampleNote')}</p>
    <div className="admin-sample-grid">{formats.map(({key, icon: Icon}) =>
      <ResourceCard key={key} label={t(key)} title={t(key + 'Name')} description={t(key + 'Meta')} icon={<Icon />}
        onOpen={() => setSelected(key)} />)}</div>
    <div aria-live="polite">{selected && <Card><div className="admin-sample-detail">
      <div><strong>{t(selectedKey + 'Name')}</strong><p>{t('cardDetails')} · {t(selectedKey + 'Fields')}</p></div>
      <Button variant="secondary" onClick={() => setSelected(null)}>{t('dismiss')}</Button>
    </div></Card>}</div>
  </div>;
}

function FeedbackExamples() {
  const { t } = useTranslation('admin');
  const [kind, setKind] = useState<'empty' | 'loading' | 'error'>('empty');
  return <div className="admin-feedback">
    <Card><SelectField label={t('stateExample')} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
      {(['empty', 'loading', 'error'] as const).map(key => <option key={key} value={key}>{t(key)}</option>)}</SelectField>
      <StatePanel title={t(kind + 'Title')} kind={kind} description={kind === 'error' ? t('errorHint') : undefined} />
    </Card>
    <Card><h2>{t('media')}</h2><p>{t('audioDesc')}</p>
      <audio controls preload="none" aria-label={t('media')} src={sampleAudio}>{t('audioFallback')}</audio>
    </Card>
    <Card><h2>{t('progressExample')}</h2>
      <ProgressIndicator label={t('progressExample')} value={50} />
    </Card>
  </div>;
}

export default function ComponentLibrary() {
  const { t, i18n } = useTranslation('admin');
  const [section, setSection] = useState('inventory');
  const [resetId, setResetId] = useState(0);
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 4500);
    return () => window.clearTimeout(timer);
  }, [toast, resetId]);
  return <>
    <div className="admin-section-heading"><div><Badge>{t('preview')}</Badge><h1>{t('library')}</h1><p>{t('libraryIntro')}</p></div>
      <PanelDialog trigger={<Button variant="secondary">{t('reset')}</Button>} title={t('resetTitle')} closeLabel={t('close')} description={t('resetDetail')}>
        <div className="admin-dialog-actions"><DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
          <DialogClose asChild><Button onClick={() => {setResetId(n => n + 1); setSection('inventory'); setToast(true);}}>{t('reset')}</Button></DialogClose></div>
      </PanelDialog>
    </div>
    <SectionTabs label={t('tabs')} value={section} dir={i18n.dir(i18n.language)} onValueChange={setSection} items={[
      { value: 'inventory', label: t('inventory'), content: <Inventory key={resetId} /> },
      { value: 'resources', label: t('resources'), content: <ResourceExamples key={resetId} /> },
      { value: 'feedback', label: t('feedback'), content: <FeedbackExamples key={resetId} /> },
    ]} />
    <Toast message={toast ? t('resetDone') : ''} />
  </>;
}
