import { i18n } from '../../i18n';

const en = {
  admin: 'Administration', overview: 'Overview', library: 'Component library', service: 'Service status', student: 'Student home', preview: 'Layout preview',
  intro: 'Explore the administration layout and check the platform connection.', libraryIntro: 'Interactive examples for the student and administration interfaces.',
  overviewLinks: 'Workspace tools', libraryDesc: 'Inspect navigation, resource cards and feedback states in the current language and theme.', serviceDesc: 'Check whether the platform API is responding and retry the connection.',
  openLibrary: 'Open component library', checkService: 'Check connection', nav: 'Administration navigation', expand: 'Expand navigation', collapse: 'Collapse navigation', openNav: 'Open navigation', close: 'Close',
  breadcrumb: 'Breadcrumb', skip: 'Skip to content', language: 'Language', theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark',
  tabs: 'Component sections', inventory: 'Inventory', resources: 'Resource cards', feedback: 'Feedback',
  catalog: 'Component inventory', name: 'Component', group: 'Family', all: 'All families', search: 'Find a component', reset: 'Reset examples',
  controls: 'Controls', navigation: 'Navigation', states: 'Feedback', content: 'Content',
  button: 'Button', badge: 'Badge', progress: 'Progress bar', searchField: 'Search field', dialog: 'Dialog', tab: 'Tab', drawer: 'Drawer', toast: 'Toast', card: 'Resource card',
  sort: 'Sort by component name', page: 'Page {{page}} of {{total}}', pagination: 'Inventory pages', prev: 'Previous page', next: 'Next page',
  noMatch: 'No matching components', clear: 'Clear filters', changeFilter: 'Try a different name or family.',
  sample: 'Design samples', sampleNote: 'These examples show how future learning materials can appear.', detail: 'Card details', cardDetails: 'Fields shown on this card', dismiss: 'Dismiss details',
  course: 'Course', video: 'Video', book: 'Book', short: 'Short', path: 'Learning path',
  courseName: 'Geometry foundations', videoName: 'Working with fractions', bookName: 'A guide to plant life', shortName: 'One English greeting', pathName: 'First steps in computing',
  courseMeta: 'Mathematics · Beginner', videoMeta: 'Mathematics · Worked example', bookMeta: 'Biology · Reading', shortMeta: 'English · Conversation', pathMeta: 'Digital skills · Beginner',
  courseFields: 'Course title, subject and level', videoFields: 'Video title, subject and format', bookFields: 'Book title, subject and format', shortFields: 'Short title, language and topic', pathFields: 'Path title, subject and level',
  stateExample: 'State examples', state: 'State', loading: 'Loading', empty: 'Empty', error: 'Error',
  loadingTitle: 'Loading sample materials…', emptyTitle: 'No materials in this sample', errorTitle: 'Sample connection error', errorHint: 'Use the state selector to compare how each message appears.',
  progressExample: 'Progress example', media: 'Audio controls', audioDesc: 'Play the local two-note sound sample. It contains no speech.', audioFallback: 'This browser cannot play the audio sample.',
  resetTitle: 'Reset the component examples?', resetDetail: 'This clears the sample filters and restores the initial preview settings.', cancel: 'Cancel', resetDone: 'Examples reset.',
  unknown: 'Page unavailable', back: 'Back to overview',
};
type Labels = Record<keyof typeof en, string>;

const fa: Labels = {
  admin: 'مدیریت', overview: 'نمای کلی', library: 'کتابخانهٔ مؤلفه‌ها', service: 'وضعیت سامانه', student: 'خانهٔ فراگیر', preview: 'پیش‌نمایش طرح',
  intro: 'طرح بخش مدیریت را ببینید و اتصال به سامانه را بررسی کنید.', libraryIntro: 'نمونه‌های تعاملی برای رابط کاربری فراگیران و مدیران.',
  overviewLinks: 'ابزارهای مدیریت', libraryDesc: 'ناوبری، کارت‌های آموزشی و پیام‌های وضعیت را با زبان و نمای کنونی ببینید.', serviceDesc: 'پاسخ‌دهی رابط برنامه را بررسی کنید و در صورت نیاز دوباره تلاش کنید.',
  openLibrary: 'باز کردن کتابخانهٔ مؤلفه‌ها', checkService: 'بررسی اتصال', nav: 'ناوبری مدیریت', expand: 'گسترش فهرست', collapse: 'جمع کردن فهرست', openNav: 'باز کردن فهرست', close: 'بستن',
  breadcrumb: 'مسیر صفحه', skip: 'رفتن به محتوا', language: 'زبان', theme: 'نمای صفحه', system: 'مطابق دستگاه', light: 'روشن', dark: 'تیره',
  tabs: 'بخش‌های مؤلفه‌ها', inventory: 'فهرست', resources: 'کارت‌های آموزشی', feedback: 'پیام‌های وضعیت',
  catalog: 'فهرست مؤلفه‌ها', name: 'مؤلفه', group: 'گروه', all: 'همهٔ گروه‌ها', search: 'جستجوی مؤلفه', reset: 'بازنشانی نمونه‌ها',
  controls: 'کنترول‌ها', navigation: 'ناوبری', states: 'پیام‌های وضعیت', content: 'محتوا',
  button: 'دکمه', badge: 'نشان', progress: 'نوار پیشرفت', searchField: 'کادر جستجو', dialog: 'پنجرهٔ گفتگو', tab: 'زبانه', drawer: 'فهرست کشویی', toast: 'پیام کوتاه', card: 'کارت آموزشی',
  sort: 'مرتب‌سازی بر پایهٔ نام مؤلفه', page: 'صفحهٔ {{page}} از {{total}}', pagination: 'صفحه‌های فهرست', prev: 'صفحهٔ قبلی', next: 'صفحهٔ بعدی',
  noMatch: 'مؤلفه‌ای پیدا نشد', clear: 'پاک کردن پالایه‌ها', changeFilter: 'نام یا گروه دیگری را امتحان کنید.',
  sample: 'نمونه‌های طراحی', sampleNote: 'این نمونه‌ها شیوهٔ نمایش مواد آموزشی آینده را نشان می‌دهند.', detail: 'جزئیات کارت', cardDetails: 'اطلاعات روی این کارت', dismiss: 'بستن جزئیات',
  course: 'دوره', video: 'ویدیو', book: 'کتاب', short: 'ویدیوی کوتاه', path: 'مسیر یادگیری',
  courseName: 'مبانی هندسه', videoName: 'کار با کسرها', bookName: 'راهنمای زندگی گیاهان', shortName: 'یک سلام به انگلیسی', pathName: 'گام‌های نخست در کمپیوتر',
  courseMeta: 'ریاضی · مقدماتی', videoMeta: 'ریاضی · مثال حل‌شده', bookMeta: 'زیست‌شناسی · مطالعه', shortMeta: 'انگلیسی · مکالمه', pathMeta: 'مهارت‌های دیجیتال · مقدماتی',
  courseFields: 'عنوان دوره، مضمون و سطح', videoFields: 'عنوان ویدیو، مضمون و قالب', bookFields: 'عنوان کتاب، مضمون و قالب', shortFields: 'عنوان ویدیوی کوتاه، زبان و موضوع', pathFields: 'عنوان مسیر، مضمون و سطح',
  stateExample: 'نمونه‌های وضعیت', state: 'وضعیت', loading: 'در حال بارگیری', empty: 'خالی', error: 'خطا',
  loadingTitle: 'مواد نمونه در حال بارگیری است…', emptyTitle: 'در این نمونه مواد آموزشی وجود ندارد', errorTitle: 'نمونهٔ خطای اتصال', errorHint: 'برای مقایسهٔ پیام‌ها، وضعیت دیگری را انتخاب کنید.',
  progressExample: 'نمونهٔ پیشرفت', media: 'کنترول‌های صدا', audioDesc: 'نمونهٔ صوتی محلی را پخش کنید. این نمونه دارای دو نُت موسیقی و بدون گفتار است.', audioFallback: 'این مرورگر نمونهٔ صوتی را پخش نمی‌تواند.',
  resetTitle: 'نمونه‌های مؤلفه‌ها بازنشانی شوند؟', resetDetail: 'پالایه‌های نمونه پاک می‌شوند و تنظیمات پیش‌نمایش به حالت آغازین برمی‌گردند.', cancel: 'انصراف', resetDone: 'نمونه‌ها بازنشانی شدند.',
  unknown: 'صفحه در دسترس نیست', back: 'بازگشت به نمای کلی',
};

const ps: Labels = {
  admin: 'اداره', overview: 'عمومي کتنه', library: 'د برخو کتابتون', service: 'د سیسټم حالت', student: 'د زده کوونکي کورپاڼه', preview: 'د بڼې مخکتنه',
  intro: 'د ادارې بڼه وګورئ او له سیسټم سره اړیکه وازمویئ.', libraryIntro: 'د زده کوونکو او ادارې د مخونو لپاره تعاملي بېلګې.',
  overviewLinks: 'د ادارې وسیلې', libraryDesc: 'د اوسني ژبې او رنګ بڼې سره د پاڼو لړ، د زده کړې کارتونه او د حالت پیغامونه وګورئ.', serviceDesc: 'د سیسټم د ځواب حالت وګورئ او که اړتیا وي اړیکه بیا وازمویئ.',
  openLibrary: 'د برخو کتابتون پرانیزئ', checkService: 'اړیکه وازمویئ', nav: 'د ادارې غورنۍ', expand: 'غورنۍ پراخه کړئ', collapse: 'غورنۍ راټوله کړئ', openNav: 'غورنۍ پرانیزئ', close: 'تړل',
  breadcrumb: 'د پاڼې مسیر', skip: 'منځپانګې ته لاړ شئ', language: 'ژبه', theme: 'د رنګ بڼه', system: 'د وسیلې له مخې', light: 'روښانه', dark: 'تیاره',
  tabs: 'د برخو وېش', inventory: 'لړلیک', resources: 'د زده کړې کارتونه', feedback: 'د حالت پیغامونه',
  catalog: 'د برخو لړلیک', name: 'برخه', group: 'ډله', all: 'ټولې ډلې', search: 'برخه ولټوئ', reset: 'بېلګې بېرته برابرې کړئ',
  controls: 'کنټرولونه', navigation: 'د پاڼو غورنۍ', states: 'د حالت پیغامونه', content: 'منځپانګه',
  button: 'تڼۍ', badge: 'نښه', progress: 'د پرمختګ پټه', searchField: 'د لټون ځای', dialog: 'د خبرو کړکۍ', tab: 'ټب', drawer: 'اړخنۍ غورنۍ', toast: 'لنډ پیغام', card: 'د زده کړې کارت',
  sort: 'د برخې د نوم له مخې ترتیب', page: 'پاڼه {{page}} له {{total}} څخه', pagination: 'د لړلیک پاڼې', prev: 'مخکینۍ پاڼه', next: 'بله پاڼه',
  noMatch: 'برخه ونه موندل شوه', clear: 'چاڼونه پاک کړئ', changeFilter: 'بل نوم یا بله ډله وازمویئ.',
  sample: 'د ډیزاین بېلګې', sampleNote: 'دا بېلګې ښيي چې راتلونکي درسي مواد څنګه وړاندې کېدای شي.', detail: 'د کارت جزیات', cardDetails: 'پر دې کارت ښودل شوي معلومات', dismiss: 'جزیات وتړئ',
  course: 'کورس', video: 'ویډیو', book: 'کتاب', short: 'لنډه ویډیو', path: 'د زده کړې لاره',
  courseName: 'د هندسې بنسټونه', videoName: 'له کسرونو سره کار', bookName: 'د بوټو د ژوند لارښود', shortName: 'په انګلیسي کې یو سلام', pathName: 'د کمپیوټر لومړي ګامونه',
  courseMeta: 'ریاضي · لومړنۍ کچه', videoMeta: 'ریاضي · حل شوې بېلګه', bookMeta: 'بیولوژي · لوستل', shortMeta: 'انګلیسي · خبرې اترې', pathMeta: 'ډیجیټلي مهارتونه · لومړنۍ کچه',
  courseFields: 'د کورس نوم، مضمون او کچه', videoFields: 'د ویډیو نوم، مضمون او بڼه', bookFields: 'د کتاب نوم، مضمون او بڼه', shortFields: 'د لنډې ویډیو نوم، ژبه او موضوع', pathFields: 'د لارې نوم، مضمون او کچه',
  stateExample: 'د حالت بېلګې', state: 'حالت', loading: 'بارېږي', empty: 'تش', error: 'تېروتنه',
  loadingTitle: 'د بېلګې مواد بارېږي…', emptyTitle: 'په دې بېلګه کې مواد نشته', errorTitle: 'د اړیکې د تېروتنې بېلګه', errorHint: 'د پیغامونو د پرتله کولو لپاره بل حالت وټاکئ.',
  progressExample: 'د پرمختګ بېلګه', media: 'د غږ کنټرولونه', audioDesc: 'د دوو غږونو ځايي بېلګه واورئ. په دې بېلګه کې خبرې نشته.', audioFallback: 'ستاسو براوزر دا غږیزه بېلګه نه شي غږولای.',
  resetTitle: 'بېلګې بېرته لومړني حالت ته ګرځوئ؟', resetDetail: 'د بېلګې چاڼونه پاکېږي او د مخکتنې لومړني تنظیمات بېرته راګرځي.', cancel: 'لغوه کول', resetDone: 'بېلګې لومړني حالت ته وګرځېدې.',
  unknown: 'پاڼه نشته', back: 'عمومي کتنې ته ورشئ',
};

for (const [lang, bundle] of Object.entries({ en, 'fa-AF': fa, ps })) {
  i18n.addResourceBundle(lang, 'admin', bundle, true, true);
}
