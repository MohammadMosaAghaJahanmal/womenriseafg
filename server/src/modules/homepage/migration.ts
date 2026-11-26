import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { defaultSettings, homepageManagePermission } from './contract';

const version = '011-homepage';
const columns = {
  homepage_settings: ['id', 'config', 'version', 'updated_at'],
  homepage_course_opens: ['course_id', 'opens'],
};
const constraints = ['homepage_singleton', 'homepage_config_type', 'homepage_course_fk', 'homepage_positive_opens'];
const indexes = ['homepage_opens_order'];
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
export class HomepageMigrationError extends Error {}

async function verify(db: Sequelize, transaction: Transaction) {
  const query = { type: QueryTypes.SELECT as const, replacements: { tables: Object.keys(columns) }, transaction };
  const [fields, rules, keys] = await Promise.all([
    db.query<{ tableName: string; columnName: string; engine: string; collation: string }>(`
      SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, t.ENGINE AS engine, t.TABLE_COLLATION AS collation
      FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
        ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)`, query),
    db.query<{ name: string }>(`
      SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)`, query),
    db.query<{ name: string }>(`
      SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)`, query),
  ]);
  const path = new Set(fields.map(field => field.tableName + '.' + field.columnName));
  if (fields.some(field => field.engine !== 'InnoDB' || field.collation !== 'utf8mb4_unicode_ci') ||
    Object.entries(columns).some(([table, names]) => names.some(name => !path.has(table + '.' + name))) ||
    constraints.some(name => !rules.some(rule => rule.name === name)) ||
    indexes.some(name => !keys.some(key => key.name === name))) {
    throw new HomepageMigrationError('The homepage schema is incompatible. Review the database before retrying.');
  }
}

export function migrateHomepage(db: Sequelize) {
  const lock = 'womenriseafg:homepage:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 38);
  return db.transaction(async connection => {
    const query = { type: QueryTypes.SELECT as const, transaction: connection };
    const [result] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held', { ...query, bind: { lock } });
    if (result?.held !== 1) throw new HomepageMigrationError('Could not acquire the homepage migration lock.');
    try {
      const versions = new Set((await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        query)).map(record => record.version));
      if (!versions.has('010-certificates')) throw new HomepageMigrationError('Apply the certificate migration before the homepage migration.');
      if (versions.has(version)) {
        await verify(db, connection);
        return false;
      }
      await db.query(`CREATE TABLE IF NOT EXISTS homepage_settings (
        id TINYINT UNSIGNED PRIMARY KEY,
        config JSON NOT NULL,
        version INT UNSIGNED NOT NULL DEFAULT 1,
        updated_at DATETIME(3) NOT NULL,
        CONSTRAINT homepage_singleton CHECK (id = 1),
        CONSTRAINT homepage_config_type CHECK (JSON_TYPE(config) = 'OBJECT')
      ) ${options}`, { transaction: connection });
      await db.query(`CREATE TABLE IF NOT EXISTS homepage_course_opens (
        course_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        opens BIGINT UNSIGNED NOT NULL,
        KEY homepage_opens_order (opens DESC, course_id),
        CONSTRAINT homepage_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
        CONSTRAINT homepage_positive_opens CHECK (opens > 0)
      ) ${options}`, { transaction: connection });
      await verify(db, connection);
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        await Permission.upsert({ code: homepageManagePermission }, { transaction });
        for (const roleCode of administratorRoles) {
          await RolePermission.upsert({ roleCode, permissionCode: homepageManagePermission }, { transaction });
        }
        await db.query(`INSERT INTO homepage_settings (id, config, version, updated_at) VALUES (1, $config, 1, NOW(3))
          ON DUPLICATE KEY UPDATE id = 1`, { bind: { config: JSON.stringify(defaultSettings) }, transaction });
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
          { bind: { version, appliedAt: new Date() }, transaction });
      });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...query, bind: { lock } });
    }
  });
}
