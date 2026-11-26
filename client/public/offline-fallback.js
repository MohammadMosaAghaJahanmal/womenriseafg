/* global document, localStorage, navigator */
let language = navigator.language;
let theme;
try {
  language = localStorage.getItem('womenriseafg.language') || language;
  theme = localStorage.getItem('womenriseafg.theme');
} catch { /* The fallback still works when browser preferences are unavailable. */ }

const locale = /^ps(?:-|$)/i.test(language) ? 'ps' : /^(?:fa|prs)(?:-|$)/i.test(language) ? 'fa-AF' : 'en';
document.documentElement.lang = locale;
document.documentElement.dir = locale === 'en' ? 'ltr' : 'rtl';
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
for (const section of document.querySelectorAll('main section[lang]')) {
  if (section.lang !== locale) section.hidden = true;
  else document.title = section.querySelector('h1').textContent + ' · womenriseafg';
}
