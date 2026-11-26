import { randomUUID } from 'node:crypto';
import { ForeignKeyConstraintError, QueryTypes, UniqueConstraintError, type Sequelize, type Transaction } from 'sequelize';
import { transitionAllowed, type EducationStatus } from '../education/contract';
import { normalizeEducationSearch } from '../education/models';
import { publicEducationEntry } from '../education/store';
import { bookReviewOwner } from '../media/contract';
import { defineMediaModels, type AssetRow } from '../media/models';
import { BookError, type BookInput } from './contract';
import { defineBookModels } from './models';
import { bookReader } from './reader';

const ownerType = 'book';
const editable: readonly EducationStatus[] = ['draft', 'educational-review', 'translation-review'];
const deletable: readonly EducationStatus[] = ['draft', 'archived'];
const noReview = { reviewNote: '', reviewedAt: null, reviewedBy: null, reviewedPdfVersion: null, reviewedCoverVersion: null };
type AssetAccess = 'draft-allowed' | 'draft-forbidden' | 'published';

function fields(input: BookInput) {
  const { slug, pdfId, coverId, categoryId, levelId, gradeId, contentLanguage, author, publisher, publicationYear, edition } = input;
  return { slug, pdfId, coverId, categoryId, levelId, gradeId, contentLanguage, author, publisher, publicationYear, edition,
    searchText: normalizeEducationSearch([slug, author, publisher, publicationYear, edition].join(' ')) };
}

function attachmentIds(book: Pick<BookInput, 'pdfId' | 'coverId'>) {
  return [book.pdfId, book.coverId].filter((id): id is string => Boolean(id));
}

function expectedVersion(file: AssetRow) {
  return file.version + (file.status === 'draft' ? 1 : 0);
}

function writeError(error: unknown): never {
  if (error instanceof UniqueConstraintError) throw new BookError('CONFLICT');
  if (error instanceof ForeignKeyConstraintError) throw new BookError('INVALID_REFERENCE');
  throw error;
}

export function createBookStore(db: Sequelize) {
  const { Book, Translation } = defineBookModels(db);
  const { Asset, Reference } = defineMediaModels(db);
  const reader = bookReader(db);

  async function requiredRecord(id: string, transaction: Transaction) {
    const record = await reader.get(id, transaction);
    if (!record) throw new BookError('NOT_FOUND');
    return record;
  }

  async function requireVersion(id: string, version: number, transaction: Transaction) {
    const record = await Book.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!record) throw new BookError('NOT_FOUND');
    if (record.getDataValue('version') !== version) throw new BookError('STALE_VERSION');
    return record;
  }

  async function lockAssets(ids: string[], transaction: Transaction) {
    if (!ids.length) return new Map<string, AssetRow>();
    const rows = await Asset.findAll({ where: { id: [...new Set(ids)] }, order: [['id', 'ASC']], transaction,
      lock: transaction.LOCK.UPDATE });
    return new Map(rows.map(asset => [asset.getDataValue('id'), asset.get()]));
  }

  async function validateTaxonomy(input: BookInput, transaction: Transaction, publishedRequired: boolean) {
    const choices = new Map([
      ['categories', input.categoryId],
      ['levels', input.levelId],
      ['grades', input.gradeId],
    ] as const);
    const ids = [...choices.values()].filter((id): id is string => id !== null);
    if (!ids.length) return;
    const rows = await db.query<{ id: string; kind: 'categories' | 'levels' | 'grades' }>(`
      SELECT e.id, e.kind FROM education_entries e WHERE e.id IN (:ids)
        AND e.kind IN ('categories','levels','grades')
        ${publishedRequired ? publicEducationEntry : "AND e.status <> 'archived'"}
      ORDER BY e.id LOCK IN SHARE MODE
    `, { type: QueryTypes.SELECT, replacements: { ids }, transaction });
    if (rows.length !== ids.length || rows.some(row => choices.get(row.kind) !== row.id)) {
      throw new BookError('INVALID_REFERENCE');
    }
  }

  async function validateLanguages(input: BookInput, transaction: Transaction, publishedRequired: boolean) {
    const tags = input.translations.map(translation => translation.locale);
    if (input.contentLanguage) tags.push(input.contentLanguage);
    const locales = [...new Set(tags)];
    if (!locales.length) throw new BookError('INCOMPLETE_CONTENT');
    const matches = await db.query<{ locale: string; status: EducationStatus }>(`
      SELECT lang.locale, e.status FROM education_languages lang
      JOIN education_entries e ON e.id = lang.entry_id
      WHERE lang.locale IN (:locales) ORDER BY lang.locale LOCK IN SHARE MODE
    `, { type: QueryTypes.SELECT, replacements: { locales }, transaction });
    if (matches.length !== locales.length) throw new BookError('INVALID_REFERENCE');
    if (publishedRequired) {
      const eligible = new Set(matches.filter(item => item.status === 'published').map(item => item.locale));
      if (!input.contentLanguage || !eligible.has(input.contentLanguage) ||
          !input.translations.some(item => eligible.has(item.locale) && item.description.trim())) {
        throw new BookError('INCOMPLETE_CONTENT');
      }
    }
  }

  function selectFile(assetId: string | null, kind: 'pdf' | 'image', assets: Map<string, AssetRow>, access: AssetAccess) {
    if (!assetId) return null;
    const asset = assets.get(assetId);
    if (asset?.status === 'draft' && access === 'draft-forbidden') throw new BookError('DRAFT_MEDIA_FORBIDDEN');
    if (!asset || asset.kind !== kind || !['draft', 'published'].includes(asset.status)) {
      throw new BookError('INVALID_REFERENCE');
    }
    if (access === 'published' && asset.status === 'draft') throw new BookError('FILES_UNPUBLISHED');
    return asset;
  }

  function selectFiles(input: BookInput, assets: Map<string, AssetRow>, access: AssetAccess) {
    return {
      pdf: selectFile(input.pdfId, 'pdf', assets, access),
      cover: selectFile(input.coverId, 'image', assets, access),
    };
  }

  async function validateReady(input: BookInput, assets: Map<string, AssetRow>, access: AssetAccess, transaction: Transaction) {
    if (!input.pdfId || !input.contentLanguage || !input.author.trim()) throw new BookError('INCOMPLETE_CONTENT');
    await validateTaxonomy(input, transaction, true);
    await validateLanguages(input, transaction, true);
    const { pdf, cover } = selectFiles(input, assets, access);
    if (!pdf?.license.trim() || !pdf.source.trim() || (cover && (!cover.license.trim() || !cover.source.trim()))) {
      throw new BookError('INCOMPLETE_CONTENT');
    }
    return { pdf, cover };
  }

  function writeTranslations(id: string, input: BookInput, transaction: Transaction) {
    return Translation.bulkCreate(input.translations.map(translation => ({
      ...translation, bookId: id,
      searchText: normalizeEducationSearch(translation.title + ' ' + translation.description),
    })), { transaction });
  }

  async function linkAssets(ownerId: string, assetIds: string[], transaction: Transaction) {
    if (!assetIds.length) return;
    await Reference.bulkCreate(assetIds.flatMap(assetId => [
      { assetId, ownerType, ownerId, published: false },
      { assetId, ownerType: bookReviewOwner, ownerId, published: false },
    ]), { transaction });
  }

  async function unlinkAssets(ownerId: string, assetIds: string[], transaction: Transaction) {
    if (!assetIds.length) return;
    await Reference.destroy({ where: { assetId: assetIds, ownerId, ownerType: [ownerType, bookReviewOwner] }, transaction });
  }

  return {
    list: reader.list,
    findPublic: reader.findPublic,
    findPublicPdfId: reader.findPublicPdfId,

    get(id: string) {
      return db.transaction(transaction => requiredRecord(id, transaction));
    },

    async create(input: BookInput, actorId: string, allowDraftMedia = false) {
      try {
        return await db.transaction(async transaction => {
          await validateTaxonomy(input, transaction, false);
          await validateLanguages(input, transaction, false);
          const ids = attachmentIds(input);
          const assets = await lockAssets(ids, transaction);
          selectFiles(input, assets, allowDraftMedia ? 'draft-allowed' : 'draft-forbidden');
          const id = randomUUID();
          const now = new Date();
          await Book.create({ ...fields(input), ...noReview, id, creatorId: actorId, version: 1, status: 'draft',
            createdAt: now, updatedAt: now }, { transaction });
          await writeTranslations(id, input, transaction);
          await linkAssets(id, ids, transaction);
          return requiredRecord(id, transaction);
        });
      } catch (error) {
        writeError(error);
      }
    },

    async update(id: string, input: BookInput, version: number, allowDraftMedia = false) {
      try {
        return await db.transaction(async transaction => {
          const book = await requireVersion(id, version, transaction);
          if (!editable.includes(book.getDataValue('status'))) throw new BookError('INVALID_TRANSITION');
          await validateTaxonomy(input, transaction, false);
          await validateLanguages(input, transaction, false);
          const previous = attachmentIds(book.get());
          const ids = attachmentIds(input);
          const assets = await lockAssets([...previous, ...ids], transaction);
          selectFiles(input, assets, allowDraftMedia ? 'draft-allowed' : 'draft-forbidden');
          await book.update({ ...fields(input), version: version + 1, updatedAt: new Date() }, { transaction });
          await Translation.destroy({ where: { bookId: id }, transaction });
          await writeTranslations(id, input, transaction);
          await unlinkAssets(id, previous.filter(assetId => !ids.includes(assetId)), transaction);
          await linkAssets(id, ids.filter(assetId => !previous.includes(assetId)), transaction);
          return requiredRecord(id, transaction);
        });
      } catch (error) {
        writeError(error);
      }
    },

    async changeStatus(id: string, status: EducationStatus, version: number, actorId: string, reviewNote: string, allowDraftMedia = false) {
      try {
        return await db.transaction(async transaction => {
          const book = await requireVersion(id, version, transaction);
          const current = book.get();
          if (!transitionAllowed(current.status, status)) throw new BookError('INVALID_TRANSITION');
          const update = { status, version: version + 1, updatedAt: new Date() };
          const ids = attachmentIds(current);
          const assets = await lockAssets(ids, transaction);
          if (status === 'draft') {
            await book.update({ ...update, ...noReview }, { transaction });
            for (const assetId of ids) {
              await Reference.upsert({ assetId, ownerId: id, ownerType: bookReviewOwner, published: false }, { transaction });
            }
          } else if (status === 'approved' || status === 'published') {
            if (status === 'approved' && !reviewNote.trim()) throw new BookError('REVIEW_REQUIRED');
            const input = await requiredRecord(id, transaction);
            const access = status === 'published' ? 'published' : allowDraftMedia ? 'draft-allowed' : 'draft-forbidden';
            const { pdf, cover } = await validateReady(input, assets, access, transaction);
            if (status === 'approved') {
              await book.update({ ...update, reviewNote: reviewNote.trim(), reviewedBy: actorId, reviewedAt: update.updatedAt,
                reviewedPdfVersion: expectedVersion(pdf), reviewedCoverVersion: cover ? expectedVersion(cover) : null }, { transaction });
              await Reference.destroy({ where: { assetId: ids, ownerId: id, ownerType: bookReviewOwner }, transaction });
            } else {
              if (!current.reviewedAt || !current.reviewNote || current.reviewedPdfVersion !== pdf.version ||
                  current.reviewedCoverVersion !== (cover?.version ?? null)) {
                throw new BookError('REVIEW_REQUIRED');
              }
              await book.update(update, { transaction });
              await Reference.update({ published: true }, { where: { assetId: ids, ownerId: id, ownerType }, transaction });
            }
          } else {
            await book.update(update, { transaction });
            if (status === 'archived') {
              await Reference.update({ published: false }, { where: { assetId: ids, ownerId: id, ownerType }, transaction });
            }
          }
          return requiredRecord(id, transaction);
        });
      } catch (error) {
        writeError(error);
      }
    },

    remove(id: string, version: number) {
      return db.transaction(async transaction => {
        const book = await requireVersion(id, version, transaction);
        if (!deletable.includes(book.getDataValue('status'))) throw new BookError('INVALID_TRANSITION');
        const ids = attachmentIds(book.get());
        await lockAssets(ids, transaction);
        await unlinkAssets(id, ids, transaction);
        await book.destroy({ transaction });
      });
    },
  };
}

export type BookStore = ReturnType<typeof createBookStore>;
