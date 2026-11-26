import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { discoveryManagePermission, discoveryPublishPermission } from './contract';

const version = '009-discovery';
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';

const statements = [
  `CREATE TABLE IF NOT EXISTS learning_paths (
    id CHAR(36) ${ascii} PRIMARY KEY,
    slug VARCHAR(80) ${ascii} NOT NULL,
    status VARCHAR(24) ${ascii} NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    subject_id CHAR(36) ${ascii} NULL,
    level_id CHAR(36) ${ascii} NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY learning_paths_slug (slug),
    KEY learning_paths_public_order (status, updated_at, id),
    KEY learning_paths_subject (subject_id, status),
    KEY learning_paths_level (level_id, status),
    CONSTRAINT learning_paths_status CHECK (status IN
      ('draft','educational-review','translation-review','approved','published','archived')),
    CONSTRAINT learning_paths_subject_fk FOREIGN KEY (subject_id) REFERENCES education_entries (id) ON DELETE SET NULL,
    CONSTRAINT learning_paths_level_fk FOREIGN KEY (level_id) REFERENCES education_entries (id) ON DELETE SET NULL
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS learning_path_translations (
    path_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    search_text TEXT NOT NULL,
    PRIMARY KEY (path_id, locale),
    KEY learning_path_translations_locale (locale, path_id),
    CONSTRAINT learning_path_translations_path_fk FOREIGN KEY (path_id) REFERENCES learning_paths (id) ON DELETE CASCADE,
    CONSTRAINT learning_path_translations_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS learning_path_items (
    path_id CHAR(36) ${ascii} NOT NULL,
    position SMALLINT UNSIGNED NOT NULL,
    kind VARCHAR(12) ${ascii} NOT NULL,
    course_id CHAR(36) ${ascii} NULL,
    lesson_id CHAR(36) ${ascii} NULL,
    media_id CHAR(36) ${ascii} NULL,
    book_id CHAR(36) ${ascii} NULL,
    quiz_id CHAR(36) ${ascii} NULL,
    PRIMARY KEY (path_id, position),
    CONSTRAINT learning_path_items_target CHECK (
      ((course_id IS NOT NULL) + (lesson_id IS NOT NULL) + (media_id IS NOT NULL)
        + (book_id IS NOT NULL) + (quiz_id IS NOT NULL)) = 1
      AND ((kind = 'course' AND course_id IS NOT NULL) OR (kind = 'lesson' AND lesson_id IS NOT NULL)
        OR (kind IN ('video','short') AND media_id IS NOT NULL) OR (kind = 'book' AND book_id IS NOT NULL)
        OR (kind = 'quiz' AND quiz_id IS NOT NULL))),
    CONSTRAINT learning_path_items_path_fk FOREIGN KEY (path_id) REFERENCES learning_paths (id) ON DELETE CASCADE,
    CONSTRAINT learning_path_items_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
    CONSTRAINT learning_path_items_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE,
    CONSTRAINT learning_path_items_media_fk FOREIGN KEY (media_id) REFERENCES learning_media (id) ON DELETE CASCADE,
    CONSTRAINT learning_path_items_book_fk FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
    CONSTRAINT learning_path_items_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS daily_learning_settings (
    id TINYINT UNSIGNED PRIMARY KEY,
    mode VARCHAR(12) ${ascii} NOT NULL,
    activities JSON NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT daily_learning_singleton CHECK (id = 1),
    CONSTRAINT daily_learning_mode CHECK (mode IN ('automatic','curated','off')),
    CONSTRAINT daily_learning_activities CHECK (JSON_TYPE(activities) = 'ARRAY')
  ) ${options}`,
];

const columns = {
  learning_paths: ['id', 'slug', 'status', 'version', 'subject_id', 'level_id', 'created_at', 'updated_at'],
  learning_path_translations: ['path_id', 'locale', 'title', 'description', 'search_text'],
  learning_path_items: ['path_id', 'position', 'kind', 'course_id', 'lesson_id', 'media_id', 'book_id', 'quiz_id'],
  daily_learning_settings: ['id', 'mode', 'activities', 'version', 'updated_at'],
};
const constraints = [
  'learning_paths_slug', 'learning_paths_status', 'learning_paths_subject_fk', 'learning_paths_level_fk',
  'learning_path_translations_path_fk', 'learning_path_translations_locale_fk', 'learning_path_items_target',
  'learning_path_items_path_fk', 'learning_path_items_course_fk', 'learning_path_items_lesson_fk', 'learning_path_items_media_fk',
  'learning_path_items_book_fk', 'learning_path_items_quiz_fk', 'daily_learning_singleton', 'daily_learning_mode',
  'daily_learning_activities',
];

export class DiscoveryMigrationError extends Error {}

async function verifySchema(db: Sequelize, transaction: Transaction) {
  const queryOptions = { type: QueryTypes.SELECT as const, transaction, replacements: { tables: Object.keys(columns) } };
  const fields = await db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)`, queryOptions);
  const definitions = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)`, queryOptions);
  const fieldNames = new Set(fields.map(row => row.tableName + '.' + row.columnName));
  const actualConstraints = new Set(definitions.map(row => row.name));
  if (fields.some(row => row.engine !== 'InnoDB' || row.collation !== 'utf8mb4_unicode_ci') ||
      Object.entries(columns).some(([table, fields]) => fields.some(field => !fieldNames.has(table + '.' + field))) ||
      constraints.some(name => !actualConstraints.has(name))) {
    throw new DiscoveryMigrationError('The discovery schema is incompatible. Review the database before retrying.');
  }
}

export function migrateDiscovery(db: Sequelize) {
  const lock = 'womenriseafg:discovery:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async connection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...lockOptions, transaction: connection });
    if (acquired?.held !== 1) throw new DiscoveryMigrationError('Could not acquire the discovery migration lock.');
    try {
      const records = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: connection });
      const versions = new Set(records.map(record => record.version));
      if (versions.has(version)) {
        await verifySchema(db, connection);
        return false;
      }
      if (!versions.has('008-quizzes')) throw new DiscoveryMigrationError('Apply the quiz migration before the discovery migration.');
      for (const statement of statements) await db.query(statement, { transaction: connection });
      await verifySchema(db, connection);
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        for (const permissionCode of [discoveryManagePermission, discoveryPublishPermission]) {
          await Permission.upsert({ code: permissionCode }, { transaction });
          for (const roleCode of administratorRoles) {
            await RolePermission.upsert({ roleCode, permissionCode }, { transaction });
          }
        }
        await db.query("INSERT INTO daily_learning_settings (id, mode, activities, version, updated_at) VALUES (1, 'automatic', JSON_ARRAY(), 1, NOW(3)) ON DUPLICATE KEY UPDATE id = 1",
          { transaction });
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
          { bind: { version, appliedAt: new Date() }, transaction });
      });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...lockOptions, transaction: connection });
    }
  });
}
