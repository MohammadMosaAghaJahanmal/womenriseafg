import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import pino from 'pino';
import { createApp } from '../src/app';
import { createDatabase } from '../src/config/database';
import { projectRoot, readSettings } from '../src/config/environment';

let server: Server;
let origin: string;
let directory: string;
let dbAvailable = true;
let checks = 0;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'womenriseafg-static-'));
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'index.html'), '<main>Foundation test</main>');
  await writeFile(path.join(directory, 'assets', 'app.js'), '/* asset */');
  await writeFile(path.join(directory, '.env'), 'blocked fixture');
  const app = createApp({
    publicDirectory: directory,
    production: true,
    logger: pino({ level: 'silent' }),
    checkDatabase: async () => {
      checks++;
      if (!dbAvailable) throw new Error('sensitive database diagnostic');
    },
  });
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve());
  });
  const { port } = server.address() as AddressInfo;
  origin = 'http://127.0.0.1:' + port;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('configuration is typed, anchored to the project and rejects unsafe values without echoing them', () => {
  const settings = readSettings({ PORT: '4070', STORAGE_ROOT: 'storage/test' });
  assert.equal(settings.port, 4070);
  assert.equal(settings.storageRoot, path.join(projectRoot, 'storage', 'test'));
  assert.equal(settings.database.port, 3306);
  assert.throws(() => readSettings({ DB_PORT: 'sensitive-invalid-value' }), { message: 'Invalid environment settings: DB_PORT' });
  assert.throws(() => readSettings({ NODE_ENV: 'production', DB_PASSWORD: '  ' }), /DB_PASSWORD/);
  assert.throws(() => readSettings({ STORAGE_ROOT: 'client/public/files' }), /STORAGE_ROOT/);
  assert.throws(() => readSettings({ STORAGE_ROOT: '.' }), /STORAGE_ROOT/);
  assert.equal(readSettings({ NODE_ENV: 'production', DB_PASSWORD: 'test-fixture' }).environment, 'production');
});

test('authentication accepts a canonical origin and only explicit proxy addresses', () => {
  const production = { NODE_ENV: 'production', DB_PASSWORD: 'test-fixture' };
  assert.deepEqual(readSettings(production).auth, { origins: [], trustedProxies: [] });
  assert.throws(() => readSettings({ ...production, AUTH_PUBLIC_ORIGIN: 'http://example.test' }), /AUTH_PUBLIC_ORIGIN/);
  assert.throws(() => readSettings({ AUTH_PUBLIC_ORIGIN: 'https://example.test/somewhere' }), /AUTH_PUBLIC_ORIGIN/);
  assert.throws(() => readSettings({ AUTH_TRUSTED_PROXY_IPS: 'true' }), /AUTH_TRUSTED_PROXY_IPS/);
  assert.deepEqual(readSettings({
    ...production, AUTH_PUBLIC_ORIGIN: 'https://example.test', AUTH_TRUSTED_PROXY_IPS: '127.0.0.1, ::1',
  }).auth, { origins: ['https://example.test'], trustedProxies: ['127.0.0.1', '::1'] });
  assert.ok(readSettings({ PORT: '4070' }).auth.origins.includes('http://127.0.0.1:4070'));
});

test('Sequelize is configured with the MySQL dialect and the configured schema', async () => {
  const db = createDatabase(readSettings({ DB_NAME: 'test_schema' }).database);
  try {
    assert.equal(db.getDialect(), 'mysql');
    assert.equal(db.getDatabaseName(), 'test_schema');
  } finally {
    await db.close();
  }
});

test('public liveness is independent of the database and does not set cookies', async () => {
  const beforeCount = checks;
  const response = await fetch(origin + '/api/v1/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(checks, beforeCount);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('readiness reports availability, redacts failures and recovers on a subsequent request', async () => {
  dbAvailable = false;
  try {
    const failed = await fetch(origin + '/api/v1/ready');
    assert.equal(failed.status, 503);
    const body = await failed.text();
    assert.doesNotMatch(body, /sensitive|diagnostic/);
    assert.equal(JSON.parse(body).error.code, 'UNAVAILABLE');
  } finally {
    dbAvailable = true;
  }
  const ready = await fetch(origin + '/api/v1/ready');
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready' });
});

test('unexpected input and malformed JSON produce safe validation errors', async () => {
  const query = await fetch(origin + '/api/v1/health?extra=fixture-private');
  assert.equal(query.status, 400);
  const body = await query.text();
  assert.doesNotMatch(body, /fixture-private/);
  assert.equal(JSON.parse(body).error.code, 'INVALID_INPUT');
  const malformed = await fetch(origin + '/api/v1/health', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"value":"fixture-private"',
  });
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(await malformed.text(), /fixture-private/);
});

test('requests over the JSON size limit return a bounded 413 response', async () => {
  const response = await fetch(origin + '/api/v1/health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(33000) }),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
  });
});

test('public build and direct browser navigation both serve successfully', async () => {
  for (const url of ['/', '/lesson/example']) {
    const response = await fetch(origin + url, { headers: { accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Foundation test/);
  }
  const asset = await fetch(origin + '/assets/app.js');
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), '/* asset */');
});

test('missing API, media, assets and private paths never receive the SPA shell', async () => {
  for (const url of ['/api', '/api/v1/missing', '/assets/missing', '/missing.css', '/media/book',
                     '/storage/book', '/.env', '/%2eenv', '/server/src/index.ts', '/node_modules/module']) {
    const response = await fetch(origin + url, { headers: { accept: 'text/html' } });
    assert.equal(response.status, 404, url);
    assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
  }
  const notHtml = await fetch(origin + '/lesson/example', { headers: { accept: 'application/json' } });
  assert.equal(notHtml.status, 404);
  assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 404);
});

test('malformed encoded paths return sanitized 400 responses', async () => {
  const response = await fetch(origin + '/bad%ZZ');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: { code: 'INVALID_PATH', message: 'Invalid request path.' } });
});
