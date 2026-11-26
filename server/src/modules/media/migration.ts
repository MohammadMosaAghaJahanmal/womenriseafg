import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { mediaManagePermission, mediaPublishPermission } from './contract';

const version = '004-centralized-media';
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';

const definitions = [
  `CREATE TABLE IF NOT EXISTS media_assets (
    id CHAR(36) ${ascii} PRIMARY KEY,
    kind VARCHAR(16) ${ascii} NOT NULL,
    status VARCHAR(16) ${ascii} NOT NULL DEFAULT 'draft',
    version INT UNSIGNED NOT NULL DEFAULT 1,
    storage_key VARCHAR(255) ${ascii} NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) ${ascii} NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    sha256 CHAR(64) ${ascii} NOT NULL,
    width INT UNSIGNED NULL,
    height INT UNSIGNED NULL,
    duration_ms BIGINT UNSIGNED NULL,
    title VARCHAR(240) NOT NULL,
    license VARCHAR(240) NOT NULL,
    source VARCHAR(1000) NOT NULL,
    author VARCHAR(240) NOT NULL,
    language VARCHAR(35) ${ascii} NULL,
    download_allowed BOOLEAN NOT NULL,
    uploader_id CHAR(36) ${ascii} NULL,
    search_text TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY media_assets_storage_key (storage_key),
    UNIQUE KEY media_assets_sha256 (sha256),
    KEY media_assets_status_kind (status, kind, created_at, id),
    KEY media_assets_recent (created_at, id),
    KEY media_assets_language (language),
    KEY media_assets_uploader (uploader_id),
    CONSTRAINT media_assets_size_valid CHECK (size_bytes > 0),
    CONSTRAINT media_assets_kind_valid CHECK (kind IN ('video','audio','image','pdf','subtitle','transcript','attachment')),
    CONSTRAINT media_assets_status_valid CHECK (status IN ('draft','published','archived','deleted')),
    CONSTRAINT media_assets_language_fk FOREIGN KEY (language) REFERENCES education_languages (locale) ON DELETE RESTRICT,
    CONSTRAINT media_assets_uploader_fk FOREIGN KEY (uploader_id) REFERENCES users (id) ON DELETE SET NULL
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS media_links (
    parent_id CHAR(36) ${ascii} NOT NULL,
    relation VARCHAR(16) ${ascii} NOT NULL,
    slot VARCHAR(35) ${ascii} NOT NULL,
    asset_id CHAR(36) ${ascii} NOT NULL,
    PRIMARY KEY (parent_id, relation, slot),
    KEY media_links_child (asset_id, relation, parent_id),
    CONSTRAINT media_links_distinct CHECK (parent_id <> asset_id),
    CONSTRAINT media_links_relation_valid CHECK (relation IN ('thumbnail','video-variant','audio','subtitle','transcript')),
    CONSTRAINT media_links_parent_fk FOREIGN KEY (parent_id) REFERENCES media_assets (id) ON DELETE RESTRICT,
    CONSTRAINT media_links_asset_fk FOREIGN KEY (asset_id) REFERENCES media_assets (id) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS media_references (
    asset_id CHAR(36) ${ascii} NOT NULL,
    owner_type VARCHAR(32) ${ascii} NOT NULL,
    owner_id VARCHAR(96) ${ascii} NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (asset_id, owner_type, owner_id),
    KEY media_references_owner (owner_type, owner_id),
    CONSTRAINT media_references_asset_fk FOREIGN KEY (asset_id) REFERENCES media_assets (id) ON DELETE RESTRICT
  ) ${options}`,
];

const columns = {
  media_assets: ['id', 'kind', 'status', 'version', 'storage_key', 'original_name', 'mime_type',
    'size_bytes', 'sha256', 'width', 'height', 'duration_ms', 'title', 'license', 'source', 'author',
    'language', 'download_allowed', 'uploader_id', 'search_text', 'created_at', 'updated_at'],
  media_links: ['parent_id', 'relation', 'slot', 'asset_id'],
  media_references: ['asset_id', 'owner_type', 'owner_id', 'published'],
};
const constraints = [
  'media_assets_storage_key', 'media_assets_sha256', 'media_assets_size_valid', 'media_assets_kind_valid',
  'media_assets_status_valid', 'media_assets_language_fk', 'media_assets_uploader_fk', 'media_links_distinct',
  'media_links_relation_valid', 'media_links_parent_fk', 'media_links_asset_fk', 'media_references_asset_fk',
];

export class MediaMigrationError extends Error {}

async function verifySchema(db: Sequelize, transaction: Transaction) {
  const queryOptions = {
    type: QueryTypes.SELECT as const,
    replacements: { tables: Object.keys(columns) },
    transaction,
  };
  const actual = await db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)
  `, queryOptions);
  const availableConstraints = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
  `, queryOptions);
  const columnNames = new Set(actual.map(row => row.tableName + '.' + row.columnName));
  const constraintNames = new Set(availableConstraints.map(row => row.name));
  if (actual.some(row => row.engine !== 'InnoDB' || row.collation !== 'utf8mb4_unicode_ci') ||
      Object.entries(columns).some(([table, names]) => names.some(name => !columnNames.has(table + '.' + name))) ||
      constraints.some(name => !constraintNames.has(name))) {
    throw new MediaMigrationError('The media schema is incompatible. Review the database before retrying.');
  }
}

export async function migrateMedia(db: Sequelize) {
  const lock = 'womenriseafg:media:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async connection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...lockOptions, transaction: connection });
    if (acquired?.held !== 1) throw new MediaMigrationError('Could not acquire the media migration lock.');
    try {
      const rows = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: connection });
      const versions = new Set(rows.map(row => row.version));
      if (!versions.has('003-education-organization')) {
        throw new MediaMigrationError('Apply the education migration before the media migration.');
      }
      if (versions.has(version)) {
        await verifySchema(db, connection);
        return false;
      }
      for (const definition of definitions) await db.query(definition, { transaction: connection });
      await verifySchema(db, connection);

      // MySQL commits the DDL separately. Grants and the marker share a transaction.
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        for (const permissionCode of [mediaManagePermission, mediaPublishPermission]) {
          await Permission.upsert({ code: permissionCode }, { transaction });
          for (const roleCode of administratorRoles) {
            await RolePermission.upsert({ roleCode, permissionCode }, { transaction });
          }
        }
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
          { bind: { version, appliedAt: new Date() }, transaction });
      });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...lockOptions, transaction: connection });
    }
  });
}
