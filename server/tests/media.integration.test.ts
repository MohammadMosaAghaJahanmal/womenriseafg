import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import pino from 'pino';
import { createApp } from '../src/app';
import { createDatabase } from '../src/config/database';
import { readSettings } from '../src/config/environment';
import { migrateIdentity } from '../src/identity/migration';
import { createIdentityStore } from '../src/identity/store';
import { createAuthRoutes } from '../src/modules/auth/routes';
import { hashPassword } from '../src/modules/auth/passwords';
import { migrateEducation } from '../src/modules/education/migration';
import { isValidMediaSlot, type MediaAsset, type MediaKind, type MediaLink } from '../src/modules/media/contract';
import { createMediaFiles } from '../src/modules/media/files';
import { migrateMedia } from '../src/modules/media/migration';
import { createMediaRoutes } from '../src/modules/media/routes';
import { createMediaStore } from '../src/modules/media/store';

const fixture = (name: string) => readFile(path.join(__dirname, 'fixtures', 'media', name));
const origin = 'https://learning.example.test';

test('media configuration and relationship slots validate independently', () => {
  assert.equal(readSettings({}).mediaMaxUploadBytes, 134217728);
  assert.throws(() => readSettings({ MEDIA_MAX_UPLOAD_BYTES: '1' }), /MEDIA_MAX_UPLOAD_BYTES/);
  assert.throws(() => readSettings({ STORAGE_ROOT: 'server/dist' }), /STORAGE_ROOT/);
  assert.equal(isValidMediaSlot('video-variant', '360p'), true);
  assert.equal(isValidMediaSlot('video-variant', '300p'), false);
  assert.equal(isValidMediaSlot('subtitle', 'fa-AF'), true);
  assert.equal(isValidMediaSlot('subtitle', 'default'), false);
});

function smallWav() {
  const samples = 8000;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    buffer.writeInt16LE(Math.round(1500 * Math.sin(2 * Math.PI * 440 * index / 8000)), 44 + index * 2);
  }
  return buffer;
}

test('media upload, streaming, publication and deletion use isolated MySQL and local storage', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const config = readSettings(process.env).database;
  assert.equal(config.host, '127.0.0.1');
  assert.match(config.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(config.port, 3306);
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'womenriseafg-media-test-')));
  const db = createDatabase(config);
  const identity = createIdentityStore(db);
  const media = createMediaStore(db);
  const maximum = 32768;
  const files = createMediaFiles(root, maximum);
  const logger = pino({ level: 'silent' });
  const options = { production: true, origins: [origin], logger };
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options), mediaRoutes: createMediaRoutes(media, files, identity, options),
  }));
  const marker = randomBytes(5).toString('hex');
  const admin = 'media.' + marker + '.admin';
  const student = 'media.' + marker + '.student';
  const manager = 'media.' + marker + '.manager';
  const managerRole = 'media-' + marker;
  const password = 'Local fixture passphrase ' + marker;
  const rights = { title: 'Test media ' + marker, license: 'CC0-1.0', source: 'Generated test fixture',
    author: '', language: 'en', downloadAllowed: false };
  let initialized = false;

  try {
    await migrateIdentity(db);
    await migrateEducation(db);
    const applied = await Promise.all([migrateMedia(db), migrateMedia(db)]);
    assert.ok(applied.filter(Boolean).length <= 1);
    assert.equal(await migrateMedia(db), false);
    initialized = true;
    await db.query('INSERT INTO roles (code) VALUES ($role)', { bind: { role: managerRole } });
    await db.query("INSERT INTO role_permissions (role_code, permission_code) VALUES ($role, 'admin:access'), ($role, 'media:manage')",
      { bind: { role: managerRole } });
    const passwordHash = await hashPassword(password);
    const administrator = await identity.createStudent(admin, passwordHash);
    const mediaManager = await identity.createStudent(manager, passwordHash);
    await identity.createStudent(student, passwordHash);
    await db.query("INSERT INTO user_roles (user_id, role_code) VALUES ($id, 'admin'), ($manager, $role)",
      { bind: { id: administrator.id, manager: mediaManager.id, role: managerRole } });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    const api = '/admin/media';
    async function request(route: string, method = 'GET', cookie?: string, data?: object, extra: Record<string, string> = {}) {
      const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;
      return fetch(base + route, {
        method, body,
        headers: { 'x-forwarded-proto': 'https', ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { Origin: origin } : {}), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...extra },
      });
    }
    const signIn = async (username: string, endpoint: string) => {
      const response = await request('/auth/' + endpoint, 'POST', undefined, { username, password });
      assert.equal(response.status, 200);
      return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    };
    const cookie = await signIn(admin, 'admin-login');
    const managerCookie = await signIn(manager, 'admin-login');
    const learnerCookie = await signIn(student, 'login');
    assert.equal((await request(api)).status, 401);
    assert.equal((await request(api, 'GET', learnerCookie)).status, 403);

    function form(kind: MediaKind, name: string, bytes: Buffer, metadata = rights) {
      const body = new FormData();
      // The declared MIME is deliberately generic. The server reads the bytes.
      body.set('file', new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }), name);
      body.set('metadata', JSON.stringify({ ...metadata, kind }));
      return body;
    }
    async function asset(response: Response, status = 200) {
      const body = await response.json() as { item: MediaAsset };
      assert.equal(response.status, status, JSON.stringify(body));
      return body.item;
    }
    const upload = async (kind: MediaKind, name: string, bytes: Buffer, metadata = rights) =>
      asset(await request(api, 'POST', cookie, form(kind, name, bytes, metadata)), 201);
    const publish = async (item: MediaAsset, status: 'archived' | 'published') =>
      asset(await request(api + '/' + item.id + '/status', 'PATCH', cookie, { status, version: item.version }));
    const attach = async (item: MediaAsset, values: MediaLink) =>
      asset(await request(api + '/' + item.id + '/links', 'POST', cookie, { ...values, version: item.version }));
    const remove = async (item: MediaAsset) =>
      request(api + '/' + item.id, 'DELETE', cookie, { version: item.version, confirm: true });

    const png = await fixture('thumbnail.png');
    assert.equal((await request(api, 'POST', cookie, form('image', 'fixture.png', png), { Origin: 'https://other.example.test' })).status, 403);
    assert.equal((await request(api, 'POST', cookie, form('image', 'fixture.png', Buffer.from('Not an image')))).status, 400);
    assert.equal((await request(api, 'POST', cookie, form('image', 'fixture.gif', png))).status, 400);
    assert.equal((await request(api, 'POST', cookie, form('image', 'large.png', Buffer.alloc(maximum + 1)))).status, 413);
    const image = await upload('image', 'thumbnail.png', png);
    assert.equal(image.mimeType, 'image/png');
    assert.equal(image.width, 32);
    assert.equal(image.height, 24);
    assert.equal((await request(api, 'POST', cookie, form('image', 'duplicate.png', png))).status, 409);

    const bytes = await fixture('lesson.mp4');
    let video = await upload('video', 'lesson.mp4', bytes);
    const variant = await upload('video', 'variant.mp4', await fixture('variant.mp4'));
    const audio = await upload('audio', 'audio.wav', smallWav());
    const caption = await upload('subtitle', 'captions.vtt',
      Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:04.500\nA test caption.\n'));
    const transcript = await upload('transcript', 'transcript.txt', Buffer.from('متن آزمایشی برای آموزش\n'));
    assert.equal(video.kind, 'video');
    assert.equal(video.sizeBytes, bytes.length);
    assert.equal(audio.durationMs, 1000);
    const adminFile = api + '/' + video.id + '/file';
    const publicFile = '/media/' + video.id + '/file';
    assert.equal((await request(publicFile)).status, 404);
    assert.equal((await request(adminFile, 'GET', learnerCookie)).status, 403);
    const full = await request(adminFile, 'GET', cookie);
    assert.equal(full.status, 200);
    assert.match(full.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
    const range = await request(adminFile, 'GET', cookie, undefined, { Range: 'bytes=30-69' });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 30-69/' + bytes.length);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(30, 70));
    const suffix = await request(adminFile, 'GET', cookie, undefined, { Range: 'bytes=-9' });
    assert.equal(suffix.status, 206);
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-9));
    const invalid = await request(adminFile, 'GET', cookie, undefined, { Range: 'bytes=' + bytes.length + '-' });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */' + bytes.length);
    const head = await request(adminFile, 'HEAD', cookie);
    assert.equal(head.headers.get('content-length'), String(bytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);

    video = await attach(video, { relation: 'thumbnail', slot: 'default', assetId: image.id });
    video = await attach(video, { relation: 'video-variant', slot: '360p', assetId: variant.id });
    video = await attach(video, { relation: 'audio', slot: 'default', assetId: audio.id });
    video = await attach(video, { relation: 'subtitle', slot: 'en', assetId: caption.id });
    video = await attach(video, { relation: 'transcript', slot: 'en', assetId: transcript.id });
    assert.equal(video.links.length, 5);
    assert.equal((await remove(image)).status, 409);
    assert.equal((await remove(video)).status, 409);
    const statusRoute = api + '/' + video.id + '/status';
    assert.equal((await request(statusRoute, 'PATCH', cookie, { status: 'published', version: video.version })).status, 422);
    assert.equal((await request(statusRoute, 'PATCH', managerCookie, { status: 'published', version: video.version })).status, 403);
    const mediaVersion = video.version;
    video = await asset(await request(api + '/' + video.id, 'PUT', cookie, { ...rights, title: 'Updated ' + marker, version: mediaVersion }));
    assert.equal((await request(api + '/' + video.id, 'PUT', cookie, { ...rights, version: mediaVersion })).status, 409);
    const thumb = await publish(image, 'published');
    const smallVariant = await publish(variant, 'published');
    const soundtrack = await publish(audio, 'published');
    const publishedCaptions = await publish(caption, 'published');
    const publishedTranscript = await publish(transcript, 'published');
    video = await publish(video, 'published');

    assert.equal((await request(publicFile)).status, 200);
    const publicRange = await request(publicFile, 'GET', undefined, undefined, { Range: 'bytes=50-89' });
    assert.equal(publicRange.status, 206);
    assert.deepEqual(Buffer.from(await publicRange.arrayBuffer()), bytes.subarray(50, 90));
    assert.equal((await request(publicFile + '?download=true')).status, 403);
    assert.equal((await remove(video)).status, 409);
    assert.equal((await request(api + '/' + thumb.id + '/status', 'PATCH', cookie, { status: 'archived', version: thumb.version })).status, 409);
    await db.query("INSERT INTO media_references (asset_id,owner_type,owner_id,published) VALUES ($id,'fixture',$owner,1)",
      { bind: { id: video.id, owner: marker } });
    assert.equal((await request(statusRoute, 'PATCH', cookie, { status: 'archived', version: video.version })).status, 409);
    await db.query('DELETE FROM media_references WHERE owner_id=$owner', { bind: { owner: marker } });
    video = await publish(video, 'archived');
    assert.equal((await request(publicFile)).status, 404);
    for (const { relation, slot } of video.links) {
      video = await asset(await request(api + '/' + video.id + '/links', 'DELETE', cookie, { relation, slot, version: video.version }));
    }
    const orphans = await request(api + '?orphans=true&q=' + marker, 'GET', cookie);
    assert.equal(orphans.status, 200);
    assert.ok((await orphans.json() as { items: MediaAsset[] }).items.some(item => item.id === video.id));
    assert.equal((await request(api + '/' + video.id, 'DELETE', cookie, { version: video.version })).status, 400);
    const deleted = await remove(video);
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { cleanupPending: false });
    assert.equal((await request(adminFile, 'GET', cookie)).status, 404);

    for (const item of [thumb, smallVariant, soundtrack, publishedCaptions]) {
      assert.equal((await remove(await publish(item, 'archived'))).status, 200);
    }
    const pending = await publish(publishedTranscript, 'archived');
    await media.markDeleted(pending.id, pending.version);
    const objectPath = path.join(root, 'media', 'objects');
    const lost = path.join(objectPath, randomUUID() + '.png');
    const fresh = path.join(objectPath, randomUUID() + '.png');
    await Promise.all([writeFile(lost, png), writeFile(fresh, png)]);
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(lost, old, old);
    await utimes(path.join(objectPath, pending.storageKey), old, old);
    const beforeCleanup = await request(api + '/usage', 'GET', cookie);
    const pendingUsage = await beforeCleanup.json() as { orphanFiles: number; pendingDeletes: number };
    assert.equal(pendingUsage.orphanFiles, 1);
    assert.equal(pendingUsage.pendingDeletes, 1);
    assert.equal((await request(api + '/cleanup', 'POST', cookie, { confirm: false })).status, 400);
    const cleanup = await request(api + '/cleanup', 'POST', cookie, { confirm: true });
    assert.equal(cleanup.status, 200);
    assert.deepEqual(await cleanup.json(), { removed: 2, pending: 0 });
    await assert.rejects(stat(lost), { code: 'ENOENT' });
    assert.equal((await stat(fresh)).isFile(), true);
    const usage = await request(api + '/usage', 'GET', cookie);
    assert.equal(usage.status, 200);
    const data = await usage.json() as { assets: number; usedBytes: number; capacityBytes: number };
    assert.equal(data.assets, 0);
    assert.equal(data.usedBytes, 0);
    assert.ok(data.capacityBytes > 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      if (initialized) {
        await db.query('DELETE FROM media_references WHERE owner_id=$owner', { bind: { owner: marker } });
        await db.query('DELETE l FROM media_links l JOIN media_assets a ON a.id = l.parent_id WHERE a.source=$source AND a.title LIKE $name',
          { bind: { source: rights.source, name: '%' + marker } });
        await db.query('DELETE FROM media_assets WHERE source=$source AND title LIKE $name',
          { bind: { source: rights.source, name: '%' + marker } });
        await db.query('DELETE FROM users WHERE login IN ($admin,$student,$manager)', { bind: { admin, student, manager } });
        await db.query('DELETE FROM roles WHERE code=$role', { bind: { role: managerRole } });
      }
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  }
});
