import { randomUUID } from 'node:crypto';
import { ForeignKeyConstraintError, QueryTypes, UniqueConstraintError, type Sequelize, type Transaction } from 'sequelize';
import { transitionAllowed, type EducationStatus } from '../education/contract';
import { normalizeEducationSearch } from '../education/models';
import { publicEducationEntry } from '../education/store';
import { learningMediaReviewOwner } from '../media/contract';
import { defineMediaModels, type AssetRow } from '../media/models';
import { aiResourceKinds, LearningMediaError, type LearningMediaInput, type LearningMediaRecord } from './contract';
import { defineLearningMediaModels } from './models';
import { learningMediaReader } from './reader';

const ownerType = 'learning-media';
const editable: readonly EducationStatus[] = ['draft', 'educational-review', 'translation-review'];
const deletable: readonly EducationStatus[] = ['draft', 'archived'];
const noReview = { reviewNote: '', reviewedAt: null, reviewedBy: null, reviewedMediaVersion: null } as const;
type AssetAccess = 'published' | 'draft-allowed' | 'draft-forbidden';

function fields(input: LearningMediaInput) {
  const { slug, kind, mediaId, categoryId, relatedCourseId, relatedLessonId, aiOrigin, aiTool, aiNotes } = input;
  return { slug, kind, mediaId, categoryId, relatedCourseId, relatedLessonId, aiOrigin, aiTool, aiNotes };
}

function writeError(error: unknown): never {
  if (error instanceof UniqueConstraintError) throw new LearningMediaError('CONFLICT');
  if (error instanceof ForeignKeyConstraintError) throw new LearningMediaError('INVALID_REFERENCE');
  throw error;
}

export function createLearningMediaStore(db: Sequelize, { shortMaxSeconds }: { shortMaxSeconds: number }) {
  const { Item, Translation } = defineLearningMediaModels(db);
  const { Asset, Reference } = defineMediaModels(db);
  const reader = learningMediaReader(db);

  async function requiredRecord(id: string, transaction: Transaction): Promise<LearningMediaRecord> {
    const record = await reader.get(id, transaction);
    if (!record) throw new LearningMediaError('NOT_FOUND');
    return record;
  }

  async function requireVersion(id: string, version: number, transaction: Transaction) {
    const record = await Item.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!record) throw new LearningMediaError('NOT_FOUND');
    if (record.getDataValue('version') !== version) throw new LearningMediaError('STALE_VERSION');
    return record;
  }

  async function lockAssets(ids: (string | null)[], transaction: Transaction) {
    const chosen = [...new Set(ids.filter((id): id is string => id !== null))];
    if (!chosen.length) return new Map<string, AssetRow>();
    const results = await Asset.findAll({ where: { id: chosen }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    return new Map(results.map(asset => [asset.getDataValue('id'), asset.get()]));
  }

  async function validateCategory(categoryId: string | null, transaction: Transaction, publishedRequired: boolean) {
    if (!categoryId) return;
    const [category] = await db.query<{ id: string }>(`
      SELECT e.id FROM education_entries e WHERE e.id = :categoryId AND e.kind = 'categories'
      ${publishedRequired ? publicEducationEntry : "AND e.status <> 'archived'"} LOCK IN SHARE MODE
    `, { type: QueryTypes.SELECT, replacements: { categoryId }, transaction });
    if (!category) throw new LearningMediaError('INVALID_REFERENCE');
  }

  async function validateRelated({ relatedCourseId, relatedLessonId }: LearningMediaInput, transaction: Transaction) {
    if (!relatedCourseId) {
      if (relatedLessonId) throw new LearningMediaError('INVALID_REFERENCE');
      return;
    }
    const [course] = await db.query<{ id: string }>('SELECT id FROM courses WHERE id = :id LOCK IN SHARE MODE',
      { type: QueryTypes.SELECT, replacements: { id: relatedCourseId }, transaction });
    if (!course) throw new LearningMediaError('INVALID_REFERENCE');
    if (!relatedLessonId) return;
    const [lesson] = await db.query<{ id: string }>(`
      SELECT id FROM lessons WHERE id = :lessonId AND course_id = :courseId LOCK IN SHARE MODE
    `, { type: QueryTypes.SELECT, replacements: { lessonId: relatedLessonId, courseId: relatedCourseId }, transaction });
    if (!lesson) throw new LearningMediaError('INVALID_REFERENCE');
  }

  async function validateLanguages(translations: LearningMediaInput['translations'], transaction: Transaction, requireDescription: boolean) {
    const locales = translations.map(item => item.locale);
    const matches = await db.query<{ locale: string; status: EducationStatus }>(`
      SELECT lang.locale, e.status FROM education_languages lang
      JOIN education_entries e ON e.id = lang.entry_id
      WHERE lang.locale IN (:locales) ORDER BY lang.locale LOCK IN SHARE MODE
    `, { type: QueryTypes.SELECT, replacements: { locales }, transaction });
    if (matches.length !== locales.length) throw new LearningMediaError('INVALID_REFERENCE');
    if (requireDescription) {
      const eligible = new Set(matches.filter(item => item.status === 'published').map(item => item.locale));
      if (!translations.some(item => eligible.has(item.locale) && item.description.trim())) {
        throw new LearningMediaError('INCOMPLETE_CONTENT');
      }
    }
  }

  function validatePortrait(file: Pick<AssetRow, 'width' | 'height' | 'durationMs'>) {
    const duration = Number(file.durationMs);
    if (!file.width || !file.height || Math.abs(file.width / file.height - 9 / 16) > 0.035 ||
        !Number.isFinite(duration) || duration <= 0 || duration > shortMaxSeconds * 1_000) {
      throw new LearningMediaError('INVALID_SHORT');
    }
  }

  async function validateAsset(
    input: LearningMediaInput,
    asset: AssetRow | undefined,
    transaction: Transaction,
    access: AssetAccess,
  ) {
    if (!input.mediaId) return;
    if (asset?.status === 'draft' && access === 'draft-forbidden') throw new LearningMediaError('DRAFT_MEDIA_FORBIDDEN');
    if (!asset || !['draft', 'published'].includes(asset.status) || (access === 'published' && asset.status !== 'published') ||
        (input.kind === 'resource' ? !aiResourceKinds.includes(asset.kind) : asset.kind !== 'video')) {
      throw new LearningMediaError('INVALID_REFERENCE');
    }
    if (input.kind !== 'short') return;
    validatePortrait(asset);
    const variants = await db.query<Pick<AssetRow, 'width' | 'height' | 'durationMs'>>(`
      SELECT child.width, child.height, child.duration_ms AS durationMs
      FROM media_links link JOIN media_assets child ON child.id = link.asset_id
      WHERE link.parent_id = :asset AND link.relation = 'video-variant'
    `, { type: QueryTypes.SELECT, replacements: { asset: asset.id }, transaction });
    for (const variant of variants) validatePortrait(variant);
  }

  async function validateDraft(input: LearningMediaInput, transaction: Transaction) {
    await validateCategory(input.categoryId, transaction, false);
    await validateRelated(input, transaction);
    await validateLanguages(input.translations, transaction, false);
  }

  async function validateReady(
    input: LearningMediaInput,
    asset: AssetRow | undefined,
    transaction: Transaction,
    access: AssetAccess,
  ) {
    if (!asset || (input.kind !== 'resource' && !input.categoryId)) throw new LearningMediaError('INCOMPLETE_CONTENT');
    await validateCategory(input.categoryId, transaction, true);
    await validateLanguages(input.translations, transaction, true);
    await validateAsset(input, asset, transaction, access);
    return asset;
  }

  function writeTranslations(id: string, input: LearningMediaInput, transaction: Transaction) {
    return Translation.bulkCreate(input.translations.map(translation => ({
      ...translation,
      learningMediaId: id,
      searchText: normalizeEducationSearch(translation.title + ' ' + translation.description),
    })), { transaction });
  }

  function linkAsset(ownerId: string, assetId: string, transaction: Transaction) {
    return Reference.bulkCreate([
      { assetId, ownerType, ownerId, published: false },
      { assetId, ownerType: learningMediaReviewOwner, ownerId, published: false },
    ], { transaction });
  }

  function unlinkAsset(ownerId: string, assetId: string, transaction: Transaction) {
    return Reference.destroy({ where: { assetId, ownerId, ownerType: [ownerType, learningMediaReviewOwner] }, transaction });
  }

  return {
    list: reader.list,
    findPublic: reader.findPublic,
    findPublicRelated: reader.findPublicRelated,

    get(id: string) {
      return db.transaction(transaction => requiredRecord(id, transaction));
    },

    async create(input: LearningMediaInput, actorId: string, allowDraftMedia = false) {
      try {
        return await db.transaction(async transaction => {
          await validateDraft(input, transaction);
          const assets = await lockAssets([input.mediaId], transaction);
          await validateAsset(input, assets.get(input.mediaId ?? ''), transaction, allowDraftMedia ? 'draft-allowed' : 'draft-forbidden');
          const id = randomUUID();
          const now = new Date();
          await Item.create({ ...fields(input), ...noReview, id, creatorId: actorId, status: 'draft', version: 1,
            createdAt: now, updatedAt: now }, { transaction });
          await writeTranslations(id, input, transaction);
          if (input.mediaId) await linkAsset(id, input.mediaId, transaction);
          return requiredRecord(id, transaction);
        });
      } catch (error) {
        writeError(error);
      }
    },

    async update(id: string, input: LearningMediaInput, version: number, allowDraftMedia = false) {
      try {
        return await db.transaction(async transaction => {
          const item = await requireVersion(id, version, transaction);
          if (!editable.includes(item.getDataValue('status'))) throw new LearningMediaError('INVALID_TRANSITION');
          const previousId = item.getDataValue('mediaId');
          await validateDraft(input, transaction);
          const assets = await lockAssets([previousId, input.mediaId], transaction);
          await validateAsset(input, assets.get(input.mediaId ?? ''), transaction, allowDraftMedia ? 'draft-allowed' : 'draft-forbidden');
          await item.update({ ...fields(input), version: version + 1, updatedAt: new Date() }, { transaction });
          await Translation.destroy({ where: { learningMediaId: id }, transaction });
          await writeTranslations(id, input, transaction);
          if (previousId !== input.mediaId) {
            if (previousId) await unlinkAsset(id, previousId, transaction);
            if (input.mediaId) await linkAsset(id, input.mediaId, transaction);
          }
          return requiredRecord(id, transaction);
        });
      } catch (error) {
        writeError(error);
      }
    },

    async changeStatus(id: string, status: EducationStatus, version: number, actorId: string, reviewNote: string, allowDraftMedia = false) {
      try {
        return await db.transaction(async transaction => {
          const item = await requireVersion(id, version, transaction);
          const current = item.get();
          if (!transitionAllowed(current.status, status)) throw new LearningMediaError('INVALID_TRANSITION');
          const updating = { status, version: version + 1, updatedAt: new Date() };
          const assets = await lockAssets([current.mediaId], transaction);
          if (status === 'draft') await item.update({ ...updating, ...noReview }, { transaction });
          else if (status === 'approved' || status === 'published') {
            if (status === 'approved' && !reviewNote.trim()) throw new LearningMediaError('REVIEW_REQUIRED');
            const record = await requiredRecord(id, transaction);
            const access = status === 'published' ? 'published' : allowDraftMedia ? 'draft-allowed' : 'draft-forbidden';
            const asset = await validateReady(record, assets.get(current.mediaId ?? ''), transaction, access);
            if (status === 'approved') {
              await item.update({ ...updating, reviewNote: reviewNote.trim(), reviewedBy: actorId, reviewedAt: updating.updatedAt,
                reviewedMediaVersion: asset.version + (asset.status === 'draft' ? 1 : 0) }, { transaction });
            } else {
              if (!current.reviewedAt || !current.reviewNote || current.reviewedMediaVersion !== asset.version) {
                throw new LearningMediaError('REVIEW_REQUIRED');
              }
              await item.update(updating, { transaction });
            }
          } else await item.update(updating, { transaction });

          if (current.mediaId) {
            const reference = { assetId: current.mediaId, ownerId: id };
            if (status === 'draft') {
              await Reference.upsert({ ...reference, ownerType: learningMediaReviewOwner, published: false }, { transaction });
            } else if (status === 'approved') {
              await Reference.destroy({ where: { ...reference, ownerType: learningMediaReviewOwner }, transaction });
            }
            if (status === 'published' || status === 'archived') {
              await Reference.update({ published: status === 'published' }, { where: { ...reference, ownerType }, transaction });
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
        const item = await requireVersion(id, version, transaction);
        if (!deletable.includes(item.getDataValue('status'))) throw new LearningMediaError('INVALID_TRANSITION');
        const mediaId = item.getDataValue('mediaId');
        if (mediaId) {
          await lockAssets([mediaId], transaction);
          await unlinkAsset(id, mediaId, transaction);
        }
        await item.destroy({ transaction });
      });
    },
  };
}

export type LearningMediaStore = ReturnType<typeof createLearningMediaStore>;
