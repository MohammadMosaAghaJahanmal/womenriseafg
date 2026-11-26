import { useEffect, useRef, useState, type DialogHTMLAttributes } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bookmark, BookOpen, CalendarDays, ChevronDown, ChevronRight,
  ClipboardList, Compass, Download, Film, Globe2, GraduationCap, Home, Library, Menu, Monitor,
  Moon, PanelLeftClose, PanelLeftOpen, Route, Search, Settings, Sparkles, Sun, UserRound, Video, X,
  type LucideIcon,
} from 'lucide-react';
import { usePreferences } from '../preferences';
import { languageNames } from '../i18n';
import { BrandLogo, useBranding } from '../features/homepage/Branding';
import { OfflineNotice } from '../features/offline/Notice';
import { useOnlineStatus } from '../features/offline/online';
import { sectionPath } from '../pages/routes';
import './shellTranslations';
import './shell.css';

type Destination = { to: string; label: string; icon: LucideIcon };
const mainLinks: Destination[] = [
  { to: '/', label: 'home', icon: Home },
  { to: '/explore', label: 'explore', icon: Compass },
  { to: '/courses', label: 'courses', icon: BookOpen },
  { to: '/videos', label: 'videos', icon: Video },
  { to: '/shorts', label: 'shorts', icon: Film },
  { to: '/ai-learning', label: 'ai', icon: Sparkles },
  { to: '/library', label: 'library', icon: Library },
  { to: '/quizzes', label: 'quizzes', icon: ClipboardList },
  { to: '/learning-paths', label: 'paths', icon: Route },
  { to: '/daily-learning', label: 'daily', icon: CalendarDays },
  { to: '/saved', label: 'saved', icon: Bookmark },
  { to: '/my-learning', label: 'learning', icon: GraduationCap },
  { to: '/downloads', label: 'downloads', icon: Download },
  { to: '/account', label: 'account', icon: UserRound },
];
const settingsLink: Destination = { to: '/settings', label: 'settings', icon: Settings };
const allLinks: Destination[] = [...mainLinks, settingsLink, { to: '/status', label: 'status', icon: Monitor }];
const bottomLinks = ['/', '/courses', '/shorts', '/library', '/my-learning'].map(to => allLinks.find(link => link.to === to)!);
const collections = new Set(['/courses', '/videos', '/shorts', '/ai-learning', '/library', '/quizzes', '/learning-paths', '/downloads']);
const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

function Brand({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation('shell');
  const { branding } = useBranding();
  return <Link className="shell-brand" to="/" onClick={onClick} aria-label={t('brand', { name: branding.name })}>
    <span className="shell-brand-mark"><BrandLogo id={branding.logoId} /></span>
    <bdi className="shell-wordmark" dir="auto">{branding.name === 'womenriseafg' ? <>womenrise<span>afg</span></> : branding.name}</bdi>
  </Link>;
}

function PreferenceFields({ full = false }: { full?: boolean }) {
  const { t } = useTranslation('shell');
  const { language, theme, setLanguage, setTheme } = usePreferences();
  const ThemeIcon = themeIcons[theme];
  return <div className={full ? 'shell-options shell-options-full' : 'shell-options'}>
    <label className="shell-select shell-language" title={t('language')}>
      <Globe2 size={17} aria-hidden="true" />
      <span className="shell-select-value" lang={language}>{languageNames[language]}</span>
      <ChevronDown size={13} aria-hidden="true" className="shell-select-chevron" />
      <select aria-label={t('language')} value={language} onChange={e => setLanguage(e.target.value as keyof typeof languageNames)}>
        {Object.entries(languageNames).map(([locale, name]) => <option value={locale} key={locale} lang={locale}>{name}</option>)}
      </select>
    </label>
    <label className="shell-select shell-theme" title={t('appearance') + ' — ' + t(theme)}>
      <ThemeIcon size={18} aria-hidden="true" />
      {full && <span>{t(theme)}</span>}
      <select aria-label={t('appearance')} value={theme} onChange={e => setTheme(e.target.value as keyof typeof themeIcons)}>
        {Object.keys(themeIcons).map(value => <option value={value} key={value}>{t(value)}</option>)}
      </select>
    </label>
  </div>;
}

function Navigation({ id, onNavigate }: { id: string; onNavigate?: () => void }) {
  const { t } = useTranslation('shell');
  const { pathname } = useLocation();
  const current = sectionPath(pathname);
  return <nav aria-label={t('navigation')} id={id} className="shell-navigation">
    <div className="shell-nav-group">
      <p className="shell-nav-heading" id={id + '-browse'}>{t('browse')}</p>
      <ul aria-labelledby={id + '-browse'}>
        {mainLinks.map(({ to, label, icon: Icon }) =>
          <li key={to}><NavLink end={!collections.has(to)} to={to} title={t(label)} aria-label={t(label)} onClick={onNavigate}
            className={({ isActive }) => 'shell-nav-link' + (isActive || to === current ? ' shell-active' : '')}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" /><span>{t(label)}</span>
          </NavLink></li>)}
      </ul>
    </div>
  </nav>;
}

const closeOnBackdrop: DialogHTMLAttributes<HTMLDialogElement>['onClick'] = event => {
  const dialog = event.currentTarget;
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
    dialog.close();
  }
};

const closeOnEscape: DialogHTMLAttributes<HTMLDialogElement>['onKeyDown'] = event => {
  if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.close();
};

export default function StudentLayout() {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const connectedRoute = useRef(online ? location.key : null);
  const [collapsed, setCollapsed] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const bottomNav = useRef<HTMLElement>(null);
  const lastPath = useRef(location.pathname);
  const current = allLinks.find(item => item.to === sectionPath(location.pathname));
  const menuClose = () => menu.current?.close();
  const offlineRoute = !online && sectionPath(location.pathname) !== '/downloads' && connectedRoute.current !== location.key;

  useEffect(() => {
    if (online) connectedRoute.current = location.key;
  }, [online, location.key]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.repeat) {
        event.preventDefault();
        if (document.querySelector('dialog[open], [role="dialog"]')) return;
        const input = document.getElementById('global-search-input');
        if (location.pathname === '/search' && input) input.focus();
        else void navigate('/search', { state: { focusSearch: true } });
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [location.pathname, navigate]);
  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      lastPath.current = location.pathname;
      main.current?.focus({ preventScroll: true });
      if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname, location.hash]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 960px)');
    const onResize = () => { if (desktop.matches) menu.current?.close(); };
    desktop.addEventListener('change', onResize);
    return () => desktop.removeEventListener('change', onResize);
  }, []);
  useEffect(() => {
    const nav = bottomNav.current;
    if (!nav) return;
    const root = document.documentElement;
    // Translated labels and larger text can change the fixed bar's height.
    const measured = new ResizeObserver(() => {
      root.style.setProperty('--shell-nav-footprint', nav.getBoundingClientRect().height + 'px');
    });
    measured.observe(nav);
    return () => {
      measured.disconnect();
      root.style.removeProperty('--shell-nav-footprint');
    };
  }, []);

  function renderSettingsLink(onNavigate?: () => void) {
    return <NavLink to="/settings" onClick={onNavigate} title={t('settings')} aria-label={t('settings')}
      className={({ isActive }) => 'shell-nav-link' + (isActive ? ' shell-active' : '')}>
      <Settings size={18} strokeWidth={1.75} aria-hidden="true" /><span>{t('settings')}</span>
    </NavLink>;
  }

  return <div className={'shell' + (collapsed ? ' shell-collapsed' : '')}>
    <a className="shell-skip" href="#main-content">{t('skip')}</a>
    <aside className="shell-rail">
      <div className="shell-rail-brand"><Brand /></div>
      <Navigation id="shell-desktop-nav" />
      <div className="shell-rail-bottom">
        {renderSettingsLink()}
        <button type="button" className="shell-nav-link shell-collapse" aria-controls="shell-desktop-nav"
          aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}
          title={t(collapsed ? 'expand' : 'collapse')} aria-label={t(collapsed ? 'expand' : 'collapse')}>
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          <span>{t('collapse')}</span>
        </button>
      </div>
    </aside>

    <div className="shell-workspace">
      <header className="shell-header">
        <div className="shell-breadcrumb">
          <span>{t('academy')}</span><ChevronRight className="ui-direction" size={14} aria-hidden="true" />
          <span>{t(current?.to === '/' ? 'overview' : current?.label ?? (location.pathname === '/search' ? 'search' : 'page'))}</span>
        </div>
        <div className="shell-header-brand"><Brand /></div>
        <div className="shell-tools">
          <Link to="/search" className="shell-search-trigger"
            aria-label={t('search') + ' Ctrl K'} aria-keyshortcuts="Control+K Meta+K">
            <Search size={16} aria-hidden="true" /><span>{t('search')}{' '}</span>
            <kbd aria-hidden="true">Ctrl K</kbd>
          </Link>
          <PreferenceFields />
          <button type="button" className="shell-icon-button shell-menu-trigger" onClick={() => menu.current?.showModal()}
            aria-controls="shell-mobile-menu" aria-haspopup="dialog" aria-label={t('openMenu')}><Menu size={21} /></button>
        </div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1} className="shell-main">{offlineRoute ? <OfflineNotice /> : <Outlet />}</main>
      <footer className="shell-footer">
        <div className="shell-footer-brand"><Brand /><p>{t('mission')}</p></div>
        <nav aria-label={t('footerNav')} className="shell-footer-links">
          <Link to="/courses">{t('courses')}</Link><Link to="/library">{t('library')}</Link>
          <Link to="/downloads">{t('downloads')}</Link><Link to="/settings">{t('settings')}</Link>
          {online && <><Link to="/status">{t('status')}</Link><Link to="/admin">{t('admin')}</Link></>}
        </nav>
      </footer>
    </div>

    <nav ref={bottomNav} aria-label={t('primaryNav')} className="shell-bottom">
      {bottomLinks.map(({ to, label, icon: Icon }) => {
        const name = t(label === 'library' ? 'libraryShort' : label);
        return <NavLink key={to} end={!collections.has(to)} to={to} title={name}
          aria-label={name}
          className={({ isActive }) => 'shell-tab' + (isActive || to === current?.to ? ' shell-tab-active' : '')}>
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>{name}</span>
        </NavLink>;
      })}
    </nav>

    <dialog id="shell-mobile-menu" ref={menu} className="shell-dialog shell-menu-dialog"
      onClick={closeOnBackdrop} onKeyDown={closeOnEscape} aria-label={t('navigation')}>
      <div className="shell-drawer-inner">
        <div className="shell-dialog-top"><Brand onClick={menuClose} /><button type="button" className="shell-icon-button"
          aria-label={t('close')} onClick={menuClose}><X size={20} /></button></div>
        <Navigation id="shell-drawer-nav" onNavigate={menuClose} />
        <div className="shell-drawer-preferences">
          {renderSettingsLink(menuClose)}
          <p className="shell-nav-heading">{t('preferences')}</p>
          <PreferenceFields full />
        </div>
      </div>
    </dialog>

  </div>;
}
