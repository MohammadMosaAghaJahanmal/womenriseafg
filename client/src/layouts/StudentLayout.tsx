import { useEffect, useRef, useState, type DialogHTMLAttributes } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight, Bookmark, BookOpen, BookOpenText, Check, ChevronDown, ChevronRight,
  Compass, Download, Film, FolderSearch, Globe2, GraduationCap, Home, Library, Menu, Monitor,
  Moon, PanelLeftClose, PanelLeftOpen, Route, Search, Settings, Sparkles, Sun, UserRound, Video, X,
  type LucideIcon,
} from 'lucide-react';
import { usePreferences } from '../preferences';
import { languageNames } from '../i18n';
import './shellTranslations';
import './shell.css';

type Destination = { to: string; label: string; icon: LucideIcon; upcoming?: boolean };
const mainLinks: Destination[] = [
  { to: '/', label: 'home', icon: Home },
  { to: '/explore', label: 'explore', icon: Compass },
  { to: '/account', label: 'account', icon: UserRound },
];
const plannedLinks: Destination[] = [
  { to: '/courses', label: 'courses', icon: BookOpen },
  { to: '/videos', label: 'videos', icon: Video },
  { to: '/shorts', label: 'shorts', icon: Film },
  { to: '/library', label: 'library', icon: Library },
  { to: '/ai-learning', label: 'ai', icon: Sparkles },
  { to: '/learning-paths', label: 'paths', icon: Route },
  { to: '/saved', label: 'saved', icon: Bookmark },
  { to: '/my-learning', label: 'learning', icon: GraduationCap },
  { to: '/downloads', label: 'downloads', icon: Download },
].map(item => ({ ...item, upcoming: true }));
const settingsLink: Destination = { to: '/settings', label: 'settings', icon: Settings };
const allLinks: Destination[] = [...mainLinks, ...plannedLinks, settingsLink, { to: '/status', label: 'status', icon: Monitor }];
const bottomLinks = ['/', '/courses', '/shorts', '/library', '/my-learning'].map(to => allLinks.find(link => link.to === to)!);
const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

function Brand({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation('shell');
  return <Link className="shell-brand" to="/" onClick={onClick} aria-label={t('brand')}>
    <span className="shell-brand-mark"><BookOpenText size={24} strokeWidth={1.8} aria-hidden="true" /></span>
    <bdi className="shell-wordmark" dir="ltr">womenrise<span>afg</span></bdi>
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
  return <nav aria-label={t('navigation')} id={id} className="shell-navigation">
    {[{ title: 'browse', links: mainLinks }, { title: 'upcoming', links: plannedLinks }].map(group =>
      <div className="shell-nav-group" key={group.title}>
        <p className="shell-nav-heading" id={id + '-' + group.title}>{t(group.title)}</p>
        <ul aria-labelledby={id + '-' + group.title}>
          {group.links.map(({ to, label, icon: Icon, upcoming }) => {
            const name = upcoming ? t('upcomingItem', { name: t(label) }) : t(label);
            return <li key={to}><NavLink end to={to} title={name} aria-label={name} onClick={onNavigate}
              className={({ isActive }) => 'shell-nav-link' + (isActive ? ' shell-active' : '')}>
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" /><span>{t(label)}</span>
            </NavLink></li>;
          })}
        </ul>
      </div>
    )}
  </nav>;
}

function normalized(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/\u200c/g, ' ').trim();
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
  const { t } = useTranslation(['shell', 'auth']);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const menu = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLDialogElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLElement>(null);
  const bottomNav = useRef<HTMLElement>(null);
  const lastPath = useRef(location.pathname);
  const current = allLinks.find(item => item.to === location.pathname);
  const found = allLinks.filter(item => normalized(t(item.label)).includes(normalized(query)));
  const menuClose = () => menu.current?.close();
  const searchClose = () => search.current?.close();

  function openSearch() {
    if (!search.current || search.current.open) return;
    setQuery('');
    search.current.showModal();
    searchField.current?.focus();
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.repeat) {
        event.preventDefault();
        if (document.querySelector('dialog[open]')) return;
        openSearch();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
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
    const layout = nav?.parentElement;
    if (!nav || !layout) return;
    // Translated labels and larger text can change the fixed bar's height.
    const measured = new ResizeObserver(() => {
      layout.style.setProperty('--shell-nav-footprint', nav.getBoundingClientRect().height + 'px');
    });
    measured.observe(nav);
    return () => measured.disconnect();
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
          <span>{t('academy')}</span><ChevronRight size={14} aria-hidden="true" />
          <span>{t(current?.to === '/' ? 'overview' : current?.label ?? 'page')}</span>
        </div>
        <div className="shell-header-brand"><Brand /></div>
        <div className="shell-tools">
          <button type="button" className="shell-search-trigger" onClick={openSearch}
            aria-label={t('search') + ' Ctrl K'} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">
            <Search size={16} aria-hidden="true" /><span>{t('search')}{' '}</span>
            <kbd aria-hidden="true">Ctrl K</kbd>
          </button>
          <PreferenceFields />
          <button type="button" className="shell-icon-button shell-menu-trigger" onClick={() => menu.current?.showModal()}
            aria-controls="shell-mobile-menu" aria-haspopup="dialog" aria-label={t('openMenu')}><Menu size={21} /></button>
        </div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1} className="shell-main"><Outlet /></main>
      <footer className="shell-footer">
        <span>{t('mission')}</span>
        <div><Link to="/settings">{t('settings')}</Link><Link to="/status">{t('status')}</Link>
          <Link to="/design-preview">{t('auth:adminPreview')}</Link><Link to="/admin">{t('admin')}</Link></div>
      </footer>
    </div>

    <nav ref={bottomNav} aria-label={t('primaryNav')} className="shell-bottom">
      <span className="shell-bottom-caption" aria-hidden="true">{t('upcoming')}</span>
      {bottomLinks.map(({ to, label, icon: Icon, upcoming }) => {
        const name = t(label === 'library' ? 'libraryShort' : label);
        const accessibleName = upcoming ? t('upcomingItem', { name }) : name;
        return <NavLink key={to} end to={to} title={accessibleName}
          aria-label={accessibleName}
          className={({ isActive }) => 'shell-tab' + (isActive ? ' shell-tab-active' : '')}>
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

    <dialog ref={search} className="shell-dialog shell-search-dialog" aria-labelledby="shell-search-title"
      aria-describedby="shell-search-help" onClick={closeOnBackdrop} onKeyDown={closeOnEscape}>
      <div className="shell-search-content">
        <div className="shell-dialog-top"><h2 id="shell-search-title">{t('searchNav')}</h2>
          <button type="button" className="shell-icon-button" aria-label={t('close')} onClick={searchClose}><X size={20} /></button></div>
        <p id="shell-search-help" className="shell-search-help">{t('searchHint')}</p>
        <label className="shell-search-field"><Search size={19} aria-hidden="true" />
          <input ref={searchField} value={query} onChange={e => setQuery(e.target.value)} type="search"
            aria-label={t('search')} placeholder={t('searchPlaceholder')} autoComplete="off" />
        </label>
        {found.length > 0 ? <div className="shell-search-list"><p className="shell-nav-heading">{t(query ? 'matches' : 'pages')}</p>
          <ul>{found.map(({ to, label, icon: Icon, upcoming }) => <li key={to}>
            <Link to={to} onClick={searchClose}>
              <Icon size={17} aria-hidden="true" /><span>{t(label)}</span>
              {upcoming && <small>{t('upcoming')}</small>}
              {location.pathname === to ? <Check size={15} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}
            </Link></li>)}</ul>
          </div> :
          <div className="shell-search-empty" role="status"><FolderSearch size={28} aria-hidden="true" />
            <strong>{t('noResults')}</strong><span>{t('trySearch')}</span>
          </div>}
      </div>
    </dialog>
  </div>;
}
