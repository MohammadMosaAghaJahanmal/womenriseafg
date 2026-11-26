import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import pino from 'pino';
import { QueryTypes } from 'sequelize';
import { createApp } from '../src/app';
import { createDatabase } from '../src/config/database';
import { readSettings } from '../src/config/environment';
import { migrateIdentity } from '../src/identity/migration';
import { createIdentityStore } from '../src/identity/store';
import { hashPassword } from '../src/modules/auth/passwords';
import { createAuthRoutes } from '../src/modules/auth/routes';
import { migrateCourses } from '../src/modules/courses/migration';
import { createCourseRoutes } from '../src/modules/courses/routes';
import { createCourseStore } from '../src/modules/courses/store';
import type { CourseRecord } from '../src/modules/courses/contract';
import type { EducationStatus } from '../src/modules/education/contract';
import { migrateEducation } from '../src/modules/education/migration';
import { createEducationRoutes } from '../src/modules/education/routes';
import { createEducationStore } from '../src/modules/education/store';
import type { LearningMediaInput, LearningMediaRecord } from '../src/modules/learning-media/contract';
import { migrateLearningMedia } from '../src/modules/learning-media/migration';
import { createLearningMediaRoutes } from '../src/modules/learning-media/routes';
import { createLearningMediaStore } from '../src/modules/learning-media/store';
import { newItem } from '../src/modules/learning-media/validation';
import type { MediaAsset, MediaKind } from '../src/modules/media/contract';
import { createMediaFiles } from '../src/modules/media/files';
import { migrateMedia } from '../src/modules/media/migration';
import { createMediaRoutes } from '../src/modules/media/routes';
import { createMediaStore } from '../src/modules/media/store';

const origin = 'https://learning.example.test';
const adminPath = '/admin/learning-media';
const permission = 'learning-media:manage';
const translations = (title: string) => [{ locale: 'en', title, description: 'Learn to compare two groups.' }];
const fixture = (name: string) => readFile(path.join(__dirname, 'fixtures', 'media', name));
const workflowNote = 'I reviewed the learning objective, accuracy, captions, and permissions.';

test('learning media normalizes translations and honors configured Short limits', () => {
  const draft = { slug: 'Practice', kind: 'video', translations: [{ locale: 'fa-af', title: 'تمرین' }] };
  const { error, value } = newItem.validate(draft);
  assert.equal(error, undefined);
  assert.equal(value.slug, 'practice');
  assert.equal(value.translations[0].locale, 'fa-AF');
  assert.ok(newItem.validate({ ...draft, status: 'published' }).error);
  assert.ok(newItem.validate({ ...draft, mediaId: 'https://example.test/file.mp4' }).error);
  assert.equal(readSettings({}).shortMaxSeconds, 90);
  assert.equal(readSettings({ SHORT_MAX_SECONDS: '45' }).shortMaxSeconds, 45);
  assert.throws(() => readSettings({ SHORT_MAX_SECONDS: '0' }), /SHORT_MAX_SECONDS/);
});

function alternateBytes(bytes: Buffer) {
  const atom = Buffer.alloc(24);
  atom.writeUInt32BE(24);
  atom.write('free', 4);
  randomBytes(16).copy(atom, 8);
  return Buffer.concat([bytes, atom]);
}

test('reviewed videos, Shorts and AI resources reach guests from an isolated MySQL workspace', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const database = readSettings(process.env).database;
  assert.equal(database.host, '127.0.0.1');
  assert.match(database.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(database.port, 3306);
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'womenriseafg-learning-media-test-')));
  const db = createDatabase(database);
  const identity = createIdentityStore(db);
  const media = createMediaStore(db);
  const courses = createCourseStore(db);
  const store = createLearningMediaStore(db, { shortMaxSeconds: 4 });
  const logger = pino({ level: 'silent' });
  const options = { production: true, origins: [origin], logger };
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options),
    educationRoutes: createEducationRoutes(createEducationStore(db), identity, options),
    mediaRoutes: createMediaRoutes(media, createMediaFiles(directory, 131072), identity, options),
    courseRoutes: createCourseRoutes(courses, media, identity, options),
    learningMediaRoutes: createLearningMediaRoutes(store, media, identity, options),
  }));
  const suffix = randomBytes(5).toString('hex');
  const reviewer = 'editor.' + suffix + '.admin';
  const author = 'editor.' + suffix + '.author';
  const student = 'editor.' + suffix + '.learner';
  const role = 'learning-media-test-' + suffix;
  const password = 'Private learning media test ' + suffix;
  const mediaIds: string[] = [];
  const itemIds: string[] = [];
  let relatedCourseId: string | undefined;
  let migrated = false;

  try {
    await migrateIdentity(db);
    await migrateEducation(db);
    await migrateMedia(db);
    await migrateCourses(db);
    const migratedRuns = await Promise.all([migrateLearningMedia(db), migrateLearningMedia(db)]);
    assert.ok(migratedRuns.filter(Boolean).length <= 1);
    assert.equal(await migrateLearningMedia(db), false);
    migrated = true;
    await db.query('INSERT INTO roles (code) VALUES ($role)', { bind: { role } });
    await db.query("INSERT INTO role_permissions (role_code,permission_code) VALUES ($role,'admin:access'),($role,$permission)",
      { bind: { role, permission } });
    const hash = await hashPassword(password);
    const reviewAccount = await identity.createStudent(reviewer, hash);
    const authorAccount = await identity.createStudent(author, hash);
    await identity.createStudent(student, hash);
    await db.query("INSERT INTO user_roles (user_id,role_code) VALUES ($reviewer,'admin'),($author,$role)",
      { bind: { reviewer: reviewAccount.id, author: authorAccount.id, role } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';

    function request(route: string, method = 'GET', cookie?: string, data?: object, suppliedOrigin = origin) {
      const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;
      return fetch(base + route, {
        method, body,
        headers: { 'x-forwarded-proto': 'https', ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { Origin: suppliedOrigin } : {}), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) },
      });
    }
    async function expectJson<T>(response: Response, expected = 200) {
      const data = await response.json() as T;
      assert.equal(response.status, expected, JSON.stringify(data));
      return data;
    }
    async function login(username: string, endpoint = 'admin-login') {
      const response = await request('/auth/' + endpoint, 'POST', undefined, { username, password });
      assert.equal(response.status, 200);
      return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    }
    const admin = await login(reviewer);
    const manager = await login(author);
    const learner = await login(student, 'login');
    const upload = async (kind: MediaKind, name: string, bytes: Buffer) => {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(bytes)]), name);
      form.set('metadata', JSON.stringify({ kind, title: name, license: 'CC0-1.0',
        source: 'Original isolated test fixture', author: 'Test authors', language: 'en' }));
      const { item } = await expectJson<{ item: MediaAsset }>(await request('/admin/media', 'POST', admin, form), 201);
      mediaIds.push(item.id);
      return item;
    };
    const fileStatus = (item: MediaAsset, status: 'published' | 'archived' = 'published') =>
      request('/admin/media/' + item.id + '/status', 'PATCH', admin, { version: item.version, status });
    const publishFile = async (item: MediaAsset) => (await expectJson<{ item: MediaAsset }>(await fileStatus(item))).item;
    const change = (item: LearningMediaRecord, status: EducationStatus, cookie = admin, reviewNote = '') =>
      request(adminPath + '/' + item.id + '/status', 'PATCH', cookie, { version: item.version, status, reviewNote });
    const move = async (item: LearningMediaRecord, status: EducationStatus, cookie = admin, note = '') =>
      (await expectJson<{ item: LearningMediaRecord }>(await change(item, status, cookie, note))).item;
    async function create(input: LearningMediaInput, actor = admin) {
      const { item } = await expectJson<{ item: LearningMediaRecord }>(await request(adminPath, 'POST', actor, input), 201);
      itemIds.push(item.id);
      return item;
    }
    const categoryResponse = await expectJson<{ items: { id: string }[] }>(await request('/education/categories'));
    const categoryId = categoryResponse.items[0]!.id;
    const curriculum = await expectJson<{ item: CourseRecord }>(await request('/admin/courses', 'POST', admin, {
      slug: 'editorial-course-' + suffix, translations: translations('Count and compare'),
      chapters: [{ translations: [{ locale: 'en', title: 'Practice' }], lessons: [{ slug: 'compare', kind: 'text',
        translations: [{ ...translations('Comparison lesson')[0], body: 'Group the objects in two sets.' }] }] }],
    }), 201);
    let related = curriculum.item;
    relatedCourseId = related.id;
    for (const status of ['educational-review', 'approved', 'published']) {
      related = (await expectJson<{ item: CourseRecord }>(await request('/admin/courses/' + related.id + '/status',
        'PATCH', admin, { status, version: related.version }))).item;
    }

    assert.equal((await request(adminPath)).status, 401);
    assert.equal((await request(adminPath, 'GET', learner)).status, 403);
    const landscape = await publishFile(await upload('video', 'count.mp4', alternateBytes(await fixture('lesson.mp4'))));
    let portrait = await upload('video', 'vertical.mp4', alternateBytes(await fixture('portrait-short.mp4')));
    const captions = await upload('subtitle', 'caption.vtt', Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.200\nCount the first group.\n'));
    portrait = (await expectJson<{ item: MediaAsset }>(await request('/admin/media/' + portrait.id + '/links', 'POST', admin,
      { version: portrait.version, assetId: captions.id, relation: 'subtitle', slot: 'en' }))).item;
    assert.equal(portrait.width, 72);
    assert.equal(portrait.height, 128);
    assert.equal(portrait.durationMs, 3000);

    const common = { categoryId, relatedCourseId: related.id, relatedLessonId: related.chapters[0]!.lessons[0]!.id,
      aiOrigin: 'human' as const, aiTool: '', aiNotes: '' };
    const videoInput = { ...common, kind: 'video' as const, mediaId: landscape.id,
      slug: 'count-' + suffix, translations: translations('Compare groups') };
    const shortInput = { ...common, kind: 'short' as const, mediaId: portrait.id, slug: 'quick-count-' + suffix,
      translations: [...translations('Quick count'), { locale: 'fa-AF', title: 'شمارش سریع', description: 'دو گروه را بشمارید.' }] };
    assert.equal((await request(adminPath, 'POST', admin, videoInput, 'https://other.example.test')).status, 403);
    assert.equal((await request(adminPath + '/assets?status=draft', 'GET', manager)).status, 403);
    assert.equal((await request(adminPath + '/assets/' + portrait.id, 'GET', manager)).status, 404);
    assert.equal((await request(adminPath, 'POST', manager, shortInput)).status, 403);
    const publicPortrait = '/media/' + portrait.id + '/file';
    assert.equal((await request(publicPortrait)).status, 404);
    assert.equal((await request(adminPath + '/assets?status=draft&kind=video', 'GET', admin)).status, 200);
    const wrongShape = await request(adminPath, 'POST', admin, { ...shortInput, mediaId: landscape.id, slug: 'wrong-shape-' + suffix });
    assert.equal(wrongShape.status, 422);
    const limited = createLearningMediaStore(db, { shortMaxSeconds: 2 });
    await assert.rejects(limited.create(shortInput, reviewAccount.id, true), { code: 'INVALID_SHORT' });
    let short = await create(shortInput);
    assert.equal((await request('/shorts/' + short.slug)).status, 404);
    for (const held of [portrait, captions]) {
      const result = await expectJson<{ error: { code: string } }>(await fileStatus(held), 409);
      assert.equal(result.error.code, 'PENDING_LEARNING_REVIEW');
    }
    short = await move(short, 'educational-review');
    assert.equal((await change(short, 'approved', manager, workflowNote)).status, 403);
    assert.equal((await change(short, 'approved')).status, 422);
    short = await move(short, 'translation-review', manager);
    short = await move(short, 'approved', admin, workflowNote);
    assert.ok(short.reviewedAt);
    assert.equal(short.reviewNote, workflowNote);
    assert.equal((await change(short, 'published')).status, 422);
    await publishFile(captions);
    portrait = await publishFile(portrait);
    short = await move(short, 'published');
    assert.equal((await request(publicPortrait)).status, 200);
    assert.equal((await fileStatus(portrait, 'archived')).status, 409);
    const listedShorts = await expectJson<{ items: { slug: string }[] }>(await request('/shorts?language=fa-AF&q=' + encodeURIComponent('شمارش')));
    assert.deepEqual(listedShorts.items.map(item => item.slug), [short.slug]);

    let video = await create({ ...videoInput, aiOrigin: 'ai-assisted', aiTool: 'Offline production fixture',
      aiNotes: 'Private preparation notes ' + suffix }, manager);
    assert.equal((await request('/videos/' + video.slug)).status, 404);
    const updatePayload = { ...videoInput, aiOrigin: video.aiOrigin, aiTool: video.aiTool, aiNotes: video.aiNotes, version: video.version };
    const changed = await Promise.all([
      request(adminPath + '/' + video.id, 'PUT', manager, updatePayload),
      request(adminPath + '/' + video.id, 'PUT', manager, updatePayload),
    ]);
    assert.deepEqual(changed.map(response => response.status).sort(), [200, 409]);
    video = (await expectJson<{ item: LearningMediaRecord }>(changed.find(response => response.ok)!)).item;
    video = await move(await move(video, 'educational-review'), 'approved', admin, workflowNote);
    video = await move(video, 'published');
    const videoPath = '/videos/' + video.slug;
    const watched = await expectJson<{ item: Record<string, unknown>; media: Record<string, unknown>;
      related: { course: { slug: string }; lesson: { slug: string } } }>(await request(videoPath));
    assert.equal(watched.item.aiOrigin, 'ai-assisted');
    assert.equal(watched.item.aiTool, video.aiTool);
    assert.equal(watched.media.license, 'CC0-1.0');
    assert.equal(watched.related.course.slug, related.slug);
    assert.equal(watched.related.lesson.slug, 'compare');
    for (const key of ['reviewNote', 'reviewedAt', 'reviewerId', 'aiNotes', 'version']) assert.equal(key in watched.item, false);
    for (const key of ['storageKey', 'originalName', 'uploaderId', 'sha256']) assert.equal(key in watched.media, false);
    assert.equal((await request('/shorts/' + video.slug)).status, 404);
    assert.equal((await request('/ai-learning/' + video.slug)).status, 200);

    let graphic = await publishFile(await upload('image', 'graphic.png', await fixture('thumbnail.png')));
    let resource = await create({ ...common, kind: 'resource', mediaId: graphic.id, slug: 'diagram-' + suffix,
      aiOrigin: 'ai-generated', aiTool: 'Offline creator fixture', aiNotes: 'Private production detail',
      translations: translations('Counting diagram') });
    resource = await move(await move(resource, 'educational-review'), 'approved', admin, workflowNote);
    graphic = (await expectJson<{ item: MediaAsset }>(await fileStatus(graphic, 'archived'))).item;
    graphic = (await expectJson<{ item: MediaAsset }>(await request('/admin/media/' + graphic.id + '/status', 'PATCH',
      admin, { status: 'draft', version: graphic.version }))).item;
    await publishFile(graphic);
    const outdatedReview = await expectJson<{ error: { code: string } }>(await change(resource, 'published'), 422);
    assert.equal(outdatedReview.error.code, 'REVIEW_REQUIRED');
    resource = await move(resource, 'draft');
    resource = await move(await move(resource, 'educational-review'), 'approved', admin, workflowNote);
    resource = await move(resource, 'published');
    const collection = await expectJson<{ items: { slug: string }[] }>(await request('/ai-learning?categoryId=' + categoryId));
    assert.deepEqual(new Set(collection.items.map(item => item.slug)), new Set([video.slug, resource.slug]));
    assert.equal((await request('/ai-learning/' + short.slug)).status, 404);
    assert.equal((await request('/videos/' + resource.slug)).status, 404);

    assert.equal((await request('/admin/courses/' + related.id + '/status', 'PATCH', admin,
      { status: 'archived', version: related.version })).status, 200);
    const afterCourse = await expectJson<{ related: { course: null; lesson: null } }>(await request(videoPath));
    assert.deepEqual(afterCourse.related, { course: null, lesson: null });
    short = await move(short, 'archived');
    assert.equal((await request('/shorts/' + short.slug)).status, 404);
    assert.equal((await fileStatus(portrait, 'archived')).status, 200);
    assert.equal((await request(adminPath + '/' + short.id, 'DELETE', admin, { confirm: true, version: short.version })).status, 204);
    assert.equal((await request(adminPath + '/' + short.id, 'GET', admin)).status, 404);

    const constraints = await db.query<{ total: number }>(
      "SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='learning_media'",
      { type: QueryTypes.SELECT });
    assert.ok(Number(constraints[0]?.total) > 4);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      if (migrated) {
        for (const id of itemIds) {
          await db.query("DELETE FROM media_references WHERE owner_type IN ('learning-media','learning-media-review') AND owner_id=$id", { bind: { id } });
          await db.query('DELETE FROM learning_media WHERE id=$id', { bind: { id } });
        }
        if (relatedCourseId) await db.query('DELETE FROM courses WHERE id=$id', { bind: { id: relatedCourseId } });
        for (const id of [...mediaIds].reverse()) {
          await db.query('DELETE FROM media_links WHERE parent_id=$id OR asset_id=$id', { bind: { id } });
          await db.query('DELETE FROM media_assets WHERE id=$id', { bind: { id } });
        }
        await db.query('DELETE FROM users WHERE login IN ($reviewer,$author,$student)', { bind: { reviewer, author, student } });
        await db.query('DELETE FROM roles WHERE code=$role', { bind: { role } });
      }
    } finally {
      await db.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
