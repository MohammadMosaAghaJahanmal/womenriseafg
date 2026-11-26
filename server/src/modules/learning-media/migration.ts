import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { learningMediaManagePermission, learningMediaPublishPermission } from './contract';

const version = '006-learning-media';
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';

const definitions = [
  `CREATE TABLE IF NOT EXISTS learning_media (
    id CHAR(36) ${ascii} PRIMARY KEY,
    slug VARCHAR(80) ${ascii} NOT NULL,
    kind VARCHAR(12) ${ascii} NOT NULL,
    status VARCHAR(24) ${ascii} NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    media_id CHAR(36) ${ascii} NULL,
    category_id CHAR(36) ${ascii} NULL,
    related_course_id CHAR(36) ${ascii} NULL,
    related_lesson_id CHAR(36) ${ascii} NULL,
    ai_origin VARCHAR(20) ${ascii} NOT NULL,
    ai_tool VARCHAR(100) NOT NULL,
    ai_notes TEXT NOT NULL,
    creator_id CHAR(36) ${ascii} NULL,
    reviewed_by CHAR(36) ${ascii} NULL,
    reviewed_at DATETIME(3) NULL,
    reviewed_media_version INT UNSIGNED NULL,
    review_note TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY learning_media_slug (slug),
    KEY learning_media_public_order (kind, status, updated_at, id),
    KEY learning_media_ai_order (ai_origin, status, updated_at, id),
    KEY learning_media_category (category_id, kind, status),
    KEY learning_media_asset (media_id),
    KEY learning_media_course (related_course_id),
    KEY learning_media_lesson (related_lesson_id),
    KEY learning_media_creator (creator_id),
    KEY learning_media_reviewer (reviewed_by),
    CONSTRAINT learning_media_kind_check CHECK (kind IN ('video','short','resource')),
    CONSTRAINT learning_media_status_check CHECK (status IN
      ('draft','educational-review','translation-review','approved','published','archived')),
    CONSTRAINT learning_media_ai_check CHECK (
      (ai_origin = 'human' AND kind <> 'resource' AND ai_tool = '' AND ai_notes = '')
      OR (ai_origin IN ('ai-assisted','ai-generated') AND CHAR_LENGTH(TRIM(ai_tool)) > 0 AND CHAR_LENGTH(TRIM(ai_notes)) > 0)),
    CONSTRAINT learning_media_review_check CHECK (
      status NOT IN ('approved','published') OR
        (media_id IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_media_version IS NOT NULL
          AND reviewed_media_version > 0 AND CHAR_LENGTH(TRIM(review_note)) > 0)),
    CONSTRAINT learning_media_asset_fk FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE RESTRICT,
    CONSTRAINT learning_media_category_fk FOREIGN KEY (category_id) REFERENCES education_entries (id) ON DELETE SET NULL,
    CONSTRAINT learning_media_course_fk FOREIGN KEY (related_course_id) REFERENCES courses (id) ON DELETE SET NULL,
    CONSTRAINT learning_media_lesson_fk FOREIGN KEY (related_lesson_id) REFERENCES lessons (id) ON DELETE SET NULL,
    CONSTRAINT learning_media_creator_fk FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT learning_media_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS learning_media_translations (
    learning_media_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    search_text TEXT NOT NULL,
    PRIMARY KEY (learning_media_id, locale),
    KEY learning_media_locale (locale, learning_media_id),
    CONSTRAINT learning_media_translation_fk FOREIGN KEY (learning_media_id) REFERENCES learning_media (id) ON DELETE CASCADE,
    CONSTRAINT learning_media_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
];

const columns = {
  learning_media: ['id', 'slug', 'kind', 'status', 'version', 'media_id', 'category_id', 'related_course_id',
    'related_lesson_id', 'ai_origin', 'ai_tool', 'ai_notes', 'creator_id', 'reviewed_by', 'reviewed_at', 'reviewed_media_version',
    'review_note', 'created_at', 'updated_at'],
  learning_media_translations: ['learning_media_id', 'locale', 'title', 'description', 'search_text'],
};

const constraints = [
  'learning_media_slug', 'learning_media_kind_check', 'learning_media_status_check', 'learning_media_ai_check',
  'learning_media_review_check', 'learning_media_asset_fk', 'learning_media_category_fk', 'learning_media_course_fk',
  'learning_media_lesson_fk', 'learning_media_creator_fk', 'learning_media_reviewer_fk', 'learning_media_translation_fk',
  'learning_media_locale_fk',
];

export class LearningMediaMigrationError extends Error {}

async function verifySchema(db: Sequelize, transaction: Transaction) {
  const queryOptions = { type: QueryTypes.SELECT as const, transaction, replacements: { tables: Object.keys(columns) } };
  const fields = await db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)
  `, queryOptions);
  const definitions = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
  `, queryOptions);
  const fieldNames = new Set(fields.map(row => row.tableName + '.' + row.columnName));
  const ruleNames = new Set(definitions.map(item => item.name));
  if (fields.some(row => row.engine !== 'InnoDB' || row.collation !== 'utf8mb4_unicode_ci') ||
      Object.entries(columns).some(([table, names]) => names.some(name => !fieldNames.has(table + '.' + name))) ||
      constraints.some(name => !ruleNames.has(name))) {
    throw new LearningMediaMigrationError('The learning media schema is incompatible. Review the database before retrying.');
  }
}

export async function migrateLearningMedia(db: Sequelize) {
  const lock = 'womenriseafg:lmedia:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async connection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...lockOptions, transaction: connection });
    if (acquired?.held !== 1) throw new LearningMediaMigrationError('Could not acquire the learning media migration lock.');
    try {
      const records = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: connection });
      const versions = new Set(records.map(record => record.version));
      if (!versions.has('005-course-learning')) {
        throw new LearningMediaMigrationError('Apply the course migration before the learning media migration.');
      }
      if (versions.has(version)) {
        await verifySchema(db, connection);
        return false;
      }
      for (const definition of definitions) await db.query(definition, { transaction: connection });
      await verifySchema(db, connection);

      // MySQL commits DDL independently. The grants and migration record are atomic.
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        for (const permissionCode of [learningMediaManagePermission, learningMediaPublishPermission]) {
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
