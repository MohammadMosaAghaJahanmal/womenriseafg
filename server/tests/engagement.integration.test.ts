import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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
import { migrateBooks } from '../src/modules/books/migration';
import { migrateCertificates } from '../src/modules/certificates/migration';
import { createCertificateRoutes } from '../src/modules/certificates/routes';
import type { CourseInput } from '../src/modules/courses/contract';
import { migrateCourses } from '../src/modules/courses/migration';
import { createCourseStore } from '../src/modules/courses/store';
import type { EditorialPath, SearchEntry } from '../src/modules/discovery/contract';
import { migrateDiscovery } from '../src/modules/discovery/migration';
import { createDiscoveryRoutes } from '../src/modules/discovery/routes';
import { createDiscoveryStore } from '../src/modules/discovery/store';
import { migrateEducation } from '../src/modules/education/migration';
import { migrateLearningMedia } from '../src/modules/learning-media/migration';
import { migrateMedia } from '../src/modules/media/migration';
import type { QuestionRecord, QuizRecord } from '../src/modules/quizzes/contract';
import { migrateQuizzes } from '../src/modules/quizzes/migration';
import { createQuizRoutes } from '../src/modules/quizzes/routes';
import { createQuizStore } from '../src/modules/quizzes/store';

test('Stage 9 MySQL workflows enforce review and grade guest attempts, search, paths, daily selection and certificate privacy', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const config = readSettings(process.env).database;
  assert.equal(config.host, '127.0.0.1');
  assert.match(config.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(config.port, 3306);
  const db = createDatabase(config);
  const identity = createIdentityStore(db);
  const courses = createCourseStore(db);
  const discovery = createDiscoveryStore(db);
  const origin = 'https://learning.example.test';
  const logger = pino({ level: 'silent' });
  const options = { origins: [origin], production: true, logger };
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options), quizRoutes: createQuizRoutes(createQuizStore(db), identity, options),
    discoveryRoutes: createDiscoveryRoutes(discovery, identity, options), certificateRoutes: createCertificateRoutes(db, courses, options),
  }));
  const token = randomBytes(5).toString('hex');
  const editorRole = 'stage9-editor-' + token;
  const adminName = 'stage9.' + token + '.admin';
  const editorName = 'stage9.' + token + '.editor';
  const password = 'Disposable learning password ' + token;
  const courseSlug = 'course-' + token;
  const quizSlug = 'quiz-' + token;
  const pathSlug = 'path-' + token;
  const createdQuestions: string[] = [];
  let originalDaily: Awaited<ReturnType<typeof discovery.dailySettings>> | undefined;
  let migrated = false;
  try {
    for (const migrate of [migrateIdentity, migrateEducation, migrateMedia, migrateCourses, migrateLearningMedia, migrateBooks]) {
      await migrate(db);
    }
    for (const migrate of [migrateQuizzes, migrateDiscovery, migrateCertificates]) {
      await migrate(db);
      assert.equal(await migrate(db), false);
    }
    migrated = true;
    await db.query('INSERT INTO roles (code) VALUES ($role)', { bind: { role: editorRole } });
    await db.query("INSERT INTO role_permissions (role_code, permission_code) VALUES ($role, 'admin:access'), ($role, 'quiz:manage'), ($role, 'discovery:manage')",
      { bind: { role: editorRole } });
    const hash = await hashPassword(password);
    const adminUser = await identity.createStudent(adminName, hash);
    const editorUser = await identity.createStudent(editorName, hash);
    await db.query("INSERT INTO user_roles (user_id, role_code) VALUES ($admin, 'admin'), ($editor, $role)",
      { bind: { admin: adminUser.id, editor: editorUser.id, role: editorRole } });
    const [subject] = await db.query<{ id: string; categoryId: string | null }>(
      "SELECT id, category_id AS categoryId FROM education_entries WHERE kind='subjects' AND status='published' AND category_id IS NOT NULL LIMIT 1",
      { type: QueryTypes.SELECT });
    assert.ok(subject?.categoryId);
    const title = 'Discovery fixture ' + token;
    const dari = 'کيميای آموزشی';
    const localized = [{ locale: 'en', title }, { locale: 'fa-AF', title: dari }];
    const courseInput: CourseInput = {
      slug: courseSlug, subjectId: subject.id, levelId: null, gradeId: null, thumbnailId: null, estimatedMinutes: null,
      instructor: '', tagIds: [], relatedCourseIds: [],
      translations: localized.map(copy => ({ ...copy, description: 'Review these skills.', objectives: '', prerequisites: '' })),
      chapters: [{ translations: localized, lessons: ['first', 'second'].map(slug => ({
        slug, kind: 'text', mediaId: null, resources: [],
        translations: localized.map(copy => ({
          ...copy, title: copy.title + ' ' + slug, body: 'Practice content excluded from search.', description: 'Practise these skills.',
        })),
      })) }],
    };
    let course = await courses.create(courseInput, adminUser.id);
    for (const next of ['educational-review', 'approved', 'published'] as const) {
      course = await courses.changeStatus(course.id, next, course.version);
    }
    const lessonIds = course.chapters[0]!.lessons.map(lesson => lesson.id);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    function request(route: string, method = 'GET', data?: object, cookie?: string, requestOrigin = origin) {
      return fetch(base + route, { method, headers: {
        'x-forwarded-proto': 'https', ...(cookie ? { Cookie: cookie } : {}),
        ...(data ? { Origin: requestOrigin, 'Content-Type': 'application/json' } : {}),
      }, body: data ? JSON.stringify(data) : undefined });
    }
    async function json<T>(response: Response, expected = 200): Promise<T> {
      const body: unknown = await response.json();
      assert.equal(response.status, expected, JSON.stringify(body));
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return body as T;
    }
    async function signIn(username: string) {
      const response = await request('/auth/admin-login', 'POST', { username, password });
      await json(response);
      return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    }
    const admin = await signIn(adminName);
    const editor = await signIn(editorName);
    await json(await request('/admin/quizzes/questions'), 401);
    await json(await request('/admin/discovery/paths'), 401);

    const questions: QuestionRecord[] = [];
    for (const [index, kind] of ['single-choice', 'multiple-choice', 'true-false', 'short-answer'].entries()) {
      const short = kind === 'short-answer';
      const question = { kind, correctOptions: short ? [] : kind === 'multiple-choice' ? [0, 2] : [0],
        translations: localized.map(copy => ({
          locale: copy.locale, prompt: copy.title + ' ' + index, options: short ? [] : kind === 'multiple-choice' ? ['A', 'B', 'C'] : ['A', 'B'],
          acceptedAnswers: short ? [copy.locale === 'en' ? 'a plant' : 'گیاه'] : [], explanation: 'Use the practice guide.',
        })) };
      const { item } = await json<{ item: QuestionRecord }>(await request('/admin/quizzes/questions', 'POST', question, editor), 201);
      createdQuestions.push(item.id);
      questions.push(item);
    }
    const quizInput = { slug: quizSlug, courseId: course.id, passingScore: 75,
      questionIds: questions.map(item => item.id), translations: localized.map(copy => ({ ...copy, description: 'Practice questions' })) };
    let { item: quiz } = await json<{ item: QuizRecord }>(await request('/admin/quizzes', 'POST', quizInput, editor), 201);
    await json(await request('/quizzes/' + quizSlug), 404);
    const quizAdmin = '/admin/quizzes/' + quiz.id;
    const originalQuizVersion = quiz.version;
    const statusQuiz = (status: string, cookie = admin) =>
      request(quizAdmin + '/status', 'PATCH', { status, version: quiz.version }, cookie);
    ({ item: quiz } = await json<{ item: QuizRecord }>(await statusQuiz('educational-review', editor)));
    await json(await statusQuiz('approved', editor), 403);
    ({ item: quiz } = await json<{ item: QuizRecord }>(await statusQuiz('approved')));
    ({ item: quiz } = await json<{ item: QuizRecord }>(await statusQuiz('published')));
    await json(await request('/admin/quizzes/questions/' + questions[0]!.id, 'DELETE', { version: 1, confirm: true }, editor), 409);
    const publicQuiz = await request('/quizzes/' + quizSlug);
    assert.equal(publicQuiz.headers.get('set-cookie'), null);
    const quizBody = await json<{ quiz: { questions: { id: string }[] } }>(publicQuiz);
    assert.deepEqual(quizBody.quiz.questions.map(value => value.id), quizInput.questionIds);
    assert.doesNotMatch(JSON.stringify(quizBody), /acceptedAnswers|correctOptions|explanation/);
    const attempt = { version: quiz.version, language: 'fa-AF', answers: questions.map((question, index) => ({
      questionId: question.id, options: index === 3 ? [] : index === 1 ? [2, 0] : [0], text: index === 3 ? ' گیاه ' : '',
    })) };
    const attemptRoute = '/quizzes/' + quizSlug + '/attempts';
    await json(await request(attemptRoute, 'POST', { ...attempt, version: originalQuizVersion }), 409);
    await json(await request(attemptRoute, 'POST', attempt, undefined, 'https://foreign.test'), 403);
    const passed = await json<{ scorePercent: number; passed: boolean; answers: { explanation: string }[] }>(await request(attemptRoute, 'POST', attempt));
    assert.equal(passed.scorePercent, 100);
    assert.equal(passed.passed, true);
    assert.equal(passed.answers[0]?.explanation, 'Use the practice guide.');
    const retake = await json<{ scorePercent: number; passed: boolean }>(await request(attemptRoute, 'POST', {
      ...attempt, answers: attempt.answers.map((value, index) => index === 3 ? { ...value, text: 'another response' }
        : index === 1 ? { ...value, options: [0] } : value),
    }));
    assert.equal(retake.scorePercent, 50);
    assert.equal(retake.passed, false);

    const searchQuery = new URLSearchParams({ q: 'كِيميای', language: 'fa-AF', kind: 'course', subjectId: subject.id, categoryId: subject.categoryId });
    interface Matches { items: SearchEntry[]; total: number }
    const found = await json<Matches>(await request('/search?' + searchQuery));
    assert.equal(found.items[0]?.id, course.id);
    assert.equal(found.items[0]?.locale, 'fa-AF');
    const suggestions = await json<Matches>(await request('/search/suggestions?' + new URLSearchParams({ q: 'كِيميای', language: 'fa-AF' })));
    assert.ok(suggestions.items.some(item => item.id === course.id));
    const paged = await json<Matches>(await request('/search?' + searchQuery + '&page=100&pageSize=1'));
    assert.deepEqual(paged, { items: [], total: found.total, page: 100, pageSize: 1 });
    const related = await json<Matches>(await request('/recommendations/course/' + course.id + '?language=fa-AF'));
    assert.ok(related.items.length > 0 && related.items.some(item => item.kind === 'lesson' || item.kind === 'quiz'));
    assert.ok(related.items.every(item => item.id !== course.id));
    const privateSearch = await json<Matches>(await request('/search?' + new URLSearchParams({ q: courseInput.chapters[0]!.lessons[0]!.translations[0]!.body })));
    assert.equal(privateSearch.total, 0);

    const activities = [{ kind: 'quiz', id: quiz.id }, { kind: 'lesson', id: lessonIds[0] }];
    const pathInput = { slug: pathSlug, subjectId: subject.id, levelId: null,
      translations: localized.map(copy => ({ ...copy, title: copy.title + ' Path', description: 'Two activities.' })), activities };
    let { item: learningPath } = await json<{ item: EditorialPath }>(await request('/admin/discovery/paths', 'POST', pathInput, editor), 201);
    const pathPublic = '/learning-paths/' + pathSlug;
    await json(await request(pathPublic), 404);
    const pathAdmin = '/admin/discovery/paths/' + learningPath.id + '/status';
    const changePath = (status: string, cookie = admin) => request(pathAdmin, 'PATCH', { status, version: learningPath.version }, cookie);
    ({ item: learningPath } = await json<{ item: EditorialPath }>(await changePath('educational-review', editor)));
    await json(await changePath('approved', editor), 403);
    ({ item: learningPath } = await json<{ item: EditorialPath }>(await changePath('approved')));
    ({ item: learningPath } = await json<{ item: EditorialPath }>(await changePath('published')));
    const path = await json<{ item: { activities: SearchEntry[] } }>(await request(pathPublic + '?language=fa-AF'));
    assert.deepEqual(path.item.activities.map(value => value.id), activities.map(value => value.id));
    assert.ok(path.item.activities.every(activity => activity.locale === 'fa-AF'));
    assert.ok((await json<Matches>(await request('/learning-paths?subjectId=' + subject.id))).items.some(item => item.id === learningPath.id));

    originalDaily = await discovery.dailySettings();
    const daily = '/admin/discovery/daily-learning';
    const setting = { version: originalDaily.version, mode: 'curated', activities: [activities[0]] };
    await json(await request(daily, 'PUT', setting, editor), 403);
    const { settings } = await json<{ settings: { version: number } }>(await request(daily, 'PUT', setting, admin));
    await json(await request(daily, 'PUT', setting, admin), 409);
    const featured = await json<{ date: string; item: SearchEntry }>(await request('/daily-learning?language=fa-AF'));
    assert.match(featured.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(featured.item.id, quiz.id);
    await json(await request(daily, 'PUT', { ...setting, version: settings.version, mode: 'off', activities: [] }, admin));
    assert.equal((await json<{ item: null }>(await request('/daily-learning'))).item, null);

    const certificates = '/certificates';
    const certificateInput = { courseSlug, completedLessonIds: lessonIds, locale: 'fa-AF' };
    await json(await request(certificates, 'POST', { ...certificateInput, completedLessonIds: lessonIds.slice(0, 1) }), 422);
    await json(await request(certificates, 'POST', { ...certificateInput, completedLessonIds: [lessonIds[0], randomUUID()] }), 422);
    await json(await request(certificates, 'POST', { ...certificateInput, displayName: 'Name must stay local' }), 400);
    interface CertificateEnvelope { certificate: { code: string; courseTitle: string; publicVerification: boolean }; }
    const privateCertificate = await json<CertificateEnvelope>(await request(certificates, 'POST', certificateInput), 201);
    assert.equal(privateCertificate.certificate.publicVerification, false);
    await json(await request(certificates + '/' + privateCertificate.certificate.code), 404);
    const published = await json<CertificateEnvelope>(await request(certificates, 'POST', { ...certificateInput, publicVerification: true }), 201);
    assert.notEqual(published.certificate.code, privateCertificate.certificate.code);
    const verified = await json<CertificateEnvelope>(await request(certificates + '/' + published.certificate.code));
    assert.equal(verified.certificate.courseTitle, dari);
    assert.deepEqual(Object.keys(verified.certificate).sort(), ['code', 'courseSlug', 'courseTitle', 'issuedAt', 'locale', 'publicVerification']);
    await json(await request(certificates), 404);

    course = await courses.changeStatus(course.id, 'archived', course.version);
    await json(await request('/quizzes/' + quizSlug), 404);
    await json(await request(certificates + '/' + published.certificate.code), 404);
    const removed = await json<{ item: { activities: SearchEntry[] } }>(await request(pathPublic));
    assert.deepEqual(removed.item.activities, []);
    const archivedSearch = await json<Matches>(await request('/search?q=' + token + '&kind=course'));
    assert.equal(archivedSearch.total, 0);
  } finally {
    try {
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      if (migrated) {
        if (originalDaily) await db.query('UPDATE daily_learning_settings SET mode = $mode, activities = $activities, version = $version WHERE id = 1',
          { bind: { ...originalDaily, activities: JSON.stringify(originalDaily.activities) } });
        await db.query('DELETE FROM learning_paths WHERE slug=$slug', { bind: { slug: pathSlug } });
        await db.query('DELETE FROM quizzes WHERE slug=$slug', { bind: { slug: quizSlug } });
        for (const id of createdQuestions) await db.query('DELETE FROM quiz_questions WHERE id=$id', { bind: { id } });
        await db.query('DELETE FROM courses WHERE slug=$slug', { bind: { slug: courseSlug } });
        await db.query('DELETE FROM users WHERE login IN ($admin,$editor)', { bind: { admin: adminName, editor: editorName } });
        await db.query('DELETE FROM roles WHERE code=$role', { bind: { role: editorRole } });
      }
    } finally { await db.close(); }
  }
});
