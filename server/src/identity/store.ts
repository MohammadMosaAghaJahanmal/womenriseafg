import { randomUUID } from 'node:crypto';
import { Op, QueryTypes, Sequelize, Transaction, UniqueConstraintError } from 'sequelize';
import { defineIdentityModels } from './models';
import { administrationPermission, administratorRoles, studentRole, superAdminRole } from './roles';

export interface IdentityAccount {
  id: string;
  login: string;
  roles: string[];
  permissions: string[];
}

export interface IdentitySession extends IdentityAccount {
  adminScope: boolean;
}

export class DuplicateLoginError extends Error {}
export class SessionPrincipalChangedError extends Error {}
export class AdministratorAlreadyInitializedError extends Error {}
export class AdministratorUnavailableError extends Error {}
export class IdentitySchemaUnavailableError extends Error {}

interface AccessRow {
  id: string;
  login: string;
  roleCode: string | null;
  permissionCode: string | null;
}

interface NewSession {
  tokenHash: string;
  expiresAt: Date;
  replaceTokenHash?: string;
}

const accessColumns = 'u.id, u.login, ur.role_code AS roleCode, rp.permission_code AS permissionCode';
const accessJoins = `
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN role_permissions rp ON rp.role_code = ur.role_code
`;

function toAccount(rows: AccessRow[]): IdentityAccount | null {
  const first = rows[0];
  if (!first) return null;
  const roles = new Set<string>();
  const permissions = new Set<string>();
  for (const row of rows) {
    if (row.roleCode) roles.add(row.roleCode);
    if (row.permissionCode) permissions.add(row.permissionCode);
  }
  return { id: first.id, login: first.login, roles: [...roles].sort(), permissions: [...permissions].sort() };
}

export function createIdentityStore(db: Sequelize) {
  const { User, Role, UserRole, Session } = defineIdentityModels(db);

  async function readAccount(userId: string, transaction?: Transaction) {
    return toAccount(await db.query<AccessRow>(
      'SELECT ' + accessColumns + accessJoins + ' WHERE u.id = $userId AND u.active = 1',
      { type: QueryTypes.SELECT, bind: { userId }, transaction },
    ));
  }

  async function createUser(login: string, passwordHash: string, roleCode: string, transaction: Transaction) {
    const id = randomUUID();
    const now = new Date();
    try {
      await User.create({ id, login: login.toLowerCase(), passwordHash, active: true, createdAt: now, updatedAt: now },
        { transaction });
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new DuplicateLoginError('This username is unavailable.');
      throw error;
    }
    await UserRole.create({ userId: id, roleCode }, { transaction });
    const account = await readAccount(id, transaction);
    if (!account) throw new IdentitySchemaUnavailableError('Unable to load the new identity.');
    return account;
  }

  async function writeSession(userId: string, session: NewSession, adminScope: boolean, transaction: Transaction) {
    const { tokenHash, expiresAt, replaceTokenHash } = session;
    await Session.create({ userId, tokenHash, expiresAt, createdAt: new Date(), adminScope }, { transaction });
    if (replaceTokenHash) {
      await Session.destroy({ where: { tokenHash: replaceTokenHash }, transaction });
    }
  }

  return {
    async createStudent(login: string, passwordHash: string, initialSession?: NewSession): Promise<IdentityAccount> {
      return db.transaction(async transaction => {
        const account = await createUser(login, passwordHash, studentRole, transaction);
        if (initialSession) await writeSession(account.id, initialSession, false, transaction);
        return account;
      });
    },

    async findCredentials(login: string) {
      const user = await User.unscoped().findOne({
        where: { login: login.toLowerCase() },
        attributes: ['id', 'login', 'passwordHash', 'active'],
      });
      return user?.get() ?? null;
    },

    async createSession(userId: string, session: NewSession, expectedPasswordHash: string, adminScope: boolean) {
      return db.transaction(async transaction => {
        const user = await User.unscoped().findByPk(userId, {
          attributes: ['id', 'active', 'passwordHash'], lock: transaction.LOCK.UPDATE, transaction,
        });
        if (!user?.getDataValue('active') || expectedPasswordHash !== user.getDataValue('passwordHash')) {
          throw new SessionPrincipalChangedError('Account data changed before the session could be issued.');
        }
        const account = await readAccount(userId, transaction);
        if (!account || account.permissions.includes(administrationPermission) !== adminScope) {
          throw new SessionPrincipalChangedError('Account permissions do not match the sign-in mode.');
        }
        await writeSession(userId, session, adminScope, transaction);
        return account;
      });
    },

    async findSession(tokenHash: string, now = new Date()): Promise<IdentitySession | null> {
      const rows = await db.query<AccessRow & { adminScope: number }>(
        'SELECT ' + accessColumns + ', s.admin_scope AS adminScope' + accessJoins + `
        INNER JOIN sessions s ON s.user_id = u.id
        WHERE s.token_hash = $tokenHash AND s.expires_at > $now AND u.active = 1
      `, { type: QueryTypes.SELECT, bind: { tokenHash, now } });
      const account = toAccount(rows);
      if (!account) return null;
      return { ...account, adminScope: rows[0]?.adminScope === 1 };
    },

    async revokeSession(tokenHash: string) {
      // Read the session and delete it under one lock so only one request can audit the logout.
      return db.transaction(async transaction => {
        const session = await Session.findByPk(tokenHash, {
          attributes: ['tokenHash', 'userId', 'expiresAt', 'adminScope'],
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!session) return null;
        const adminActorId = session.getDataValue('adminScope') && session.getDataValue('expiresAt').getTime() > Date.now()
          ? session.getDataValue('userId') : null;
        await session.destroy({ transaction });
        return adminActorId;
      });
    },

    async bootstrapAdministrator(login: string, passwordHash: string) {
      return db.transaction(async transaction => {
        // The seeded role is a stable row to lock even before the first assignment.
        const role = await Role.findByPk(superAdminRole, { transaction, lock: transaction.LOCK.UPDATE });
        if (!role) throw new IdentitySchemaUnavailableError('Apply the identity migration first.');
        const existing = await UserRole.findOne({ where: { roleCode: superAdminRole }, transaction });
        if (existing) throw new AdministratorAlreadyInitializedError('A super administrator already exists.');
        return createUser(login, passwordHash, superAdminRole, transaction);
      });
    },

    async recoverAdministrator(login: string, passwordHash: string) {
      return db.transaction(async transaction => {
        const user = await User.unscoped().findOne({
          where: { login: login.toLowerCase(), active: true }, transaction, lock: transaction.LOCK.UPDATE,
        });
        if (!user) throw new AdministratorUnavailableError('An active administrator with that username was not found.');
        const userId = user.getDataValue('id');
        const grant = await UserRole.findOne({ where: { userId, roleCode: { [Op.in]: [...administratorRoles] } }, transaction });
        if (!grant) throw new AdministratorUnavailableError('An active administrator with that username was not found.');

        await user.update({ passwordHash, updatedAt: new Date() }, { transaction });
        const revoked = await Session.destroy({ where: { userId }, transaction });
        return { userId, revoked };
      });
    },

    async purgeExpiredSessions(now = new Date()) {
      return Session.destroy({ where: { expiresAt: { [Op.lte]: now } } });
    },
  };
}

export type IdentityStore = ReturnType<typeof createIdentityStore>;
