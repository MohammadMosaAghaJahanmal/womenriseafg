import { i18n } from '../../i18n';

export const discoveryNamespace = 'learningDiscovery';

const en = {
  search: 'Search learning content', find: 'Search', query: 'Keywords', suggestions: 'Suggested results',
  kind: 'Content type', subjectLabel: 'Subject', categoryLabel: 'Category', level: 'Level', grade: 'Grade', language: 'Content language',
  fileLanguage: 'File language', metadataLanguage: 'Title and description language',
  all: 'All', clear: 'Clear filters', loading: 'Loading learning content…', failed: 'Learning content could not be loaded.',
  retry: 'Try again', empty: 'No learning content matches these filters.', course: 'Course', lesson: 'Lesson', video: 'Video',
  short: 'Short video', book: 'Book', quiz: 'Quiz', ai: 'AI learning', subject: 'Subject', category: 'Category',
  path: 'Learning path', paths: 'Learning paths', pathEmpty: 'No learning paths are available.', activityList: 'Activities',
  completed: 'Completed', progress: '{{done}} of {{total}} activities completed', daily: 'Daily Learning',
  dailyEmpty: 'There is no featured activity today.', related: 'Related learning', selected: 'Selected activities',
  manage: 'Paths and Daily Learning', addPath: 'Add learning path', code: 'Path code', title: 'Title', description: 'Description',
  addTranslation: 'Add translation', dropTranslation: 'Remove translation', chooseActivity: 'Choose published activity',
  add: 'Add', earlier: 'Move activity {{position}} up', later: 'Move activity {{position}} down', remove: 'Remove activity {{position}}',
  unavailable: 'Activity unavailable', save: 'Save', saving: 'Saving…', saved: 'Changes saved.', publication: 'Review and publication',
  delete: 'Delete path', confirmDelete: 'Delete this learning path?', confirmStatus: 'Change this path to {{status}}?',
  mode: 'Daily selection rule', automatic: 'Rotate through published activities', curated: 'Rotate through the selected activities',
  off: 'Hide the daily activity', permission: 'This action requires additional permission.',
  stale: 'This entry changed. Reload before saving.', invalid: 'Review the values in the form.',
  transition: 'This status change is unavailable.', reference: 'Select published activities, languages and filter values.',
  incomplete: 'Add a description and at least one activity.', conflict: 'This path code is already in use.',
};
const ps: typeof en = {
  search: 'درسي منځپانګه ولټوئ', find: 'لټون', query: 'کلیدي ټکي', suggestions: 'وړاندیز شوې پایلې',
  kind: 'د منځپانګې ډول', subjectLabel: 'مضمون', categoryLabel: 'ډله', level: 'کچه', grade: 'ټولګی', language: 'د منځپانګې ژبه',
  fileLanguage: 'د فایل ژبه', metadataLanguage: 'د سرلیک او تشریح ژبه',
  all: 'ټول', clear: 'چاڼونه پاک کړئ', loading: 'درسي منځپانګه بارېږي…', failed: 'درسي منځپانګه بار نه شوه.',
  retry: 'بیا هڅه وکړئ', empty: 'له دې چاڼونو سره سم درسي منځپانګه نشته.', course: 'کورس', lesson: 'درس', video: 'ویډیو',
  short: 'لنډه ویډیو', book: 'کتاب', quiz: 'ازموینه', ai: 'د مصنوعي ځیرکتیا زده کړه', subject: 'مضمون', category: 'ډله',
  path: 'د زده کړې لاره', paths: 'د زده کړې لارې', pathEmpty: 'د زده کړې لارې نشته.', activityList: 'فعالیتونه',
  completed: 'بشپړ شوی', progress: 'له {{total}} فعالیتونو څخه {{done}} بشپړ شوي', daily: 'ورځنۍ زده کړه',
  dailyEmpty: 'د نن لپاره ټاکل شوی فعالیت نشته.', related: 'اړونده زده کړه', selected: 'ټاکل شوي فعالیتونه',
  manage: 'د زده کړې لارې او ورځنۍ زده کړه', addPath: 'د زده کړې لاره زیاته کړئ', code: 'د لارې کوډ', title: 'سرلیک', description: 'تشریح',
  addTranslation: 'ژباړه زیاته کړئ', dropTranslation: 'ژباړه لرې کړئ', chooseActivity: 'خپور شوی فعالیت وټاکئ',
  add: 'زیاتول', earlier: '{{position}} فعالیت پورته یوسئ', later: '{{position}} فعالیت ښکته یوسئ', remove: '{{position}} فعالیت لرې کړئ',
  unavailable: 'فعالیت شتون نه لري', save: 'خوندي کول', saving: 'خوندي کېږي…', saved: 'بدلونونه خوندي شول.', publication: 'کتنه او خپرول',
  delete: 'لاره ړنګه کړئ', confirmDelete: 'دا د زده کړې لاره ړنګه کړئ؟', confirmStatus: 'د لارې حالت {{status}} ته بدل کړئ؟',
  mode: 'د ورځني ټاکلو تګلاره', automatic: 'خپاره شوي فعالیتونه په وار سره', curated: 'ټاکل شوي فعالیتونه په وار سره',
  off: 'ورځنی فعالیت پټ کړئ', permission: 'دا کار اضافي اجازې ته اړتیا لري.',
  stale: 'دا توکی بدل شو. له خوندي کولو مخکې یې بیا بار کړئ.', invalid: 'د فورم ارزښتونه وګورئ.',
  transition: 'دا د حالت بدلون شونی نه دی.', reference: 'خپاره شوي فعالیتونه، ژبې او چاڼونه وټاکئ.',
  incomplete: 'تشریح او لږ تر لږه یو فعالیت زیات کړئ.', conflict: 'دا د لارې کوډ له مخکې کارول کېږي.',
};
const fa: typeof en = {
  search: 'جست‌وجوی محتوای آموزشی', find: 'جست‌وجو', query: 'کلیدواژه‌ها', suggestions: 'نتایج پیشنهادی',
  kind: 'نوع محتوا', subjectLabel: 'مضمون', categoryLabel: 'دسته', level: 'سطح', grade: 'صنف', language: 'زبان محتوا',
  fileLanguage: 'زبان فایل', metadataLanguage: 'زبان عنوان و توضیحات',
  all: 'همه', clear: 'پاک‌کردن فیلترها', loading: 'در حال بارگیری محتوای آموزشی…', failed: 'محتوای آموزشی بار نشد.',
  retry: 'تلاش دوباره', empty: 'محتوای آموزشی مطابق این فیلترها پیدا نشد.', course: 'دوره', lesson: 'درس', video: 'ویدیو',
  short: 'ویدیوی کوتاه', book: 'کتاب', quiz: 'آزمون', ai: 'یادگیری هوش مصنوعی', subject: 'مضمون', category: 'دسته',
  path: 'مسیر یادگیری', paths: 'مسیرهای یادگیری', pathEmpty: 'مسیر یادگیری در دسترس نیست.', activityList: 'فعالیت‌ها',
  completed: 'تکمیل شده', progress: '{{done}} از {{total}} فعالیت تکمیل شده', daily: 'یادگیری روزانه',
  dailyEmpty: 'امروز فعالیت برگزیده‌ای در دسترس نیست.', related: 'یادگیری مرتبط', selected: 'فعالیت‌های منتخب',
  manage: 'مسیرها و یادگیری روزانه', addPath: 'افزودن مسیر یادگیری', code: 'کد مسیر', title: 'عنوان', description: 'توضیحات',
  addTranslation: 'افزودن ترجمه', dropTranslation: 'حذف ترجمه', chooseActivity: 'انتخاب فعالیت نشر شده',
  add: 'افزودن', earlier: 'انتقال فعالیت {{position}} به بالا', later: 'انتقال فعالیت {{position}} به پایین', remove: 'حذف فعالیت {{position}}',
  unavailable: 'فعالیت در دسترس نیست', save: 'ذخیره', saving: 'در حال ذخیره…', saved: 'تغییرات ذخیره شد.', publication: 'بازبینی و نشر',
  delete: 'حذف مسیر', confirmDelete: 'این مسیر یادگیری حذف شود؟', confirmStatus: 'وضعیت این مسیر به {{status}} تغییر کند؟',
  mode: 'روش انتخاب روزانه', automatic: 'چرخش میان فعالیت‌های نشر شده', curated: 'چرخش میان فعالیت‌های منتخب',
  off: 'پنهان‌کردن فعالیت روزانه', permission: 'این کار به اجازهٔ بیشتری نیاز دارد.',
  stale: 'این مورد تغییر کرده است. پیش از ذخیره دوباره بار کنید.', invalid: 'مقادیر فرم را بررسی کنید.',
  transition: 'این تغییر وضعیت ممکن نیست.', reference: 'فعالیت‌ها، زبان‌ها و فیلترهای نشر شده را انتخاب کنید.',
  incomplete: 'توضیحات و دست‌کم یک فعالیت اضافه کنید.', conflict: 'این کد مسیر قبلاً استفاده شده است.',
};

for (const [locale, strings] of [['en', en], ['ps', ps], ['fa-AF', fa]] as const) {
  i18n.addResourceBundle(locale, discoveryNamespace, strings, true, true);
}
