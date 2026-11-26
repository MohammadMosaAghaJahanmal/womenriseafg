import { DataTypes, Model, Sequelize } from 'sequelize';
import type { MediaAsset, MediaLink } from './contract';

type AssetStatus = MediaAsset['status'] | 'deleted';

export interface AssetRow extends Omit<MediaAsset, 'status' | 'links' | 'createdAt' | 'updatedAt' | 'sizeBytes' | 'durationMs'> {
  status: AssetStatus;
  sizeBytes: number | string;
  durationMs: number | string | null;
  uploaderId: string | null;
  searchText: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LinkRow extends MediaLink {
  parentId: string;
}

interface ReferenceRow {
  assetId: string;
  ownerType: string;
  ownerId: string;
  published: boolean;
}

export function defineMediaModels(db: Sequelize) {
  const Asset = db.define<Model<AssetRow>>('MediaAsset', {
    id: { type: DataTypes.CHAR(36), primaryKey: true },
    kind: { type: DataTypes.STRING(16), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'draft' },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    storageKey: { type: DataTypes.STRING(255), field: 'storage_key', allowNull: false },
    originalName: { type: DataTypes.STRING(255), field: 'original_name', allowNull: false },
    mimeType: { type: DataTypes.STRING(120), field: 'mime_type', allowNull: false },
    sizeBytes: { type: DataTypes.BIGINT.UNSIGNED, field: 'size_bytes', allowNull: false },
    sha256: { type: DataTypes.CHAR(64), allowNull: false },
    width: { type: DataTypes.INTEGER.UNSIGNED },
    height: { type: DataTypes.INTEGER.UNSIGNED },
    durationMs: { type: DataTypes.BIGINT.UNSIGNED, field: 'duration_ms' },
    title: { type: DataTypes.STRING(240), allowNull: false },
    license: { type: DataTypes.STRING(240), allowNull: false },
    source: { type: DataTypes.STRING(1000), allowNull: false },
    author: { type: DataTypes.STRING(240), allowNull: false },
    language: { type: DataTypes.STRING(35) },
    downloadAllowed: { type: DataTypes.BOOLEAN, field: 'download_allowed', allowNull: false },
    uploaderId: { type: DataTypes.CHAR(36), field: 'uploader_id' },
    searchText: { type: DataTypes.TEXT, field: 'search_text', allowNull: false },
    createdAt: { type: DataTypes.DATE(3), field: 'created_at', allowNull: false },
    updatedAt: { type: DataTypes.DATE(3), field: 'updated_at', allowNull: false },
  }, { tableName: 'media_assets', timestamps: false });

  const Link = db.define<Model<LinkRow>>('MediaLink', {
    parentId: { type: DataTypes.CHAR(36), field: 'parent_id', primaryKey: true },
    relation: { type: DataTypes.STRING(16), primaryKey: true },
    slot: { type: DataTypes.STRING(35), primaryKey: true },
    assetId: { type: DataTypes.CHAR(36), field: 'asset_id', allowNull: false },
  }, { tableName: 'media_links', timestamps: false });

  const Reference = db.define<Model<ReferenceRow>>('MediaReference', {
    assetId: { type: DataTypes.CHAR(36), field: 'asset_id', primaryKey: true },
    ownerType: { type: DataTypes.STRING(32), field: 'owner_type', primaryKey: true },
    ownerId: { type: DataTypes.STRING(96), field: 'owner_id', primaryKey: true },
    published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, { tableName: 'media_references', timestamps: false });

  return { Asset, Link, Reference };
}
