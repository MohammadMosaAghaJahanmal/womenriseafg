import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { i18n, savedPreference, type Language } from './i18n';

export type Theme = 'system' | 'light' | 'dark';
interface Preferences {
  language: Language;
  setLanguage: (value: Language) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
}
const Context = createContext<Preferences | null>(null);
const scheme = window.matchMedia('(prefers-color-scheme: dark)');
const stored = savedPreference('theme');
const initialTheme = stored === 'light' || stored === 'dark' ? stored : 'system';

function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value === 'system' ? (scheme.matches ? 'dark' : 'light') : value;
}

function remember(key: 'language' | 'theme', value: string) {
  try { localStorage.setItem('womenriseafg.' + key, value); }
  catch { /* Preferences continue working in memory when storage is unavailable. */ }
}
applyTheme(initialTheme);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { i18n: translations } = useTranslation();
  const [theme, updateTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    const sync = () => applyTheme(theme);
    sync();
    scheme.addEventListener('change', sync);
    return () => scheme.removeEventListener('change', sync);
  }, [theme]);

  function setTheme(value: Theme) {
    applyTheme(value);
    updateTheme(value);
    remember('theme', value);
  }
  function setLanguage(value: Language) {
    void i18n.changeLanguage(value);
    remember('language', value);
  }
  return <Context.Provider value={{ theme, setTheme, language: translations.language as Language, setLanguage }}>{children}</Context.Provider>;
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing preferences provider');
  return value;
}
