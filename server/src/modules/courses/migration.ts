import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { courseManagePermission, coursePublishPermission } from './contract';

const version = '005-course-learning';
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';

const definitions = [
  `CREATE TABLE IF NOT EXISTS courses (
    id CHAR(36) ${ascii} PRIMARY KEY,
    slug VARCHAR(120) ${ascii} NOT NULL,
    status VARCHAR(24) ${ascii} NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    subject_id CHAR(36) ${ascii} NULL,
    level_id CHAR(36) ${ascii} NULL,
    grade_id CHAR(36) ${ascii} NULL,
    thumbnail_id CHAR(36) ${ascii} NULL,
    estimated_minutes INT UNSIGNED NULL,
    instructor VARCHAR(240) NOT NULL,
    creator_id CHAR(36) ${ascii} NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY courses_slug (slug),
    KEY courses_public_order (status, updated_at, id),
    KEY courses_subject (subject_id, status),
    KEY courses_level (level_id, status),
    KEY courses_grade (grade_id),
    KEY courses_thumbnail (thumbnail_id),
    KEY courses_creator (creator_id),
    CONSTRAINT course_status_valid CHECK (status IN ('draft','educational-review','translation-review','approved','published','archived')),
    CONSTRAINT course_duration_valid CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
    CONSTRAINT course_subject_fk FOREIGN KEY (subject_id) REFERENCES education_entries (id) ON DELETE RESTRICT,
    CONSTRAINT course_level_fk FOREIGN KEY (level_id) REFERENCES education_entries (id) ON DELETE RESTRICT,
    CONSTRAINT course_grade_fk FOREIGN KEY (grade_id) REFERENCES education_entries (id) ON DELETE RESTRICT,
    CONSTRAINT course_thumbnail_fk FOREIGN KEY (thumbnail_id) REFERENCES media_assets (id) ON DELETE RESTRICT,
    CONSTRAINT course_creator_fk FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE SET NULL
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS course_translations (
    course_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    title VARCHAR(240) NOT NULL,
    description TEXT NOT NULL,
    objectives TEXT NOT NULL,
    prerequisites TEXT NOT NULL,
    search_text TEXT NOT NULL,
    PRIMARY KEY (course_id, locale),
    KEY course_translation_locale (locale),
    CONSTRAINT course_translation_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
    CONSTRAINT course_translation_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS chapters (
    id CHAR(36) ${ascii} PRIMARY KEY,
    course_id CHAR(36) ${ascii} NOT NULL,
    position INT UNSIGNED NOT NULL,
    UNIQUE KEY chapters_course_identity (course_id, id),
    KEY chapters_order (course_id, position, id),
    CONSTRAINT chapter_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS chapter_translations (
    chapter_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    title VARCHAR(240) NOT NULL,
    PRIMARY KEY (chapter_id, locale),
    KEY chapter_translation_locale (locale),
    CONSTRAINT chapter_translation_fk FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE,
    CONSTRAINT chapter_translation_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS lessons (
    id CHAR(36) ${ascii} PRIMARY KEY,
    course_id CHAR(36) ${ascii} NOT NULL,
    chapter_id CHAR(36) ${ascii} NOT NULL,
    slug VARCHAR(120) ${ascii} NOT NULL,
    kind VARCHAR(12) ${ascii} NOT NULL,
    media_id CHAR(36) ${ascii} NULL,
    position INT UNSIGNED NOT NULL,
    UNIQUE KEY lessons_course_slug (course_id, slug),
    KEY lessons_order (course_id, chapter_id, position, id),
    KEY lessons_media (media_id),
    CONSTRAINT lesson_kind_valid CHECK (kind IN ('text','video','audio','pdf')),
    CONSTRAINT lesson_chapter_fk FOREIGN KEY (course_id, chapter_id) REFERENCES chapters (course_id, id) ON DELETE CASCADE,
    CONSTRAINT lesson_media_fk FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS lesson_translations (
    lesson_id CHAR(36) ${ascii} NOT NULL,
    locale VARCHAR(35) ${ascii} NOT NULL,
    title VARCHAR(240) NOT NULL,
    description TEXT NOT NULL,
    body MEDIUMTEXT NOT NULL,
    PRIMARY KEY (lesson_id, locale),
    KEY lesson_translation_locale (locale),
    CONSTRAINT lesson_translation_fk FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE,
    CONSTRAINT lesson_translation_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS lesson_resources (
    lesson_id CHAR(36) ${ascii} NOT NULL,
    media_id CHAR(36) ${ascii} NOT NULL,
    label VARCHAR(240) NOT NULL,
    position INT UNSIGNED NOT NULL,
    PRIMARY KEY (lesson_id, media_id),
    KEY lesson_resources_order (lesson_id, position),
    KEY lesson_resources_media (media_id),
    CONSTRAINT lesson_resource_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE,
    CONSTRAINT lesson_resource_media_fk FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS course_tags (
    course_id CHAR(36) ${ascii} NOT NULL,
    tag_id CHAR(36) ${ascii} NOT NULL,
    PRIMARY KEY (course_id, tag_id),
    KEY course_tags_lookup (tag_id),
    CONSTRAINT course_tag_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
    CONSTRAINT course_tag_entry_fk FOREIGN KEY (tag_id) REFERENCES education_entries (id) ON DELETE RESTRICT
  ) ${options}`,
  `CREATE TABLE IF NOT EXISTS course_related (
    course_id CHAR(36) ${ascii} NOT NULL,
    related_id CHAR(36) ${ascii} NOT NULL,
    position INT UNSIGNED NOT NULL,
    PRIMARY KEY (course_id, related_id),
    KEY course_related_lookup (related_id),
    KEY course_related_order (course_id, position),
    CONSTRAINT course_related_distinct CHECK (course_id <> related_id),
    CONSTRAINT course_related_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
    CONSTRAINT course_related_target_fk FOREIGN KEY (related_id) REFERENCES courses (id) ON DELETE CASCADE
  ) ${options}`,
];

const columns = {
  courses: ['id', 'slug', 'status', 'version', 'subject_id', 'level_id', 'grade_id', 'thumbnail_id',
    'estimated_minutes', 'instructor', 'creator_id', 'created_at', 'updated_at'],
  course_translations: ['course_id', 'locale', 'title', 'description', 'objectives', 'prerequisites', 'search_text'],
  chapters: ['id', 'course_id', 'position'],
  chapter_translations: ['chapter_id', 'locale', 'title'],
  lessons: ['id', 'course_id', 'chapter_id', 'slug', 'kind', 'media_id', 'position'],
  lesson_translations: ['lesson_id', 'locale', 'title', 'description', 'body'],
  lesson_resources: ['lesson_id', 'media_id', 'label', 'position'],
  course_tags: ['course_id', 'tag_id'],
  course_related: ['course_id', 'related_id', 'position'],
};

const constraints = [
  'courses_slug', 'course_status_valid', 'course_duration_valid', 'course_subject_fk', 'course_level_fk',
  'course_grade_fk', 'course_thumbnail_fk', 'course_creator_fk', 'course_translation_fk', 'course_translation_locale_fk',
  'chapters_course_identity', 'chapter_course_fk', 'chapter_translation_fk', 'chapter_translation_locale_fk',
  'lessons_course_slug', 'lesson_chapter_fk', 'lesson_media_fk', 'lesson_translation_fk',
  'lesson_translation_locale_fk', 'lesson_resource_lesson_fk', 'lesson_resource_media_fk', 'course_tag_course_fk',
  'course_tag_entry_fk', 'course_related_distinct', 'course_related_course_fk', 'course_related_target_fk',
];

export class CourseMigrationError extends Error {}

async function verifySchema(db: Sequelize, transaction: Transaction) {
  const queryOptions = { type: QueryTypes.SELECT as const, transaction, replacements: { tables: Object.keys(columns) } };
  const fields = await db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)
  `, queryOptions);
  const rules = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
  `, queryOptions);
  const fieldNames = new Set(fields.map(row => row.tableName + '.' + row.columnName));
  const ruleNames = new Set(rules.map(row => row.name));
  if (fields.some(row => row.engine !== 'InnoDB' || row.collation !== 'utf8mb4_unicode_ci') ||
      Object.entries(columns).some(([table, names]) => names.some(name => !fieldNames.has(table + '.' + name))) ||
      constraints.some(name => !ruleNames.has(name)) ||
      (!ruleNames.has('lesson_kind_valid') && !ruleNames.has('lesson_extended_kind_valid'))) {
    throw new CourseMigrationError('The course schema is incompatible. Review the database before retrying.');
  }
}

export async function migrateCourses(db: Sequelize) {
  const lock = 'womenriseafg:courses:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async connection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...lockOptions, transaction: connection });
    if (acquired?.held !== 1) throw new CourseMigrationError('Could not acquire the course migration lock.');
    try {
      const rows = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: connection });
      const versions = new Set(rows.map(row => row.version));
      if (!versions.has('004-centralized-media')) {
        throw new CourseMigrationError('Apply the media migration before the course migration.');
      }
      if (versions.has(version)) {
        await verifySchema(db, connection);
        return false;
      }
      for (const definition of definitions) await db.query(definition, { transaction: connection });
      await verifySchema(db, connection);

      // MySQL commits DDL independently. Permission grants and the ledger commit together.
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        for (const permissionCode of [courseManagePermission, coursePublishPermission]) {
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
