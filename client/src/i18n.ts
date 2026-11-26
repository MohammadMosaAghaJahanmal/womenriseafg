import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const languages = ['en', 'ps', 'fa-AF'] as const;
export type Language = typeof languages[number];
export const languageNames: Record<Language, string> = { en: 'English', ps: 'پښتو', 'fa-AF': 'دری' };

export function savedPreference(key: 'language' | 'theme') {
  try { return localStorage.getItem('womenriseafg.' + key); }
  catch { return null; }
}

export function browserLanguage(): Language {
  const browser = navigator.languages?.[0] || navigator.language;
  if (/^ps(?:-|$)/i.test(browser)) return 'ps';
  if (/^(fa|prs)(?:-|$)/i.test(browser)) return 'fa-AF';
  return 'en';
}

const savedLanguage = savedPreference('language');
const language = languages.some(value => value === savedLanguage) ? savedLanguage as Language : browserLanguage();
function setDocumentLanguage(value: string) {
  document.documentElement.lang = value;
  document.documentElement.dir = value === 'en' ? 'ltr' : 'rtl';
}
setDocumentLanguage(language);
i18n.on('languageChanged', setDocumentLanguage);
void i18n.use(initReactI18next).init({
  lng: language,
  supportedLngs: [...languages],
  fallbackLng: 'en',
  load: 'currentOnly',
  resources: {},
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
export { i18n };
