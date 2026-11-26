import { useEffect, useRef, useState } from 'react';
import { Layers3, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Activity, Award, BookMarked, ChevronRight, ClipboardCheck, Files, FolderTree, GraduationCap, LibraryBig, MessageSquareText, PanelsTopLeft, Route, UsersRound, UserRound, Video, type LucideIcon } from 'lucide-react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, PanelDialog, SelectField, StatePanel } from '../../components/ui/Primitives';
import { languageNames, languages, type Language } from '../../i18n';
import { usePreferences, type Theme } from '../../preferences';
import { readIdentity } from '../auth/api';
import { useEducationData } from '../education/useEducationData';
import { AdminCourses, matchCourseRoute } from '../courses/admin/AdminCourses';
import { courseAdminPath } from '../courses/admin/api';
import { AdminEducation, matchEducationRoute } from '../education/AdminEducation';
import { EducationFamilies } from '../education/EducationIndex';
import { educationPath } from '../education/api';
import { AdminLearningMedia, matchLearningMediaRoute } from '../learning-media/admin/AdminLearningMedia';
import { learningMediaAdminPath } from '../learning-media/admin/api';
import { AdminBooks, matchBookRoute } from '../library/admin/AdminBooks';
import { bookAdminPath } from '../library/admin/api';
import { AdminMedia, matchMediaRoute } from '../media/AdminMedia';
import { mediaPath } from '../media/api';
import { AdminQuizzes } from '../quizzes/AdminQuizzes';
import { quizAdminPath } from '../quizzes/api';
import { AdminDiscovery, collectionsAdminPath, pathsAdminPath } from '../discovery/AdminDiscovery';
import { BrandLogo, useBranding } from '../homepage/Branding';
import { HomepageAdmin } from '../homepage/admin/HomepageAdmin';
import { homepageAdminPath } from '../homepage/admin/api';
import AdminCertificates from '../engagement/AdminCertificates';
import { StaffAdmin } from '../staff/StaffPages';
import { staffAdminPath } from '../staff/api';
import CorrectionQueue from '../privacy/CorrectionQueue';
import { AdminOperations, operationsAdminPath } from '../operations/AdminOperations';
import ComponentLibrary from './ComponentLibrary';
import './strings';
import './admin.css';

const destinations: { to: string; label: string; Icon: LucideIcon; permission?: string }[] = [
  { to: '/admin', label: 'overview', Icon: LayoutDashboard },
  { to: educationPath(), label: 'education:title', Icon: FolderTree },
  { to: courseAdminPath, label: 'courseAdmin:title', Icon: LibraryBig },
  { to: learningMediaAdminPath, label: 'learningMediaAdmin:title', Icon: Video },
  { to: bookAdminPath, label: 'bookAdmin:title', Icon: BookMarked },
  { to: quizAdminPath, label: 'quiz:adminTitle', Icon: ClipboardCheck },
  { to: pathsAdminPath, label: 'learningDiscovery:manage', Icon: Route },
  { to: collectionsAdminPath, label: 'learningDiscovery:collections', Icon: Layers3 },
  { to: homepageAdminPath, label: 'homepageAdmin:title', Icon: PanelsTopLeft },
  { to: '/admin/certificates', label: 'certificateSettings:title', Icon: Award, permission: 'certificates:manage' },
  { to: '/admin/corrections', label: 'privacy:queueTitle', Icon: MessageSquareText, permission: 'corrections:manage' },
  { to: staffAdminPath, label: 'staff:adminTitle', Icon: UsersRound, permission: 'staff:manage' },
  { to: operationsAdminPath, label: 'operations:title', Icon: Activity, permission: 'operations:manage' },
  { to: mediaPath, label: 'media:title', Icon: Files },
  { to: '/admin/components', label: 'library', Icon: Layers3 },
  { to: '/status', label: 'service', Icon: Activity },
];

function SidebarLinks({ collapsed = false, onNavigate, permissions }: {
  collapsed?: boolean; onNavigate?: () => void; permissions: string[];
}) {
  const { t } = useTranslation(['admin', 'auth', 'education', 'media', 'courseAdmin', 'learningMediaAdmin', 'bookAdmin', 'quiz', 'learningDiscovery', 'homepageAdmin']);
  return <nav className="admin-links" aria-label={t('nav')}>{destinations
    .filter(destination => !destination.permission || permissions.includes(destination.permission)).map(({ to, label, Icon }) =>
    <NavLink key={to} to={to} end={to === '/admin'}
      onClick={onNavigate} aria-label={collapsed ? t(label) : undefined} title={collapsed ? t(label) : undefined}>
      <Icon size={19} aria-hidden="true" /><span className={collapsed ? 'admin-sr' : undefined}>{t(label)}</span>
    </NavLink>)}
    <Link to="/account" onClick={onNavigate} title={collapsed ? t('auth:account') : undefined}>
      <UserRound size={19} aria-hidden="true" /><span className={collapsed ? 'admin-sr' : undefined}>{t('auth:account')}</span>
    </Link>
    <Link className="admin-home-link" to="/" onClick={onNavigate} title={collapsed ? t('student') : undefined}>
      <GraduationCap size={20} aria-hidden="true" /><span className={collapsed ? 'admin-sr' : undefined}>{t('student')}</span>
    </Link>
  </nav>;
}

function PreferenceFields() {
  const { t } = useTranslation('admin');
  const { language, theme, setLanguage, setTheme } = usePreferences();
  return <div className="admin-prefs">
    <SelectField label={t('language')} value={language} onChange={e => setLanguage(e.target.value as Language)}>
      {languages.map(l => <option key={l} value={l} lang={l}>{languageNames[l]}</option>)}
    </SelectField>
    <SelectField label={t('theme')} value={theme} onChange={e => setTheme(e.target.value as Theme)}>
      {(['system', 'light', 'dark'] as const).map(key => <option key={key} value={key}>{t(key)}</option>)}
    </SelectField>
  </div>;
}

export function ComponentPreviewPage() {
  const { t } = useTranslation('admin');
  const { branding } = useBranding();
  return <div className="admin-shell admin-shell--preview">
    <a className="admin-skip" href="#preview-main">{t('skip')}</a>
    <div className="admin-body">
      <header className="admin-top">
        <Link className="admin-brand" to="/"><span><BrandLogo id={branding.logoId} /></span>
          <bdi>{branding.name}</bdi>
        </Link>
        <PreferenceFields />
      </header>
      <main className="admin-main" id="preview-main" tabIndex={-1}><ComponentLibrary /></main>
    </div>
  </div>;
}

function Overview() {
  const { t } = useTranslation(['admin', 'education', 'media', 'courseAdmin', 'learningMediaAdmin', 'bookAdmin', 'homepageAdmin']);
  return <><div className="admin-section-heading"><div><h1>{t('admin')}</h1><p>{t('education:dashboardIntro')}</p></div></div>
    <EducationFamilies dashboard />
    <section aria-labelledby="admin-tools"><h2 className="admin-tools-title" id="admin-tools">{t('overviewLinks')}</h2>
      <div className="admin-overview-grid">
        {[
          { to: courseAdminPath, title: 'courseAdmin:title', description: 'courseAdmin:intro', action: 'courseAdmin:dashboard', Icon: LibraryBig },
          { to: learningMediaAdminPath, title: 'learningMediaAdmin:title', description: 'learningMediaAdmin:intro', action: 'learningMediaAdmin:overview', Icon: Video },
          { to: bookAdminPath, title: 'bookAdmin:title', description: 'bookAdmin:intro', action: 'bookAdmin:overview', Icon: BookMarked },
          { to: homepageAdminPath, title: 'homepageAdmin:title', description: 'homepageAdmin:intro', action: 'homepageAdmin:title', Icon: PanelsTopLeft },
          { to: mediaPath, title: 'media:title', description: 'media:overviewHint', action: 'media:overview', Icon: Files },
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
  const { t } = useTranslation(['admin', 'education', 'media', 'courseAdmin', 'learningMediaAdmin', 'bookAdmin', 'quiz', 'learningDiscovery', 'homepageAdmin']);
  const { branding, refresh } = useBranding();
  const { result: identity } = useEducationData(readIdentity);
  const permissions = identity.status === 'ready' ? identity.data?.permissions ?? [] : [];
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
  const education = matchEducationRoute(route);
  const media = matchMediaRoute(route);
  const courses = matchCourseRoute(route);
  const learningMedia = matchLearningMediaRoute(route);
  const books = matchBookRoute(route);
  const quizzes = route === quizAdminPath || route.startsWith(quizAdminPath + '/');
  const discovery = route.startsWith('/admin/discovery/');
  const homepage = route === homepageAdminPath;
  const certificates = route === '/admin/certificates';
  const corrections = route === '/admin/corrections';
  const staff = route === staffAdminPath;
  const operations = route === operationsAdminPath;
  const page = route === '/admin' ? 'overview' : route === '/admin/components' ? 'library' :
    certificates ? 'certificateSettings:title' : corrections ? 'privacy:queueTitle' : staff ? 'staff:adminTitle' : operations ? 'operations:title' :
    homepage ? 'homepageAdmin:title' : quizzes ? 'quiz:adminTitle' :
    route.startsWith(collectionsAdminPath) ? 'learningDiscovery:collections' : discovery ? 'learningDiscovery:manage' :
    books ? 'bookAdmin:title' : learningMedia ? 'learningMediaAdmin:title' : courses ? 'courseAdmin:title' : media ? 'media:title' :
      education ? 'education:' + ('kind' in education ? education.kind : 'title') : 'unknown';
  useEffect(() => { document.title = t(page) + ' · ' + branding.name; }, [t, page, branding.name]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)');
    function closeOnDesktop(event: MediaQueryListEvent) { if (event.matches) setDrawer(false); }
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);
  return <div className={'admin-shell' + (collapsed ? ' admin-shell--compact' : '')}>
    <a className="admin-skip" href="#admin-main">{t('skip')}</a>
    <aside className="admin-side">
      <Link className="admin-brand" aria-label={branding.name} to="/"><span><BrandLogo id={branding.logoId} /></span>
        <bdi className={collapsed ? 'admin-sr' : undefined}>{branding.name}</bdi></Link>
      <SidebarLinks collapsed={collapsed} permissions={permissions} />
      <button className="admin-collapse" type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={t(collapsed ? 'expand' : 'collapse')}>
        {collapsed ? <PanelLeftOpen className="ui-direction" size={19} /> : <PanelLeftClose className="ui-direction" size={19} />}
        {!collapsed && <span>{t('collapse')}</span>}
      </button>
    </aside>
    <div className="admin-body">
      <header className="admin-top">
        <div className="admin-mobile-trigger"><PanelDialog drawer title={t('admin')} closeLabel={t('close')} open={drawer} onOpenChange={setDrawer}
          trigger={<Button variant="ghost" className="ui-icon-btn" aria-label={t('openNav')}><Menu size={21} /></Button>}>
          <SidebarLinks permissions={permissions} onNavigate={() => setDrawer(false)} />
        </PanelDialog></div>
        <nav aria-label={t('breadcrumb')} className="admin-breadcrumb"><Link to="/admin">{t('admin')}</Link><ChevronRight className="ui-direction" size={15} aria-hidden="true" /><span aria-current="page">{t(page)}</span></nav>
        <PreferenceFields />
      </header>
      <main className="admin-main" id="admin-main" tabIndex={-1} ref={main}>
        {certificates ? <AdminCertificates /> : corrections ? <CorrectionQueue /> : staff ? <StaffAdmin /> : operations ? <AdminOperations /> :
          homepage ? <HomepageAdmin onSaved={refresh} /> : quizzes ? <AdminQuizzes route={route} /> : discovery ? <AdminDiscovery key={route} route={route} /> :
          books ? <AdminBooks route={books} /> : learningMedia ? <AdminLearningMedia route={learningMedia} /> : courses ? <AdminCourses route={courses} /> :
          media ? <AdminMedia route={media} /> : education ? <AdminEducation route={education} /> : page === 'overview' ? <Overview /> : page === 'library' ? <ComponentLibrary /> :
          <><h1>{t('unknown')}</h1><StatePanel kind="empty" title={t('back')}><Button asChild><Link to="/admin">{t('overview')}</Link></Button></StatePanel></>}
      </main>
    </div>
  </div>;
}
