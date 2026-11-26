import { randomUUID } from 'node:crypto';
import type { Sequelize, Transaction } from 'sequelize';
import type { EducationKind } from './contract';
import { defineEducationModels, normalizeEducationSearch, type EntryRow, type TranslationRow } from './models';

type LocalNames = [english: string, pashto: string, dari: string];
type Seed = {
  kind: EducationKind;
  slug: string;
  names: LocalNames;
  parentSlug?: string;
  gradeNumber?: number;
  locale?: string;
  direction?: 'ltr' | 'rtl';
};

const locales = ['en', 'ps', 'fa-AF'] as const;
const languages: Seed[] = [
  { kind: 'languages', slug: 'en', locale: 'en', direction: 'ltr', names: ['English', 'انګلیسي', 'انگلیسی'] },
  { kind: 'languages', slug: 'ps', locale: 'ps', direction: 'rtl', names: ['Pashto', 'پښتو', 'پشتو'] },
  { kind: 'languages', slug: 'fa-af', locale: 'fa-AF', direction: 'rtl', names: ['Dari', 'دري', 'دری'] },
];
const categories: [string, ...LocalNames][] = [
  ['school-education', 'School education', 'ښوونیزې زده کړې', 'آموزش مکتب'],
  ['mathematics', 'Mathematics', 'ریاضي', 'ریاضیات'],
  ['biology', 'Biology', 'بیولوژي', 'بیولوژی'],
  ['chemistry', 'Chemistry', 'کیمیا', 'کیمیا'],
  ['physics', 'Physics', 'فزیک', 'فزیک'],
  ['english-language', 'English language', 'انګلیسي ژبه', 'زبان انگلیسی'],
  ['dari-language', 'Dari language', 'دري ژبه', 'زبان دری'],
  ['pashto-language', 'Pashto language', 'پښتو ژبه', 'زبان پشتو'],
  ['computer-science', 'Computer science', 'کمپیوټر ساینس', 'علوم کمپیوتر'],
  ['programming', 'Programming', 'پروګرام جوړونه', 'برنامه‌نویسی'],
  ['artificial-intelligence', 'Artificial intelligence', 'مصنوعي ځیرکتیا', 'هوش مصنوعی'],
  ['digital-literacy', 'Digital literacy', 'ډیجیټلي سواد', 'سواد دیجیتالی'],
  ['university-preparation', 'University preparation', 'پوهنتون ته چمتووالی', 'آمادگی برای پوهنتون'],
  ['professional-development', 'Professional development', 'مسلکي وده', 'رشد مسلکی'],
  ['entrepreneurship', 'Entrepreneurship', 'متشبثیت', 'کارآفرینی'],
  ['graphic-design', 'Graphic design', 'ګرافیک ډیزاین', 'طراحی گرافیک'],
  ['financial-literacy', 'Financial literacy', 'مالي سواد', 'سواد مالی'],
  ['communication-skills', 'Communication skills', 'د اړیکو مهارتونه', 'مهارت‌های ارتباطی'],
  ['daily-life-education', 'Daily-life education', 'د ورځني ژوند زده کړې', 'آموزش زندگی روزمره'],
];
const subjects: [string, string, ...LocalNames][] = [
  ['general-mathematics', 'mathematics', 'General mathematics', 'عمومي ریاضي', 'ریاضیات عمومی'],
  ['life-science', 'biology', 'Life science', 'د ژوند ساینس', 'علوم زیستی'],
  ['general-chemistry', 'chemistry', 'General chemistry', 'عمومي کیمیا', 'کیمیای عمومی'],
  ['general-physics', 'physics', 'General physics', 'عمومي فزیک', 'فزیک عمومی'],
  ['english', 'english-language', 'English', 'انګلیسي', 'انگلیسی'],
  ['dari', 'dari-language', 'Dari', 'دري', 'دری'],
  ['pashto', 'pashto-language', 'Pashto', 'پښتو', 'پشتو'],
  ['computer-basics', 'digital-literacy', 'Computer basics', 'د کمپیوټر بنسټونه', 'مبانی کمپیوتر'],
];
const levels: [string, ...LocalNames][] = [
  ['beginner', 'Beginner', 'لومړنۍ کچه', 'مقدماتی'],
  ['intermediate', 'Intermediate', 'منځنۍ کچه', 'متوسط'],
  ['advanced', 'Advanced', 'لوړه کچه', 'پیشرفته'],
];

export async function seedEducation(db: Sequelize, transaction: Transaction) {
  const seeds: Seed[] = [
    ...languages,
    ...categories.map(([slug, ...names]): Seed => ({ kind: 'categories', slug, names })),
    ...subjects.map(([slug, parentSlug, ...names]): Seed => ({ kind: 'subjects', slug, parentSlug, names })),
    ...levels.map(([slug, ...names]): Seed => ({ kind: 'levels', slug, names })),
    ...Array.from({ length: 12 }, (_, index): Seed => {
      const gradeNumber = index + 1;
      const number = new Intl.NumberFormat('fa-AF', { numberingSystem: 'arabext' }).format(gradeNumber);
      return { kind: 'grades', slug: 'grade-' + gradeNumber, gradeNumber,
        names: ['Grade ' + gradeNumber, 'ټولګی ' + number, 'صنف ' + number] };
    }),
  ];
  const { Entry, Language, Translation } = defineEducationModels(db);
  const now = new Date();
  const categoryIds = new Map<string, string>();
  const allEntries: EntryRow[] = [];
  const allTranslations: TranslationRow[] = [];

  for (const seed of seeds) {
    const id = randomUUID();
    if (seed.kind === 'categories') categoryIds.set(seed.slug, id);
    const categoryId = seed.parentSlug ? categoryIds.get(seed.parentSlug) : null;
    if (seed.parentSlug && !categoryId) throw new Error('Education seed category is missing.');
    allEntries.push({
      id, kind: seed.kind, slug: seed.slug, status: 'published', categoryId: categoryId ?? null,
      categoryKind: categoryId ? 'categories' : null, gradeNumber: seed.gradeNumber ?? null,
      version: 1, createdAt: now, updatedAt: now,
    });
    locales.forEach((locale, index) => {
      const name = seed.names[index]!;
      allTranslations.push({ entryId: id, locale, name, description: '', searchText: normalizeEducationSearch(name) });
    });
  }
  // Insert parents first to satisfy InnoDB's immediate category foreign key.
  await Entry.bulkCreate(allEntries.filter(row => row.kind !== 'subjects'), { transaction });
  await Entry.bulkCreate(allEntries.filter(row => row.kind === 'subjects'), { transaction });
  for (const language of languages) {
    const entry = allEntries.find(row => row.kind === 'languages' && row.slug === language.slug)!;
    await Language.create({
      entryId: entry.id, entryKind: 'languages', locale: language.locale!, direction: language.direction!,
    }, { transaction });
  }
  await Translation.bulkCreate(allTranslations, { transaction });
}
