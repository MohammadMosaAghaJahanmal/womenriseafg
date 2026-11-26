import { i18n } from '../i18n';

const en = {
  home: 'Home', explore: 'Explore', courses: 'Courses', videos: 'Videos', shorts: 'Shorts',
  library: 'Digital library', libraryShort: 'Library', ai: 'AI learning', paths: 'Learning paths',
  collections: 'Course collections',
  saved: 'Saved', learning: 'My learning', downloads: 'Downloads', settings: 'Settings', status: 'System status',
  admin: 'Administration', adminPreview: 'Administration preview', academy: 'Learning workspace', overview: 'Overview', navigation: 'Student navigation',
  primaryNav: 'Quick navigation', browse: 'Workspace', footerNav: 'Footer navigation',
  search: 'Search learning content', quizzes: 'Quizzes', daily: 'Daily learning', certificates: 'Certificates',
  close: 'Close', openMenu: 'Open navigation', collapse: 'Collapse sidebar',
  expand: 'Expand sidebar', skip: 'Skip to content', language: 'Interface language', appearance: 'Appearance',
  light: 'Light', dark: 'Dark', system: 'System', brand: '{{name}} home',
  mission: 'Free learning for Afghan girls and women.', preferences: 'Preferences', page: 'Page', account: 'Account',
};

type Messages = typeof en;

const ps: Messages = {
  home: 'کور', explore: 'سپړنه', courses: 'کورسونه', videos: 'ویډیوګانې', shorts: 'لنډې ویډیوګانې',
  library: 'ډیجیټلي کتابتون', libraryShort: 'کتابتون', ai: 'مصنوعي ځیرکتیا', paths: 'د زده کړې لارې',
  collections: 'د کورسونو ټولګې',
  saved: 'خوندي شوي', learning: 'زما زده کړه', downloads: 'ښکته شوي توکي', settings: 'امستنې', status: 'د سیسټم حالت',
  admin: 'اداره', adminPreview: 'د ادارې مخکتنه', academy: 'د زده کړې چاپېریال', overview: 'ټولیزه کتنه', navigation: 'د زده کوونکو لارښود',
  primaryNav: 'د پاڼو لنډلارې', browse: 'چاپېریال', footerNav: 'د پاڼې په پای کې لېنکونه',
  search: 'ښوونیز مواد ولټوئ', quizzes: 'ازموینې', daily: 'ورځنۍ زده‌کړه', certificates: 'سندونه',
  close: 'تړل', openMenu: 'مېنو پرانیستل', collapse: 'اړخیز مېنو راټولول',
  expand: 'اړخیز مېنو پراخول', skip: 'منځپانګې ته ورشئ', language: 'د کارن‌مخ ژبه', appearance: 'بڼه',
  light: 'روښانه', dark: 'تیاره', system: 'سیسټم', brand: 'د {{name}} کورپاڼه',
  mission: 'د افغان نجونو او ښځو لپاره وړیا زده کړه.', preferences: 'غوراوي', page: 'پاڼه', account: 'حساب',
};

const fa: Messages = {
  home: 'خانه', explore: 'کاوش', courses: 'دوره‌ها', videos: 'ویدیوها', shorts: 'ویدیوهای کوتاه',
  library: 'کتابخانۀ دیجیتال', libraryShort: 'کتابخانه', ai: 'یادگیری هوش مصنوعی', paths: 'مسیرهای یادگیری',
  collections: 'مجموعه‌های دوره‌ها',
  saved: 'ذخیره‌شده‌ها', learning: 'یادگیری من', downloads: 'دانلودها', settings: 'تنظیمات', status: 'وضعیت سیستم',
  admin: 'مدیریت', adminPreview: 'پیش‌نمایش مدیریت', academy: 'محیط یادگیری', overview: 'نمای کلی', navigation: 'راهنمای صفحات شاگردان',
  primaryNav: 'دسترسی سریع', browse: 'محیط یادگیری', footerNav: 'پیوندهای پایین صفحه',
  search: 'جستجوی محتوای یادگیری', quizzes: 'آزمون‌ها', daily: 'یادگیری روزانه', certificates: 'گواهی‌ها',
  close: 'بستن', openMenu: 'باز کردن منو', collapse: 'جمع کردن منوی کناری',
  expand: 'باز کردن منوی کناری', skip: 'رفتن به محتوا', language: 'زبان رابط کاربر', appearance: 'نمایش',
  light: 'روشن', dark: 'تاریک', system: 'سیستم', brand: 'صفحۀ اصلی {{name}}',
  mission: 'آموزش رایگان برای دختران و زنان افغان.', preferences: 'تنظیمات نمایش', page: 'صفحه', account: 'حساب',
};

for (const [locale, messages] of Object.entries({ en, ps, 'fa-AF': fa })) {
  i18n.addResourceBundle(locale, 'shell', messages, true, true);
}
