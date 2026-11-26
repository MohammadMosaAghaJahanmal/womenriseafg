import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { staffManagePermission, staffWorkspacePermission, superAdminRole } from '../../identity/roles';
import { contributorRoles } from './contract';

const version = '012-staff';
const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ascii = 'CHARACTER SET ascii COLLATE ascii_bin';
const tables = ['staff_assignments', 'staff_audit_events'];
export class StaffMigrationError extends Error {}

async function verify(db: Sequelize, transaction: Transaction) {
  const rows = await db.query<{ name: string; engine: string; fields: string }>(`
    SELECT t.TABLE_NAME AS name, t.ENGINE AS engine,
      GROUP_CONCAT(c.COLUMN_NAME ORDER BY c.ORDINAL_POSITION) AS fields
    FROM information_schema.TABLES t JOIN information_schema.COLUMNS c
      ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME IN (:tables)
    GROUP BY t.TABLE_NAME, t.ENGINE`,
  { type: QueryTypes.SELECT, replacements: { tables }, transaction });
  const expected = new Map([
    ['staff_assignments', 'id,course_id,assignee_id,lane,locale,instructions,state,created_at'],
    ['staff_audit_events', 'id,actor_id,target_id,event,created_at'],
  ]);
  if (rows.length !== tables.length || rows.some(row => row.engine !== 'InnoDB' || expected.get(row.name) !== row.fields)) {
    throw new StaffMigrationError('Staff schema is incompatible. Check the database before retrying.');
  }
  const rules = await db.query<{ name: string }>(`
    SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)`,
  { type: QueryTypes.SELECT, replacements: { tables }, transaction });
  const names = new Set(rules.map(row => row.name));
  if (['staff_assignment_course_fk', 'staff_assignment_user_fk', 'staff_assignment_locale_fk',
    'staff_assignment_lane_locale', 'staff_assignment_state'].some(name => !names.has(name))) {
    throw new StaffMigrationError('Staff assignment constraints are incomplete. Check the database before retrying.');
  }
}

export function migrateStaff(db: Sequelize) {
  const lock = 'womenriseafg:staff:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 38);
  return db.transaction(async connection => {
    const select = { type: QueryTypes.SELECT as const, transaction: connection };
    const [result] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held', { ...select, bind: { lock } });
    if (result?.held !== 1) throw new StaffMigrationError('Could not acquire the staff migration lock.');
    try {
      const versions = new Set((await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations', select))
        .map(item => item.version));
      if (!versions.has('011-homepage')) throw new StaffMigrationError('Apply the homepage migration before the staff migration.');
      if (versions.has(version)) {
        await verify(db, connection);
        return false;
      }
      await db.query(`CREATE TABLE IF NOT EXISTS staff_assignments (
        id CHAR(36) ${ascii} PRIMARY KEY,
        course_id CHAR(36) ${ascii} NOT NULL,
        assignee_id CHAR(36) ${ascii} NOT NULL,
        lane VARCHAR(12) ${ascii} NOT NULL,
        locale VARCHAR(35) ${ascii} NULL,
        instructions VARCHAR(1000) NOT NULL,
        state VARCHAR(10) ${ascii} NOT NULL,
        created_at DATETIME(3) NOT NULL,
        KEY staff_assignment_course (course_id, state),
        KEY staff_assignment_user (assignee_id, state, created_at, id),
        CONSTRAINT staff_assignment_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
        CONSTRAINT staff_assignment_user_fk FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT staff_assignment_locale_fk FOREIGN KEY (locale) REFERENCES education_languages (locale) ON DELETE RESTRICT,
        CONSTRAINT staff_assignment_lane_locale CHECK (
          (lane = 'translate' AND locale IS NOT NULL) OR (lane IN ('edit', 'review') AND locale IS NULL)
        ),
        CONSTRAINT staff_assignment_state CHECK (state IN ('open', 'complete', 'revoked'))
      ) ${options}`, { transaction: connection });
      await db.query(`CREATE TABLE IF NOT EXISTS staff_audit_events (
        id CHAR(36) ${ascii} PRIMARY KEY,
        actor_id CHAR(36) ${ascii} NOT NULL,
        target_id CHAR(36) ${ascii} NOT NULL,
        event VARCHAR(40) ${ascii} NOT NULL,
        created_at DATETIME(3) NOT NULL,
        KEY staff_audit_order (created_at, id)
      ) ${options}`, { transaction: connection });
      await verify(db, connection);
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        await Permission.upsert({ code: staffManagePermission }, { transaction });
        await Permission.upsert({ code: staffWorkspacePermission }, { transaction });
        await RolePermission.upsert({ roleCode: superAdminRole, permissionCode: staffManagePermission }, { transaction });
        for (const roleCode of contributorRoles) {
          await RolePermission.upsert({ roleCode, permissionCode: staffWorkspacePermission }, { transaction });
        }
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
          { bind: { version, appliedAt: new Date() }, transaction });
      });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...select, bind: { lock } });
    }
  });
}

