import { i18n } from '../i18n';

const en = {
  home: 'Home', explore: 'Explore', courses: 'Courses', videos: 'Videos', shorts: 'Shorts',
  library: 'Digital library', libraryShort: 'Library', ai: 'AI learning', paths: 'Learning paths',
  saved: 'Saved', learning: 'My learning', downloads: 'Downloads', settings: 'Settings', status: 'System status',
  admin: 'Administration', adminPreview: 'Administration preview', academy: 'Learning workspace', overview: 'Overview', navigation: 'Student navigation',
  primaryNav: 'Quick navigation', browse: 'Workspace', upcoming: 'Coming soon', upcomingItem: '{{name}} (coming soon)',
  search: 'Search pages', searchNav: 'Find a page', searchHint: 'Search the workspace navigation.',
  searchPlaceholder: 'Type a page name', matches: 'Matching pages', pages: 'Pages', noResults: 'No matching pages',
  trySearch: 'Try another page name.', close: 'Close', openMenu: 'Open navigation', collapse: 'Collapse sidebar',
  expand: 'Expand sidebar', skip: 'Skip to content', language: 'Interface language', appearance: 'Appearance',
  light: 'Light', dark: 'Dark', system: 'System', brand: 'womenriseafg home',
  mission: 'Free learning for Afghan girls and women.', preferences: 'Preferences', page: 'Page', account: 'Account',
};

type Messages = typeof en;

const ps: Messages = {
  home: 'کور', explore: 'سپړنه', courses: 'کورسونه', videos: 'ویډیوګانې', shorts: 'لنډې ویډیوګانې',
  library: 'ډیجیټلي کتابتون', libraryShort: 'کتابتون', ai: 'مصنوعي ځیرکتیا', paths: 'د زده کړې لارې',
  saved: 'خوندي شوي', learning: 'زما زده کړه', downloads: 'ښکته شوي توکي', settings: 'امستنې', status: 'د سیسټم حالت',
  admin: 'اداره', adminPreview: 'د ادارې مخکتنه', academy: 'د زده کړې چاپېریال', overview: 'ټولیزه کتنه', navigation: 'د زده کوونکو لارښود',
  primaryNav: 'د پاڼو لنډلارې', browse: 'چاپېریال', upcoming: 'ژر راځي', upcomingItem: '{{name}} (ژر راځي)',
  search: 'پاڼې ولټوئ', searchNav: 'پاڼه ومومئ', searchHint: 'د زده کړې په چاپېریال کې پاڼې ولټوئ.',
  searchPlaceholder: 'د پاڼې نوم ولیکئ', matches: 'موندل شوې پاڼې', pages: 'پاڼې', noResults: 'هېڅ پاڼه ونه موندل شوه',
  trySearch: 'د بلې پاڼې نوم وازمویئ.', close: 'تړل', openMenu: 'مېنو پرانیستل', collapse: 'اړخیز مېنو راټولول',
  expand: 'اړخیز مېنو پراخول', skip: 'منځپانګې ته ورشئ', language: 'د کارن‌مخ ژبه', appearance: 'بڼه',
  light: 'روښانه', dark: 'تیاره', system: 'سیسټم', brand: 'د womenriseafg کورپاڼه',
  mission: 'د افغان نجونو او ښځو لپاره وړیا زده کړه.', preferences: 'غوراوي', page: 'پاڼه', account: 'حساب',
};

const fa: Messages = {
  home: 'خانه', explore: 'کاوش', courses: 'دوره‌ها', videos: 'ویدیوها', shorts: 'ویدیوهای کوتاه',
  library: 'کتابخانۀ دیجیتال', libraryShort: 'کتابخانه', ai: 'یادگیری هوش مصنوعی', paths: 'مسیرهای یادگیری',
  saved: 'ذخیره‌شده‌ها', learning: 'یادگیری من', downloads: 'دانلودها', settings: 'تنظیمات', status: 'وضعیت سیستم',
  admin: 'مدیریت', adminPreview: 'پیش‌نمایش مدیریت', academy: 'محیط یادگیری', overview: 'نمای کلی', navigation: 'راهنمای صفحات شاگردان',
  primaryNav: 'دسترسی سریع', browse: 'محیط یادگیری', upcoming: 'به‌زودی', upcomingItem: '{{name}} (به‌زودی)',
  search: 'جستجوی صفحه‌ها', searchNav: 'یافتن صفحه', searchHint: 'صفحه‌های محیط یادگیری را جستجو کنید.',
  searchPlaceholder: 'نام صفحه را بنویسید', matches: 'صفحه‌های یافت‌شده', pages: 'صفحه‌ها', noResults: 'صفحۀ مطابق یافت نشد',
  trySearch: 'نام صفحۀ دیگری را جستجو کنید.', close: 'بستن', openMenu: 'باز کردن منو', collapse: 'جمع کردن منوی کناری',
  expand: 'باز کردن منوی کناری', skip: 'رفتن به محتوا', language: 'زبان رابط کاربر', appearance: 'نمایش',
  light: 'روشن', dark: 'تاریک', system: 'سیستم', brand: 'صفحۀ اصلی womenriseafg',
  mission: 'آموزش رایگان برای دختران و زنان افغان.', preferences: 'تنظیمات نمایش', page: 'صفحه', account: 'حساب',
};

for (const [locale, messages] of Object.entries({ en, ps, 'fa-AF': fa })) {
  i18n.addResourceBundle(locale, 'shell', messages, true, true);
}
