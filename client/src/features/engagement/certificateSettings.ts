import axios from 'axios';
import { i18n } from '../../i18n';

export const certificateSettingsNamespace = 'certificateSettings';
export const templateLanguages = ['en', 'ps', 'fa-AF'] as const;
export interface CertificateTemplate {
  layout: 'classic' | 'simple';
  enabled: boolean;
  titles: Record<(typeof templateLanguages)[number], string>;
}
export interface CertificateSettings {
  templates: CertificateTemplate[];
  version: number;
}
export interface CertificateReceipt {
  code: string;
  courseSlug: string;
  locale: string;
  issuedAt: string;
  withdrawn: boolean;
}
const service = axios.create({ baseURL: '/api/v1', timeout: 12_000 });
const admin = '/admin/certificates';
export const defaultCertificateTemplates: CertificateTemplate[] = ['classic', 'simple'].map(layout => ({
  layout: layout as CertificateTemplate['layout'], enabled: true, titles: { en: '', ps: '', 'fa-AF': '' },
}));

export async function publicCertificateTemplates(signal: AbortSignal) {
  return (await service.get<{ templates: CertificateTemplate[] }>('/certificate-templates', { signal })).data.templates;
}

export async function readCertificateSettings(signal: AbortSignal) {
  return (await service.get<CertificateSettings>(admin, { signal })).data;
}

export async function saveCertificateSettings(settings: CertificateSettings) {
  return (await service.put<CertificateSettings>(admin, settings)).data;
}

export async function readCertificateReceipt(code: string) {
  return (await service.get<{ receipt: CertificateReceipt }>(admin + '/' + encodeURIComponent(code))).data.receipt;
}

export async function updateCertificateReceipt(code: string, withdrawn: boolean) {
  return (await service.patch<{ receipt: CertificateReceipt }>(admin + '/' + encodeURIComponent(code), { withdrawn })).data.receipt;
}

const en = {
  title: 'Certificate settings', templates: 'Printable templates', enabled: 'Available to learners',
  customTitle: 'Optional certificate heading', save: 'Save templates', saving: 'Saving…', saved: 'Certificate templates saved.',
  leastOne: 'Keep at least one template available.', load: 'Loading certificate settings…', retry: 'Reload settings',
  failure: 'The request failed. Check your access and try again.', stale: 'The settings changed. Reload before saving again.',
  lookup: 'Public verification record', lookupHelp: 'Look up a code shared by a learner. Records contain no learner name.',
  code: 'Verification code', find: 'Find record', notFound: 'No public verification record matches this code.',
  withdrawn: 'Public verification withdrawn', available: 'Public verification available for a published course',
  withdraw: 'Withdraw public verification', reinstate: 'Restore public verification',
  confirmWithdraw: 'Withdraw public verification for this code?', confirmReinstate: 'Restore public verification for this code?',
  changed: 'Verification status updated.',
};
const ps: typeof en = {
  title: 'د تصدیق‌لیک امستنې', templates: 'د چاپ وړ بڼې', enabled: 'زده کوونکو ته د لاسرسي وړ',
  customTitle: 'د تصدیق‌لیک اختیاري سرلیک', save: 'بڼې خوندي کړئ', saving: 'خوندي کېږي…', saved: 'د تصدیق‌لیک بڼې خوندي شوې.',
  leastOne: 'لږ تر لږه یوه بڼه د لاسرسي وړ پرېږدئ.', load: 'د تصدیق‌لیک امستنې بارېږي…', retry: 'امستنې بیا بار کړئ',
  failure: 'غوښتنه ناکامه شوه. خپل لاسرسی وګورئ او بیا هڅه وکړئ.', stale: 'امستنې بدلې شوې. له خوندي کولو مخکې یې بیا بار کړئ.',
  lookup: 'د عامه تایید ثبت', lookupHelp: 'هغه کوډ ولټوئ چې زده کوونکي شریک کړی وي. ثبتونه د زده کوونکي نوم نه لري.',
  code: 'د تایید کوډ', find: 'ثبت ومومئ', notFound: 'له دې کوډ سره د عامه تایید ثبت نشته.',
  withdrawn: 'عامه تایید بند دی', available: 'د خپاره شوي کورس عامه تایید شته',
  withdraw: 'عامه تایید بند کړئ', reinstate: 'عامه تایید بیا فعال کړئ',
  confirmWithdraw: 'د دې کوډ عامه تایید بند شي؟', confirmReinstate: 'د دې کوډ عامه تایید بیا فعال شي؟',
  changed: 'د تایید حالت تازه شو.',
};
const fa: typeof en = {
  title: 'تنظیمات گواهی', templates: 'قالب‌های قابل چاپ', enabled: 'در دسترس یادگیرندگان',
  customTitle: 'عنوان اختیاری گواهی', save: 'ذخیرۀ قالب‌ها', saving: 'در حال ذخیره…', saved: 'قالب‌های گواهی ذخیره شدند.',
  leastOne: 'دست‌کم یک قالب را در دسترس بگذارید.', load: 'در حال بارگیری تنظیمات گواهی…', retry: 'بارگیری دوبارۀ تنظیمات',
  failure: 'درخواست انجام نشد. دسترسی خود را بررسی کنید و دوباره بکوشید.', stale: 'تنظیمات تغییر کرده‌اند. پیش از ذخیره دوباره بارگیری کنید.',
  lookup: 'سابقۀ تأیید عمومی', lookupHelp: 'کدی را جست‌وجو کنید که یادگیرنده به اشتراک گذاشته است. سوابق نام یادگیرنده را ندارند.',
  code: 'کد تأیید', find: 'یافتن سابقه', notFound: 'سابقۀ تأیید عمومی برای این کد پیدا نشد.',
  withdrawn: 'تأیید عمومی غیرفعال است', available: 'تأیید عمومی برای دورۀ منتشرشده فعال است',
  withdraw: 'غیرفعال کردن تأیید عمومی', reinstate: 'فعال‌سازی دوبارۀ تأیید عمومی',
  confirmWithdraw: 'تأیید عمومی این کد غیرفعال شود؟', confirmReinstate: 'تأیید عمومی این کد دوباره فعال شود؟',
  changed: 'وضعیت تأیید به‌روز شد.',
};
for (const [locale, labels] of [['en', en], ['ps', ps], ['fa-AF', fa]] as const) {
  i18n.addResourceBundle(locale, certificateSettingsNamespace, labels);
}
