import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Router } from 'express';
import pino from 'pino';
import { QueryTypes } from 'sequelize';
import { createApp } from '../src/app';
import { createDatabase } from '../src/config/database';
import { readSettings } from '../src/config/environment';
import { migrateIdentity } from '../src/identity/migration';
import { createIdentityStore } from '../src/identity/store';
import { hashPassword } from '../src/modules/auth/passwords';
import { createAuthRoutes } from '../src/modules/auth/routes';
import { migrateBooks } from '../src/modules/books/migration';
import { correctionTarget } from '../src/modules/corrections/contract';
import { migrateCorrections } from '../src/modules/corrections/migration';
import { createCorrectionRoutes } from '../src/modules/corrections/routes';
import { createCorrectionStore } from '../src/modules/corrections/store';
import { migrateCurriculumAuthoring } from '../src/modules/courses/authoringMigration';
import { migrateCourses } from '../src/modules/courses/migration';
import { createCourseStore } from '../src/modules/courses/store';
import { migrateCollections, migrateDiscovery } from '../src/modules/discovery/migration';
import { createCollectionStore } from '../src/modules/discovery/store';
import { migrateEducation } from '../src/modules/education/migration';
import { migrateLearningMedia } from '../src/modules/learning-media/migration';
import { migrateMedia } from '../src/modules/media/migration';
import { migrateQuizzes } from '../src/modules/quizzes/migration';

test('correction link parsing only accepts supported public resource shapes', () => {
  assert.deepEqual(correctionTarget('/learn/basic-math/whole-numbers'), { kind: 'lesson', slug: 'whole-numbers', parentSlug: 'basic-math' });
  assert.deepEqual(correctionTarget('/library/reading-book/read'), { kind: 'book', slug: 'reading-book' });
  assert.deepEqual(correctionTarget('/collections/maths'), { kind: 'collection', slug: 'maths' });
  const longSlug = 'a'.repeat(80);
  assert.deepEqual(correctionTarget('/learn/' + longSlug + '/' + longSlug), { kind: 'lesson', slug: longSlug, parentSlug: longSlug });
  for (const path of ['/admin/courses', '/settings', '/courses/basic-math/certificate', '/courses/basic-math?lang=en',
    'https://learning.example.test/courses/basic-math', '/learn/other/../../private', '/courses/' + longSlug + 'a', '/collections']) {
    assert.equal(correctionTarget(path), null, path);
  }
});

test('guest reports target public resources and the restricted queue resolves and expires only eligible reports', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const database = readSettings(process.env).database;
  assert.equal(database.host, '127.0.0.1');
  assert.match(database.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(database.port, 3306);
  const db = createDatabase(database);
  const identity = createIdentityStore(db);
  const corrections = createCorrectionStore(db);
  const courses = createCourseStore(db);
  const collections = createCollectionStore(db);
  const key = randomBytes(5).toString('hex');
  const slug = 'correction-' + key;
  const target = '/learn/' + slug + '/start';
  const draftTarget = '/courses/' + slug + '-draft';
  const collectionTarget = '/collections/' + slug;
  const origin = 'https://learning.example.test';
  const logs: string[] = [];
  const logger = pino({}, { write: entry => { logs.push(entry); } });
  const options = { production: true, origins: [origin], logger };
  const routes = Router().use(createAuthRoutes(identity, options), createCorrectionRoutes(db, identity, options));
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: routes,
  }));
  const accountIds: string[] = [];
  const courseIds: string[] = [];
  const collectionIds: string[] = [];
  const message = 'در درس اندازه‌گیری یک علامت کم است.';

  try {
    for (const migrate of [migrateIdentity, migrateEducation, migrateMedia, migrateCourses, migrateLearningMedia,
      migrateBooks, migrateQuizzes, migrateDiscovery, migrateCurriculumAuthoring, migrateCorrections, migrateCollections]) await migrate(db);
    assert.equal(await migrateCorrections(db), false);
    const password = 'Disposable correction test passphrase ' + key;
    const hash = await hashPassword(password);
    const admin = await identity.createStudent('corr.admin.' + key, hash);
    const learner = await identity.createStudent('corr.reader.' + key, hash);
    accountIds.push(admin.id, learner.id);
    await db.query("INSERT INTO user_roles (user_id, role_code) VALUES ($id, 'admin')", { bind: { id: admin.id } });

    const local = { locale: 'en', title: 'Correction test fixture' };
    const courseInput = {
      slug, thumbnailId: null, subjectId: null, levelId: null, gradeId: null, instructor: '',
      estimatedMinutes: null, tagIds: [], relatedCourseIds: [],
      provenance: { source: 'Isolated test fixture', creator: 'Fixture', license: 'CC0-1.0',
        attribution: '', origin: 'human' as const, tool: '', notes: '' },
      translations: [{ ...local, description: '', objectives: '', prerequisites: '' }],
      chapters: [{ translations: [local], lessons: [{ slug: 'start', kind: 'text' as const, mediaId: null, resources: [],
        translations: [{ ...local, body: 'Review the example.', description: '' }] }] }],
    };
    let course = await courses.create(courseInput, admin.id);
    courseIds.push(course.id);
    for (const state of ['educational-review', 'approved', 'published'] as const) {
      course = await courses.changeStatus(course.id, state, course.version);
    }
    const draft = await courses.create({ ...courseInput, slug: slug + '-draft' }, admin.id);
    courseIds.push(draft.id);
    let collection = await collections.create({
      slug, levelId: null, subjectId: null,
      translations: [{ ...local, description: 'This collection has learning resources.' }],
      activities: [{ id: course.id, kind: 'course' }],
    });
    collectionIds.push(collection.id);

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    async function request(path: string, init: RequestInit = {}, requestOrigin = origin) {
      const headers = new Headers(init.headers);
      headers.set('X-Forwarded-Proto', 'https');
      headers.set('Origin', requestOrigin);
      if (init.body) headers.set('Content-Type', 'application/json');
      return fetch(base + path, { ...init, headers });
    }
    async function signIn(path: string, username: string) {
      const response = await request(path, { method: 'POST', body: JSON.stringify({ username, password }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie')!.split(';')[0]!;
    }
    const learnerCookie = await signIn('/auth/login', learner.login);
    const administratorCookie = await signIn('/auth/admin-login', admin.login);
    const queue = '/admin/corrections';
    assert.equal((await request(queue)).status, 401);
    assert.equal((await request(queue, { headers: { cookie: learnerCookie } })).status, 403);
    const write = { method: 'POST', body: JSON.stringify({ resource: target, message }) };
    assert.equal((await request('/corrections', write, 'https://other.example.test')).status, 403);
    assert.equal((await request('/corrections', { method: 'POST', body: JSON.stringify({ resource: draftTarget, message }) })).status, 404);
    const collectionWrite = { method: 'POST', body: JSON.stringify({ resource: collectionTarget, message }) };
    assert.equal((await request('/corrections', collectionWrite)).status, 404);
    for (const state of ['educational-review', 'approved', 'published'] as const) {
      collection = await collections.changeStatus(collection.id, state, collection.version);
    }
    assert.equal((await request('/corrections', collectionWrite)).status, 201);
    const accepted = await request('/corrections', { ...write, headers: { cookie: learnerCookie } });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.headers.get('Cache-Control'), 'no-store');
    assert.equal(accepted.headers.get('Set-Cookie'), null);
    assert.equal(await accepted.text(), '');
    for (let i = 0; i < 2; i++) {
      const extra = { resource: target, message, email: 'test@example.test' };
      assert.equal((await request('/corrections', { method: 'POST', body: JSON.stringify(extra) })).status, 400);
    }
    assert.equal((await request('/corrections', write)).status, 429);
    const headers = { cookie: administratorCookie };
    const response = await request(queue, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const listing = await response.json() as { items: { id: string; resourcePath: string; message: string }[] };
    const row = listing.items.find(item => item.resourcePath === target)!;
    assert.equal(row.message, message);
    assert.ok(listing.items.some(item => item.resourcePath === collectionTarget));
    assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'id', 'message', 'resolvedAt', 'resourcePath']);
    const patch = { method: 'PATCH', headers, body: JSON.stringify({ status: 'resolved' }) };
    assert.equal((await request(queue + '/' + row.id, patch, 'https://other.example.test')).status, 403);
    assert.equal((await request(queue + '/' + row.id, patch)).status, 204);
    assert.equal((await request(queue + '/' + row.id, patch)).status, 409);
    const before = new Date(Date.now() + 60_000);
    const [old] = await corrections.list('resolved', 1).then(result => result.items.filter(item => item.resourcePath === target));
    assert.ok(old?.resolvedAt);
    assert.equal(await corrections.retention(before, false), 1);
    assert.equal(await corrections.retention(new Date(0), true), 0);
    assert.equal((await request(queue + '/' + row.id, {
      ...patch, body: JSON.stringify({ status: 'open' }),
    })).status, 204);
    const [stored] = await db.query<{ resolvedAt: Date | null }>('SELECT resolved_at AS resolvedAt FROM learner_corrections WHERE id = $id',
      { type: QueryTypes.SELECT, bind: { id: row.id } });
    assert.equal(stored?.resolvedAt, null);
    assert.equal(await corrections.retention(before, true), 0);
    assert.equal((await request(queue + '/' + row.id, patch)).status, 204);
    assert.equal(await corrections.retention(before, true), 1);
    assert.equal(await corrections.retention(before, false), 0);
    assert.ok(logs.some(entry => entry.includes('correction_status_changed')));
    assert.ok(logs.every(entry => !entry.includes(message) && !entry.includes(learner.login) && !entry.includes(row.id)));
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    try {
      if (courseIds.length) {
        await db.query('DELETE FROM learner_corrections WHERE resource_path IN ($target, $collectionTarget)', { bind: { target, collectionTarget } });
        for (const id of collectionIds) await db.query('DELETE FROM course_collections WHERE id = $id', { bind: { id } });
        for (const id of courseIds) await db.query('DELETE FROM courses WHERE id = $id', { bind: { id } });
      }
      for (const id of accountIds) await db.query('DELETE FROM users WHERE id = $id', { bind: { id } });
    } finally {
      await db.close();
    }
  }
});
