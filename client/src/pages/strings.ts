import { i18n } from '../i18n';

const en = {
  settingsIntro: 'Choose how this workspace appears on this device.',
  local: 'This browser remembers your language and appearance choices.',
  follows: 'System follows the light or dark setting on your device.',
  preview: 'Section preview', explore: 'Explore subjects', back: 'Go to homepage',
  courses: 'Structured courses and chapter-by-chapter lessons will appear here.',
  videos: 'This space is reserved for educational videos with captions and transcripts.',
  shorts: 'Short video lessons will appear here once they are published.',
  library: 'Books and reading materials will appear here as they become available.',
  ai: 'Reviewed, AI-assisted learning materials will be collected here.',
  paths: 'Learning paths will group courses into a suggested order.',
  saved: 'You will be able to return here to resources you choose to save.',
  learning: 'Optional learning progress will appear here when that feature is available.',
  downloads: 'This area will list the materials you choose to download for offline study.',
  notFound: 'Page not found', missing: 'This address does not match a page in the workspace.',
  connection: 'API connection', checking: 'Checking the API connection…', available: 'The API is responding.',
  failed: 'The connection check failed. Try again.', again: 'Check again', retry: 'Try again', loading: 'Opening page…',
};
const ps: typeof en = {
  settingsIntro: 'په دې وسیله د زده کړې چاپېریال بڼه وټاکئ.',
  local: 'دا براوزر ستاسو د ژبې او بڼې ټاکنې ساتي.',
  follows: 'د سیسټم په ټاکلو سره د دې وسیلې روښانه یا تیاره بڼه کارول کېږي.',
  preview: 'د برخې مخکتنه', explore: 'مضمونونه وپلټئ', back: 'کورپاڼې ته ورشئ',
  courses: 'منظم کورسونه او د هر فصل درسونه به دلته راشي.',
  videos: 'دا برخه د زده کړې هغو ویډیوګانو ته ځانګړې شوې چې لیکلې بڼه او فرعي سرلیکونه لري.',
  shorts: 'لنډ ویډیويي درسونه به له خپرېدو وروسته دلته ښکاره شي.',
  library: 'کتابونه او د لوست مواد به له چمتو کېدو وروسته دلته راشي.',
  ai: 'هغه درسي مواد به دلته راټول شي چې د مصنوعي ځیرکتیا په مرسته جوړ شوي او بیا کتل شوي وي.',
  paths: 'د زده کړې لارې به کورسونه په وړاندیز شوي ترتیب کې راټول کړي.',
  saved: 'هغه سرچینې چې تاسو یې خوندي کوئ، وروسته به یې دلته موندلی شئ.',
  learning: 'کله چې د پرمختګ اختیاري ثبت چمتو شي، خپل پرمختګ به دلته ووینئ.',
  downloads: 'هغه مواد چې تاسو یې د انټرنېټ پرته زده کړې لپاره ښکته کوئ، دلته به ښکاره شي.',
  notFound: 'پاڼه ونه موندل شوه', missing: 'په دې پته د زده کړې په چاپېریال کې پاڼه نشته.',
  connection: 'د کړنلارې اړیکه', checking: 'له سیسټم سره اړیکه کتل کېږي…', available: 'سیسټم ځواب ورکوي.',
  failed: 'اړیکه بریالۍ نه شوه. بیا هڅه وکړئ.', again: 'بیا یې وګورئ', retry: 'بیا هڅه وکړئ', loading: 'پاڼه پرانیستل کېږي…',
};
const fa: typeof en = {
  settingsIntro: 'نمای محیط یادگیری را در این دستگاه انتخاب کنید.',
  local: 'این مرورگر انتخاب زبان و نمایش شما را به یاد می‌سپارد.',
  follows: 'با انتخاب سیستم، نمایش روشن یا تاریک دستگاه شما دنبال می‌شود.',
  preview: 'پیش‌نمایش بخش', explore: 'کاوش مضمون‌ها', back: 'بازگشت به خانه',
  courses: 'دوره‌های منظم و درس‌های هر فصل در این بخش قرار خواهند گرفت.',
  videos: 'این بخش برای ویدیوهای آموزشی همراه با زیرنویس و متن درس در نظر گرفته شده است.',
  shorts: 'درس‌های ویدیویی کوتاه پس از نشر در این بخش قرار خواهند گرفت.',
  library: 'کتاب‌ها و منابع خواندنی پس از آماده شدن در این بخش قرار می‌گیرند.',
  ai: 'منابع آموزشی بازبینی‌شده که با کمک هوش مصنوعی تهیه شده‌اند، در این‌جا گردآوری خواهند شد.',
  paths: 'مسیرهای یادگیری دوره‌ها را به ترتیب پیشنهادی در کنار هم قرار خواهند داد.',
  saved: 'منابعی را که برای ذخیره کردن انتخاب می‌کنید، بعداً در این‌جا پیدا خواهید کرد.',
  learning: 'با آماده شدن ثبت اختیاری پیشرفت، می‌توانید پیشرفت خود را در این‌جا ببینید.',
  downloads: 'موادی که برای مطالعه بدون اینترنت دانلود می‌کنید در این بخش فهرست خواهند شد.',
  notFound: 'صفحه پیدا نشد', missing: 'این نشانی با هیچ صفحه‌ای در محیط یادگیری مطابقت ندارد.',
  connection: 'ارتباط با سرور', checking: 'ارتباط با سرور بررسی می‌شود…', available: 'سرور پاسخ می‌دهد.',
  failed: 'بررسی ارتباط موفق نشد. دوباره تلاش کنید.', again: 'بررسی دوباره', retry: 'تلاش دوباره', loading: 'صفحه در حال باز شدن است…',
};
for (const [lang, values] of Object.entries({ en, ps, 'fa-AF': fa })) {
  i18n.addResourceBundle(lang, 'pages', values);
}
