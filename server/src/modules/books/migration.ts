import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { bookManagePermission, bookPublishPermission } from './contract';

const version = '007-digital-library';
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';

const statements = [
  `CREATE TABLE IF NOT EXISTS books (
    id CHAR(36) ${ascii} PRIMARY KEY,
    slug VARCHAR(80) ${ascii} NOT NULL,
    status VARCHAR(24) ${ascii} NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    pdf_id CHAR(36) ${ascii} NULL,
    cover_id CHAR(36) ${ascii} NULL,
    category_id CHAR(36) ${ascii} NULL,
    level_id CHAR(36) ${ascii} NULL,
    grade_id CHAR(36) ${ascii} NULL,
    content_language VARCHAR(35) ${ascii} NULL,
    author VARCHAR(150) NOT NULL,
    publisher VARCHAR(150) NOT NULL,
    publication_year SMALLINT UNSIGNED NULL,
    edition VARCHAR(100) NOT NULL,
    search_text TEXT NOT NULL,
    creator_id CHAR(36) ${ascii} NULL,
    reviewed_by CHAR(36) ${ascii} NULL,
    reviewed_at DATETIME(3) NULL,
    reviewed_pdf_version INT UNSIGNED NULL,
    reviewed_cover_version INT UNSIGNED NULL,
    review_note TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY books_slug (slug),
    KEY books_public_order (status, updated_at, id),
    KEY books_category (category_id, status),
    KEY books_level (level_id, status),
    KEY books_grade (grade_id),
    KEY books_content_language (content_language, status),
    KEY books_pdf (pdf_id),
    KEY books_cover (cover_id),
    KEY books_creator (creator_id),
    KEY books_reviewer (reviewed_by),
    CONSTRAINT books_status_check CHECK (status IN
      ('draft','educational-review','translation-review','approved','published','archived')),
    CONSTRAINT books_year_check CHECK (publication_year IS NULL OR publication_year BETWEEN 1 AND 9999),
    CONSTRAINT books_distinct_media_check CHECK (pdf_id IS NULL OR cover_id IS NULL OR pdf_id <> cover_id),
    CONSTRAINT books_review_check CHECK (
      status NOT IN ('approved','published') OR
        (pdf_id IS NOT NULL AND content_language IS NOT NULL AND reviewed_at IS NOT NULL
          AND reviewed_pdf_version IS NOT NULL AND reviewed_pdf_version > 0
          AND (cover_id IS NULL OR (reviewed_cover_version IS NOT NULL AND reviewed_cover_version > 0))
          AND CHAR_LENGTH(TRIM(author)) > 0 AND CHAR_LENGTH(TRIM(review_note)) > 0)),
    CONSTRAINT books_pdf_fk FOREIGN KEY (pdf_id) REFERENCES media_assets (id) ON DELETE RESTRICT,
    CONSTRAINT books_cover_fk FOREIGN KEY (cover_id) REFERENCES media_assets (id) ON DELETE RESTRICT,
    CONSTRAINT books_category_fk FOREIGN KEY (category_id) REFERENCES education_entries (id) ON DELETE SET NULL,
    CONSTRAINT books_level_fk FOREIGN KEY (level_id) REFERENCES education_entries (id) ON DELETE SET NULL,
    CONSTRAINT books_grade_fk FOREIGN KEY (grade_id) REFERENCES education_entries (id) ON DELETE SET NULL,
    CONSTRAINT books_content_language_fk FOREIGN KEY (content_language) REFERENCES education_languages (locale) ON DELETE RESTRICT,
    CONSTRAINT books_creator_fk FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT books_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS book_translations (
    book_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    search_text TEXT NOT NULL,
    PRIMARY KEY (book_id, locale),
    KEY book_translations_locale (locale, book_id),
    CONSTRAINT book_translations_book_fk FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
    CONSTRAINT book_translations_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
];

const columns = {
  books: ['id', 'slug', 'status', 'version', 'pdf_id', 'cover_id', 'category_id', 'level_id', 'grade_id',
    'content_language', 'author', 'publisher', 'publication_year', 'edition', 'search_text', 'creator_id', 'reviewed_by',
    'reviewed_at', 'reviewed_pdf_version', 'reviewed_cover_version', 'review_note', 'created_at', 'updated_at'],
  book_translations: ['book_id', 'locale', 'title', 'description', 'search_text'],
};

const constraints = [
  'books_slug', 'books_status_check', 'books_year_check', 'books_distinct_media_check', 'books_review_check',
  'books_pdf_fk', 'books_cover_fk', 'books_category_fk', 'books_level_fk', 'books_grade_fk', 'books_content_language_fk',
  'books_creator_fk', 'books_reviewer_fk', 'book_translations_book_fk', 'book_translations_locale_fk',
];

export class BookMigrationError extends Error {}

async function verifySchema(db: Sequelize, transaction: Transaction) {
  const options = { type: QueryTypes.SELECT as const, transaction, replacements: { tables: Object.keys(columns) } };
  const fields = await db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)
  `, options);
  const definitions = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
  `, options);
  const fieldNames = new Set(fields.map(row => row.tableName + '.' + row.columnName));
  const ruleNames = new Set(definitions.map(row => row.name));
  if (fields.some(row => row.engine !== 'InnoDB' || row.collation !== 'utf8mb4_unicode_ci') ||
      Object.entries(columns).some(([table, names]) => names.some(name => !fieldNames.has(table + '.' + name))) ||
      constraints.some(name => !ruleNames.has(name))) {
    throw new BookMigrationError('The digital library schema is incompatible. Review the database before retrying.');
  }
}

export function migrateBooks(db: Sequelize) {
  const lock = 'womenriseafg:books:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async connection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...lockOptions, transaction: connection });
    if (acquired?.held !== 1) throw new BookMigrationError('Could not acquire the digital library migration lock.');
    try {
      const records = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: connection });
      const versions = new Set(records.map(record => record.version));
      if (!versions.has('006-learning-media')) {
        throw new BookMigrationError('Apply the learning media migration before the digital library migration.');
      }
      if (versions.has(version)) {
        await verifySchema(db, connection);
        return false;
      }
      for (const statement of statements) await db.query(statement, { transaction: connection });
      await verifySchema(db, connection);

      // MySQL commits DDL independently. The grants and migration record are atomic.
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        for (const permissionCode of [bookManagePermission, bookPublishPermission]) {
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
