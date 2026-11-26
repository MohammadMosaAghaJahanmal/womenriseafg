import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';

const version = '013-curriculum-authoring';
const quizLink = 'CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL';
const fields = {
  courses: { provenance: 'JSON NULL' },
  course_translations: { provenance: 'JSON NULL' },
  lesson_translations: { image_alt: "VARCHAR(500) NOT NULL DEFAULT ''", provenance: 'JSON NULL' },
  lessons: { quiz_id: quizLink },
  quizzes: { provenance: 'JSON NULL' },
  quiz_translations: { provenance: 'JSON NULL' },
  quiz_questions: { provenance: 'JSON NULL' },
  quiz_question_translations: { provenance: 'JSON NULL' },
} as const;

const kindCheck = "kind IN ('text','video','audio','pdf','image','quiz')";
const linkCheck = "(kind = 'quiz' AND media_id IS NULL) OR (kind <> 'quiz' AND quiz_id IS NULL)";
const rules = {
  lesson_extended_kind_valid: 'CHECK (' + kindCheck + ')',
  lesson_quiz_kind_valid: 'CHECK (' + linkCheck + ')',
  lesson_quiz_fk: 'FOREIGN KEY (quiz_id) REFERENCES quizzes (id)',
} as const;

export class CurriculumAuthoringMigrationError extends Error {}

async function inspect(db: Sequelize, transaction: Transaction) {
  const columns = await db.query<{ columnKey: string; collation: string | null }>(`
    SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS columnKey, COLLATION_NAME AS collation
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
  `, { replacements: { tables: Object.keys(fields) }, type: QueryTypes.SELECT, transaction });
  const constraints = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lessons'
  `, { type: QueryTypes.SELECT, transaction });
  return { columns: new Map(columns.map(row => [row.columnKey, row.collation])), constraints: new Set(constraints.map(row => row.name)) };
}

export async function migrateCurriculumAuthoring(db: Sequelize) {
  const lock = 'womenriseafg:authoring:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async transaction => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held', { ...lockOptions, transaction });
    if (acquired?.held !== 1) throw new CurriculumAuthoringMigrationError('Could not acquire the curriculum authoring migration lock.');
    try {
      const rows = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction });
      const versions = new Set(rows.map(row => row.version));
      if (!versions.has('008-quizzes')) {
        throw new CurriculumAuthoringMigrationError('Apply the quiz migration before the curriculum authoring migration.');
      }
      const graduated = versions.has(version);
      const current = await inspect(db, transaction);
      if (!graduated) {
        const priorCollation = current.columns.get('lessons.quiz_id');
        if (priorCollation && priorCollation !== 'ascii_bin' && !current.constraints.has('lesson_quiz_fk')) {
          await db.query('ALTER TABLE lessons MODIFY COLUMN quiz_id ' + quizLink, { transaction });
        }
        for (const [table, columns] of Object.entries(fields)) {
          for (const [column, definition] of Object.entries(columns)) {
            if (!current.columns.has(table + '.' + column)) {
              await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, { transaction });
            }
          }
        }
        for (const [constraint, rule] of Object.entries(rules)) {
          if (!current.constraints.has(constraint)) {
            await db.query(`ALTER TABLE lessons ADD CONSTRAINT ${constraint} ${rule}`, { transaction });
          }
        }
        if (current.constraints.has('lesson_kind_valid')) {
          await db.query('ALTER TABLE lessons DROP CHECK lesson_kind_valid', { transaction });
        }
      }
      const next = await inspect(db, transaction);
      if (Object.entries(fields).some(([table, columns]) =>
        Object.keys(columns).some(column => !next.columns.has(table + '.' + column))) ||
          Object.keys(rules).some(name => !next.constraints.has(name)) || next.constraints.has('lesson_kind_valid') ||
          next.columns.get('lessons.quiz_id') !== 'ascii_bin') {
        throw new CurriculumAuthoringMigrationError('The curriculum authoring schema is incompatible. Review the database before retrying.');
      }
      if (!graduated) {
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
          { bind: { version, appliedAt: new Date() }, transaction });
      }
      return !graduated;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...lockOptions, transaction });
    }
  });
}
