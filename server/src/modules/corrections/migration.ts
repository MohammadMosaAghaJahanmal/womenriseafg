import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administratorRoles } from '../../identity/roles';
import { correctionManagePermission } from './contract';

const version = '015-corrections';
const fields = ['id', 'resource_id', 'resource_kind', 'resource_path', 'message', 'created_at', 'resolved_at'];
export class CorrectionMigrationError extends Error {}

async function verify(db: Sequelize, transaction: Transaction) {
  const options = { type: QueryTypes.SELECT as const, transaction };
  const columns = await db.query<{ name: string; engine: string; collation: string }>(
    `SELECT COLUMN_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
        ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'learner_corrections'`, options);
  const keys = await db.query<{ name: string }>(
    `SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'learner_corrections'`, options);
  const rules = await db.query<{ name: string }>(
    `SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'learner_corrections'`, options);
  if (!fields.every(field => columns.some(column => column.name === field)) ||
      columns.some(column => column.engine !== 'InnoDB' || column.collation !== 'utf8mb4_unicode_ci') ||
      !['PRIMARY', 'corrections_queue', 'corrections_retention'].every(key => keys.some(index => index.name === key)) ||
      !['corrections_message_length', 'corrections_timestamps'].every(name => rules.some(rule => rule.name === name))) {
    throw new CorrectionMigrationError('The correction reporting schema is incompatible.');
  }
}

export function migrateCorrections(db: Sequelize) {
  const lock = 'womenriseafg:corrections:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 32);
  return db.transaction(async connection => {
    const query = { type: QueryTypes.SELECT as const, transaction: connection };
    const [result] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held', { ...query, bind: { lock } });
    if (result?.held !== 1) throw new CorrectionMigrationError('Could not acquire the correction reporting migration lock.');
    try {
      const versions = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations', query);
      if (!versions.some(item => item.version === '009-discovery')) {
        throw new CorrectionMigrationError('Apply the discovery migration before correction reporting.');
      }
      if (versions.some(item => item.version === version)) {
        await verify(db, connection);
        return false;
      }
      await db.query(`CREATE TABLE IF NOT EXISTS learner_corrections (
        id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        resource_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        resource_kind VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        resource_path VARCHAR(175) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        message VARCHAR(1200) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        resolved_at DATETIME(3) NULL,
        KEY corrections_queue (created_at DESC, id),
        KEY corrections_retention (resolved_at),
        CONSTRAINT corrections_message_length CHECK (CHAR_LENGTH(message) BETWEEN 12 AND 1200),
        CONSTRAINT corrections_timestamps CHECK (resolved_at IS NULL OR resolved_at >= created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction: connection });
      await verify(db, connection);
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        await Permission.upsert({ code: correctionManagePermission }, { transaction });
        for (const roleCode of administratorRoles) {
          await RolePermission.upsert({ roleCode, permissionCode: correctionManagePermission }, { transaction });
        }
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
          { bind: { version, appliedAt: new Date() }, transaction });
      });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...query, bind: { lock } });
    }
  });
}
