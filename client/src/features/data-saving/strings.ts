import { i18n } from '../../i18n';

export const dataSavingNamespace = 'dataSaving';

const en = {
  title: 'Data saving',
  description: 'Use fewer images and prefer smaller video versions when they are available.',
  setting: 'Data-saving mode',
  auto: 'Follow the connection',
  on: 'Always on',
  off: 'Off',
  enabled: 'Data saving is on.',
  disabled: 'Data saving is off.',
  notSaved: 'Your choice applies while this page is open. The browser could not save it.',
};
const ps: typeof en = {
  title: 'د انټرنېټ سپما',
  description: 'کله چې شونې وي، لږ انځورونه او د ویډیو وړې نسخې وکاروئ.',
  setting: 'د انټرنېټ د سپما حالت',
  auto: 'د اړیکې له مخې',
  on: 'تل فعال',
  off: 'بند',
  enabled: 'د انټرنېټ سپما فعاله ده.',
  disabled: 'د انټرنېټ سپما بنده ده.',
  notSaved: 'تر څو چې دا پاڼه پرانیستې وي، ستاسې ټاکنه کار کوي. براوزر یې خوندي نه کړه.',
};
const fa: typeof en = {
  title: 'صرفه‌جویی در اینترنت',
  description: 'در صورت دسترسی، از تصویرهای کمتر و نسخه‌های کوچک‌تر ویدیو استفاده کنید.',
  setting: 'حالت صرفه‌جویی در اینترنت',
  auto: 'مطابق با اتصال',
  on: 'همیشه روشن',
  off: 'خاموش',
  enabled: 'صرفه‌جویی در اینترنت روشن است.',
  disabled: 'صرفه‌جویی در اینترنت خاموش است.',
  notSaved: 'تا زمانی که این صفحه باز باشد انتخاب شما اعمال می‌شود. مرورگر نتوانست آن را ذخیره کند.',
};

for (const [locale, strings] of [['en', en], ['ps', ps], ['fa-AF', fa]] as const) {
  i18n.addResourceBundle(locale, dataSavingNamespace, strings, true, true);
}
