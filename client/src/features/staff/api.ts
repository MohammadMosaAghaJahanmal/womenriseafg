import axios from 'axios';
import type { CourseRecord, CourseTranslation } from '../courses/admin/api';
import type { Status } from '../education/api';

const api = axios.create({ baseURL: '/api/v1', timeout: 15_000 });
export const staffAdminPath = '/admin/staff';
export const staffWorkspacePath = '/staff';
export const assignableRoles = ['admin', 'content-manager', 'teacher', 'translator', 'reviewer'] as const;
export const lanes = ['edit', 'translate', 'review'] as const;
export type StaffRole = typeof assignableRoles[number];
export type Lane = typeof lanes[number];
export const staffPageSize = 15;

export interface StaffAccount { id: string; username: string; active: boolean; roles: string[]; revision: string }
interface Page<T> { items: T[]; total: number }
export interface Assignment {
  id: string;
  courseId: string;
  courseSlug?: string;
  assigneeId: string;
  lane: Lane;
  locale: string | null;
  instructions: string;
  state: 'open' | 'complete' | 'revoked';
  createdAt: string;
}
export interface AuditEvent { id: string; actorId: string; targetId: string; event: string; createdAt: string }
export type Detail = { assignment: Assignment; course: CourseRecord };
export type CopyPatch = { version: number; entryId: string; locale: string; title: string } & (
  { scope: 'course'; description: string; objectives: string; prerequisites: string } |
  { scope: 'chapter' } |
  { scope: 'lesson'; description: string; body: string; imageAlt: string }
);

export async function staffUsers(prefix: string, page: number, signal: AbortSignal) {
  return (await api.get<Page<StaffAccount>>(staffAdminPath + '/users', { signal, params: { prefix, page, pageSize: staffPageSize } })).data;
}
export async function updateStaff(account: StaffAccount, role: StaffRole | null, active: boolean) {
  await api.patch(staffAdminPath + '/users/' + account.id, { role, active, revision: account.revision });
}
export async function staffCourses(q: string, status: Status, page: number, signal: AbortSignal) {
  return (await api.get<Page<{ id: string; slug: string; translations: CourseTranslation[] }>>(
    staffAdminPath + '/courses', { signal, params: { q, status, page, pageSize: staffPageSize } })).data;
}
export async function assignments(manage: boolean, page: number, signal: AbortSignal) {
  return (await api.get<Page<Assignment>>((manage ? staffAdminPath : staffWorkspacePath) + '/assignments',
    { signal, params: { page, pageSize: staffPageSize } })).data;
}
export async function staffAudit(page: number, signal: AbortSignal) {
  return (await api.get<Page<AuditEvent>>(staffAdminPath + '/audit',
    { signal, params: { page, pageSize: staffPageSize } })).data;
}
export async function addAssignment(input: Pick<Assignment,'assigneeId'|'courseId'|'lane'|'locale'|'instructions'>) {
  await api.post(staffAdminPath + '/assignments', input);
}
export async function revokeAssignment(id: string) {
  await api.post(staffAdminPath + '/assignments/' + id + '/revoke', {});
}
export async function assignedCourse(id: string, signal: AbortSignal) {
  return (await api.get<{item: Detail}>(staffWorkspacePath + '/assignments/' + id, { signal })).data.item;
}
export async function saveAssignedCopy(id: string, patch: CopyPatch) {
  return (await api.patch<{ course: CourseRecord }>(staffWorkspacePath + '/assignments/' + id + '/copy', patch)).data.course;
}
export async function completeAssignment(id: string, action: 'submit' | 'approve' | 'return', version: number) {
  await api.post(staffWorkspacePath + '/assignments/' + id + '/complete', { action, version });
}

