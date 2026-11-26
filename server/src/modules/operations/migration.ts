import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { superAdminRole } from '../../identity/roles';

export const operationsPermission = 'operations:manage';
const version = '019-operations';
export class OperationsMigrationError extends Error {}

async function verify(db: Sequelize, transaction: Transaction) {
  const [row] = await db.query<{ engine: string; fields: string; rules: number }>(`
    SELECT t.ENGINE AS engine, GROUP_CONCAT(c.COLUMN_NAME ORDER BY c.ORDINAL_POSITION) AS fields,
      (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS tc
        WHERE tc.TABLE_SCHEMA = t.TABLE_SCHEMA AND tc.TABLE_NAME = t.TABLE_NAME
        AND tc.CONSTRAINT_NAME IN ('operations_backup_kind', 'operations_backup_result')) AS rules
    FROM information_schema.TABLES t JOIN information_schema.COLUMNS c
      ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
    WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'operations_backup_checks'
    GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME, t.ENGINE`,
  { type: QueryTypes.SELECT, transaction });
  if (row?.engine !== 'InnoDB' || row.fields !== 'kind,result,recorded_at' || Number(row.rules) !== 2) {
    throw new OperationsMigrationError('Operations schema is incompatible. Check the database before retrying.');
  }
}

export function migrateOperations(db: Sequelize) {
  const lock = 'womenriseafg:operations:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 35);
  return db.transaction(async connection => {
    const select = { type: QueryTypes.SELECT as const, transaction: connection, bind: { lock } };
    const [result] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held', select);
    if (result?.held !== 1) throw new OperationsMigrationError('Could not acquire the operations migration lock.');
    try {
      const versions = new Set((await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations', select))
        .map(row => row.version));
      if (!versions.has('012-staff')) throw new OperationsMigrationError('Apply the staff migration before the operations migration.');
      if (versions.has(version)) {
        await verify(db, connection);
        return false;
      }
      await db.query(`CREATE TABLE IF NOT EXISTS operations_backup_checks (
        kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        result VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        recorded_at DATETIME(3) NOT NULL,
        CONSTRAINT operations_backup_kind CHECK (kind IN ('backup', 'restore-drill')),
        CONSTRAINT operations_backup_result CHECK (result IN ('passed', 'failed'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction: connection });
      await verify(db, connection);
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        await Permission.upsert({ code: operationsPermission }, { transaction });
        await RolePermission.upsert({ roleCode: superAdminRole, permissionCode: operationsPermission }, { transaction });
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, NOW(3))',
          { bind: { version }, transaction });
      });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', select);
    }
  });
}

