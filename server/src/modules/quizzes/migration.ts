import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { quizManagePermission, quizPublishPermission, quizQuestionLimit } from './contract';

const version = '008-quizzes';
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';

const statements = [
  `CREATE TABLE IF NOT EXISTS quizzes (
    id CHAR(36) ${ascii} PRIMARY KEY,
    slug VARCHAR(80) ${ascii} NOT NULL,
    course_id CHAR(36) ${ascii} NULL,
    status VARCHAR(24) ${ascii} NOT NULL,
    passing_score TINYINT UNSIGNED NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY quizzes_slug (slug),
    KEY quizzes_public_order (status, updated_at, id),
    KEY quizzes_course (course_id, status),
    CONSTRAINT quizzes_status_check CHECK (status IN
      ('draft','educational-review','translation-review','approved','published','archived')),
    CONSTRAINT quizzes_score_check CHECK (passing_score BETWEEN 1 AND 100),
    CONSTRAINT quizzes_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS quiz_translations (
    quiz_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    search_text TEXT NOT NULL,
    PRIMARY KEY (quiz_id, locale),
    KEY quiz_translations_locale (locale, quiz_id),
    CONSTRAINT quiz_translations_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
    CONSTRAINT quiz_translations_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS quiz_questions (
    id CHAR(36) ${ascii} PRIMARY KEY,
    kind VARCHAR(16) ${ascii} NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    KEY quiz_questions_kind_updated (kind, updated_at, id),
    CONSTRAINT quiz_questions_kind_check CHECK (kind IN ('single-choice','multiple-choice','true-false','short-answer'))
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS quiz_question_translations (
    question_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    prompt TEXT NOT NULL,
    explanation TEXT NOT NULL,
    search_text TEXT NOT NULL,
    PRIMARY KEY (question_id, locale),
    KEY quiz_question_translations_locale (locale, question_id),
    CONSTRAINT quiz_question_translations_question_fk FOREIGN KEY (question_id) REFERENCES quiz_questions (id) ON DELETE CASCADE,
    CONSTRAINT quiz_question_translations_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS quiz_question_options (
    question_id CHAR(36) ${ascii} NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    correct BOOLEAN NOT NULL,
    PRIMARY KEY (question_id, position),
    CONSTRAINT quiz_question_options_position_check CHECK (position < 8),
    CONSTRAINT quiz_question_options_correct_check CHECK (correct IN (0, 1)),
    CONSTRAINT quiz_question_options_question_fk FOREIGN KEY (question_id) REFERENCES quiz_questions (id) ON DELETE CASCADE
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS quiz_option_translations (
    question_id CHAR(36) ${ascii} NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    label VARCHAR(100) NOT NULL,
    PRIMARY KEY (question_id, position, locale),
    KEY quiz_option_translations_question_locale (question_id, locale),
    CONSTRAINT quiz_option_translations_option_fk FOREIGN KEY (question_id, position)
      REFERENCES quiz_question_options (question_id, position) ON DELETE CASCADE,
    CONSTRAINT quiz_option_translations_language_fk FOREIGN KEY (question_id, locale)
      REFERENCES quiz_question_translations (question_id, locale) ON DELETE CASCADE
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS quiz_short_answers (
    question_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    answer VARCHAR(100) NOT NULL,
    PRIMARY KEY (question_id, locale, position),
    CONSTRAINT quiz_short_answers_position_check CHECK (position < 8),
    CONSTRAINT quiz_short_answers_translation_fk FOREIGN KEY (question_id, locale)
      REFERENCES quiz_question_translations (question_id, locale) ON DELETE CASCADE
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS quiz_question_links (
    quiz_id CHAR(36) ${ascii} NOT NULL,
    question_id CHAR(36) ${ascii} NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (quiz_id, question_id),
    UNIQUE KEY quiz_question_links_position (quiz_id, position),
    KEY quiz_question_links_question (question_id, quiz_id),
    CONSTRAINT quiz_question_links_position_check CHECK (position < ${quizQuestionLimit}),
    CONSTRAINT quiz_question_links_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
    CONSTRAINT quiz_question_links_question_fk FOREIGN KEY (question_id) REFERENCES quiz_questions (id) ON DELETE RESTRICT
  ) ${options}`,
];

const columns = {
  quizzes: ['id', 'slug', 'course_id', 'status', 'passing_score', 'version', 'created_at', 'updated_at'],
  quiz_translations: ['quiz_id', 'locale', 'title', 'description', 'search_text'],
  quiz_questions: ['id', 'kind', 'version', 'created_at', 'updated_at'],
  quiz_question_translations: ['question_id', 'locale', 'prompt', 'explanation', 'search_text'],
  quiz_question_options: ['question_id', 'position', 'correct'],
  quiz_option_translations: ['question_id', 'position', 'locale', 'label'],
  quiz_short_answers: ['question_id', 'locale', 'position', 'answer'],
  quiz_question_links: ['quiz_id', 'question_id', 'position'],
};
const constraints = [
  'quizzes_slug', 'quizzes_status_check', 'quizzes_score_check', 'quizzes_course_fk',
  'quiz_translations_quiz_fk', 'quiz_translations_locale_fk', 'quiz_questions_kind_check',
  'quiz_question_translations_question_fk', 'quiz_question_translations_locale_fk',
  'quiz_question_options_position_check', 'quiz_question_options_correct_check', 'quiz_question_options_question_fk',
  'quiz_option_translations_option_fk', 'quiz_option_translations_language_fk',
  'quiz_short_answers_position_check', 'quiz_short_answers_translation_fk',
  'quiz_question_links_position', 'quiz_question_links_position_check', 'quiz_question_links_quiz_fk', 'quiz_question_links_question_fk',
];

export class QuizMigrationError extends Error {}

async function verifySchema(db: Sequelize, transaction: Transaction) {
  const config = { type: QueryTypes.SELECT as const, transaction, replacements: { tables: Object.keys(columns) } };
  const fields = await db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)
  `, config);
  const definitions = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
  `, config);
  const fieldNames = new Set(fields.map(field => field.tableName + '.' + field.columnName));
  const constraintNames = new Set(definitions.map(definition => definition.name));
  if (fields.some(field => field.engine !== 'InnoDB' || field.collation !== 'utf8mb4_unicode_ci') ||
      Object.entries(columns).some(([table, names]) => names.some(name => !fieldNames.has(table + '.' + name))) ||
      constraints.some(name => !constraintNames.has(name))) {
    throw new QuizMigrationError('The quiz schema is incompatible. Review the database before retrying.');
  }
}

export function migrateQuizzes(db: Sequelize) {
  const lock = 'womenriseafg:quizzes:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async connection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...lockOptions, transaction: connection });
    if (acquired?.held !== 1) throw new QuizMigrationError('Could not acquire the quiz migration lock.');
    try {
      const records = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: connection });
      const versions = new Set(records.map(record => record.version));
      if (!versions.has('007-digital-library')) throw new QuizMigrationError('Apply the digital library migration before the quiz migration.');
      if (versions.has(version)) {
        await verifySchema(db, connection);
        return false;
      }
      for (const statement of statements) await db.query(statement, { transaction: connection });
      await verifySchema(db, connection);

      // MySQL commits DDL independently. Grants and the migration record share a transaction.
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        for (const permissionCode of [quizManagePermission, quizPublishPermission]) {
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
