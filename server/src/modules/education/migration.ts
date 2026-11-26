import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { educationManagePermission, educationPublishPermission } from './contract';
import { seedEducation } from './seed';

const version = '003-education-organization';
const tableOptions = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';

const definitions = [
  `CREATE TABLE IF NOT EXISTS education_entries (
    id CHAR(36) ${ascii} PRIMARY KEY,
    kind VARCHAR(16) ${ascii} NOT NULL,
    slug VARCHAR(80) ${ascii} NOT NULL,
    status VARCHAR(24) ${ascii} NOT NULL,
    category_id CHAR(36) ${ascii} NULL,
    category_kind VARCHAR(16) ${ascii} NULL,
    grade_number TINYINT UNSIGNED NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY education_entries_kind_slug (kind, slug),
    UNIQUE KEY education_entries_id_kind (id, kind),
    UNIQUE KEY education_entries_grade (grade_number),
    KEY education_entries_status_slug (kind, status, slug),
    KEY education_entries_category (category_id, category_kind),
    CONSTRAINT education_entry_kind_valid CHECK (kind IN ('categories','subjects','levels','grades','languages','tags')),
    CONSTRAINT education_entry_status_valid CHECK (status IN ('draft','educational-review','translation-review','approved','published','archived')),
    CONSTRAINT education_entry_grade_valid CHECK (
      (kind = 'grades' AND grade_number IS NOT NULL AND grade_number BETWEEN 1 AND 12)
      OR (kind <> 'grades' AND grade_number IS NULL)
    ),
    CONSTRAINT education_entry_category_valid CHECK (
      (category_id IS NULL AND category_kind IS NULL)
      OR (kind = 'subjects' AND category_id IS NOT NULL AND category_kind IS NOT NULL AND category_kind = 'categories')
    ),
    CONSTRAINT education_entry_category_fk FOREIGN KEY (category_id, category_kind)
      REFERENCES education_entries (id, kind) ON DELETE RESTRICT
  ) ${tableOptions}`,
  `CREATE TABLE IF NOT EXISTS education_languages (
    entry_id CHAR(36) ${ascii} PRIMARY KEY,
    entry_kind VARCHAR(16) ${ascii} NOT NULL DEFAULT 'languages',
    locale VARCHAR(35) ${ascii} NOT NULL,
    direction VARCHAR(3) ${ascii} NOT NULL,
    UNIQUE KEY education_languages_locale (locale),
    KEY education_languages_entry_kind (entry_id, entry_kind),
    CONSTRAINT education_language_kind_valid CHECK (entry_kind = 'languages'),
    CONSTRAINT education_language_direction_valid CHECK (direction IN ('ltr','rtl')),
    CONSTRAINT education_language_entry_fk FOREIGN KEY (entry_id, entry_kind)
      REFERENCES education_entries (id, kind) ON DELETE RESTRICT
  ) ${tableOptions}`,
  `CREATE TABLE IF NOT EXISTS education_translations (
    entry_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    search_text TEXT NOT NULL,
    PRIMARY KEY (entry_id, locale),
    KEY education_translations_locale (locale),
    CONSTRAINT education_translation_entry_fk FOREIGN KEY (entry_id) REFERENCES education_entries (id) ON DELETE CASCADE,
    CONSTRAINT education_translation_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${tableOptions}`,
];

const requiredColumns = {
  education_entries: ['id', 'kind', 'slug', 'status', 'category_id', 'category_kind', 'grade_number',
    'version', 'created_at', 'updated_at'],
  education_languages: ['entry_id', 'entry_kind', 'locale', 'direction'],
  education_translations: ['entry_id', 'locale', 'name', 'description', 'search_text'],
};

const requiredConstraints = [
  'education_entry_kind_valid', 'education_entry_status_valid', 'education_entry_grade_valid',
  'education_entry_category_valid', 'education_entry_category_fk', 'education_entries_kind_slug',
  'education_entries_id_kind', 'education_entries_grade', 'education_language_kind_valid',
  'education_language_direction_valid', 'education_language_entry_fk', 'education_languages_locale',
  'education_translation_entry_fk', 'education_translation_locale_fk',
];

export class EducationMigrationError extends Error {}

async function verifyEducationSchema(db: Sequelize, transaction: Transaction) {
  const tables = Object.keys(requiredColumns);
  const options = { type: QueryTypes.SELECT as const, replacements: { tables }, transaction };
  const columns = await db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName,
      t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)
  `, options);
  const constraints = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
  `, options);
  const columnNames = new Set(columns.map(column => column.tableName + '.' + column.columnName));
  const constraintNames = new Set(constraints.map(constraint => constraint.name));
  if (columns.some(column => column.engine !== 'InnoDB' || column.collation !== 'utf8mb4_unicode_ci') ||
      Object.entries(requiredColumns).some(([table, expected]) => expected.some(name => !columnNames.has(table + '.' + name))) ||
      requiredConstraints.some(name => !constraintNames.has(name))) {
    throw new EducationMigrationError('The education schema is incompatible. Review the database before retrying.');
  }
}

export async function migrateEducation(db: Sequelize) {
  const lock = 'womenriseafg:education:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async connection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...lockOptions, transaction: connection });
    if (acquired?.held !== 1) throw new EducationMigrationError('Could not acquire the education migration lock.');
    try {
      const rows = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: connection });
      const versions = new Set(rows.map(row => row.version));
      if (!versions.has('002-admin-session-scope')) {
        throw new EducationMigrationError('Apply the identity migrations before the education migration.');
      }
      if (versions.has(version)) {
        await verifyEducationSchema(db, connection);
        return false;
      }

      // MySQL commits DDL separately. Retrying the table definitions is safe;
      // seed data, permissions and the ledger marker commit together.
      for (const definition of definitions) await db.query(definition, { transaction: connection });
      await verifyEducationSchema(db, connection);

      await db.transaction(async transaction => {
        await seedEducation(db, transaction);
        const { Permission, RolePermission } = defineIdentityModels(db);
        for (const permissionCode of [educationManagePermission, educationPublishPermission]) {
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
