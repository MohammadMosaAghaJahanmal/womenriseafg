import { randomUUID } from 'node:crypto';
import { ForeignKeyConstraintError, QueryTypes, UniqueConstraintError, type Sequelize, type Transaction } from 'sequelize';
import {
  EducationError, educationKinds, transitionAllowed,
  type EducationInput, type EducationKind, type EducationListOptions, type EducationRecord, type EducationStatus,
} from './contract';
import { defineEducationModels, normalizeEducationSearch, type EntryRow } from './models';

interface EntryProjection extends Pick<EntryRow, 'id' | 'slug' | 'status' | 'categoryId' | 'gradeNumber' | 'version' | 'updatedAt'> {
  locale: string | null;
  direction: 'ltr' | 'rtl' | null;
}
type TranslationProjection = EducationInput['translations'][number] & { entryId: string };

const entryColumns = `e.id, e.slug, e.status, e.category_id AS categoryId,
  e.grade_number AS gradeNumber, e.version, e.updated_at AS updatedAt, lang.locale, lang.direction`;
const entryTables = `FROM education_entries e LEFT JOIN education_languages lang ON lang.entry_id = e.id`;
const publishedTranslation = `AND EXISTS (
  SELECT 1 FROM education_languages listed_language
  JOIN education_entries language_entry ON language_entry.id = listed_language.entry_id
  WHERE listed_language.locale = t.locale AND language_entry.status = 'published'
)`;
const visibleCategory = `category.status = 'published'
AND EXISTS (SELECT 1 FROM education_translations t WHERE t.entry_id = category.id ${publishedTranslation})`;
const publiclyVisible = `AND e.status = 'published'
AND (e.category_id IS NULL OR EXISTS (
  SELECT 1 FROM education_entries category
  WHERE category.id = e.category_id AND ${visibleCategory}
))
AND EXISTS (SELECT 1 FROM education_translations t WHERE t.entry_id = e.id ${publishedTranslation})`;
const editableStatuses: readonly EducationStatus[] = ['draft', 'educational-review', 'translation-review'];
const deletableStatuses: readonly EducationStatus[] = ['draft', 'archived'];

function translateWriteError(error: unknown, referenceError: 'CONFLICT' | 'INVALID_REFERENCE'): never {
  if (error instanceof UniqueConstraintError) throw new EducationError('CONFLICT');
  if (error instanceof ForeignKeyConstraintError) throw new EducationError(referenceError);
  throw error;
}

function translatedSearchPattern(input: string) {
  const text = normalizeEducationSearch(input);
  // Escape LIKE's two wildcards and the escape marker itself.
  return text ? '%' + text.replace(/[=%_]/g, '=$&') + '%' : '';
}

export function createEducationStore(db: Sequelize) {
  const { Entry, Language, Translation } = defineEducationModels(db);

  async function records(rows: EntryProjection[], transaction: Transaction, onlyPublic = false): Promise<EducationRecord[]> {
    if (!rows.length) return [];
    const translations = await db.query<TranslationProjection>(`
      SELECT t.entry_id AS entryId, t.locale, t.name, t.description
      FROM education_translations t
      WHERE t.entry_id IN (:entries) ${onlyPublic ? publishedTranslation : ''}
      ORDER BY t.locale
    `, { type: QueryTypes.SELECT, replacements: { entries: rows.map(item => item.id) }, transaction });
    const byEntry = new Map<string, EducationInput['translations']>();
    for (const { entryId, ...translation } of translations) {
      const labels = byEntry.get(entryId) ?? [];
      labels.push(translation);
      byEntry.set(entryId, labels);
    }
    return rows.map(({ updatedAt, locale, direction, ...row }) => ({
      ...row,
      ...(locale && direction ? { locale, direction } : {}),
      updatedAt: updatedAt.toISOString(),
      translations: byEntry.get(row.id) ?? [],
    }));
  }

  async function get(kind: EducationKind, id: string, transaction: Transaction) {
    const rows = await db.query<EntryProjection>(`
      SELECT ${entryColumns} ${entryTables} WHERE e.kind = $kind AND e.id = $id
    `, { type: QueryTypes.SELECT, bind: { kind, id }, transaction });
    const [record] = await records(rows, transaction);
    if (!record) throw new EducationError('NOT_FOUND');
    return record;
  }

  async function lockEntry(kind: EducationKind, id: string, version: number, transaction: Transaction) {
    const entry = await Entry.findOne({ where: { id, kind }, lock: transaction.LOCK.UPDATE, transaction });
    if (!entry) throw new EducationError('NOT_FOUND');
    if (entry.getDataValue('version') !== version) throw new EducationError('STALE_VERSION');
    return entry;
  }

  function attributes(input: EducationInput) {
    return {
      slug: input.slug,
      categoryId: input.categoryId ?? null,
      categoryKind: input.categoryId ? 'categories' as const : null,
      gradeNumber: input.gradeNumber ?? null,
    };
  }

  async function addTranslations(id: string, translations: EducationInput['translations'], transaction: Transaction) {
    await Translation.bulkCreate(translations.map(translation => ({
      entryId: id, ...translation,
      searchText: normalizeEducationSearch(translation.name + ' ' + translation.description),
    })), { transaction });
  }

  async function verifyPublication(record: EducationRecord, transaction: Transaction) {
    if (record.categoryId) {
      const [category] = await db.query<{ found: number }>(`
        SELECT 1 AS found FROM education_entries category WHERE category.id = $id AND ${visibleCategory}
      `, { type: QueryTypes.SELECT, bind: { id: record.categoryId }, transaction });
      if (!category) throw new EducationError('INVALID_REFERENCE');
    }
    // A language can supply its own label as it becomes publicly available.
    const [hasLabel] = await db.query<{ found: number }>(`
      SELECT 1 AS found FROM education_translations t
      WHERE t.entry_id = $id
        AND (t.locale = $ownLocale OR EXISTS (
          SELECT 1 FROM education_languages lang
          JOIN education_entries language_entry ON language_entry.id = lang.entry_id
          WHERE lang.locale = t.locale AND language_entry.status = 'published'
        ))
      LIMIT 1
    `, { type: QueryTypes.SELECT, bind: { id: record.id, ownLocale: record.locale ?? null }, transaction });
    if (!hasLabel) throw new EducationError('INVALID_REFERENCE');
  }

  return {
    async list(kind: EducationKind, { search, status, page, pageSize, publicOnly = false }: EducationListOptions) {
      return db.transaction(async transaction => {
        const pattern = translatedSearchPattern(search);
        const conditions = `WHERE e.kind = $kind
          ${publicOnly ? publiclyVisible : status ? 'AND e.status = $status' : ''}
          ${pattern ? `AND (CONVERT(e.slug USING utf8mb4) LIKE $pattern ESCAPE '='
            OR LOWER(CONVERT(lang.locale USING utf8mb4)) LIKE $pattern ESCAPE '='
            OR EXISTS (SELECT 1 FROM education_translations t
              WHERE t.entry_id = e.id AND t.search_text LIKE $pattern ESCAPE '='
              ${publicOnly ? publishedTranslation : ''}))` : ''}`;
        const options = { type: QueryTypes.SELECT as const, transaction,
          bind: { kind, status: status ?? null, pattern, pageSize, offset: (page - 1) * pageSize } };
        const [total] = await db.query<{ count: number | string }>(`SELECT COUNT(*) AS count ${entryTables} ${conditions}`, options);
        const rows = await db.query<EntryProjection>(`
          SELECT ${entryColumns} ${entryTables} ${conditions}
          ORDER BY e.grade_number, e.slug, e.id LIMIT $pageSize OFFSET $offset
        `, options);
        return { items: await records(rows, transaction, publicOnly), total: Number(total?.count ?? 0), page, pageSize };
      });
    },

    get(kind: EducationKind, id: string) {
      return db.transaction(transaction => get(kind, id, transaction));
    },

    async create(kind: EducationKind, input: EducationInput) {
      try {
        return await db.transaction(async transaction => {
          const id = randomUUID();
          const now = new Date();
          await Entry.create({ id, kind, ...attributes(input), status: 'draft', version: 1,
            createdAt: now, updatedAt: now }, { transaction });
          if (kind === 'languages') {
            if (!input.locale || !input.direction) throw new EducationError('INVALID_REFERENCE');
            await Language.create({ entryId: id, entryKind: 'languages', locale: input.locale, direction: input.direction }, { transaction });
          }
          await addTranslations(id, input.translations, transaction);
          return get(kind, id, transaction);
        });
      } catch (error) {
        translateWriteError(error, 'INVALID_REFERENCE');
      }
    },

    async update(kind: EducationKind, id: string, input: EducationInput, version: number) {
      try {
        return await db.transaction(async transaction => {
          const entry = await lockEntry(kind, id, version, transaction);
          if (!editableStatuses.includes(entry.getDataValue('status'))) throw new EducationError('INVALID_TRANSITION');
          if (kind === 'languages') {
            const language = await Language.findByPk(id, { transaction });
            if (!language || (input.locale !== undefined && input.locale !== language.getDataValue('locale'))) {
              throw new EducationError('INVALID_REFERENCE');
            }
            if (input.direction) await language.update({ direction: input.direction }, { transaction });
          }
          await entry.update({ ...attributes(input), version: version + 1, updatedAt: new Date() }, { transaction });
          await Translation.destroy({ where: { entryId: id }, transaction });
          await addTranslations(id, input.translations, transaction);
          return get(kind, id, transaction);
        });
      } catch (error) {
        translateWriteError(error, 'INVALID_REFERENCE');
      }
    },

    changeStatus(kind: EducationKind, id: string, status: EducationStatus, version: number) {
      return db.transaction(async transaction => {
        const entry = await lockEntry(kind, id, version, transaction);
        if (!transitionAllowed(entry.getDataValue('status'), status)) throw new EducationError('INVALID_TRANSITION');
        if (status === 'published') await verifyPublication(await get(kind, id, transaction), transaction);
        await entry.update({ status, version: version + 1, updatedAt: new Date() }, { transaction });
        return get(kind, id, transaction);
      });
    },

    async remove(kind: EducationKind, id: string, version: number) {
      try {
        await db.transaction(async transaction => {
          const entry = await lockEntry(kind, id, version, transaction);
          if (!deletableStatuses.includes(entry.getDataValue('status'))) throw new EducationError('INVALID_TRANSITION');
          if (kind === 'languages') {
            // Remove own labels before deleting its metadata. The locale FK
            // prevents deletion when labels on other entries still use it.
            await Translation.destroy({ where: { entryId: id }, transaction });
            await Language.destroy({ where: { entryId: id }, transaction });
          }
          await entry.destroy({ transaction });
        });
      } catch (error) {
        translateWriteError(error, 'CONFLICT');
      }
    },

    async summary() {
      const counts = await db.query<{ kind: EducationKind; total: number | string; published: number | string }>(`
        SELECT kind, COUNT(*) AS total, SUM(status = 'published') AS published
        FROM education_entries GROUP BY kind
      `, { type: QueryTypes.SELECT });
      const byKind = new Map(counts.map(count => [count.kind, count]));
      return educationKinds.map(kind => ({
        kind, total: Number(byKind.get(kind)?.total ?? 0), published: Number(byKind.get(kind)?.published ?? 0),
      }));
    },
  };
}

export type EducationStore = ReturnType<typeof createEducationStore>;
