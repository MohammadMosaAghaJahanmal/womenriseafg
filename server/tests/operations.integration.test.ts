import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
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
import { migrateCertificates } from '../src/modules/certificates/migration';
import { migrateCourses } from '../src/modules/courses/migration';
import { migrateDiscovery } from '../src/modules/discovery/migration';
import { migrateEducation } from '../src/modules/education/migration';
import { migrateHomepage } from '../src/modules/homepage/migration';
import { migrateLearningMedia } from '../src/modules/learning-media/migration';
import { migrateMedia } from '../src/modules/media/migration';
import { createMediaStore } from '../src/modules/media/store';
import { migrateOperations } from '../src/modules/operations/migration';
import { createOperationsRoutes } from '../src/modules/operations/routes';
import { migrateQuizzes } from '../src/modules/quizzes/migration';
import { migrateStaff } from '../src/modules/staff/migration';

type Backup = { kind: string; result: string; recordedAt: string };
interface Snapshot {
  storage: { count: string; bytes: string; kind: string }[];
  backupChecks: Backup[];
  volume: { capacityBytes: number; freeBytes: number } | null;
  checkedAt: string;
}

test('owner operations tracks media totals and preserves only the latest backup check without exposing storage paths', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const database = readSettings(process.env).database;
  assert.equal(database.host, '127.0.0.1');
  assert.match(database.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(database.port, 3306);
  const db = createDatabase(database);
  const identity = createIdentityStore(db);
  const media = createMediaStore(db);
  const nonce = randomBytes(5).toString('hex');
  const assetId = randomUUID();
  const password = 'Temporary operations test ' + nonce;
  const origin = 'https://learning.example.test';
  const options = { production: true, origins: [origin], logger: pino({ level: 'silent' }) };
  let accessible = true;
  const files = { space: async () => {
    if (!accessible) throw new Error('internal/private/object/path');
    return { capacityBytes: 65536, freeBytes: 32768 };
  }};
  const router = Router().use(createAuthRoutes(identity, options), createOperationsRoutes(db, files, identity, options));
  const app = createApp({ production: true, logger: options.logger, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(), identityRoutes: router });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
  const userIds: string[] = [];
  let oldChecks: Backup[] | undefined;
  const send = (endpoint: string, cookie?: string, body?: unknown, writeOrigin = origin) => fetch(base + endpoint, {
    method: body ? 'PUT' : 'GET',
    headers: { 'X-Forwarded-Proto': 'https', Origin: writeOrigin, 'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  async function verifyOriginSession(username: string) {
    const reply = await fetch(base + '/auth/admin-login', {
      method: 'POST', headers: { 'X-Forwarded-Proto': 'https', Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(reply.status, 200);
    const cookie = reply.headers.get('Set-Cookie')?.split(';')[0];
    assert.ok(cookie);
    return cookie;
  }
  try {
    for (const migration of [migrateIdentity, migrateEducation, migrateMedia, migrateCourses, migrateLearningMedia, migrateBooks,
      migrateQuizzes, migrateDiscovery, migrateCertificates, migrateHomepage, migrateStaff, migrateOperations]) {
      await migration(db);
    }
    assert.equal(await migrateOperations(db), false);
    const endpoint = '/admin/operations';
    assert.equal((await send(endpoint)).status, 401);
    const hash = await hashPassword(password);
    const owner = await identity.createStudent('ops.' + nonce + '.owner', hash);
    const administrator = await identity.createStudent('ops.' + nonce + '.admin', hash);
    userIds.push(owner.id, administrator.id);
    await db.query("INSERT INTO user_roles (user_id, role_code) VALUES ($owner, 'super-admin'), ($admin, 'admin')",
      { bind: { owner: owner.id, admin: administrator.id } });
    const ownerCookie = await verifyOriginSession(owner.login);
    const adminCookie = await verifyOriginSession(administrator.login);
    assert.equal((await send(endpoint, adminCookie)).status, 403);
    const first = await send(endpoint, ownerCookie);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('Cache-Control'), 'no-store');
    const original = await first.json() as Snapshot;
    oldChecks = original.backupChecks;
    assert.deepEqual(original.volume, { capacityBytes: 65536, freeBytes: 32768 });
    assert.ok(!Number.isNaN(Date.parse(original.checkedAt)));

    await media.create(assetId, 'audio', {
      title: 'Private media fixture', license: 'CC0-1.0', source: 'Fixture', author: 'Fixture', language: 'en', downloadAllowed: false,
    }, { storageKey: assetId + '.wav', originalName: 'private-fixture.wav', mimeType: 'audio/wav', sizeBytes: 8192,
      sha256: randomBytes(32).toString('hex'), width: null, height: null, durationMs: null }, owner.id);
    assert.equal((await send(endpoint + '/backup-checks/backup', adminCookie, { result: 'passed' })).status, 403);
    assert.equal((await send(endpoint + '/backup-checks/backup', ownerCookie, { result: 'passed' }, 'https://other.example.test')).status, 403);
    assert.equal((await send(endpoint + '/backup-checks/backup', ownerCookie, { result: 'passed', path: 'private.sql' })).status, 400);
    assert.equal((await send(endpoint + '/backup-checks/backup', ownerCookie, { result: 'passed' })).status, 204);
    assert.equal((await send(endpoint + '/backup-checks/backup', ownerCookie, { result: 'failed' })).status, 204);
    assert.equal((await send(endpoint + '/backup-checks/restore-drill', ownerCookie, { result: 'passed' })).status, 204);

    accessible = false;
    const current = await send(endpoint, ownerCookie);
    assert.equal(current.status, 200);
    const snapshot = await current.json() as Snapshot;
    assert.equal(snapshot.volume, null);
    const before = original.storage.find(item => item.kind === 'audio');
    const after = snapshot.storage.find(item => item.kind === 'audio');
    assert.ok(after);
    assert.equal(BigInt(after.bytes) - BigInt(before?.bytes ?? 0), 8192n);
    assert.equal(BigInt(after.count) - BigInt(before?.count ?? 0), 1n);
    assert.deepEqual(snapshot.backupChecks.map(({ kind, result }) => ({ kind, result })),
      [{ kind: 'backup', result: 'failed' }, { kind: 'restore-drill', result: 'passed' }]);
    assert.doesNotMatch(JSON.stringify(snapshot), /private-fixture|internal\/private\/object\/path|password_hash|tokenHash/);
    const [rows] = await db.query<{ total: number }>('SELECT COUNT(*) AS total FROM operations_backup_checks', { type: QueryTypes.SELECT });
    assert.equal(Number(rows?.total), 2);
  } finally {
    try {
      if (oldChecks) {
        await db.query('DELETE FROM operations_backup_checks');
        for (const row of oldChecks) await db.query('INSERT INTO operations_backup_checks VALUES ($kind, $result, $date)',
          { bind: { kind: row.kind, result: row.result, date: new Date(row.recordedAt) } });
      }
      if (userIds.length) {
        await db.query('DELETE FROM media_assets WHERE id = $assetId', { bind: { assetId } });
        await db.query('DELETE FROM users WHERE id IN (:userIds)', { replacements: { userIds } });
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.close();
    }
  }
});

