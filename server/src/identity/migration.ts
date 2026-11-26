import { createHash } from 'node:crypto';
import { QueryTypes, Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from './models';
import { accountPermission, administrationPermission, administratorRoles, seededRoles } from './roles';

const baselineVersion = '001-initial-identity';
const scopeVersion = '002-admin-session-scope';
const tableOptions = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = ' CHARACTER SET ascii COLLATE ascii_bin';
const ledger = `CREATE TABLE IF NOT EXISTS identity_schema_migrations (
  version VARCHAR(80)${ascii} PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL
)${tableOptions}`;

// Fixed names and CREATE IF NOT EXISTS make each DDL step repeatable after an
// interrupted migration. MySQL implicitly commits DDL, so seed data and the
// applied marker are committed together only after all tables are verified.
const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36)${ascii} PRIMARY KEY,
    login VARCHAR(32)${ascii} NOT NULL,
    password_hash VARCHAR(255)${ascii} NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY users_login_unique (login)
  )`,
  `CREATE TABLE IF NOT EXISTS roles (
    code VARCHAR(32)${ascii} PRIMARY KEY
  )`,
  `CREATE TABLE IF NOT EXISTS permissions (
    code VARCHAR(64)${ascii} PRIMARY KEY
  )`,
  `CREATE TABLE IF NOT EXISTS user_roles (
    user_id CHAR(36)${ascii} NOT NULL,
    role_code VARCHAR(32)${ascii} NOT NULL,
    PRIMARY KEY (user_id, role_code),
    KEY user_roles_code_index (role_code),
    CONSTRAINT identity_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT identity_user_roles_role FOREIGN KEY (role_code) REFERENCES roles (code) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS role_permissions (
    role_code VARCHAR(32)${ascii} NOT NULL,
    permission_code VARCHAR(64)${ascii} NOT NULL,
    PRIMARY KEY (role_code, permission_code),
    KEY role_permissions_code_index (permission_code),
    CONSTRAINT identity_role_permissions_role FOREIGN KEY (role_code) REFERENCES roles (code) ON DELETE CASCADE,
    CONSTRAINT identity_role_permissions_permission FOREIGN KEY (permission_code) REFERENCES permissions (code) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64)${ascii} PRIMARY KEY,
    user_id CHAR(36)${ascii} NOT NULL,
    created_at DATETIME(3) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    KEY sessions_user_index (user_id),
    KEY sessions_expiry_index (expires_at),
    CONSTRAINT identity_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )`,
];

const expectedColumns = {
  identity_schema_migrations: 'version:varchar:80:ascii_bin,applied_at:datetime:3:',
  users: 'id:char:36:ascii_bin,login:varchar:32:ascii_bin,password_hash:varchar:255:ascii_bin,active:tinyint::,created_at:datetime:3:,updated_at:datetime:3:',
  roles: 'code:varchar:32:ascii_bin',
  permissions: 'code:varchar:64:ascii_bin',
  user_roles: 'user_id:char:36:ascii_bin,role_code:varchar:32:ascii_bin',
  role_permissions: 'role_code:varchar:32:ascii_bin,permission_code:varchar:64:ascii_bin',
  sessions: 'token_hash:char:64:ascii_bin,user_id:char:36:ascii_bin,created_at:datetime:3:,expires_at:datetime:3:',
} as const;

const requiredIndexes = [
  'identity_schema_migrations:PRIMARY:0:version',
  'users:PRIMARY:0:id',
  'users:users_login_unique:0:login',
  'roles:PRIMARY:0:code',
  'permissions:PRIMARY:0:code',
  'user_roles:PRIMARY:0:user_id,role_code',
  'user_roles:user_roles_code_index:1:role_code',
  'role_permissions:PRIMARY:0:role_code,permission_code',
  'role_permissions:role_permissions_code_index:1:permission_code',
  'sessions:PRIMARY:0:token_hash',
  'sessions:sessions_user_index:1:user_id',
  'sessions:sessions_expiry_index:1:expires_at',
];

const requiredReferences = [
  'user_roles:user_id:users:id:CASCADE',
  'user_roles:role_code:roles:code:RESTRICT',
  'role_permissions:role_code:roles:code:CASCADE',
  'role_permissions:permission_code:permissions:code:RESTRICT',
  'sessions:user_id:users:id:CASCADE',
];

export class IdentityMigrationError extends Error {}

async function verifySchema(db: Sequelize, transaction: Transaction, hasAdminScope: boolean) {
  const tables = Object.keys(expectedColumns);
  const options = { type: QueryTypes.SELECT as const, replacements: { tables }, transaction };
  const columns = await db.query<{ name: keyof typeof expectedColumns; fields: string; engine: string; collation: string }>(`
    SELECT c.TABLE_NAME AS name,
           GROUP_CONCAT(CONCAT(c.COLUMN_NAME, ':', c.DATA_TYPE, ':',
             COALESCE(CAST(c.CHARACTER_MAXIMUM_LENGTH AS CHAR), CAST(c.DATETIME_PRECISION AS CHAR), ''), ':',
             COALESCE(c.COLLATION_NAME, '')) ORDER BY c.ORDINAL_POSITION) AS fields,
           t.ENGINE AS engine, t.TABLE_COLLATION AS collation
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (:tables)
    GROUP BY c.TABLE_NAME, t.ENGINE, t.TABLE_COLLATION
    HAVING SUM(c.IS_NULLABLE = 'YES') = 0
  `, options);
  const indexes = await db.query<{ signature: string }>(`
    SELECT CONCAT(TABLE_NAME, ':', INDEX_NAME, ':', NON_UNIQUE, ':',
      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)) AS signature
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)
    GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
    HAVING SUM(SUB_PART IS NOT NULL) = 0
  `, options);
  const references = await db.query<{ signature: string }>(`
    SELECT CONCAT(k.TABLE_NAME, ':', k.COLUMN_NAME, ':', k.REFERENCED_TABLE_NAME, ':',
      k.REFERENCED_COLUMN_NAME, ':', r.DELETE_RULE) AS signature
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME IN (:tables)
      AND k.REFERENCED_TABLE_SCHEMA = DATABASE()
  `, options);
  const indexSignatures = new Set(indexes.map(index => index.signature));
  const referenceSignatures = new Set(references.map(reference => reference.signature));
  const fields = {
    ...expectedColumns,
    sessions: expectedColumns.sessions + (hasAdminScope ? ',admin_scope:tinyint::' : ''),
  };
  if (columns.length !== tables.length ||
      columns.some(row => row.fields !== fields[row.name] || row.engine !== 'InnoDB' || row.collation !== 'utf8mb4_unicode_ci') ||
      requiredIndexes.some(signature => !indexSignatures.has(signature)) ||
      requiredReferences.some(signature => !referenceSignatures.has(signature))) {
    throw new IdentityMigrationError('The identity schema is incompatible. Review the database before retrying.');
  }
}

async function readAdminScopeColumn(db: Sequelize, transaction: Transaction) {
  const [column] = await db.query<{ defaultValue: string | null }>(`
    SELECT COLUMN_DEFAULT AS defaultValue
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'admin_scope'
  `, { type: QueryTypes.SELECT, transaction });
  return column;
}

async function recordVersion(db: Sequelize, version: string, transaction: Transaction) {
  await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
    { bind: { version, appliedAt: new Date() }, transaction });
}

async function applyBaseline(db: Sequelize, migrationConnection: Transaction) {
  for (const statement of schema) {
    await db.query(statement + tableOptions, { transaction: migrationConnection });
  }
  await verifySchema(db, migrationConnection, false);

  const { Role, Permission, RolePermission } = defineIdentityModels(db);
  await db.transaction(async transaction => {
    for (const code of [accountPermission, administrationPermission]) {
      await Permission.upsert({ code }, { transaction });
    }
    for (const roleCode of seededRoles) {
      await Role.upsert({ code: roleCode }, { transaction });
      await RolePermission.upsert({ roleCode, permissionCode: accountPermission }, { transaction });
      if (administratorRoles.some(code => code === roleCode)) {
        await RolePermission.upsert({ roleCode, permissionCode: administrationPermission }, { transaction });
      }
    }
    await recordVersion(db, baselineVersion, transaction);
  });
}

export async function migrateIdentity(db: Sequelize) {
  const lock = 'womenriseafg:identity:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const sql = { type: QueryTypes.SELECT as const, bind: { lock } };

  // Named locks are connection-local. The outer transaction reserves that
  // connection for DDL and lock release. The seed transaction commits before
  // release, keeping simultaneous migration commands serialized.
  return db.transaction(async migrationConnection => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held',
      { ...sql, transaction: migrationConnection });
    if (acquired?.held !== 1) throw new IdentityMigrationError('Could not acquire the identity migration lock.');
    try {
      await db.query(ledger, { transaction: migrationConnection });
      const rows = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction: migrationConnection });
      const versions = new Set(rows.map(row => row.version));
      if (!versions.has(baselineVersion)) await applyBaseline(db, migrationConnection);

      const scopeApplied = versions.has(scopeVersion);
      let scopeColumn = await readAdminScopeColumn(db, migrationConnection);
      if (!scopeApplied && !scopeColumn) {
        await verifySchema(db, migrationConnection, false);
        // Legacy sessions have no proof of administrator sign-in. Keep those
        // sessions active for learner access and require a fresh admin login.
        await db.query('ALTER TABLE sessions ADD COLUMN admin_scope BOOLEAN NOT NULL DEFAULT FALSE',
          { transaction: migrationConnection });
        scopeColumn = await readAdminScopeColumn(db, migrationConnection);
      }
      if (scopeColumn?.defaultValue !== '0') {
        throw new IdentityMigrationError('The administrator session scope column is missing or has an incompatible default.');
      }
      await verifySchema(db, migrationConnection, true);
      if (!scopeApplied) await db.transaction(transaction => recordVersion(db, scopeVersion, transaction));
      return !versions.has(baselineVersion) || !scopeApplied;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...sql, transaction: migrationConnection });
    }
  });
}
