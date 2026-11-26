import { randomUUID } from 'node:crypto';
import { ForeignKeyConstraintError, QueryTypes, UniqueConstraintError, type Sequelize, type Transaction } from 'sequelize';
import { publishedLocale } from '../courses/reader';
import { transitionAllowed, type EducationStatus } from '../education/contract';
import { normalizeEducationSearch } from '../education/models';
import { publicEducationEntry } from '../education/store';
import { DiscoveryError, type DailySettings, type EditorialPath, type PathInput, type PathListQuery, type Reference, type Translation } from './contract';
import { discoverySearch, publicPath } from './search';

type PathRow = Omit<EditorialPath, 'updatedAt' | 'translations' | 'activities'> & { updatedAt: Date };
type DailyRow = Omit<DailySettings, 'activities'> & { activities: string };
const pathFields = 'p.id, p.slug, p.status, p.version, p.updated_at AS updatedAt, p.subject_id AS subjectId, p.level_id AS levelId';
const editable = ['draft', 'educational-review', 'translation-review'] as readonly EducationStatus[];
const deletable = ['draft', 'archived'] as readonly EducationStatus[];
const dayLength = 24 * 60 * 60 * 1000;
const kabulDate = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function dailyIndex(now: Date) {
  const parts = new Map(kabulDate.formatToParts(now).map(({ type, value }) => [type, value]));
  const year = Number(parts.get('year'));
  const month = Number(parts.get('month'));
  const day = Number(parts.get('day'));
  const utc = Date.UTC(year, month - 1, day);
  return { index: Math.floor(utc / dayLength), date: new Date(utc).toISOString().slice(0, 10) };
}

function writeError(error: unknown): never {
  if (error instanceof UniqueConstraintError) throw new DiscoveryError('CONFLICT');
  if (error instanceof ForeignKeyConstraintError) throw new DiscoveryError('INVALID_REFERENCE');
  throw error;
}

export function createDiscoveryStore(db: Sequelize) {
  return createGroupedDiscoveryStore(db, false);
}

export function createCollectionStore(db: Sequelize) {
  return createGroupedDiscoveryStore(db, true);
}

function createGroupedDiscoveryStore(db: Sequelize, collection: boolean) {
  const discovery = discoverySearch(db);
  const table = collection ? 'course_collections' : 'learning_paths';
  const translationTable = collection ? 'course_collection_translations' : 'learning_path_translations';
  const itemTable = collection ? 'course_collection_items' : 'learning_path_items';
  const publicVisibility = collection ? `p.status = 'published' AND EXISTS (
    SELECT 1 FROM course_collection_translations t WHERE t.path_id = p.id AND ${publishedLocale('t.locale')})` : publicPath;

  async function dailySettings(transaction?: Transaction, lock = false): Promise<DailySettings> {
    const [row] = await db.query<DailyRow>(`SELECT mode, CAST(activities AS CHAR) AS activities, version
      FROM daily_learning_settings WHERE id = 1${lock ? ' FOR UPDATE' : ''}`, { type: QueryTypes.SELECT, transaction });
    if (!row) throw new DiscoveryError('NOT_FOUND');
    return { mode: row.mode, version: row.version, activities: JSON.parse(row.activities) as Reference[] };
  }

  function pathTranslations(id: string, transaction: Transaction, publicOnly = false) {
    return db.query<Translation>(`SELECT locale, title, description FROM ${translationTable} t
      WHERE t.path_id = :id ${publicOnly ? 'AND ' + publishedLocale('t.locale') : ''} ORDER BY locale`,
      { type: QueryTypes.SELECT, replacements: { id }, transaction });
  }

  function pathActivities(id: string, transaction: Transaction) {
    return db.query<Reference>(`SELECT kind, COALESCE(course_id, lesson_id, media_id, book_id, quiz_id) AS id
      FROM ${itemTable} WHERE path_id = :id ORDER BY position`, { type: QueryTypes.SELECT, replacements: { id }, transaction });
  }

  async function pathRow(id: string, transaction: Transaction, lock = false) {
    const [row] = await db.query<PathRow>(`SELECT ${pathFields} FROM ${table} p WHERE p.id = :id${lock ? ' FOR UPDATE' : ''}`,
      { type: QueryTypes.SELECT, replacements: { id }, transaction });
    if (!row) throw new DiscoveryError('NOT_FOUND');
    return row;
  }

  async function expand(row: PathRow, transaction: Transaction, publicOnly = false, language = 'en'): Promise<EditorialPath> {
    const translations = await pathTranslations(row.id, transaction, publicOnly);
    const references = await pathActivities(row.id, transaction);
    const candidates = await discovery.references(references, language, transaction);
    const activities = references.map((reference, index) => ({ reference, activity: candidates[index] ?? null }));
    return { ...row, updatedAt: row.updatedAt.toISOString(), translations,
      activities: publicOnly ? activities.filter(item => item.activity) : activities };
  }

  async function validateActivityList(activities: Reference[], transaction: Transaction) {
    if (collection && activities.some(item => item.kind !== 'course')) throw new DiscoveryError('INVALID_REFERENCE');
    const chosen = await discovery.references(activities, 'en', transaction);
    if (chosen.some(item => !item)) throw new DiscoveryError('INVALID_REFERENCE');
  }

  async function validateTaxonomy(subjectId: string | null, levelId: string | null, transaction: Transaction) {
    if (!subjectId && !levelId) return;
    const [matches] = await db.query<{ total: number | string }>(`SELECT COUNT(*) AS total FROM education_entries e WHERE
      ((e.id = :subjectId AND e.kind = 'subjects') OR (e.id = :levelId AND e.kind = 'levels')) ${publicEducationEntry}`,
    { type: QueryTypes.SELECT, replacements: { subjectId, levelId }, transaction });
    if (Number(matches?.total ?? 0) !== Number(Boolean(subjectId)) + Number(Boolean(levelId))) throw new DiscoveryError('INVALID_REFERENCE');
  }

  async function validateLocales(translations: Translation[], transaction: Transaction) {
    const [matches] = await db.query<{ total: number | string }>(`SELECT COUNT(*) AS total FROM education_languages lang
      WHERE lang.locale IN (:locales) AND ${publishedLocale('lang.locale')}`,
    { type: QueryTypes.SELECT, replacements: { locales: translations.map(item => item.locale) }, transaction });
    if (Number(matches?.total ?? 0) !== translations.length) throw new DiscoveryError('INVALID_REFERENCE');
  }

  async function validatePath(input: PathInput, transaction: Transaction) {
    await validateTaxonomy(input.subjectId, input.levelId, transaction);
    await validateLocales(input.translations, transaction);
    await validateActivityList(input.activities, transaction);
  }

  async function writeContents(id: string, input: PathInput, transaction: Transaction) {
    await db.query(`DELETE FROM ${translationTable} WHERE path_id = :id`, { replacements: { id }, transaction });
    await db.query(`DELETE FROM ${itemTable} WHERE path_id = :id`, { replacements: { id }, transaction });
    for (const translation of input.translations) {
      await db.query(`INSERT INTO ${translationTable} (path_id, locale, title, description, search_text)
        VALUES (:id, :locale, :title, :description, :search)`,
      { replacements: { id, ...translation, search: normalizeEducationSearch(translation.title + ' ' + translation.description) }, transaction });
    }
    for (const [position, reference] of input.activities.entries()) {
      const media = reference.kind === 'video' || reference.kind === 'short';
      await db.query(`INSERT INTO ${itemTable} (path_id, position, kind, course_id, lesson_id, media_id, book_id, quiz_id)
        VALUES (:id, :position, :kind, :course, :lesson, :media, :book, :quiz)`,
      { replacements: { id, position, kind: reference.kind,
        course: reference.kind === 'course' ? reference.id : null,
        lesson: reference.kind === 'lesson' ? reference.id : null,
        media: media ? reference.id : null,
        book: reference.kind === 'book' ? reference.id : null,
        quiz: reference.kind === 'quiz' ? reference.id : null,
      }, transaction });
    }
  }

  return {
    search: discovery.search,
    recommendations: discovery.recommendations,
    activityPreviews: discovery.references,
    dailySettings,

    async daily(language?: string, now = new Date()) {
      const { index, date } = dailyIndex(now);
      const settings = await dailySettings();
      if (settings.mode === 'off') return { date, item: null };
      if (settings.mode === 'automatic') return { date, item: await discovery.pickDaily(index, language) };
      const items = (await discovery.references(settings.activities, language)).filter(item => item !== null);
      return { date, item: items.length ? items[(index % items.length + items.length) % items.length]! : null };
    },

    async updateDaily(input: DailySettings) {
      return db.transaction(async transaction => {
        const current = await dailySettings(transaction, true);
        if (current.version !== input.version) throw new DiscoveryError('STALE_VERSION');
        if (input.mode === 'curated' && !input.activities.length) throw new DiscoveryError('INCOMPLETE_PATH');
        await validateActivityList(input.activities, transaction);
        await db.query(`UPDATE daily_learning_settings SET mode = :mode, activities = :serialized, version = version + 1,
          updated_at = NOW(3) WHERE id = 1`,
        { replacements: { mode: input.mode, serialized: JSON.stringify(input.activities) }, transaction });
        return dailySettings(transaction);
      });
    },

    async adminPaths(query: PathListQuery) {
      return db.transaction(async transaction => {
        const normalized = normalizeEducationSearch(query.q);
        const offset = (query.page - 1) * query.pageSize;
        const filters = ['1 = 1'];
        if (query.status) filters.push('p.status = :status');
        if (normalized) filters.push(`(LOCATE(:normalized, CONVERT(p.slug USING utf8mb4) COLLATE utf8mb4_unicode_ci) > 0
          OR EXISTS (SELECT 1 FROM ${translationTable} t WHERE t.path_id = p.id AND LOCATE(:normalized, t.search_text) > 0))`);
        const clause = `FROM ${table} p WHERE ` + filters.join(' AND ');
        const options = { type: QueryTypes.SELECT as const, transaction, replacements: { ...query, normalized, offset, limit: query.pageSize } };
        const [count] = await db.query<{ total: number | string }>('SELECT COUNT(*) AS total ' + clause, options);
        const rows = await db.query<PathRow & { activityCount: number | string }>(`SELECT ${pathFields}, (
          SELECT COUNT(*) FROM ${itemTable} a WHERE a.path_id = p.id) AS activityCount ${clause}
          ORDER BY p.updated_at DESC, p.id LIMIT :limit OFFSET :offset`, options);
        const items = [];
        for (const row of rows) items.push({ ...row, activityCount: Number(row.activityCount),
          updatedAt: row.updatedAt.toISOString(), translations: await pathTranslations(row.id, transaction) });
        return { items, total: Number(count?.total ?? 0), page: query.page, pageSize: query.pageSize };
      });
    },

    async publicCollections(query: PathListQuery & { language?: string; preferred?: string }) {
      const term = normalizeEducationSearch(query.q);
      const language = query.language ?? null;
      const preferred = query.preferred ?? 'en';
      const locale = 't.path_id = p.id AND ' + publishedLocale('t.locale');
      // Match the same public translation that the list will display for this result.
      const selectedLocale = `SELECT t.locale FROM ${translationTable} t WHERE ${locale}
        AND (:language IS NULL OR t.locale = :language)
        ORDER BY t.locale = :preferred DESC, t.locale = 'en' DESC, t.locale LIMIT 1`;
      const clause = `FROM ${table} p JOIN ${translationTable} t ON t.path_id = p.id AND t.locale = (${selectedLocale})
        WHERE ${publicVisibility} AND (:term = '' OR LOCATE(:term, t.search_text) > 0)`;
      return db.transaction(async transaction => {
        const options = { transaction, type: QueryTypes.SELECT as const,
          replacements: { term, language, preferred, limit: query.pageSize, offset: (query.page - 1) * query.pageSize } };
        const [count] = await db.query<{ total: number | string }>('SELECT COUNT(*) AS total ' + clause, options);
        const rows = await db.query<Translation & { id: string; slug: string }>(
          `SELECT p.id, p.slug, t.locale, t.title, t.description ${clause}
          ORDER BY p.updated_at DESC, p.id LIMIT :limit OFFSET :offset`, options);
        const items = rows.map(({ slug, ...row }) => ({ ...row, kind: 'collection', href: '/collections/' + slug }));
        return { items, total: Number(count?.total ?? 0), page: query.page, pageSize: query.pageSize };
      });
    },

    async publicPath(slug: string, language?: string) {
      return db.transaction(async transaction => {
        const [row] = await db.query<PathRow>(`SELECT ${pathFields} FROM ${table} p WHERE p.slug = :slug AND ${publicVisibility}`,
          { type: QueryTypes.SELECT, replacements: { slug }, transaction });
        if (!row) throw new DiscoveryError('NOT_FOUND');
        const { id, translations, activities } = await expand(row, transaction, true, language);
        return { id, slug: row.slug, translations, activities: activities.flatMap(item => item.activity ? [item.activity] : []) };
      });
    },

    async get(id: string) {
      return db.transaction(async transaction => expand(await pathRow(id, transaction), transaction));
    },

    async create(input: PathInput) {
      try {
        return await db.transaction(async transaction => {
          await validatePath(input, transaction);
          const id = randomUUID();
          await db.query(`INSERT INTO ${table} (id, slug, status, subject_id, level_id, created_at, updated_at)
            VALUES (:id, :slug, 'draft', :subjectId, :levelId, NOW(3), NOW(3))`, { replacements: { id, ...input }, transaction });
          await writeContents(id, input, transaction);
          return expand(await pathRow(id, transaction), transaction);
        });
      } catch (error) { return writeError(error); }
    },

    async update(id: string, input: PathInput, version: number) {
      try {
        return await db.transaction(async transaction => {
          const row = await pathRow(id, transaction, true);
          if (row.version !== version) throw new DiscoveryError('STALE_VERSION');
          if (!editable.includes(row.status)) throw new DiscoveryError('INVALID_TRANSITION');
          await validatePath(input, transaction);
          await db.query(`UPDATE ${table} SET slug = :slug, subject_id = :subjectId, level_id = :levelId,
            version = version + 1, updated_at = NOW(3) WHERE id = :id`, { replacements: { id, ...input }, transaction });
          await writeContents(id, input, transaction);
          return expand(await pathRow(id, transaction), transaction);
        });
      } catch (error) { return writeError(error); }
    },

    async changeStatus(id: string, status: EducationStatus, version: number) {
      return db.transaction(async transaction => {
        const row = await pathRow(id, transaction, true);
        if (row.version !== version) throw new DiscoveryError('STALE_VERSION');
        if (!transitionAllowed(row.status, status)) throw new DiscoveryError('INVALID_TRANSITION');
        if (status === 'approved' || status === 'published') {
          const translations = await pathTranslations(id, transaction, true);
          const activities = await pathActivities(id, transaction);
          if (!translations.some(item => item.description.trim()) || !activities.length) throw new DiscoveryError('INCOMPLETE_PATH');
          await validateTaxonomy(row.subjectId, row.levelId, transaction);
          await validateActivityList(activities, transaction);
        }
        await db.query(`UPDATE ${table} SET status = :status, version = version + 1, updated_at = NOW(3) WHERE id = :id`,
          { replacements: { id, status }, transaction });
        return expand(await pathRow(id, transaction), transaction);
      });
    },

    async remove(id: string, version: number) {
      await db.transaction(async transaction => {
        const row = await pathRow(id, transaction, true);
        if (row.version !== version) throw new DiscoveryError('STALE_VERSION');
        if (!deletable.includes(row.status)) throw new DiscoveryError('INVALID_TRANSITION');
        await db.query(`DELETE FROM ${table} WHERE id = :id`, { replacements: { id }, transaction });
      });
    },
  };
}

export type DiscoveryStore = ReturnType<typeof createDiscoveryStore>;
