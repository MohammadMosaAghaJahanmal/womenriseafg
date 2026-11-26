import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';

const version = '010-certificates';
export class CertificateMigrationError extends Error {}

async function verify(db: Sequelize, transaction: Transaction) {
  const options = { type: QueryTypes.SELECT as const, transaction };
  const columns = await db.query<{ columnName: string }>(`
    SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificates'
  `, options);
  const rules = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificates'
  `, options);
  const names = new Set(columns.map(column => column.columnName));
  if (!['code', 'course_id', 'locale', 'issued_at'].every(column => names.has(column)) ||
      !rules.some(rule => rule.name === 'certificates_course_fk')) {
    throw new CertificateMigrationError('The certificate schema is incompatible.');
  }
}

export function migrateCertificates(db: Sequelize) {
  const lock = 'womenriseafg:certificates:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 32);
  return db.transaction(async transaction => {
    const options = { type: QueryTypes.SELECT as const, transaction };
    const [status] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held', { ...options, bind: { lock } });
    if (status?.held !== 1) throw new CertificateMigrationError('Could not acquire the certificate migration lock.');
    try {
      const versions = new Set((await db.query<{ version: string }>(
        'SELECT version FROM identity_schema_migrations', options)).map(row => row.version));
      if (!versions.has('005-course-learning')) throw new CertificateMigrationError('Apply the course migration before certificates.');
      if (versions.has(version)) {
        await verify(db, transaction);
        return false;
      }
      await db.query(`
        CREATE TABLE IF NOT EXISTS certificates (
          code CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
          course_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          locale VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          issued_at DATETIME(3) NOT NULL,
          KEY certificates_course (course_id),
          CONSTRAINT certificates_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { transaction });
      await verify(db, transaction);
      await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
        { bind: { version, appliedAt: new Date() }, transaction });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...options, bind: { lock } });
    }
  });
}
