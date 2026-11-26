import { i18n } from '../i18n';

const en = {
  settingsIntro: 'Choose how this workspace appears on this device.',
  local: 'This browser remembers your language and appearance choices.',
  follows: 'System follows the light or dark setting on your device.',
  courseOpenTitle: 'Course open counts',
  courseOpenDescription: 'The platform counts opens per course to rank popular courses. It stores aggregate totals without learner identifiers or viewing histories.',
  back: 'Go to homepage',
  notFound: 'Page not found', missing: 'This address does not match a page in the workspace.',
  connection: 'API connection', checking: 'Checking the API connection…', available: 'The API is responding.',
  failed: 'The connection check failed. Try again.', again: 'Check again', retry: 'Try again', loading: 'Opening page…',
  pageLoadFailed: 'This page could not load. Check your connection and try again.',
};
const ps: typeof en = {
  settingsIntro: 'په دې وسیله د زده کړې چاپېریال بڼه وټاکئ.',
  local: 'دا براوزر ستاسو د ژبې او بڼې ټاکنې ساتي.',
  follows: 'د سیسټم په ټاکلو سره د دې وسیلې روښانه یا تیاره بڼه کارول کېږي.',
  courseOpenTitle: 'د کورسونو د پرانیستلو شمېر',
  courseOpenDescription: 'د ډېرو کتل شویو کورسونو د ښودلو لپاره د هر کورس د پرانیستلو ټول شمېر ساتل کېږي. د زده‌کوونکو پېژندپاڼې او د کتنو مخینه نه ساتل کېږي.',
  back: 'کورپاڼې ته ورشئ',
  notFound: 'پاڼه ونه موندل شوه', missing: 'په دې پته د زده کړې په چاپېریال کې پاڼه نشته.',
  connection: 'د کړنلارې اړیکه', checking: 'له سیسټم سره اړیکه کتل کېږي…', available: 'سیسټم ځواب ورکوي.',
  failed: 'اړیکه بریالۍ نه شوه. بیا هڅه وکړئ.', again: 'بیا یې وګورئ', retry: 'بیا هڅه وکړئ', loading: 'پاڼه پرانیستل کېږي…',
  pageLoadFailed: 'دا پاڼه بار نه شوه. خپله اړیکه وګورئ او بیا هڅه وکړئ.',
};
const fa: typeof en = {
  settingsIntro: 'نمای محیط یادگیری را در این دستگاه انتخاب کنید.',
  local: 'این مرورگر انتخاب زبان و نمایش شما را به یاد می‌سپارد.',
  follows: 'با انتخاب سیستم، نمایش روشن یا تاریک دستگاه شما دنبال می‌شود.',
  courseOpenTitle: 'شمار باز شدن دوره‌ها',
  courseOpenDescription: 'برای رده‌بندی دوره‌های پربازدید، شمار کل باز شدن هر دوره ثبت می‌شود. شناسهٔ شاگردان و تاریخچۀ بازدیدها ثبت نمی‌شود.',
  back: 'بازگشت به خانه',
  notFound: 'صفحه پیدا نشد', missing: 'این نشانی با هیچ صفحه‌ای در محیط یادگیری مطابقت ندارد.',
  connection: 'ارتباط با سرور', checking: 'ارتباط با سرور بررسی می‌شود…', available: 'سرور پاسخ می‌دهد.',
  failed: 'بررسی ارتباط موفق نشد. دوباره تلاش کنید.', again: 'بررسی دوباره', retry: 'تلاش دوباره', loading: 'صفحه در حال باز شدن است…',
  pageLoadFailed: 'این صفحه بارگیری نشد. اتصال خود را بررسی کنید و دوباره بکوشید.',
};
for (const [lang, values] of Object.entries({ en, ps, 'fa-AF': fa })) {
  i18n.addResourceBundle(lang, 'pages', values);
}
