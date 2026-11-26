import { useEffect, useRef, useState } from 'react';
import { Layers3, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Activity, BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, PanelDialog, SelectField, StatePanel } from '../../components/ui/Primitives';
import { languageNames, languages, type Language } from '../../i18n';
import { usePreferences, type Theme } from '../../preferences';
import ComponentLibrary from './ComponentLibrary';
import './strings';
import './admin.css';

const destinations = [
  { to: '/admin', label: 'overview', Icon: LayoutDashboard },
  { to: '/admin/components', label: 'library', Icon: Layers3 },
  { to: '/status', label: 'service', Icon: Activity },
];

function SidebarLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation('admin');
  return <nav className="admin-links" aria-label={t('nav')}>{destinations.map(({ to, label, Icon }) =>
    <NavLink key={to} to={to} end onClick={onNavigate} aria-label={collapsed ? t(label) : undefined} title={collapsed ? t(label) : undefined}>
      <Icon size={19} aria-hidden="true" /><span className={collapsed ? 'admin-sr' : undefined}>{t(label)}</span>
    </NavLink>)}
    <Link className="admin-home-link" to="/" onClick={onNavigate} title={collapsed ? t('student') : undefined}>
      <GraduationCap size={20} aria-hidden="true" /><span className={collapsed ? 'admin-sr' : undefined}>{t('student')}</span>
    </Link>
  </nav>;
}

function Overview() {
  const { t } = useTranslation('admin');
  return <><div className="admin-section-heading"><div><Badge>{t('preview')}</Badge><h1>{t('admin')}</h1><p>{t('intro')}</p></div></div>
    <section aria-labelledby="admin-tools"><h2 className="admin-tools-title" id="admin-tools">{t('overviewLinks')}</h2>
      <div className="admin-overview-grid">
        {[
          { to: '/admin/components', title: 'library', description: 'libraryDesc', action: 'openLibrary', Icon: Layers3 },
          { to: '/status', title: 'service', description: 'serviceDesc', action: 'checkService', Icon: Activity },
        ].map(({ to, title, description, action, Icon }) =>
          <Card key={to} className="admin-tool">
            <span className="admin-tool-icon"><Icon size={24} aria-hidden="true" /></span>
            <h3>{t(title)}</h3><p>{t(description)}</p>
            <Button variant="secondary" asChild><Link to={to}>{t(action)}</Link></Button>
          </Card>)}
      </div>
    </section>
  </>;
}

export default function AdminPage() {
  const { t } = useTranslation('admin');
  const { language, theme, setLanguage, setTheme } = usePreferences();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      main.current?.focus();
    }
  }, [pathname]);
  const route = pathname.replace(/\/+$/, '');
  const page = route === '/admin' ? 'overview' : route === '/admin/components' ? 'library' : 'unknown';
  useEffect(() => { document.title = t(page) + ' · womenriseafg'; }, [t, page]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)');
    function closeOnDesktop(event: MediaQueryListEvent) { if (event.matches) setDrawer(false); }
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);
  return <div className={'admin-shell' + (collapsed ? ' admin-shell--compact' : '')}>
    <a className="admin-skip" href="#admin-main">{t('skip')}</a>
    <aside className="admin-side">
      <Link className="admin-brand" aria-label="womenriseafg" to="/"><span><BookOpen aria-hidden="true" /></span>
        <b className={collapsed ? 'admin-sr' : undefined} dir="ltr">womenriseafg</b></Link>
      <SidebarLinks collapsed={collapsed} />
      <button className="admin-collapse" type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={t(collapsed ? 'expand' : 'collapse')}>
        {collapsed ? <PanelLeftOpen className="ui-direction" size={19} /> : <PanelLeftClose className="ui-direction" size={19} />}
        {!collapsed && <span>{t('collapse')}</span>}
      </button>
    </aside>
    <div className="admin-body">
      <header className="admin-top">
        <div className="admin-mobile-trigger"><PanelDialog drawer title={t('admin')} closeLabel={t('close')} open={drawer} onOpenChange={setDrawer}
          trigger={<Button variant="ghost" className="ui-icon-btn" aria-label={t('openNav')}><Menu size={21} /></Button>}>
          <SidebarLinks onNavigate={() => setDrawer(false)} />
        </PanelDialog></div>
        <nav aria-label={t('breadcrumb')} className="admin-breadcrumb"><Link to="/admin">{t('admin')}</Link><ChevronRight className="ui-direction" size={15} aria-hidden="true" /><span aria-current="page">{t(page)}</span></nav>
        <div className="admin-prefs">
          <SelectField label={t('language')} value={language} onChange={e => setLanguage(e.target.value as Language)}>
            {languages.map(l => <option key={l} value={l} lang={l}>{languageNames[l]}</option>)}
          </SelectField>
          <SelectField label={t('theme')} value={theme} onChange={e => setTheme(e.target.value as Theme)}>
            {(['system', 'light', 'dark'] as const).map(key => <option key={key} value={key}>{t(key)}</option>)}
          </SelectField>
        </div>
      </header>
      <main className="admin-main" id="admin-main" tabIndex={-1} ref={main}>
        {page === 'overview' ? <Overview /> : page === 'library' ? <ComponentLibrary /> :
          <><h1>{t('unknown')}</h1><StatePanel kind="empty" title={t('back')}><Button asChild><Link to="/admin">{t('overview')}</Link></Button></StatePanel></>}
      </main>
    </div>
  </div>;
}
