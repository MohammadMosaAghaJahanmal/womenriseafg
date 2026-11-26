import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import pino from 'pino';
import { QueryTypes } from 'sequelize';
import { createApp } from '../src/app';
import { createDatabase } from '../src/config/database';
import { readSettings } from '../src/config/environment';
import { migrateIdentity } from '../src/identity/migration';
import { superAdminRole } from '../src/identity/roles';
import { createIdentityStore } from '../src/identity/store';
import { hashPassword } from '../src/modules/auth/passwords';
import { createAuthRoutes } from '../src/modules/auth/routes';

const browserOrigin = 'https://learning.example.test';
const tlsHeader = { 'X-Forwarded-Proto': 'https' };
const suffix = () => randomBytes(6).toString('hex');

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
}

test('identity and permissions on an isolated migrated MySQL schema', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable migrated test schema',
  timeout: 60000,
}, async () => {
  const config = readSettings(process.env).database;
  assert.equal(config.host, '127.0.0.1', 'This test uses a loopback database');
  assert.match(config.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(config.port, 3306, 'Use an isolated MySQL instance');
  const db = createDatabase(config);
  const store = createIdentityStore(db);
  const logRecords: Record<string, unknown>[] = [];
  const logger = pino({ base: undefined }, new Writable({
    write(chunk, _encoding, done) {
      logRecords.push(JSON.parse(chunk.toString()));
      done();
    },
  }));
  const app = createApp({
    production: true,
    trustedProxies: ['127.0.0.1'],
    logger,
    checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(store, { origins: [browserOrigin], production: true, logger }),
  });
  const server = createServer(app);
  const untrustedServer = createServer(createApp({
    production: true, logger, checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(store, { origins: [browserOrigin], production: true, logger }),
  }));
  const student = 'learner.' + suffix();
  const admin = 'admin.' + suffix();
  const password = 'long-passphrase-' + suffix();
  const nextPassword = 'another-long-passphrase-' + suffix();
  let bootstrapCreated = false;

  try {
    const migrations = await Promise.all([migrateIdentity(db), migrateIdentity(db)]);
    assert.ok(migrations.filter(Boolean).length <= 1);
    assert.equal(await migrateIdentity(db), false);
    const url = await listen(server);
    const direct = await listen(untrustedServer);
    const request = (path: string, options?: RequestInit) => fetch(url + '/api/v1' + path, options);
    const get = (path: string, cookie?: string) => request(path, {
      headers: { ...tlsHeader, ...(cookie ? { Cookie: cookie } : {}) },
    });
    const post = (path: string, body: object, cookie?: string, origin = browserOrigin, contentType = 'application/json') =>
      request(path, { method: 'POST', headers: {
        ...tlsHeader, ...(origin ? { Origin: origin } : {}), 'Content-Type': contentType,
        ...(cookie ? { Cookie: cookie } : {}),
      }, body: JSON.stringify(body) });
    const session = (response: Response) => {
      const header = response.headers.get('set-cookie') ?? '';
      assert.match(header, /^__Host-womenriseafg_session=[A-Za-z0-9_-]{43};/);
      for (const attr of [/; HttpOnly/i, /; Secure/i, /; SameSite=Strict/i, /; Path=\//i]) assert.match(header, attr);
      assert.doesNotMatch(header, /Domain=|Expires=|Max-Age=/i);
      return header.split(';')[0]!;
    };

    const guest = await get('/auth/session');
    assert.equal(guest.status, 200);
    assert.deepEqual(await guest.json(), { user: null });
    assert.equal((await get('/admin/access')).status, 401);
    assert.equal((await fetch(direct + '/api/v1/auth/session', { headers: tlsHeader })).status, 400);
    assert.equal((await request('/auth/session')).status, 400);
    const input = { username: student, password };
    assert.equal((await post('/auth/register', input, undefined, 'https://wrong.example.test')).status, 403);
    assert.equal((await post('/auth/register', input, undefined, '')).status, 403);
    assert.equal((await post('/auth/register', input, undefined, browserOrigin, 'text/plain')).status, 415);
    assert.equal((await post('/auth/register', { ...input, roles: ['super-admin'] })).status, 400);
    assert.equal((await post('/auth/register', { ...input, password: 'short' })).status, 400);

    const registration = await post('/auth/register', { ...input, username: student.toUpperCase() });
    assert.equal(registration.status, 201);
    const studentCookie = session(registration);
    assert.deepEqual(await registration.json(), { user: { username: student, permissions: ['account:self'] } });
    assert.match(registration.headers.get('cache-control') ?? '', /no-store/);
    assert.equal((await post('/auth/register', input)).status, 409);
    assert.equal((await get('/admin/access', studentCookie)).status, 403);
    assert.equal((await post('/auth/admin-login', input)).status, 401);
    await db.query("INSERT INTO user_roles (user_id, role_code) SELECT id, 'admin' FROM users WHERE login = $student",
      { bind: { student } });
    try {
      assert.equal((await get('/admin/access', studentCookie)).status, 403);
      assert.deepEqual(await (await get('/auth/session', studentCookie)).json(),
        { user: { username: student, permissions: ['account:self'] } });
    } finally {
      await db.query("DELETE gr FROM user_roles gr JOIN users u ON u.id = gr.user_id WHERE u.login = $student AND gr.role_code = 'admin'",
        { bind: { student } });
    }
    const incorrect = await post('/auth/login', { ...input, password: nextPassword });
    const absent = await post('/auth/login', { ...input, username: 'missing.' + suffix() });
    assert.equal(incorrect.status, 401);
    assert.equal(absent.status, 401);
    assert.deepEqual(await incorrect.json(), await absent.json());

    const signedIn = await post('/auth/login', input, studentCookie);
    assert.equal(signedIn.status, 200);
    const replacement = session(signedIn);
    assert.notEqual(replacement, studentCookie);
    assert.deepEqual(await (await get('/auth/session', studentCookie)).json(), { user: null });
    const token = replacement.split('=')[1]!;
    const hash = createHash('sha256').update(token).digest('hex');
    const [row] = await db.query<{ token: string; hours: number; passwordHash: string }>(
      'SELECT s.token_hash AS token, TIMESTAMPDIFF(MINUTE, s.created_at, s.expires_at) / 60 AS hours, u.password_hash AS passwordHash FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.login = $login',
      { type: QueryTypes.SELECT, bind: { login: student } },
    );
    assert.ok(row);
    assert.equal(row.token, hash);
    assert.notEqual(row.token, token);
    assert.notEqual(row.passwordHash, password);
    assert.ok(Number(row.hours) >= 7.95 && Number(row.hours) <= 8);
    await db.query('UPDATE sessions SET expires_at = NOW(3) - INTERVAL 1 SECOND WHERE token_hash = $hash', { bind: { hash } });
    assert.deepEqual(await (await get('/auth/session', replacement)).json(), { user: null });
    assert.equal(await store.purgeExpiredSessions(), 1);

    const outcomes = await Promise.allSettled([
      store.bootstrapAdministrator(admin, await hashPassword(password)),
      store.bootstrapAdministrator(admin, await hashPassword(password)),
    ]);
    bootstrapCreated = outcomes.some(result => result.status === 'fulfilled');
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await post('/auth/login', { username: admin, password })).status, 401);
    const adminSignIn = await post('/auth/admin-login', { username: admin, password });
    assert.equal(adminSignIn.status, 200);
    const adminCookie = session(adminSignIn);
    assert.equal((await get('/admin/access', adminCookie)).status, 200);
    const [adminUser] = await db.query<{ id: string; scope: number }>(
      'SELECT u.id, s.admin_scope AS scope FROM users u JOIN sessions s ON s.user_id = u.id WHERE u.login = $admin',
      { type: QueryTypes.SELECT, bind: { admin } },
    );
    assert.ok(adminUser);
    assert.equal(adminUser.scope, 1);
    await db.query('DELETE FROM user_roles WHERE user_id = $userId AND role_code = $role',
      { bind: { userId: adminUser.id, role: superAdminRole } });
    assert.equal((await get('/admin/access', adminCookie)).status, 403);
    await db.query('INSERT INTO user_roles (user_id, role_code) VALUES ($userId, $role)',
      { bind: { userId: adminUser.id, role: superAdminRole } });
    await db.query('UPDATE users SET active = 0 WHERE login = $login', { bind: { login: admin } });
    assert.equal((await get('/admin/access', adminCookie)).status, 401);
    await db.query('UPDATE users SET active = 1 WHERE login = $login', { bind: { login: admin } });
    assert.deepEqual(await store.recoverAdministrator(admin, await hashPassword(nextPassword)), {
      userId: adminUser.id, revoked: 1,
    });
    assert.equal((await get('/admin/access', adminCookie)).status, 401);
    await assert.rejects(store.recoverAdministrator(student, await hashPassword(nextPassword)));
    assert.equal((await post('/auth/admin-login', { username: admin, password })).status, 401);
    const recovered = await post('/auth/admin-login', { username: admin, password: nextPassword });
    assert.equal(recovered.status, 200);
    const recoveredCookie = session(recovered);
    assert.equal((await post('/auth/logout', {}, recoveredCookie, 'https://wrong.example.test')).status, 403);
    const logout = await post('/auth/logout', {}, recoveredCookie);
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie') ?? '', /Expires=/i);
    assert.equal((await get('/admin/access', recoveredCookie)).status, 401);
    assert.ok(logRecords.some(record => record.event === 'admin_sign_in' &&
      record.result === 'success' && record.actorId === adminUser.id));
    assert.ok(logRecords.some(record => record.event === 'admin_sign_out' &&
      record.result === 'success' && record.actorId === adminUser.id));
    assert.ok(logRecords.some(record => record.event === 'admin_sign_in' &&
      record.result === 'denied' && !Object.hasOwn(record, 'actorId')));
    let throttled: Response | undefined;
    for (let i = 0; i < 20; i++) {
      // Invalid, inexpensive requests still count against the shared credentials limit.
      const response = await post('/auth/login', {});
      if (response.status === 429) { throttled = response; break; }
      assert.equal(response.status, 400);
    }
    assert.ok(throttled?.headers.has('retry-after'));
  } finally {
    await Promise.all([server, untrustedServer].map(instance =>
      new Promise<void>(resolve => instance.close(() => resolve()))));
    try {
      await db.query('DELETE FROM users WHERE login = $student OR login = $admin', {
        bind: { student, admin: bootstrapCreated ? admin : student },
      });
    } finally { await db.close(); }
  }
});
