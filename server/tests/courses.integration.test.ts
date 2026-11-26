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
import { migrateEducation } from '../src/modules/education/migration';
import { createEducationStore } from '../src/modules/education/store';
import { createMediaFiles } from '../src/modules/media/files';
import { createMediaRoutes } from '../src/modules/media/routes';
import { migrateMedia } from '../src/modules/media/migration';
import { createMediaStore } from '../src/modules/media/store';
import type { MediaAsset, MediaKind } from '../src/modules/media/contract';
import type { CourseInput, CourseRecord, CourseStatus, CourseSummary, LessonInput } from '../src/modules/courses/contract';
import { createCourseRoutes } from '../src/modules/courses/routes';
import { migrateCourses } from '../src/modules/courses/migration';
import { createCourseStore } from '../src/modules/courses/store';
import { newCourse } from '../src/modules/courses/validation';
import { migrateCurriculumAuthoring } from '../src/modules/courses/authoringMigration';
import { createQuizStore } from '../src/modules/quizzes/store';
import { fixtureCredit, migrateAuthoringFixtures } from './fixtures/curriculum';

const origin = 'https://learning.example.test';
const prefix = '/admin/courses';
const localized = (title: string) => [{ locale: 'en', title }];
const overview = (title: string) => [{ locale: 'en', title, description: 'A free course.',
  objectives: 'Understand the material.', prerequisites: 'None.' }];

function makeLesson(slug: string, kind: LessonInput['kind'], mediaId: string | null = null): LessonInput {
  return { slug, kind, mediaId, translations: [{ locale: 'en', title: slug, description: 'Lesson overview', body: 'Practice text' }], resources: [] };
}

test('course validation normalizes language and rejects duplicate lessons and reserved properties', () => {
  const draft = { slug: 'Practice', translations: [{ locale: 'fa-af', title: 'تمرین' }], chapters: [] };
  const { error, value } = newCourse.validate(draft);
  assert.equal(error, undefined);
  assert.equal(value.slug, 'practice');
  assert.equal(value.translations[0].locale, 'fa-AF');
  assert.ok(newCourse.validate({ ...draft, status: 'published' }).error);
  const lesson = makeLesson('repeat', 'text');
  assert.ok(newCourse.validate({ ...draft, chapters: [
    { translations: localized('First'), lessons: [lesson] }, { translations: localized('Second'), lessons: [lesson] },
  ] }).error);
});

function freshWav() {
  const bytes = Buffer.alloc(1644);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  randomBytes(16).copy(bytes, 48);
  return bytes;
}

test('published curriculum flows from course administration to free guest lessons on MySQL', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const config = readSettings(process.env).database;
  assert.equal(config.host, '127.0.0.1');
  assert.match(config.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(config.port, 3306);
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'womenriseafg-course-test-')));
  const db = createDatabase(config);
  const identity = createIdentityStore(db);
  const education = createEducationStore(db);
  const media = createMediaStore(db);
  const store = createCourseStore(db);
  const quizzes = createQuizStore(db);
  const logger = pino({ level: 'silent' });
  const options = { production: true, origins: [origin], logger };
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options),
    mediaRoutes: createMediaRoutes(media, createMediaFiles(root, 131072), identity, options),
    courseRoutes: createCourseRoutes(store, media, identity, options),
  }));
  const key = randomBytes(5).toString('hex');
  const adminName = 'course.' + key + '.admin';
  const learnerName = 'course.' + key + '.guest';
  const staffName = 'course.' + key + '.staff';
  const role = 'course-qa-' + key;
  const password = 'Course fixture password ' + key;
  const createdMedia: string[] = [];
  const createdCourses: string[] = [];
  const createdTaxonomy: string[] = [];
  const createdQuizzes: string[] = [];
  const createdQuestions: string[] = [];
  let ready = false;

  try {
    await migrateIdentity(db);
    await migrateEducation(db);
    await migrateMedia(db);
    const applied = await Promise.all([migrateCourses(db), migrateCourses(db)]);
    assert.ok(applied.filter(Boolean).length <= 1);
    assert.equal(await migrateCourses(db), false);
    await migrateAuthoringFixtures(db);
    assert.equal(await migrateCurriculumAuthoring(db), false);
    ready = true;
    await db.query('INSERT INTO roles (code) VALUES ($role)', { bind: { role } });
    await db.query("INSERT INTO role_permissions (role_code,permission_code) VALUES ($role,'admin:access'),($role,'course:manage')",
      { bind: { role } });
    const hash = await hashPassword(password);
    const adminUser = await identity.createStudent(adminName, hash);
    const staff = await identity.createStudent(staffName, hash);
    await identity.createStudent(learnerName, hash);
    await db.query("INSERT INTO user_roles (user_id,role_code) VALUES ($admin,'admin'),($staff,$role)",
      { bind: { admin: adminUser.id, staff: staff.id, role } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    function request(route: string, method = 'GET', cookie?: string, data?: object, otherOrigin = origin) {
      const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;
      return fetch(base + route, {
        method, body, headers: { 'x-forwarded-proto': 'https', ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { Origin: otherOrigin } : {}), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) },
      });
    }
    async function signIn(username: string, endpoint = 'admin-login') {
      const response = await request('/auth/' + endpoint, 'POST', undefined, { username, password });
      assert.equal(response.status, 200);
      return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    }
    const admin = await signIn(adminName);
    const learner = await signIn(learnerName, 'login');
    const author = await signIn(staffName);
    const course = async (response: Response, expected = 200) => {
      const body = await response.json() as { item: CourseRecord };
      assert.equal(response.status, expected, JSON.stringify(body));
      return body.item;
    };
    async function create(input: CourseInput) {
      const item = await course(await request(prefix, 'POST', admin, input), 201);
      createdCourses.push(item.id);
      return item;
    }
    async function status(item: CourseRecord, next: CourseStatus, actor = admin) {
      return course(await request(prefix + '/' + item.id + '/status', 'PATCH', actor, { status: next, version: item.version }));
    }
    async function upload(kind: MediaKind, name: string, bytes: Buffer, downloadAllowed: boolean) {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(bytes)]), name);
      form.set('metadata', JSON.stringify({ kind, title: name + ' ' + key, license: 'CC0-1.0',
        source: 'Generated course test file', language: 'en', downloadAllowed }));
      const created = await request('/admin/media', 'POST', admin, form);
      const body = await created.json() as { item: MediaAsset };
      assert.equal(created.status, 201, JSON.stringify(body));
      createdMedia.push(body.item.id);
      const published = await request('/admin/media/' + body.item.id + '/status', 'PATCH', admin,
        { version: body.item.version, status: 'published' });
      assert.equal(published.status, 200);
      return (await published.json() as { item: MediaAsset }).item;
    }

    assert.equal((await request(prefix)).status, 401);
    assert.equal((await request(prefix, 'GET', learner)).status, 403);
    const original = await readFile(path.join(__dirname, 'fixtures', 'media', 'lesson.mp4'));
    const extraBox = Buffer.alloc(24);
    extraBox.writeUInt32BE(24);
    extraBox.write('free', 4);
    randomBytes(16).copy(extraBox, 8);
    const video = await upload('video', 'practice.mp4', Buffer.concat([original, extraBox]), false);
    const audio = await upload('audio', 'practice.wav', freshWav(), false);
    const pdf = await upload('pdf', 'practice.pdf', await readFile(path.join(__dirname, 'fixtures', 'media', 'lesson-handout.pdf')), true);
    assert.equal((await request(prefix + '/assets/' + video.id, 'GET', author)).status, 200);
    assert.equal((await request('/admin/media', 'GET', author)).status, 403);

    const common = { subjectId: null, levelId: null, gradeId: null, thumbnailId: null, estimatedMinutes: 15,
      instructor: '', tagIds: [], relatedCourseIds: [], provenance: fixtureCredit };
    const restricted = await upload('attachment', 'practice.txt', Buffer.from('Restricted course fixture ' + key), false);
    const inaccessible = await request(prefix, 'POST', admin, {
      ...common, slug: 'restricted-' + key, translations: overview('Restricted resource'),
      chapters: [{ translations: localized('Practice'), lessons: [{
        ...makeLesson('read', 'text'), resources: [{ mediaId: restricted.id, label: 'Unavailable attachment' }],
      }] }],
    });
    assert.equal(inaccessible.status, 422);
    assert.equal((await inaccessible.json() as { error: { code: string } }).error.code, 'RESOURCE_DOWNLOAD_FORBIDDEN');
    async function publishedTaxonomy(kind: 'categories' | 'subjects', categoryId?: string) {
      let item = await education.create(kind, { slug: 'course-qa-' + key + '-' + kind, categoryId,
        translations: [{ locale: 'en', name: 'Course taxonomy ' + key, description: '' }] });
      createdTaxonomy.push(item.id);
      for (const status of ['educational-review', 'approved', 'published'] as const) {
        item = await education.changeStatus(kind, item.id, status, item.version);
      }
      return item;
    }
    const category = await publishedTaxonomy('categories');
    const subject = await publishedTaxonomy('subjects', category.id);
    let related = await create({ ...common, slug: 'related-' + key, translations: overview('Follow-up reading'),
      chapters: [{ translations: localized('Further reading'), lessons: [makeLesson('read-more', 'text')] }] });
    related = await status(await status(await status(related, 'educational-review'), 'approved'), 'published');

    const lessons = [
      makeLesson('read', 'text'), makeLesson('watch', 'video', video.id),
      makeLesson('listen', 'audio', audio.id), makeLesson('handout', 'pdf', pdf.id),
    ];
    for (const lesson of lessons) lesson.translations[0]!.body += 'x'.repeat(8800);
    lessons[0]!.resources = [{ mediaId: pdf.id, label: 'Optional handout' }];
    const input = { ...common, slug: 'full-course-' + key, instructor: 'Course team', relatedCourseIds: [related.id], subjectId: subject.id,
      translations: [...overview('Practice course ' + key),
        { locale: 'fa-AF', title: 'تمرین مطالعه', description: 'آموزش رایگان', objectives: '', prerequisites: '' }],
      chapters: [{ translations: localized('First chapter'), lessons: lessons.slice(0, 2) },
        { translations: localized('Second chapter'), lessons: lessons.slice(2) }],
    };
    assert.ok(JSON.stringify(input).length > 32768);
    assert.equal((await request(prefix, 'POST', admin, input, 'https://different.example.test')).status, 403);
    const oversized = { ...input, padding: 'x'.repeat(512 * 1024) };
    assert.equal((await request(prefix, 'POST', undefined, oversized)).status, 401);
    assert.equal((await request(prefix, 'POST', admin, oversized)).status, 413);
    let record = await create(input);
    const publicPath = '/courses/' + record.slug;
    assert.equal((await request(publicPath)).status, 404);
    assert.equal((await request(publicPath + '/lessons/read')).status, 404);
    assert.equal((await request(prefix + '/' + record.id + '/status', 'PATCH', admin, { status: 'published', version: record.version })).status, 409);

    const first = record.chapters[0]!;
    const originalIds = first.lessons.map(lesson => lesson.id);
    const reordered = { ...input, chapters: [{ ...first, lessons: [...first.lessons].reverse() }, record.chapters[1]!] };
    const endpoint = prefix + '/' + record.id;
    const previousVersion = record.version;
    const concurrent = await Promise.all([
      request(endpoint, 'PUT', author, { ...reordered, version: previousVersion }),
      request(endpoint, 'PUT', author, { ...reordered, version: previousVersion }),
    ]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    record = await course(concurrent.find(response => response.ok)!);
    assert.deepEqual(record.chapters[0]?.lessons.map(item => item.id), originalIds.reverse());
    assert.equal((await request(endpoint, 'PUT', author, { ...reordered, version: previousVersion })).status, 409);
    record = await status(await status(await status(record, 'educational-review', author), 'translation-review', author), 'approved', author);
    assert.equal((await request(endpoint + '/status', 'PATCH', author, { status: 'published', version: record.version })).status, 403);
    record = await status(record, 'published');

    const list = await request('/courses?language=fa-AF&q=' + encodeURIComponent('تمرین'));
    assert.equal(list.status, 200);
    const filtered = await list.json() as { items: { id: string; lessonCount: number }[] };
    assert.ok(filtered.items.some(item => item.id === record.id && item.lessonCount === 4));
    const courseDetail = await request(publicPath);
    assert.equal(courseDetail.status, 200);
    const detail = await courseDetail.json() as { course: CourseRecord; related: { slug: string }[] };
    assert.deepEqual(detail.related.map(item => item.slug), [related.slug]);
    assert.equal(detail.course.subjectId, subject.id);
    assert.equal('body' in detail.course.chapters[0]!.lessons[0]!.translations[0]!, false);
    assert.equal('version' in detail.course, false);
    const subjectFilter = '/courses?subjectId=' + subject.id;
    const subjectResults = async (path: string) => {
      const response = await request(path);
      assert.equal(response.status, 200);
      return (await response.json() as { items: CourseSummary[] }).items;
    };
    assert.deepEqual((await subjectResults(subjectFilter)).map(item => item.id), [record.id]);
    await education.changeStatus('categories', category.id, 'archived', category.version);
    assert.deepEqual(await subjectResults(subjectFilter), []);
    assert.equal((await subjectResults('/courses?q=' + record.slug))[0]?.subjectId, null);
    const afterTaxonomyArchive = await request(publicPath);
    assert.equal(afterTaxonomyArchive.status, 200);
    assert.equal((await afterTaxonomyArchive.json() as { course: CourseRecord }).course.subjectId, null);
    for (const [slug, before, next, mediaId] of [
      ['watch', null, 'read', video.id], ['read', 'watch', 'listen', null],
      ['listen', 'read', 'handout', audio.id], ['handout', 'listen', null, pdf.id],
    ] as const) {
      const result = await request(publicPath + '/lessons/' + slug);
      assert.equal(result.status, 200);
      const data = await result.json() as { previous: string | null; next: string | null;
        lesson: LessonInput; media: { id: string } | null; resources: { media: { downloadAllowed: boolean } }[] };
      assert.equal(data.previous, before);
      assert.equal(data.next, next);
      assert.equal(data.media?.id ?? null, mediaId);
      assert.ok(data.lesson.translations[0]!.body.startsWith('Practice text'));
      if (slug === 'read') assert.equal(data.resources[0]?.media.downloadAllowed, true);
    }
    assert.equal((await request('/media/' + video.id + '/file')).status, 200);
    assert.equal((await request('/admin/media/' + video.id + '/status', 'PATCH', admin,
      { status: 'archived', version: video.version })).status, 409);
    record = await status(record, 'archived');
    assert.equal((await request(publicPath)).status, 404);
    assert.equal((await request(publicPath + '/lessons/watch')).status, 404);
    assert.equal((await request(endpoint, 'DELETE', admin, { confirm: true, version: record.version })).status, 204);
    assert.equal((await request('/admin/media/' + video.id + '/status', 'PATCH', admin,
      { status: 'archived', version: video.version })).status, 200);

    const diagram = await upload('image', 'diagram.png', await readFile(path.join(__dirname, 'fixtures', 'media', 'thumbnail.png')), false);
    const question = await quizzes.createQuestion({
      kind: 'single-choice', correctOptions: [0], provenance: fixtureCredit,
      translations: [{ locale: 'en', prompt: 'Count the shapes', options: ['One', 'Two'], acceptedAnswers: [], explanation: '' }],
    });
    createdQuestions.push(question.id);
    let quiz = await quizzes.createQuiz({
      slug: 'standalone-' + key, courseId: null, passingScore: 60, questionIds: [question.id], provenance: fixtureCredit,
      translations: [{ locale: 'en', title: 'Study quiz', description: 'Check your understanding.' }],
    });
    createdQuizzes.push(quiz.id);
    for (const next of ['educational-review', 'approved', 'published'] as const) {
      quiz = await quizzes.changeStatus(quiz.id, next, quiz.version);
    }
    const imageLesson = makeLesson('diagram', 'image', diagram.id);
    const language = imageLesson.translations[0]!;
    imageLesson.translations[0] = { ...language, imageAlt: 'One square on a blue background' };
    const authored = { ...common, slug: 'authoring-' + key, provenance: { ...fixtureCredit,
      origin: 'ai-assisted' as const, tool: 'Fixture method', notes: 'Private review notes' },
    translations: overview('Image and quiz'), chapters: [{ translations: localized('Study'),
      lessons: [imageLesson, { ...makeLesson('check', 'quiz'), quizId: quiz.id }] }] };
    let authoredCourse = await create({ ...authored, provenance: null });
    authoredCourse = await status(authoredCourse, 'educational-review');
    const authoredAdmin = prefix + '/' + authoredCourse.id;
    const incomplete = await request(authoredAdmin + '/status', 'PATCH', admin, {
      status: 'approved', version: authoredCourse.version,
    });
    assert.equal(incomplete.status, 422);
    assert.equal((await incomplete.json() as { error: { code: string } }).error.code, 'INCOMPLETE_PROVENANCE');
    authoredCourse = await course(await request(authoredAdmin, 'PUT', admin, { ...authored, version: authoredCourse.version }));
    authoredCourse = await status(await status(authoredCourse, 'approved'), 'published');
    const detailPath = '/courses/' + authoredCourse.slug;
    const publicImage = await request(detailPath + '/lessons/diagram');
    assert.equal(publicImage.status, 200);
    const imageBody = await publicImage.text();
    assert.match(imageBody, /One square on a blue background/);
    assert.doesNotMatch(imageBody, /Private review notes/);
    const publicQuiz = await request(detailPath + '/lessons/check');
    assert.equal(publicQuiz.status, 200);
    assert.equal((await publicQuiz.json() as { lesson: { quizSlug: string } }).lesson.quizSlug, quiz.slug);
    await assert.rejects(quizzes.changeStatus(quiz.id, 'archived', quiz.version), { code: 'QUIZ_IN_USE' });
    authoredCourse = await status(authoredCourse, 'archived');
    assert.equal((await quizzes.changeStatus(quiz.id, 'archived', quiz.version)).status, 'archived');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      if (ready) {
        for (const id of createdCourses) {
          await db.query("DELETE FROM media_references WHERE owner_type='course' AND owner_id=$id", { bind: { id } });
        }
        for (const id of [...createdCourses].reverse()) await db.query('DELETE FROM courses WHERE id=$id', { bind: { id } });
        for (const id of createdQuizzes) await db.query('DELETE FROM quizzes WHERE id=$id', { bind: { id } });
        for (const id of createdQuestions) await db.query('DELETE FROM quiz_questions WHERE id=$id', { bind: { id } });
        for (const id of [...createdTaxonomy].reverse()) await db.query('DELETE FROM education_entries WHERE id=$id', { bind: { id } });
        for (const id of createdMedia) await db.query('DELETE FROM media_assets WHERE id=$id', { bind: { id } });
        await db.query('DELETE FROM users WHERE login IN ($admin,$learner,$staff)', {
          bind: { admin: adminName, learner: learnerName, staff: staffName },
        });
        await db.query('DELETE FROM roles WHERE code=$role', { bind: { role } });
      }
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  }
});
