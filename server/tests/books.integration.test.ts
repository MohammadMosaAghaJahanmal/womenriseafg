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
import { createApp } from '../src/app';
import { createDatabase } from '../src/config/database';
import { readSettings } from '../src/config/environment';
import { migrateIdentity } from '../src/identity/migration';
import { createIdentityStore } from '../src/identity/store';
import { hashPassword } from '../src/modules/auth/passwords';
import { createAuthRoutes } from '../src/modules/auth/routes';
import { migrateBooks } from '../src/modules/books/migration';
import { createBookRoutes } from '../src/modules/books/routes';
import { createBookStore } from '../src/modules/books/store';
import type { BookInput, BookRecord } from '../src/modules/books/contract';
import { newBook } from '../src/modules/books/validation';
import { migrateCourses } from '../src/modules/courses/migration';
import { migrateEducation } from '../src/modules/education/migration';
import { createEducationRoutes } from '../src/modules/education/routes';
import { createEducationStore } from '../src/modules/education/store';
import type { EducationStatus } from '../src/modules/education/contract';
import { migrateLearningMedia } from '../src/modules/learning-media/migration';
import { createMediaFiles } from '../src/modules/media/files';
import { migrateMedia } from '../src/modules/media/migration';
import { createMediaRoutes } from '../src/modules/media/routes';
import { createMediaStore } from '../src/modules/media/store';
import type { MediaAsset, MediaKind, MediaStatus } from '../src/modules/media/contract';

const origin = 'https://learning.example.test';
const prefix = '/admin/books';
const selectedTranslations = (title: string) => [{ locale: 'en', title, description: 'A practice booklet for learners.' }];
const fixture = (file: string) => readFile(path.join(__dirname, 'fixtures', 'media', file));

test('book input normalizes locale and rejects reserved properties, URLs and duplicate translations', () => {
  const draft = { slug: 'Book-Title', contentLanguage: 'fa-af', translations: [{ locale: 'fa-af', title: 'راهنما' }] };
  const { error, value } = newBook.validate(draft);
  assert.equal(error, undefined);
  assert.equal(value.slug, 'book-title');
  assert.equal(value.contentLanguage, 'fa-AF');
  assert.equal(value.translations[0].locale, 'fa-AF');
  assert.ok(newBook.validate({ ...draft, downloadAllowed: true }).error);
  assert.ok(newBook.validate({ ...draft, pdfId: 'https://example.test/book.pdf' }).error);
  assert.ok(newBook.validate({ ...draft, translations: [...draft.translations, { locale: 'fa-AF', title: 'کتاب' }] }).error);
});

function largePdf(mark: string) {
  const stream = 'BT /F1 20 Tf 42 728 Td (Read the workbook) Tj ET\n' + ('%' + mark + 'x'.repeat(980) + '\n').repeat(4300);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream',
  ];
  let content = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const position = content.length;
    content += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return position.toString().padStart(10, '0') + ' 00000 n \n';
  });
  const xref = content.length;
  return Buffer.from(content + 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('') +
    'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n', 'ascii');
}

test('reviewed books support guest PDF ranges and only per-file permitted downloads', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const config = readSettings(process.env).database;
  assert.equal(config.host, '127.0.0.1');
  assert.match(config.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(config.port, 3306);
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'womenriseafg-book-test-')));
  const db = createDatabase(config);
  const identity = createIdentityStore(db);
  const media = createMediaStore(db);
  const files = createMediaFiles(root, 8 * 1024 * 1024);
  const books = createBookStore(db);
  const logger = pino({ level: 'silent' });
  const options = { production: true, origins: [origin], logger };
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options),
    educationRoutes: createEducationRoutes(createEducationStore(db), identity, options),
    mediaRoutes: createMediaRoutes(media, files, identity, options),
    bookRoutes: createBookRoutes(books, media, files, identity, options),
  }));
  const mark = randomBytes(5).toString('hex');
  const reviewer = 'book.' + mark + '.reviewer';
  const author = 'book.' + mark + '.staff';
  const student = 'book.' + mark + '.learner';
  const role = 'book-review-fixture-' + mark;
  const password = 'Digital library fixture password ' + mark;
  const mediaIds: string[] = [];
  const bookIds: string[] = [];
  let ready = false;

  try {
    await migrateIdentity(db);
    await migrateEducation(db);
    await migrateMedia(db);
    await migrateCourses(db);
    await migrateLearningMedia(db);
    const migrated = await Promise.all([migrateBooks(db), migrateBooks(db)]);
    assert.ok(migrated.filter(Boolean).length <= 1);
    assert.equal(await migrateBooks(db), false);
    ready = true;
    await db.query('INSERT INTO roles (code) VALUES ($role)', { bind: { role } });
    await db.query("INSERT INTO role_permissions (role_code,permission_code) VALUES ($role,'admin:access'),($role,'book:manage')",
      { bind: { role } });
    const passwordHash = await hashPassword(password);
    const reviewerAccount = await identity.createStudent(reviewer, passwordHash);
    const authorAccount = await identity.createStudent(author, passwordHash);
    await identity.createStudent(student, passwordHash);
    await db.query("INSERT INTO user_roles (user_id,role_code) VALUES ($reviewer,'admin'),($author,$role)",
      { bind: { reviewer: reviewerAccount.id, author: authorAccount.id, role } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    function request(route: string, method = 'GET', cookie?: string, values?: object, headers: Record<string, string> = {}) {
      const body = values instanceof FormData ? values : values ? JSON.stringify(values) : undefined;
      return fetch(base + route, { method, body, headers: {
        'x-forwarded-proto': 'https', ...(cookie ? { Cookie: cookie } : {}), ...(body ? { Origin: origin } : {}),
        ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...headers,
      } });
    }
    async function checked<T>(response: Response, status = 200) {
      const value = await response.json() as T;
      assert.equal(response.status, status, JSON.stringify(value));
      return value;
    }
    async function login(username: string, endpoint = 'admin-login') {
      const response = await request('/auth/' + endpoint, 'POST', undefined, { username, password });
      assert.equal(response.status, 200);
      return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    }
    const admin = await login(reviewer);
    const manager = await login(author);
    const learner = await login(student, 'login');
    function form(kind: MediaKind, name: string, data: Buffer, downloadAllowed = false) {
      const body = new FormData();
      body.set('file', new Blob([new Uint8Array(data)]), name);
      body.set('metadata', JSON.stringify({ kind, title: name + ' ' + mark, license: 'CC0-1.0',
        source: 'Original isolated test document', author: 'Workbook author', downloadAllowed }));
      return body;
    }
    async function upload(kind: MediaKind, name: string, data: Buffer, downloadAllowed = false) {
      const { item } = await checked<{ item: MediaAsset }>(
        await request('/admin/media', 'POST', admin, form(kind, name, data, downloadAllowed)), 201);
      mediaIds.push(item.id);
      return item;
    }
    const changeFile = (item: MediaAsset, status: MediaStatus = 'published') =>
      request('/admin/media/' + item.id + '/status', 'PATCH', admin, { status, version: item.version });
    async function publishFile(item: MediaAsset) {
      return (await checked<{ item: MediaAsset }>(await changeFile(item))).item;
    }
    const change = (item: BookRecord, status: EducationStatus, actor = admin, reviewNote = '') =>
      request(prefix + '/' + item.id + '/status', 'PATCH', actor, { status, version: item.version, reviewNote });
    const move = async (item: BookRecord, status: EducationStatus, reviewNote = '') =>
      (await checked<{ item: BookRecord }>(await change(item, status, admin, reviewNote))).item;
    async function create(input: BookInput, actor = admin) {
      const { item } = await checked<{ item: BookRecord }>(await request(prefix, 'POST', actor, input), 201);
      bookIds.push(item.id);
      return item;
    }
    const taxonomy = async (kind: string) => (await checked<{ items: { id: string }[] }>(await request('/education/' + kind))).items[0]!.id;
    const [categoryId, levelId, gradeId] = await Promise.all([taxonomy('categories'), taxonomy('levels'), taxonomy('grades')]);
    assert.equal((await request(prefix)).status, 401);
    assert.equal((await request(prefix, 'GET', learner)).status, 403);
    const invalid = await request('/admin/media', 'POST', admin, form('pdf', 'invalid.pdf', Buffer.from('Invalid file')));
    assert.equal(invalid.status, 400);
    const smallBytes = await fixture('lesson-handout.pdf');
    const bigBytes = largePdf(mark);
    assert.ok(bigBytes.length > 4 * 1024 * 1024);
    let small = await upload('pdf', 'reader-guide.pdf', smallBytes, true);
    const big = await publishFile(await upload('pdf', 'workbook.pdf', bigBytes));
    let cover = await upload('image', 'cover.png', await fixture('thumbnail.png'));
    const baseInput = { categoryId, levelId, gradeId, contentLanguage: 'en',
      author: 'Workbook author', publisher: 'Learning Team', publicationYear: 2026, edition: 'First edition', coverId: null };
    const guideInput = { ...baseInput, slug: 'guide-' + mark, pdfId: small.id, coverId: cover.id,
      translations: [...selectedTranslations('Quick guide'), { locale: 'fa-AF', title: 'راهنمای مطالعه', description: 'برای یادگیری' }] };
    assert.equal((await request(prefix, 'POST', admin, guideInput, { Origin: 'https://other.example.test' })).status, 403);
    assert.equal((await request(prefix + '/assets?kind=pdf&status=draft', 'GET', manager)).status, 403);
    assert.equal((await request(prefix + '/assets/' + small.id, 'GET', manager)).status, 404);
    assert.equal((await request(prefix, 'POST', manager, guideInput)).status, 403);
    assert.equal((await request(prefix, 'POST', admin, { ...guideInput, pdfId: cover.id })).status, 422);
    let guide = await create(guideInput);
    const pathGuide = '/books/' + guide.slug;
    const guideFile = pathGuide + '/file';
    assert.equal((await request(pathGuide)).status, 404);
    assert.equal((await request(guideFile)).status, 404);
    assert.equal((await request(guideFile + '?download=true')).status, 404);
    assert.equal((await request('/media/' + small.id + '/file')).status, 404);
    assert.equal((await request('/admin/media/' + small.id + '/file', 'HEAD', admin)).status, 200);
    for (const file of [small, cover]) {
      const held = await checked<{ error: { code: string } }>(await changeFile(file), 409);
      assert.equal(held.error.code, 'PENDING_LEARNING_REVIEW');
    }
    guide = await move(guide, 'educational-review');
    assert.equal((await change(guide, 'approved', manager, 'Rights checked.')).status, 403);
    assert.equal((await change(guide, 'approved')).status, 422);
    guide = await move(guide, 'translation-review');
    const reviewNote = 'Checked author, license, cover rights, and document legibility.';
    guide = await move(guide, 'approved', reviewNote);
    assert.equal(guide.reviewNote, reviewNote);
    assert.ok(guide.reviewedAt);
    const draftFiles = await checked<{ error: { code: string } }>(await change(guide, 'published'), 422);
    assert.equal(draftFiles.error.code, 'FILES_UNPUBLISHED');
    small = await publishFile(small);
    assert.equal((await change(guide, 'published')).status, 422);
    cover = await publishFile(cover);
    cover = (await checked<{ item: MediaAsset }>(await changeFile(cover, 'archived'))).item;
    cover = (await checked<{ item: MediaAsset }>(await changeFile(cover, 'draft'))).item;
    cover = await publishFile(cover);
    const staleReview = await checked<{ error: { code: string } }>(await change(guide, 'published'), 422);
    assert.equal(staleReview.error.code, 'REVIEW_REQUIRED');
    guide = await move(await move(guide, 'draft'), 'educational-review');
    guide = await move(guide, 'approved', reviewNote);
    guide = await move(guide, 'published');
    const info = (await checked<{ item: Record<string, unknown> }>(await request(pathGuide))).item;
    assert.equal(info.coverId, cover.id);
    assert.equal(info.contentLanguage, 'en');
    assert.equal(info.fileSizeBytes, smallBytes.length);
    assert.equal(info.license, 'CC0-1.0');
    for (const field of ['reviewNote', 'reviewedAt', 'reviewedBy', 'pdfId', 'version', 'storageKey']) assert.equal(field in info, false);
    const selection = await checked<{ items: BookRecord[] }>(
      await request('/books?language=en&categoryId=' + categoryId + '&levelId=' + levelId + '&q=' + encodeURIComponent('راهنمای')));
    assert.deepEqual(selection.items.map(item => item.id), [guide.id]);
    const actualLanguage = await checked<{ items: BookRecord[] }>(await request('/books?language=fa-AF&q=' + guide.slug));
    assert.equal(actualLanguage.items.length, 0);

    const download = await request(guideFile + '?download=true');
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), smallBytes);
    const inline = await request(guideFile, 'HEAD');
    assert.equal(inline.status, 200);
    assert.equal(inline.headers.get('content-type'), 'application/pdf');
    assert.equal(inline.headers.get('content-length'), String(smallBytes.length));
    assert.match(inline.headers.get('content-disposition') ?? '', /^inline/);
    assert.match(inline.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.equal(await inline.text(), '');

    let workbook = await create({ ...baseInput, slug: 'workbook-' + mark, pdfId: big.id,
      translations: selectedTranslations('Measurements workbook') }, manager);
    workbook = await move(await move(workbook, 'educational-review'), 'approved', reviewNote);
    workbook = await move(workbook, 'published');
    const bigFile = '/books/' + workbook.slug + '/file';
    const first = await request(bigFile, 'GET', undefined, undefined, { Range: 'bytes=0-65535' });
    assert.equal(first.status, 206);
    assert.equal(first.headers.get('content-range'), 'bytes 0-65535/' + bigBytes.length);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), bigBytes.subarray(0, 65536));
    const tail = await request(bigFile, 'GET', undefined, undefined, { Range: 'bytes=-512' });
    assert.equal(tail.status, 206);
    assert.deepEqual(Buffer.from(await tail.arrayBuffer()), bigBytes.subarray(-512));
    const failedRange = await request(bigFile, 'GET', undefined, undefined, { Range: 'bytes=99000000-' });
    assert.equal(failedRange.status, 416);
    assert.equal(failedRange.headers.get('content-range'), 'bytes */' + bigBytes.length);
    assert.equal((await request(bigFile + '?download=true')).status, 403);
    assert.equal((await changeFile(big, 'archived')).status, 409);
    assert.equal((await changeFile(cover, 'archived')).status, 409);
    const cached = await request(bigFile, 'GET', undefined, undefined, { 'If-None-Match': first.headers.get('etag')! });
    assert.equal(cached.status, 304);
    workbook = await move(workbook, 'archived');
    assert.equal((await request(bigFile, 'GET', undefined, undefined, { 'If-None-Match': first.headers.get('etag')! })).status, 404);
    assert.equal((await request(prefix + '/' + workbook.id, 'DELETE', admin, { version: workbook.version, confirm: true })).status, 204);
    assert.equal((await changeFile(big, 'archived')).status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      if (ready) {
        for (const id of bookIds) {
          await db.query("DELETE FROM media_references WHERE owner_type IN ('book','book-review') AND owner_id=$id", { bind: { id } });
          await db.query('DELETE FROM books WHERE id=$id', { bind: { id } });
        }
        for (const id of mediaIds) await db.query('DELETE FROM media_assets WHERE id=$id', { bind: { id } });
        await db.query('DELETE FROM users WHERE login IN ($reviewer,$author,$student)', { bind: { reviewer, author, student } });
        await db.query('DELETE FROM roles WHERE code=$role', { bind: { role } });
      }
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  }
});
