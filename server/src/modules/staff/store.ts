import { randomUUID } from 'node:crypto';
import { Op, QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { superAdminRole } from '../../identity/roles';
import type { CourseStore } from '../courses/store';
import { assignableRoles, eligibleForLane, StaffError, type Assignment, type AssignmentInput, type Lane, type StaffRole } from './contract';

const columns = 'id, course_id AS courseId, assignee_id AS assigneeId, lane, locale, instructions, state, created_at AS createdAt';
type Page = { page: number; pageSize: number };
type AssignmentRow = Omit<Assignment, 'createdAt'> & { createdAt: Date };
type UserAccess = { id: string; username: string; active: boolean; roles: string[]; revision: string };

export function createStaffStore(db: Sequelize, courses: CourseStore) {
  const { User, UserRole, Session } = defineIdentityModels(db);
  const select = { type: QueryTypes.SELECT as const };

  const paging = ({ page, pageSize }: Page) => ({ limit: pageSize, offset: (page - 1) * pageSize });
  async function rolesFor(userId: string, transaction: Transaction) {
    return (await UserRole.findAll({ where: { userId }, transaction })).map(row => row.getDataValue('roleCode')).sort();
  }
  async function lockUser(id: string, transaction: Transaction) {
    const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw new StaffError('NOT_FOUND');
    return user;
  }
  async function audit(actorId: string, targetId: string, event: string, transaction: Transaction) {
    await db.query('INSERT INTO staff_audit_events (id, actor_id, target_id, event, created_at) VALUES ($id, $actorId, $targetId, $event, $date)',
      { bind: { id: randomUUID(), actorId, targetId, event, date: new Date() }, transaction });
  }
  async function assignmentById(id: string, transaction: Transaction) {
    const [assignment] = await db.query<AssignmentRow>(
      'SELECT ' + columns + ' FROM staff_assignments WHERE id = $id FOR UPDATE', { ...select, bind: { id }, transaction });
    if (!assignment) throw new StaffError('NOT_FOUND');
    return { ...assignment, createdAt: assignment.createdAt.toISOString() };
  }

  async function usingAssignment<T>(id: string, assigneeId: string,
    run: (assignment: Assignment, transaction: Transaction) => Promise<T>): Promise<T> {
    return db.transaction(async transaction => {
      // Keep the user and assignment locks until the content operation commits.
      const user = await lockUser(assigneeId, transaction);
      const assignment = await assignmentById(id, transaction);
      if (!user.getDataValue('active') || assignment.assigneeId !== assigneeId || assignment.state !== 'open' ||
        !eligibleForLane(await rolesFor(assigneeId, transaction), assignment.lane)) throw new StaffError('NOT_FOUND');
      return run(assignment, transaction);
    });
  }

  return {
    async listUsers(page: Page, prefix: string) {
      const filter = prefix ? ' WHERE LEFT(login, CHAR_LENGTH($prefix)) = $prefix' : '';
      const bind = { ...paging(page), prefix };
      const [rows, [size]] = await Promise.all([
        db.query<Omit<UserAccess, 'roles' | 'revision'> & { updatedAt: Date }>(
          'SELECT id, login AS username, active, updated_at AS updatedAt FROM users' + filter +
          ' ORDER BY login LIMIT $limit OFFSET $offset', { ...select, bind }),
        db.query<{ total: number }>('SELECT COUNT(*) AS total FROM users' + filter, { ...select, bind }),
      ]);
      const roles = rows.length ? await UserRole.findAll({ where: { userId: rows.map(item => item.id) }, order: [['roleCode', 'ASC']] }) : [];
      const items: UserAccess[] = rows.map(({ id, username, active, updatedAt }) => ({
        id, username, active: Boolean(active), revision: updatedAt.toISOString(),
        roles: roles.filter(row => row.getDataValue('userId') === id).map(row => row.getDataValue('roleCode')),
      }));
      return { items, total: Number(size?.total ?? 0) };
    },

    async setUser({ id, role, active, revision, actorId }: { id: string; role: StaffRole | null; active: boolean; revision: string; actorId: string }) {
      await db.transaction(async transaction => {
        const user = await lockUser(id, transaction);
        const roles = await rolesFor(id, transaction);
        if (id === actorId || roles.includes(superAdminRole)) throw new StaffError('PROTECTED_ACCOUNT');
        const oldRevision = user.getDataValue('updatedAt');
        if (revision !== oldRevision.toISOString()) throw new StaffError('STALE_VERSION');
        const oldRoles = roles.filter(value => assignableRoles.some(assignable => assignable === value));
        const roleUnchanged = role === null ? oldRoles.length === 0 : oldRoles.length === 1 && oldRoles[0] === role;
        if (roleUnchanged && active === user.getDataValue('active')) return;

        await UserRole.destroy({ where: { userId: id, roleCode: { [Op.in]: [...assignableRoles] } }, transaction });
        if (role) await UserRole.create({ userId: id, roleCode: role }, { transaction });
        await user.update({ active, updatedAt: new Date(Math.max(Date.now(), oldRevision.getTime() + 1)) }, { transaction });
        await Session.destroy({ where: { userId: id }, transaction });
        const open = await db.query<{ id: string; lane: Lane }>(
          "SELECT id, lane FROM staff_assignments WHERE assignee_id = $id AND state = 'open'", { ...select, bind: { id }, transaction });
        const invalid = open.filter(item => !active || !role || !eligibleForLane([role], item.lane)).map(item => item.id);
        if (invalid.length) await db.query("UPDATE staff_assignments SET state = 'revoked' WHERE id IN (:invalid)", {
          replacements: { invalid }, transaction,
        });
        await audit(actorId, id, 'account_access_updated', transaction);
      });
    },

    async listAssignments(page: Page, assigneeId?: string) {
      const scope = assigneeId ? " WHERE a.assignee_id = $assigneeId AND a.state = 'open'" : '';
      const bind = { ...paging(page), assigneeId };
      const [rows, [size]] = await Promise.all([
        db.query<AssignmentRow & { courseSlug: string }>(`
          SELECT a.id, a.course_id AS courseId, a.assignee_id AS assigneeId, a.lane, a.locale, a.instructions,
            a.state, a.created_at AS createdAt, c.slug AS courseSlug
          FROM staff_assignments a JOIN courses c ON c.id = a.course_id` + scope +
          ' ORDER BY a.created_at DESC, a.id DESC LIMIT $limit OFFSET $offset', { ...select, bind }),
        db.query<{ total: number }>('SELECT COUNT(*) AS total FROM staff_assignments a' + scope, { ...select, bind }),
      ]);
      return { items: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), total: Number(size?.total ?? 0) };
    },

    async listAudit(page: Page) {
      const [items, [size]] = await Promise.all([
        db.query<{ id: string; actorId: string; targetId: string; event: string; createdAt: Date }>(`
          SELECT id, actor_id AS actorId, target_id AS targetId, event, created_at AS createdAt
          FROM staff_audit_events ORDER BY created_at DESC, id DESC LIMIT $limit OFFSET $offset`,
        { ...select, bind: paging(page) }),
        db.query<{ total: number }>('SELECT COUNT(*) AS total FROM staff_audit_events', select),
      ]);
      return { items, total: Number(size?.total ?? 0) };
    },

    async assign(input: AssignmentInput, actorId: string) {
      return db.transaction(async transaction => {
        const { courseId, assigneeId, lane, locale } = input;
        const user = await lockUser(assigneeId, transaction);
        if (!user.getDataValue('active') || !eligibleForLane(await rolesFor(assigneeId, transaction), lane)) {
          throw new StaffError('ROLE_UNAVAILABLE');
        }
        const course = await courses.get(courseId, transaction);
        if (course.status === 'published' || course.status === 'archived' || course.status === 'approved') {
          throw new StaffError('INVALID_ASSIGNMENT');
        }
        if (locale) {
          const [language] = await db.query<{ locale: string }>(`
            SELECT l.locale FROM education_languages l JOIN education_entries e ON e.id = l.entry_id
            WHERE l.locale = $locale AND e.status <> 'archived'`, { ...select, bind: { locale }, transaction });
          if (!language) throw new StaffError('INVALID_ASSIGNMENT');
        }
        const [duplicate] = await db.query<{ id: string }>(`
          SELECT id FROM staff_assignments
          WHERE assignee_id = $assigneeId AND course_id = $courseId AND lane = $lane AND locale <=> $locale AND state = 'open'`,
        { ...select, bind: { assigneeId, courseId, lane, locale }, transaction });
        if (duplicate) throw new StaffError('INVALID_ASSIGNMENT');
        const id = randomUUID();
        await db.query(`INSERT INTO staff_assignments (id, course_id, assignee_id, lane, locale, instructions, state, created_at)
          VALUES ($id,$courseId,$assigneeId,$lane,$locale,$instructions,'open',$createdAt)`,
        { bind: { ...input, id, createdAt: new Date() }, transaction });
        await audit(actorId, id, 'assignment_created', transaction);
        return assignmentById(id, transaction);
      });
    },

    async revoke(id: string, actorId: string) {
      await db.transaction(async transaction => {
        const assignment = await assignmentById(id, transaction);
        if (assignment.state !== 'open') throw new StaffError('INVALID_ASSIGNMENT');
        await db.query("UPDATE staff_assignments SET state = 'revoked' WHERE id = $id", { bind: { id }, transaction });
        await audit(actorId, id, 'assignment_revoked', transaction);
      });
    },

    usingAssignment,
    async complete(assignment: Assignment, actorId: string, event: 'assignment_completed' | 'course_approved' | 'course_returned', transaction: Transaction) {
      await db.query("UPDATE staff_assignments SET state = 'complete' WHERE id = $id", { bind: { id: assignment.id }, transaction });
      await audit(actorId, assignment.id, event, transaction);
    },

    auditEdit(id: string, actorId: string, transaction: Transaction) {
      return audit(actorId, id, 'course_copy_edited', transaction);
    },
  };
}

export type StaffStore = ReturnType<typeof createStaffStore>;

