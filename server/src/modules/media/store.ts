import {
  ForeignKeyConstraintError, Op, QueryTypes, UniqueConstraintError,
  col, fn, literal, where as expression, type Model, type Sequelize, type Transaction, type WhereOptions,
} from 'sequelize';
import { normalizeEducationSearch } from '../education/models';
import {
  bookReviewOwner, isValidMediaSlot, learningMediaReviewOwner, MediaError, type MediaAsset, type MediaKind, type MediaLink, type MediaListOptions,
  type MediaMetadata, type MediaRelation, type MediaStatus, type StoredFile,
} from './contract';
import { defineMediaModels, type AssetRow } from './models';

const detachedCondition = `
  NOT EXISTS (SELECT 1 FROM media_links outgoing WHERE outgoing.parent_id = MediaAsset.id)
  AND NOT EXISTS (SELECT 1 FROM media_links incoming WHERE incoming.asset_id = MediaAsset.id)
  AND NOT EXISTS (SELECT 1 FROM media_references linked WHERE linked.asset_id = MediaAsset.id)
`;
const transitions: Record<MediaStatus, readonly MediaStatus[]> = {
  draft: ['published', 'archived'],
  published: ['archived'],
  archived: ['draft'],
};
const relationKinds: Record<MediaRelation, { parents: readonly MediaKind[]; asset: MediaKind }> = {
  thumbnail: { parents: ['video', 'audio', 'pdf', 'attachment'], asset: 'image' },
  'video-variant': { parents: ['video'], asset: 'video' },
  audio: { parents: ['video'], asset: 'audio' },
  subtitle: { parents: ['video', 'audio'], asset: 'subtitle' },
  transcript: { parents: ['video', 'audio'], asset: 'transcript' },
};

function mediaWriteError(error: unknown, foreignKeyCode: 'INVALID_REFERENCE' | 'CONFLICT' = 'INVALID_REFERENCE'): never {
  if (error instanceof UniqueConstraintError) throw new MediaError('CONFLICT');
  if (error instanceof ForeignKeyConstraintError) throw new MediaError(foreignKeyCode);
  throw error;
}

function indexedSearchFields(originalName: string, metadata: MediaMetadata) {
  return normalizeEducationSearch([metadata.title, originalName, metadata.author, metadata.license].join(' '));
}

function fileFields(row: AssetRow): StoredFile {
  return {
    storageKey: row.storageKey, originalName: row.originalName, mimeType: row.mimeType, sha256: row.sha256,
    sizeBytes: Number(row.sizeBytes), width: row.width, height: row.height,
    durationMs: row.durationMs == null ? null : Number(row.durationMs),
  };
}

function assetRecord(row: AssetRow, links: MediaLink[]): MediaAsset & { uploaderId: string | null } {
  if (row.status === 'deleted') throw new MediaError('NOT_FOUND');
  return {
    ...fileFields(row),
    id: row.id, kind: row.kind, status: row.status, version: row.version,
    title: row.title, license: row.license, source: row.source, author: row.author,
    language: row.language, downloadAllowed: row.downloadAllowed,
    uploaderId: row.uploaderId,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), links,
  };
}

export function createMediaStore(db: Sequelize) {
  const { Asset, Link, Reference } = defineMediaModels(db);

  async function linkMap(ids: string[], transaction: Transaction, publicOnly = false) {
    const links = new Map<string, MediaLink[]>();
    if (!ids.length) return links;
    const rows = await db.query<MediaLink & { parentId: string }>(`
      SELECT l.parent_id AS parentId, l.relation, l.slot, l.asset_id AS assetId
      FROM media_links l JOIN media_assets child ON child.id = l.asset_id
      WHERE l.parent_id IN (:ids) AND ${publicOnly ? "child.status = 'published'" : "child.status <> 'deleted'"}
      ORDER BY l.relation, l.slot
    `, { type: QueryTypes.SELECT, transaction, replacements: { ids } });
    for (const { parentId, ...link } of rows) {
      const current = links.get(parentId) ?? [];
      current.push(link);
      links.set(parentId, current);
    }
    return links;
  }

  async function toRecord(row: AssetRow, transaction: Transaction, publicOnly = false) {
    return assetRecord(row, (await linkMap([row.id], transaction, publicOnly)).get(row.id) ?? []);
  }

  function lockedAsset(id: string, transaction: Transaction) {
    return Asset.findByPk(id, { lock: transaction.LOCK.UPDATE, transaction });
  }

  function checkVersion(asset: Model<AssetRow> | null | undefined, version: number): asserts asset is Model<AssetRow> {
    if (!asset || asset.getDataValue('status') === 'deleted') throw new MediaError('NOT_FOUND');
    if (asset.getDataValue('version') !== version) throw new MediaError('STALE_VERSION');
  }

  async function isReferenced(id: string, transaction: Transaction) {
    const link = await Link.findOne({ where: { [Op.or]: [{ assetId: id }, { parentId: id }] }, transaction });
    if (link) return true;
    return Boolean(await Reference.findOne({ where: { assetId: id }, transaction }));
  }

  async function hasPublishedOwner(id: string, transaction: Transaction) {
    const [parent] = await db.query<{ linked: number }>(`
      SELECT 1 AS linked FROM media_links l JOIN media_assets parent ON parent.id = l.parent_id
      WHERE l.asset_id = $id AND parent.status = 'published' LIMIT 1
    `, { type: QueryTypes.SELECT, bind: { id }, transaction });
    if (parent) return true;
    return Boolean(await Reference.findOne({ where: { assetId: id, published: true }, transaction }));
  }

  async function validatePublication(row: AssetRow, transaction: Transaction) {
    if (!row.title.trim() || !row.license.trim() || !row.source.trim()) throw new MediaError('INVALID_TRANSITION');
    const [pendingReview] = await db.query<{ held: number }>(`
      SELECT 1 AS held FROM media_references pending
      WHERE pending.owner_type IN ($learningMediaOwner, $bookOwner) AND (pending.asset_id = $id OR EXISTS (
        SELECT 1 FROM media_links link WHERE link.parent_id = pending.asset_id AND link.asset_id = $id
      )) LIMIT 1
    `, { bind: { learningMediaOwner: learningMediaReviewOwner, bookOwner: bookReviewOwner, id: row.id },
      type: QueryTypes.SELECT, transaction });
    if (pendingReview) throw new MediaError('PENDING_LEARNING_REVIEW');
    const linked = (await linkMap([row.id], transaction)).get(row.id) ?? [];
    if (!linked.length) return;
    const distinct = [...new Set(linked.map(link => link.assetId))].sort();
    const children = await Asset.findAll({
      where: { id: distinct }, order: [['id', 'ASC']], lock: transaction.LOCK.UPDATE, transaction,
    });
    if (children.length !== distinct.length || children.some(child => child.getDataValue('status') !== 'published')) {
      throw new MediaError('INVALID_LINK');
    }
  }

  async function checkVariantTree(parentId: string, childId: string, transaction: Transaction) {
    const other = await Link.findOne({ where: {
      relation: 'video-variant', [Op.or]: [{ assetId: parentId }, { parentId: childId }],
    }, transaction });
    if (other) throw new MediaError('INVALID_LINK');
  }

  return {
    list({ q, kind, status, page, pageSize, orphans }: MediaListOptions) {
      return db.transaction(async transaction => {
        const conditions: WhereOptions<AssetRow>[] = [{ status: { [Op.ne]: 'deleted' } }];
        if (kind) conditions.push({ kind });
        if (status) conditions.push({ status });
        if (orphans) {
          conditions.push({ status: { [Op.in]: ['draft', 'archived'] } }, literal(detachedCondition));
        }
        const query = normalizeEducationSearch(q);
        if (query) conditions.push(expression(fn('LOCATE', query, col('search_text')), Op.gt, 0));
        const { rows, count } = await Asset.findAndCountAll({
          where: { [Op.and]: conditions }, order: [['createdAt', 'DESC'], ['id', 'DESC']],
          limit: pageSize, offset: (page - 1) * pageSize, transaction,
        });
        const links = await linkMap(rows.map(row => row.getDataValue('id')), transaction);
        return {
          items: rows.map(row => assetRecord(row.get(), links.get(row.getDataValue('id')) ?? [])),
          total: count, page, pageSize,
        };
      });
    },

    get(id: string) {
      return db.transaction(async transaction => {
        const asset = await Asset.findOne({ where: { id, status: { [Op.ne]: 'deleted' } }, transaction });
        if (!asset) throw new MediaError('NOT_FOUND');
        return toRecord(asset.get(), transaction);
      });
    },

    findPublic(id: string) {
      return db.transaction(async transaction => {
        const asset = await Asset.findOne({ where: { id, status: 'published' }, transaction });
        if (!asset) return null;
        return toRecord(asset.get(), transaction, true);
      });
    },

    async create(id: string, kind: MediaKind, metadata: MediaMetadata, file: StoredFile, uploaderId: string) {
      try {
        return await db.transaction(async transaction => {
          const timestamp = new Date();
          const searchText = indexedSearchFields(file.originalName, metadata);
          const asset = await Asset.create({
            ...metadata, ...file, id, kind, uploaderId, searchText,
            status: 'draft', version: 1, createdAt: timestamp, updatedAt: timestamp,
          }, { transaction });
          return assetRecord(asset.get(), []);
        });
      } catch (error) {
        mediaWriteError(error);
      }
    },

    async update(id: string, metadata: MediaMetadata, version: number) {
      try {
        return await db.transaction(async transaction => {
          const asset = await lockedAsset(id, transaction);
          checkVersion(asset, version);
          const row = asset.get();
          if (row.status !== 'draft') throw new MediaError('INVALID_TRANSITION');
          await asset.update({
            ...metadata, searchText: indexedSearchFields(row.originalName, metadata),
            version: version + 1, updatedAt: new Date(),
          }, { transaction });
          return toRecord(asset.get(), transaction);
        });
      } catch (error) {
        mediaWriteError(error);
      }
    },

    setStatus(id: string, status: MediaStatus, version: number) {
      return db.transaction(async transaction => {
        const asset = await lockedAsset(id, transaction);
        checkVersion(asset, version);
        const row = asset.get();
        if (row.status === 'deleted' || !transitions[row.status].includes(status)) {
          throw new MediaError('INVALID_TRANSITION');
        }
        if (status === 'published') await validatePublication(row, transaction);
        if (status === 'archived' && await hasPublishedOwner(id, transaction)) throw new MediaError('CONFLICT');
        await asset.update({ status, version: version + 1, updatedAt: new Date() }, { transaction });
        return toRecord(asset.get(), transaction);
      });
    },

    async attach(id: string, link: MediaLink, version: number) {
      if (id === link.assetId || !isValidMediaSlot(link.relation, link.slot)) throw new MediaError('INVALID_LINK');
      try {
        return await db.transaction(async transaction => {
          const assets = await Asset.findAll({
            where: { id: [id, link.assetId] }, order: [['id', 'ASC']], lock: transaction.LOCK.UPDATE, transaction,
          });
          const parent = assets.find(asset => asset.getDataValue('id') === id);
          checkVersion(parent, version);
          const owner = parent.get();
          if (owner.status !== 'draft') throw new MediaError('INVALID_TRANSITION');
          const child = assets.find(asset => asset.getDataValue('id') === link.assetId)?.get();
          if (!child || child.status === 'deleted' || child.status === 'archived') throw new MediaError('INVALID_REFERENCE');
          const allowed = relationKinds[link.relation];
          if (!allowed.parents.includes(owner.kind) || child.kind !== allowed.asset ||
              (['subtitle', 'transcript', 'audio'].includes(link.relation) &&
                link.slot !== 'default' && child.language !== null && child.language !== link.slot)) {
            throw new MediaError('INVALID_LINK');
          }
          if (link.relation === 'video-variant') await checkVariantTree(id, link.assetId, transaction);
          await Link.create({ parentId: id, ...link }, { transaction });
          await parent.update({ version: version + 1, updatedAt: new Date() }, { transaction });
          return toRecord(parent.get(), transaction);
        });
      } catch (error) {
        mediaWriteError(error);
      }
    },

    detach(id: string, relation: MediaRelation, slot: string, version: number) {
      return db.transaction(async transaction => {
        const asset = await lockedAsset(id, transaction);
        checkVersion(asset, version);
        const row = asset.get();
        if (row.status !== 'draft' && row.status !== 'archived') throw new MediaError('INVALID_TRANSITION');
        const removed = await Link.destroy({ where: { parentId: id, relation, slot }, transaction });
        if (!removed) throw new MediaError('NOT_FOUND');
        await asset.update({ version: version + 1, updatedAt: new Date() }, { transaction });
        return toRecord(asset.get(), transaction);
      });
    },

    markDeleted(id: string, version: number) {
      return db.transaction(async transaction => {
        const asset = await lockedAsset(id, transaction);
        checkVersion(asset, version);
        const row = asset.get();
        if (row.status !== 'draft' && row.status !== 'archived') throw new MediaError('INVALID_TRANSITION');
        // Link writes hold both locked asset rows. Future content reference writers
        // must likewise lock their asset, then reject an already deleted record.
        if (await isReferenced(id, transaction)) throw new MediaError('CONFLICT');
        await asset.update({ status: 'deleted', version: version + 1, updatedAt: new Date() }, { transaction });
        return fileFields(row);
      });
    },

    async completeDelete(id: string) {
      await Asset.destroy({ where: { id, status: 'deleted' } });
    },

    async pendingDeletes() {
      const rows = await Asset.findAll({ where: { status: 'deleted' }, attributes: ['id', 'storageKey'],
        order: [['updatedAt', 'ASC'], ['id', 'ASC']], limit: 100 });
      return rows.map(row => ({ id: row.getDataValue('id'), storageKey: row.getDataValue('storageKey') }));
    },

    async storageKeys() {
      const rows = await Asset.findAll({ attributes: ['storageKey'] });
      return rows.map(row => row.getDataValue('storageKey'));
    },

    async usage() {
      const [row] = await db.query<{
        assets: string | number; usedBytes: string | number; orphanAssets: string | number; pendingDeletes: string | number;
      }>(`
        SELECT COUNT(CASE WHEN status <> 'deleted' THEN 1 END) AS assets,
          COUNT(CASE WHEN status = 'deleted' THEN 1 END) AS pendingDeletes,
          COALESCE(SUM(size_bytes), 0) AS usedBytes,
          COUNT(CASE WHEN status IN ('draft', 'archived') AND ${detachedCondition} THEN 1 END) AS orphanAssets
        FROM media_assets AS \`MediaAsset\`
      `, { type: QueryTypes.SELECT });
      return {
        assets: Number(row?.assets ?? 0), usedBytes: Number(row?.usedBytes ?? 0),
        orphanAssets: Number(row?.orphanAssets ?? 0), pendingDeletes: Number(row?.pendingDeletes ?? 0),
      };
    },
  };
}

export type MediaStore = ReturnType<typeof createMediaStore>;
