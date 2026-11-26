import { i18n } from '../../i18n';

const en = {
  title: 'Operations', intro: 'Check application health, media usage, staff activity, and backup readiness.',
  health: 'Application health', ready: 'Database responding', checked: 'Checked at', refresh: 'Refresh',
  loading: 'Loading operations…', failed: 'Operations information could not be loaded.', retry: 'Try again',
  storage: 'Tracked media', storageHint: 'Counts and sizes come from live media records. They exclude exports, backup files and temporary uploads.',
  volume: 'Free space on the storage volume', volumeUnknown: 'Storage volume capacity is unavailable.',
  quotaHint: 'Check the hosting account’s own disk and inode quotas in the hosting control panel.',
  mediaEmpty: 'No media files are registered yet.', kind: 'Media type', count: 'Files', bytes: 'Bytes', share: 'Share of tracked media',
  video: 'Video', audio: 'Audio', image: 'Image', pdf: 'PDF', subtitle: 'Captions', transcript: 'Transcript', attachment: 'Attachment',
  total: 'Total', backups: 'Backup and restore checks', backup: 'Backup verification', 'restore-drill': 'Restore drill',
  backupHint: 'Record the result of a check you performed separately. This page records your report without running a backup or touching stored content.',
  missing: 'No check recorded.', result: 'Check outcome', choose: 'Choose an outcome', passed: 'Passed', failedCheck: 'Needs attention',
  recorded: 'Recorded at', save: 'Record check', saved: 'Check recorded.', saving: 'Recording…',
  staff: 'Recent staff activity', fullAudit: 'Open staff and assignments', activityEmpty: 'No staff activity has been recorded.',
  auditHint: 'The server’s private logs hold sign-in and operational events. Keep those logs private.',
};
const ps: typeof en = {
  title: 'عملیات', intro: 'د کاریال حالت، د رسنیو زېرمه، د همکارانو فعالیت او د شاتړ چمتووالی وګورئ.',
  health: 'د کاریال حالت', ready: 'ډېټابېس ځواب ورکوي', checked: 'د کتنې وخت', refresh: 'تازه کړئ',
  loading: 'عملیات پورته کېږي…', failed: 'د عملیاتو معلومات پورته نه شول.', retry: 'بیا هڅه وکړئ',
  storage: 'ثبت شوې رسنۍ', storageHint: 'شمېر او کچه له فعالو رسنیزو ریکارډونو اخیستل کېږي. صادر شوي توکي، شاتړ او لنډمهاله فایلونه پکې نشته.',
  volume: 'د زېرمې ازاد ځای', volumeUnknown: 'د زېرمې د ځای معلومات نشته.',
  quotaHint: 'د کوربه حساب د ډیسک او فایل شمېرې حدونه د کوربه په کنټرول برخه کې وګورئ.',
  mediaEmpty: 'تر اوسه کوم رسنیز فایل نه دی ثبت شوی.', kind: 'د رسنۍ ډول', count: 'فایلونه', bytes: 'بایټونه', share: 'د ثبت شویو رسنیو برخه',
  video: 'ویډیو', audio: 'غږ', image: 'انځور', pdf: 'PDF', subtitle: 'فرعي لیکنې', transcript: 'لیکلې بڼه', attachment: 'ضمیمه',
  total: 'ټول', backups: 'د شاتړ او بیا راګرځولو کتنې', backup: 'د شاتړ کتنه', 'restore-drill': 'د بیا راګرځولو تمرین',
  backupHint: 'د هغې کتنې پایله ثبت کړئ چې جلا مو ترسره کړې وي. پاڼه یوازې ستاسو راپور ثبتوي او زېرمه شوې منځپانګه نه بدلوي.',
  missing: 'کتنه لا نه ده ثبت شوې.', result: 'د کتنې پایله', choose: 'پایله وټاکئ', passed: 'بریالۍ', failedCheck: 'پاملرنه غواړي',
  recorded: 'د ثبت وخت', save: 'کتنه ثبت کړئ', saved: 'کتنه ثبت شوه.', saving: 'ثبتېږي…',
  staff: 'د همکارانو وروستی فعالیت', fullAudit: 'کارکوونکي او دندې پرانیزئ', activityEmpty: 'د همکارانو کوم فعالیت نه دی ثبت شوی.',
  auditHint: 'د ننوتلو او عملیاتو پېښې د سرور په خصوصي ثبتونو کې دي. ثبتونه خصوصي وساتئ.',
};
const fa: typeof en = {
  title: 'عملیات', intro: 'وضعیت برنامه، مصرف رسانه، فعالیت کارکنان و آمادگی پشتیبان‌گیری را بررسی کنید.',
  health: 'وضعیت برنامه', ready: 'پایگاه داده پاسخ می‌دهد', checked: 'زمان بررسی', refresh: 'تازه‌سازی',
  loading: 'بارگذاری عملیات…', failed: 'بارگذاری معلومات عملیات ممکن نبود.', retry: 'تلاش دوباره',
  storage: 'رسانه‌های ثبت‌شده', storageHint: 'تعداد و اندازه از رکوردهای فعال رسانه می‌آیند. فایل‌های صادراتی، پشتیبان و موقت در آن شامل نیستند.',
  volume: 'فضای آزاد دیسک ذخیره‌سازی', volumeUnknown: 'معلومات فضای دیسک در دسترس نیست.',
  quotaHint: 'سهمیۀ دیسک و شمار فایل‌های حساب را در بخش کنترل میزبان بررسی کنید.',
  mediaEmpty: 'هنوز هیچ فایل رسانه‌ای ثبت نشده است.', kind: 'نوع رسانه', count: 'فایل‌ها', bytes: 'بایت', share: 'سهم از رسانه‌های ثبت‌شده',
  video: 'ویدیو', audio: 'صدا', image: 'تصویر', pdf: 'PDF', subtitle: 'زیرنویس', transcript: 'متن گفتار', attachment: 'پیوست',
  total: 'مجموع', backups: 'بررسی پشتیبان و بازگردانی', backup: 'بررسی پشتیبان', 'restore-drill': 'تمرین بازگردانی',
  backupHint: 'نتیجۀ بررسی‌ای را که جداگانه انجام داده‌اید ثبت کنید. این صفحه تنها گزارش شما را ثبت می‌کند و محتوای ذخیره‌شده را تغییر نمی‌دهد.',
  missing: 'بررسی ثبت نشده است.', result: 'نتیجۀ بررسی', choose: 'نتیجه‌ای انتخاب کنید', passed: 'موفق', failedCheck: 'نیاز به رسیدگی',
  recorded: 'زمان ثبت', save: 'ثبت بررسی', saved: 'بررسی ثبت شد.', saving: 'در حال ثبت…',
  staff: 'فعالیت اخیر کارکنان', fullAudit: 'باز کردن کارکنان و وظایف', activityEmpty: 'فعالیتی از کارکنان ثبت نشده است.',
  auditHint: 'رویدادهای ورود و عملیات در گزارش‌های خصوصی سرور هستند. گزارش‌ها را خصوصی نگه دارید.',
};
for (const [language, dictionary] of Object.entries({ en, ps, 'fa-AF': fa })) i18n.addResourceBundle(language, 'operations', dictionary);

