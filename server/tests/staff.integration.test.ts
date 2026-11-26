import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import pino from 'pino';
import { createApp } from '../src/app';
import { createDatabase } from '../src/config/database';
import { readSettings } from '../src/config/environment';
import { migrateIdentity } from '../src/identity/migration';
import { createIdentityStore } from '../src/identity/store';
import { hashPassword } from '../src/modules/auth/passwords';
import { createAuthRoutes } from '../src/modules/auth/routes';
import { migrateBooks } from '../src/modules/books/migration';
import { migrateCertificates } from '../src/modules/certificates/migration';
import { migrateCurriculumAuthoring } from '../src/modules/courses/authoringMigration';
import { migrateCourses } from '../src/modules/courses/migration';
import { createCourseStore } from '../src/modules/courses/store';
import type { CourseRecord } from '../src/modules/courses/contract';
import { migrateDiscovery } from '../src/modules/discovery/migration';
import { migrateEducation } from '../src/modules/education/migration';
import { migrateHomepage } from '../src/modules/homepage/migration';
import { migrateLearningMedia } from '../src/modules/learning-media/migration';
import { migrateMedia } from '../src/modules/media/migration';
import { migrateQuizzes } from '../src/modules/quizzes/migration';
import { migrateStaff } from '../src/modules/staff/migration';
import { createStaffRoutes } from '../src/modules/staff/routes';

test('staff roles revoke old sessions and restrict course editing and approval to eligible assignees', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const database = readSettings(process.env).database;
  assert.equal(database.host, '127.0.0.1');
  assert.match(database.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(database.port, 3306);
  const db = createDatabase(database);
  const identity = createIdentityStore(db);
  const courses = createCourseStore(db);
  const nonce = randomBytes(5).toString('hex');
  const loginPrefix = 'staff.' + nonce;
  const password = 'Temporary staff test passphrase ' + nonce;
  const origin = 'https://learning.example.test';
  const options = { production: true, origins: [origin], logger: pino({ level: 'silent' }) };
  const app = createApp({
    production: true, logger: options.logger, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options), staffRoutes: createStaffRoutes(db, courses, identity, options),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let ready = false;
  const nowHeaders = { 'X-Forwarded-Proto': 'https', Origin: origin, 'Content-Type': 'application/json' };
  const send = (path: string, method = 'GET', body?: unknown, cookie?: string) =>
    fetch(base + path, { method, headers: { ...nowHeaders, ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  async function signIn(username: string, admin: boolean) {
    const reply = await send(admin ? '/auth/admin-login' : '/auth/login', 'POST', { username, password });
    assert.equal(reply.status, 200, await reply.clone().text());
    const cookie = reply.headers.get('Set-Cookie')?.split(';')[0];
    assert.ok(cookie);
    const { user } = await reply.json() as { user: { permissions: string[] } };
    return { cookie, user };
  }
  async function account(id: string, cookie: string) {
    const reply = await send('/admin/staff/users?prefix=' + loginPrefix, 'GET', undefined, cookie);
    assert.equal(reply.status, 200);
    const result = await reply.json() as { items: { id: string; revision: string }[] };
    assert.equal(reply.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(result), /passwordHash|password_hash|token_hash/);
    const row = result.items.find(item => item.id === id);
    assert.ok(row);
    return row;
  }
  async function setRole(id: string, role: string | null, cookie: string, active = true) {
    const { revision } = await account(id, cookie);
    return send('/admin/staff/users/' + id, 'PATCH', { role, active, revision }, cookie);
  }
  async function assign(cookie: string, courseId: string, assigneeId: string, lane: string, locale: string | null = null) {
    const reply = await send('/admin/staff/assignments', 'POST',
      { courseId, assigneeId, lane, locale, instructions: 'Scope test' }, cookie);
    assert.equal(reply.status, 201, await reply.clone().text());
    const body = await reply.json() as { item: { id: string } };
    return body.item.id;
  }
  try {
    for (const migration of [migrateIdentity, migrateEducation, migrateMedia, migrateCourses, migrateLearningMedia, migrateBooks,
      migrateQuizzes, migrateDiscovery, migrateCertificates, migrateHomepage, migrateStaff, migrateCurriculumAuthoring]) {
      await migration(db);
    }
    assert.equal(await migrateStaff(db), false);
    ready = true;
    const hash = await hashPassword(password);
    async function register(role: string) {
      const user = await identity.createStudent(loginPrefix + '.' + role, hash);
      userIds.push(user.id);
      return user;
    }
    const owner = await register('owner');
    const admin = await register('admin');
    const teacher = await register('teacher');
    const second = await register('second');
    const translator = await register('translator');
    const reviewer = await register('reviewer');
    await db.query("INSERT INTO user_roles (user_id, role_code) VALUES ($owner, 'super-admin'), ($admin, 'admin')",
      { bind: { owner: owner.id, admin: admin.id } });

    const ownerSession = await signIn(owner.login, true);
    const adminSession = await signIn(admin.login, true);
    const before = await signIn(teacher.login, false);
    assert.equal((await send('/admin/staff/users')).status, 401);
    assert.equal((await send('/admin/staff/users', 'GET', undefined, adminSession.cookie)).status, 403);
    assert.equal((await setRole(owner.id, 'teacher', ownerSession.cookie)).status, 403);
    assert.equal((await setRole(teacher.id, 'super-admin', ownerSession.cookie)).status, 400);
    assert.equal((await setRole(teacher.id, 'teacher', ownerSession.cookie)).status, 204);
    assert.equal((await setRole(second.id, 'teacher', ownerSession.cookie)).status, 204);
    assert.equal((await setRole(translator.id, 'translator', ownerSession.cookie)).status, 204);
    assert.equal((await setRole(reviewer.id, 'reviewer', ownerSession.cookie)).status, 204);
    const previously = await send('/auth/session', 'GET', undefined, before.cookie);
    assert.deepEqual(await previously.json(), { user: null });

    const editor = await signIn(teacher.login, true);
    const outsider = await signIn(second.login, true);
    const linguist = await signIn(translator.login, true);
    const reviewing = await signIn(reviewer.login, true);
    assert.deepEqual(editor.user.permissions.sort(), ['account:self', 'staff:workspace']);
    assert.equal((await send('/admin/access', 'GET', undefined, editor.cookie)).status, 403);
    assert.equal((await send('/admin/staff/assignments', 'POST', {}, editor.cookie)).status, 403);
    const draftInput = {
      subjectId: null, levelId: null, gradeId: null, thumbnailId: null, estimatedMinutes: null, instructor: '',
      tagIds: [], relatedCourseIds: [], translations: [{ locale: 'en', title: 'Scoped lesson', description: '',
        objectives: '', prerequisites: '' }], chapters: [],
      provenance: { creator: 'Fixture', source: 'Original fixture', license: 'CC0-1.0',
        attribution: '', origin: 'human' as const, tool: '', notes: '' },
    };
    async function draft(slug: string) {
      const course = await courses.create({ ...draftInput, slug: 'staff-scope-' + nonce + '-' + slug }, owner.id);
      courseIds.push(course.id);
      return course;
    }
    const first = await draft('one');
    const other = await draft('two');
    const editId = await assign(ownerSession.cookie, first.id, teacher.id, 'edit');
    const translateId = await assign(ownerSession.cookie, first.id, translator.id, 'translate', 'ps');
    const reviewId = await assign(ownerSession.cookie, first.id, reviewer.id, 'review');
    assert.equal((await send('/admin/staff/assignments', 'POST',
      { courseId: first.id, assigneeId: teacher.id, lane: 'review', locale: null }, ownerSession.cookie)).status, 422);
    assert.equal((await send('/staff/assignments/' + editId, 'GET', undefined, outsider.cookie)).status, 404);
    const outsiderList = await send('/staff/assignments', 'GET', undefined, outsider.cookie);
    assert.deepEqual(await outsiderList.json(), { items: [], total: 0 });
    const patch = { scope: 'course', entryId: first.id, version: first.version, locale: 'en', title: 'Edited course scope' };
    const copy = (id: string) => '/staff/assignments/' + id + '/copy';
    assert.equal((await send(copy(editId), 'PATCH', { ...patch, entryId: other.id }, editor.cookie)).status, 404);
    assert.equal((await send(copy(editId), 'PATCH', { ...patch, locale: 'fa-AF' }, editor.cookie)).status, 422);
    assert.equal((await send(copy(translateId), 'PATCH', patch, linguist.cookie)).status, 422);
    assert.equal((await send(copy(reviewId), 'PATCH', patch, reviewing.cookie)).status, 422);
    const update = await send(copy(editId), 'PATCH', patch, editor.cookie);
    assert.equal(update.status, 200, await update.clone().text());
    assert.equal((await send(copy(editId), 'PATCH', patch, editor.cookie)).status, 409);
    const { course: edited } = await update.json() as { course: CourseRecord };
    assert.equal(edited.translations[0]?.title, patch.title);
    assert.equal(edited.provenance?.license, 'CC0-1.0');
    const translation = await send(copy(translateId), 'PATCH',
      { ...patch, locale: 'ps', version: edited.version, title: 'اندازه کول' }, linguist.cookie);
    assert.equal(translation.status, 200, await translation.clone().text());
    const { course: translated } = await translation.json() as { course: CourseRecord };
    const review = await courses.changeStatus(first.id, 'educational-review', translated.version);
    assert.equal((await send('/staff/assignments/' + editId + '/complete', 'POST',
      { version: review.version, action: 'approve' }, editor.cookie)).status, 422);
    assert.equal((await send('/staff/assignments/' + reviewId + '/complete', 'POST',
      { version: review.version, action: 'approve' }, reviewing.cookie)).status, 204);
    assert.equal((await courses.get(first.id)).status, 'approved');

    const secondTask = await assign(ownerSession.cookie, other.id, teacher.id, 'edit');
    assert.equal((await send('/admin/staff/assignments/' + secondTask + '/revoke', 'POST', {}, ownerSession.cookie)).status, 204);
    assert.equal((await send('/staff/assignments/' + secondTask, 'GET', undefined, editor.cookie)).status, 404);
    assert.equal((await setRole(teacher.id, null, ownerSession.cookie)).status, 204);
    assert.equal((await send('/staff/assignments', 'GET', undefined, editor.cookie)).status, 401);
    const audit = await send('/admin/staff/audit', 'GET', undefined, ownerSession.cookie);
    assert.equal(audit.status, 200);
    const events = await audit.json() as { items: { event: string }[] };
    assert.ok(events.items.some(item => item.event === 'course_approved'));
    assert.doesNotMatch(JSON.stringify(events), /Scope test|password|staff\./i);
  } finally {
    try {
      if (ready && userIds.length) {
        await db.query('DELETE FROM staff_audit_events WHERE actor_id IN (:userIds)', { replacements: { userIds } });
        if (courseIds.length) await db.query('DELETE FROM courses WHERE id IN (:courseIds)', { replacements: { courseIds } });
        await db.query('DELETE FROM users WHERE id IN (:userIds)', { replacements: { userIds } });
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.close();
    }
  }
});

