import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
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
import { transitionAllowed, type EducationInput, type EducationRecord } from '../src/modules/education/contract';
import { migrateEducation } from '../src/modules/education/migration';
import { createEducationRoutes } from '../src/modules/education/routes';
import { createEducationStore } from '../src/modules/education/store';
import { createInput } from '../src/modules/education/validation';

test('education inputs and status transitions validate normalized locale, grades, and reserved fields', () => {
  const values = { slug: 'Reading', translations: [{ locale: 'fa-af', name: 'خواندن' }] };
  const { error, value } = createInput.categories.validate(values);
  assert.equal(error, undefined);
  assert.deepEqual(value, { slug: 'reading', translations: [{ locale: 'fa-AF', name: 'خواندن', description: '' }] });
  assert.ok(createInput.categories.validate({ ...values, status: 'published' }).error);
  assert.ok(createInput.grades.validate({ ...values, gradeNumber: 13 }).error);
  assert.ok(createInput.languages.validate({ ...values, locale: 'en-u-nu-latn', direction: 'ltr' }).error);
  assert.ok(createInput.tags.validate({
    ...values, translations: [...values.translations, { locale: 'fa-AF', name: 'دیگر' }],
  }).error);
  assert.equal(transitionAllowed('draft', 'published'), false);
  assert.equal(transitionAllowed('translation-review', 'approved'), true);
});

test('education administration CRUD, translation, publication and permissions use isolated MySQL', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const config = readSettings(process.env).database;
  assert.equal(config.host, '127.0.0.1');
  assert.match(config.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(config.port, 3306);

  const db = createDatabase(config);
  const identity = createIdentityStore(db);
  const origin = 'https://learning.example.test';
  const logger = pino({ level: 'silent' });
  const options = { production: true, origins: [origin], logger };
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'],
    checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options),
    educationRoutes: createEducationRoutes(createEducationStore(db), identity, options),
  }));
  const key = randomBytes(5).toString('hex');
  const prefix = 'test-' + key;
  const admin = prefix + '-admin';
  const manager = prefix + '-worker';
  const student = prefix + '-student';
  const managerRole = 'test-manage-' + key;
  const password = 'test-passphrase-' + key;
  let educationReady = false;
  const values = (slug: string, name: string, extra: Partial<EducationInput> = {}): EducationInput => ({
    slug: prefix + '-' + slug, translations: [{ locale: 'en', name, description: '' }], ...extra,
  });

  try {
    await migrateIdentity(db);
    const runs = await Promise.all([migrateEducation(db), migrateEducation(db)]);
    assert.ok(runs.filter(Boolean).length <= 1);
    assert.equal(await migrateEducation(db), false);
    educationReady = true;
    await db.query('INSERT INTO roles (code) VALUES ($role)', { bind: { role: managerRole } });
    await db.query("INSERT INTO role_permissions (role_code, permission_code) VALUES ($role, 'admin:access'), ($role, 'education:manage')",
      { bind: { role: managerRole } });
    const passwordHash = await hashPassword(password);
    for (const [login, role] of [[admin, 'admin'], [manager, managerRole], [student, 'student']] as const) {
      const user = await identity.createStudent(login, passwordHash);
      if (role !== 'student') {
        await db.query('INSERT INTO user_roles (user_id, role_code) VALUES ($id, $role)', { bind: { id: user.id, role } });
      }
    }

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    function request(path: string, method = 'GET', cookie?: string, body?: object, requestOrigin = origin) {
      return fetch(base + path, {
        method, headers: {
          'x-forwarded-proto': 'https',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { Origin: requestOrigin, 'Content-Type': 'application/json' } : {}),
        }, body: body ? JSON.stringify(body) : undefined,
      });
    }
    async function signIn(login: string, path = 'admin-login') {
      const response = await request('/auth/' + path, 'POST', undefined, { username: login, password });
      assert.equal(response.status, 200);
      return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    }
    const api = '/admin/education';
    async function entry(path: string, method: string, cookie: string, body?: object, expected = 200) {
      const response = await request(api + path, method, cookie, body);
      const data = await response.json() as { item: EducationRecord };
      assert.equal(response.status, expected, path + ' ' + JSON.stringify(data));
      return data.item;
    }

    assert.equal((await request(api + '/categories')).status, 401);
    const studentCookie = await signIn(student, 'login');
    assert.equal((await request(api + '/summary', 'GET', studentCookie)).status, 403);
    const cookie = await signIn(admin);
    const managerCookie = await signIn(manager);
    const summary = await request(api + '/summary', 'GET', cookie);
    assert.equal(summary.status, 200);
    const counts = (await summary.json() as { items: { kind: string; total: number }[] }).items;
    assert.equal(counts.length, 6);
    assert.ok((counts.find(item => item.kind === 'categories')?.total ?? 0) >= 19);
    assert.equal((await request('/education/grades?pageSize=50')).status, 200);
    assert.equal((await request('/education/tags?status=draft')).status, 400);

    for (const [kind, suffix, extra] of [
      ['levels', 'advanced-writing', {}],
      ['categories', 'science', {}],
      ['subjects', 'chemistry', {}],
      ['languages', 'test-locale', { locale: 'uz-Latn', direction: 'ltr' }],
      ['tags', 'writing', {}],
    ] as const) {
      const item = await entry('/' + kind, 'POST', cookie, values(suffix, 'Test entry', extra), 201);
      const edited = await entry('/' + kind + '/' + item.id, 'PUT', cookie,
        { ...values(suffix, 'Edited entry', extra), version: item.version });
      assert.equal(edited.translations[0]?.name, 'Edited entry');
      assert.equal((await request(api + '/' + kind + '/' + item.id, 'DELETE', cookie, { version: edited.version })).status, 204);
    }
    assert.equal((await request(api + '/grades', 'POST', cookie, values('grade', 'Grade 1', { gradeNumber: 1 }))).status, 409);
    assert.equal((await request(api + '/grades', 'POST', cookie, values('grade', 'Grade 13', { gradeNumber: 13 }))).status, 400);
    const seededGrade = await request(api + '/grades?page=2&pageSize=5', 'GET', cookie);
    assert.equal(seededGrade.status, 200);
    const page = await seededGrade.json() as { items: EducationRecord[]; total: number; page: number };
    assert.equal(page.total, 12);
    assert.equal(page.items.length, 5);
    assert.equal(page.page, 2);

    const category = await entry('/categories', 'POST', cookie, values('parent', 'Parent category'), 201);
    const subject = await entry('/subjects', 'POST', cookie, values('child', 'Subject', { categoryId: category.id }), 201);
    assert.equal((await request(api + '/categories/' + category.id, 'DELETE', cookie, { version: category.version })).status, 409);
    assert.equal((await request(api + '/subjects/' + subject.id, 'DELETE', cookie, { version: subject.version })).status, 204);
    assert.equal((await request(api + '/categories/' + category.id, 'DELETE', cookie, { version: category.version })).status, 204);

    const tagInput = values('localized', 'Published test', { translations: [
      { locale: 'en', name: 'Publication check', description: 'English label' },
      { locale: 'fa-AF', name: 'آزمایش کتابخانه', description: 'دری' },
      { locale: 'ps', name: 'د کتابتون ازموینه', description: 'پښتو' },
    ] });
    assert.equal((await request(api + '/tags', 'POST', cookie, tagInput, 'https://elsewhere.example.test')).status, 403);
    const draft = await entry('/tags', 'POST', cookie, tagInput, 201);
    assert.equal(draft.status, 'draft');
    const byText = (await (await request(api + '/tags?q=' + encodeURIComponent('کتابخانه'), 'GET', cookie)).json()) as { items: EducationRecord[] };
    assert.ok(byText.items.some(row => row.id === draft.id));
    const publicLookup = async () => (await (await request('/education/tags?q=' + prefix)).json() as { items: EducationRecord[] }).items;
    assert.deepEqual(await publicLookup(), []);
    const editUrl = '/tags/' + draft.id;
    const current = await entry(editUrl, 'GET', cookie);
    assert.equal(current.translations.length, 3);
    const edits = await Promise.all([
      request(api + editUrl, 'PUT', cookie, { ...tagInput, version: draft.version }),
      request(api + editUrl, 'PUT', cookie, { ...tagInput, version: draft.version }),
    ]);
    assert.deepEqual(edits.map(response => response.status).sort(), [200, 409]);
    let item = await entry(editUrl, 'GET', cookie);
    const statusUrl = editUrl + '/status';
    assert.equal((await request(api + statusUrl, 'PATCH', cookie, { status: 'published', version: item.version })).status, 409);
    for (const status of ['educational-review', 'translation-review', 'approved'] as const) {
      item = await entry(statusUrl, 'PATCH', managerCookie, { status, version: item.version });
    }
    assert.equal((await request(api + statusUrl, 'PATCH', managerCookie, { status: 'published', version: item.version })).status, 403);
    item = await entry(statusUrl, 'PATCH', cookie, { status: 'published', version: item.version });
    assert.equal(item.status, 'published');
    assert.deepEqual((await publicLookup()).map(row => row.id), [item.id]);
    assert.equal((await request(api + editUrl, 'DELETE', cookie, { version: item.version })).status, 409);
    assert.equal((await request(api + editUrl, 'PUT', cookie, { ...tagInput, version: item.version })).status, 409);
    item = await entry(statusUrl, 'PATCH', cookie, { status: 'archived', version: item.version });
    assert.deepEqual(await publicLookup(), []);
    assert.equal((await request(api + editUrl, 'DELETE', cookie, { version: item.version })).status, 204);
    assert.equal((await request(api + editUrl, 'GET', cookie)).status, 404);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      if (educationReady) {
        // Only the entries and test identities created by this run are removed.
        await db.query('DELETE t FROM education_translations t JOIN education_entries e ON e.id = t.entry_id WHERE e.slug LIKE $prefix',
          { bind: { prefix: prefix + '-%' } });
        await db.query('DELETE l FROM education_languages l JOIN education_entries e ON e.id = l.entry_id WHERE e.slug LIKE $prefix',
          { bind: { prefix: prefix + '-%' } });
        await db.query("DELETE FROM education_entries WHERE slug LIKE $prefix AND kind = 'subjects'", { bind: { prefix: prefix + '-%' } });
        await db.query('DELETE FROM education_entries WHERE slug LIKE $prefix', { bind: { prefix: prefix + '-%' } });
        await db.query('DELETE FROM users WHERE login IN ($admin, $manager, $student)', { bind: { admin, manager, student } });
        await db.query('DELETE FROM roles WHERE code = $role', { bind: { role: managerRole } });
      }
    } finally {
      await db.close();
    }
  }
});
