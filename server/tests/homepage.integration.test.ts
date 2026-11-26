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
import { createBookStore } from '../src/modules/books/store';
import { migrateCertificates } from '../src/modules/certificates/migration';
import type { CourseInput } from '../src/modules/courses/contract';
import { migrateCourses } from '../src/modules/courses/migration';
import { createCourseStore } from '../src/modules/courses/store';
import { migrateDiscovery } from '../src/modules/discovery/migration';
import { createDiscoveryStore } from '../src/modules/discovery/store';
import { migrateEducation } from '../src/modules/education/migration';
import { migrateLearningMedia } from '../src/modules/learning-media/migration';
import { createLearningMediaStore } from '../src/modules/learning-media/store';
import type { MediaKind } from '../src/modules/media/contract';
import { migrateMedia } from '../src/modules/media/migration';
import { createMediaStore } from '../src/modules/media/store';
import { migrateQuizzes } from '../src/modules/quizzes/migration';
import type { HomepageBranding, HomepageItem, HomepageSettings, SectionKey } from '../src/modules/homepage/contract';
import { migrateHomepage } from '../src/modules/homepage/migration';
import { createHomepageRoutes } from '../src/modules/homepage/routes';
import { createHomepageStore } from '../src/modules/homepage/store';

interface Home {
  branding: HomepageBranding;
  sections: HomepageSettings['sections'];
  announcements: { translations: HomepageSettings['announcements'][number]['translations'] }[];
  content: Partial<Record<SectionKey, HomepageItem[]>>;
}

test('homepage publishes visible multilingual panels, protects settings and ranks atomic aggregate opens on MySQL', {
  skip: process.env.WOMENRISEAFG_IDENTITY_TEST !== '1' && 'set WOMENRISEAFG_IDENTITY_TEST=1 for a disposable test schema',
  timeout: 60000,
}, async () => {
  const database = readSettings(process.env).database;
  assert.equal(database.host, '127.0.0.1');
  assert.match(database.name, /^womenriseafg_test_[a-z0-9_]+$/);
  assert.notEqual(database.port, 3306);
  const db = createDatabase(database);
  const identity = createIdentityStore(db);
  const courses = createCourseStore(db);
  const discovery = createDiscoveryStore(db);
  const media = createMediaStore(db);
  const books = createBookStore(db);
  const learningMedia = createLearningMediaStore(db, { shortMaxSeconds: 60 });
  const homepage = createHomepageStore(db);
  const origin = 'https://learning.example.test';
  const logger = pino({ level: 'silent' });
  const options = { production: true, logger, origins: [origin] };
  const server = createServer(createApp({
    logger, production: true, trustedProxies: ['127.0.0.1'], checkDatabase: () => db.authenticate(),
    identityRoutes: createAuthRoutes(identity, options), homepageRoutes: createHomepageRoutes(homepage, identity, options),
  }));
  const token = randomBytes(5).toString('hex');
  const adminLogin = 'home.' + token + '.admin';
  const reviewerLogin = 'home.' + token + '.review';
  const role = 'home-test-' + token;
  const password = 'Disposable homepage passphrase ' + token;
  const assets: string[] = [];
  const bookIds: string[] = [];
  const learningIds: string[] = [];
  const courseIds: string[] = [];
  const pathIds: string[] = [];
  let migrated = false;
  let saved: HomepageSettings | undefined;
  let daily: Awaited<ReturnType<typeof discovery.dailySettings>> | undefined;

  try {
    for (const migrate of [migrateIdentity, migrateEducation, migrateMedia, migrateCourses, migrateLearningMedia, migrateBooks,
      migrateQuizzes, migrateDiscovery, migrateCertificates, migrateHomepage]) await migrate(db);
    assert.equal(await migrateHomepage(db), false);
    migrated = true;
    saved = (await homepage.getSettings()).settings;
    daily = await discovery.dailySettings();
    const auth = await hashPassword(password);
    const owner = await identity.createStudent(adminLogin, auth);
    const reviewer = await identity.createStudent(reviewerLogin, auth);
    await db.query('INSERT INTO roles (code) VALUES ($role)', { bind: { role } });
    await db.query("INSERT INTO role_permissions (role_code, permission_code) VALUES ($role, 'admin:access')", { bind: { role } });
    await db.query("INSERT INTO user_roles (user_id, role_code) VALUES ($owner, 'admin'), ($reviewer, $role)",
      { bind: { owner: owner.id, reviewer: reviewer.id, role } });
    const [subject] = await db.query<{ id: string; categoryId: string }>(`
      SELECT id, category_id AS categoryId FROM education_entries WHERE kind = 'subjects' AND status='published'
      AND category_id IS NOT NULL LIMIT 1`, { type: QueryTypes.SELECT });
    assert.ok(subject);
    const title = (suffix: string) => 'Homepage ' + suffix + ' ' + token;
    const labels = (suffix: string, localized = true) => [
      { locale: 'en', title: title(suffix), description: 'Free learning.' },
      ...(localized ? [{ locale: 'fa-AF', title: 'آموزش ' + suffix, description: 'تمرین رایگان' }] : []),
    ];

    async function addCourse(suffix: string, localized = true, publish = true, subjectId: string | null = subject!.id) {
      const translations = labels(suffix, localized);
      const input: CourseInput = {
        slug: 'home-' + suffix + '-' + token, thumbnailId: null, subjectId, levelId: null, gradeId: null, instructor: '',
        estimatedMinutes: 18, tagIds: [], relatedCourseIds: [],
        translations: translations.map(copy => ({ ...copy, objectives: '', prerequisites: '' })),
        chapters: [{ translations, lessons: [{ slug: 'first', kind: 'text', mediaId: null, resources: [],
          translations: translations.map(copy => ({ ...copy, body: 'First lesson content.' })),
        }] }],
      };
      let course = await courses.create(input, owner.id);
      courseIds.push(course.id);
      if (publish) {
        for (const status of ['educational-review', 'approved', 'published'] as const) {
          course = await courses.changeStatus(course.id, status, course.version);
        }
      }
      return course;
    }

    async function addAsset(kind: MediaKind, suffix: string, publish = true) {
      const id = randomUUID();
      const asset = await media.create(id, kind, { title: title(suffix), license: 'CC0-1.0', author: 'Fixture',
        source: 'Isolated homepage tests', language: 'en', downloadAllowed: false }, { storageKey: id + '.fixture',
        originalName: suffix, sizeBytes: 256, mimeType: kind === 'image' ? 'image/png' : kind === 'pdf' ? 'application/pdf' : 'video/mp4',
        sha256: randomBytes(32).toString('hex'), width: kind === 'pdf' ? null : 300,
        height: kind === 'pdf' ? null : 534, durationMs: kind === 'video' ? 5000 : null,
      }, owner.id);
      assets.push(id);
      return publish ? media.setStatus(id, 'published', asset.version) : asset;
    }

    async function addLearning(suffix: string, kind: 'video' | 'short' | 'resource', mediaId: string) {
      let entry = await learningMedia.create({
        slug: 'home-' + suffix + '-' + token, kind, mediaId, categoryId: subject!.categoryId,
        relatedCourseId: null, relatedLessonId: null,
        aiOrigin: kind === 'resource' ? 'ai-generated' : 'human', aiTool: kind === 'resource' ? 'Fixture generator' : '',
        aiNotes: kind === 'resource' ? 'Synthetic illustration with no real learner data.' : '', translations: labels(suffix),
      }, owner.id);
      learningIds.push(entry.id);
      for (const status of ['educational-review', 'approved', 'published'] as const) {
        entry = await learningMedia.changeStatus(entry.id, status, entry.version, owner.id, 'Reviewed fixture content.');
      }
      return entry;
    }

    const featured = await addCourse('featured');
    const related = await addCourse('related');
    const popular = await addCourse('popular', false, true, null);
    const draft = await addCourse('draft', true, false);
    const logo = await addAsset('image', 'logo');
    const hidden = await addAsset('image', 'hidden-logo', false);
    const pdf = await addAsset('pdf', 'book-pdf');
    const video = await addLearning('video', 'video', (await addAsset('video', 'video-file')).id);
    const short = await addLearning('short', 'short', (await addAsset('video', 'short-file')).id);
    const ai = await addLearning('illustration', 'resource', (await addAsset('image', 'ai-illustration')).id);
    let book = await books.create({ slug: 'home-book-' + token, pdfId: pdf.id, coverId: null, categoryId: subject.categoryId,
      levelId: null, gradeId: null, contentLanguage: 'en', author: 'Fixture author', publisher: '', publicationYear: null,
      edition: '', translations: labels('book') }, owner.id);
    bookIds.push(book.id);
    for (const status of ['educational-review', 'approved', 'published'] as const) {
      book = await books.changeStatus(book.id, status, book.version, owner.id, 'Reviewed fixture book.');
    }
    let path = await discovery.create({ slug: 'home-path-' + token, subjectId: subject.id, levelId: null,
      translations: labels('path'), activities: [{ kind: 'course', id: related.id }] });
    pathIds.push(path.id);
    for (const status of ['educational-review', 'approved', 'published'] as const) {
      path = await discovery.changeStatus(path.id, status, path.version);
    }
    await discovery.updateDaily({ version: daily.version, mode: 'curated', activities: [{ kind: 'video', id: video.id }] });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    function request(path: string, method = 'GET', data?: object, cookie?: string, forwarded = origin) {
      return fetch(base + path, { method, headers: { 'X-Forwarded-Proto': 'https',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data ? { Origin: forwarded, 'Content-Type': 'application/json' } : {}) },
        body: data ? JSON.stringify(data) : undefined });
    }
    async function json<T>(response: Response, expected = 200): Promise<T> {
      const content: unknown = await response.json();
      assert.equal(response.status, expected, JSON.stringify(content));
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return content as T;
    }
    async function login(username: string) {
      const response = await request('/auth/admin-login', 'POST', { username, password });
      await json(response);
      return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    }
    const cookie = await login(adminLogin);
    const reviewerCookie = await login(reviewerLogin);
    const admin = '/admin/homepage';
    await json(await request(admin), 401);
    await json(await request(admin, 'GET', undefined, reviewerCookie), 403);
    const { settings } = await json<{ settings: HomepageSettings }>(await request(admin, 'GET', undefined, cookie));
    const config = { ...settings, sections: [...settings.sections].reverse(),
      branding: { ...settings.branding, name: title('brand'), logoId: logo.id, faviconId: logo.id },
      featuredCourseIds: [featured.id], recommendedBookIds: [book.id],
      announcements: [{ enabled: true, translations: [{ locale: 'fa-AF', title: 'خبر', body: 'مطلب آموزشی تازه' }] },
        { enabled: false, translations: [{ locale: 'en', title: 'Hidden announcement', body: 'Private draft.' }] }],
    };
    await json(await request(admin, 'PUT', { ...config, featuredCourseIds: [draft.id] }, cookie), 422);
    await json(await request(admin, 'PUT', { ...config, branding: { ...config.branding, logoId: hidden.id } }, cookie), 422);
    await json(await request(admin, 'PUT', config, cookie, 'https://other.test'), 403);
    const updated = await json<{ settings: HomepageSettings; selected: { featuredCourses: HomepageItem[]; recommendedBooks: HomepageItem[] } }>(
      await request(admin, 'PUT', config, cookie));
    assert.equal(updated.settings.version, config.version + 1);
    assert.deepEqual(updated.selected.featuredCourses.map(item => item.id), [featured.id]);
    assert.deepEqual(updated.selected.recommendedBooks.map(item => item.id), [book.id]);
    await json(await request(admin, 'PUT', config, cookie), 409);
    const picker = await json<{ items: { id: string }[] }>(
      await request(admin + '/images?q=logo', 'GET', undefined, cookie));
    assert.ok(picker.items.some(item => item.id === logo.id));
    assert.ok(!picker.items.some(item => item.id === hidden.id));

    const opens = '/homepage/course-opens';
    const initial = await json<Home>(await request('/homepage?preferred=fa-AF'));
    assert.equal(initial.content.popular, undefined);
    await json(await request(opens, 'POST', { slug: draft.slug }), 404);
    await json(await request(opens, 'POST', { slug: popular.slug, learnerId: 'personal-data' }), 400);
    await json(await request(opens, 'POST', { slug: popular.slug }, undefined, 'https://other.test'), 403);
    const posted = await Promise.all([popular.slug, related.slug, popular.slug, popular.slug, related.slug].map(slug =>
      request(opens, 'POST', { slug })));
    for (const response of posted) {
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    const persisted = await db.query<{ courseId: string; opens: string }>(`
      SELECT course_id AS courseId, CAST(opens AS CHAR) AS opens
      FROM homepage_course_opens WHERE course_id IN ($popular, $related) ORDER BY opens DESC`,
      { type: QueryTypes.SELECT, bind: { popular: popular.id, related: related.id } });
    assert.deepEqual(persisted.map(item => [item.courseId, item.opens]), [[popular.id, '3'], [related.id, '2']]);
    const result = await json<Home>(await request('/homepage?preferred=fa-AF'));
    assert.equal(result.branding.logoId, logo.id);
    assert.deepEqual(result.sections, config.sections);
    assert.deepEqual(result.announcements.map(item => item.translations[0]?.title), ['خبر']);
    assert.deepEqual(result.content.popular?.slice(0, 2).map(item => item.id), [popular.id, related.id]);
    assert.equal(result.content.featured?.[0]?.lessonCount, 1);
    assert.equal(result.content.featured?.[0]?.estimatedMinutes, 18);
    assert.equal(result.content.featured?.[0]?.locale, 'fa-AF');
    assert.equal(result.content.featured?.[0]?.subject?.locale, 'fa-AF');
    assert.equal(result.content.recommendedCourses?.[0]?.id, related.id);
    assert.equal(result.content.videos?.[0]?.id, video.id);
    assert.equal(result.content.shorts?.[0]?.id, short.id);
    assert.equal(result.content.ai?.[0]?.id, ai.id);
    assert.equal(result.content.paths?.[0]?.id, path.id);
    assert.equal(result.content.books?.[0]?.id, book.id);
    assert.equal(result.content.daily?.[0]?.id, video.id);
    assert.ok(result.content.subjects?.every(item => item.href.startsWith('/search?subjectId=')));
    assert.equal(result.content.recent?.length, 4);
    assert.doesNotMatch(JSON.stringify(result), /"opens"|storageKey|reviewNote|learnerId|Hidden announcement|home-draft/);
    const filtered = await json<Home>(await request('/homepage?language=fa-AF&preferred=ps'));
    assert.deepEqual(filtered.content.popular?.map(item => item.id), [related.id]);
    assert.equal(filtered.content.featured?.[0]?.locale, 'fa-AF');
    assert.equal(filtered.content.books, undefined, 'catalog translation is distinct from actual PDF language');

    await media.setStatus(logo.id, 'archived', logo.version);
    const { branding } = await json<{ branding: HomepageBranding }>(await request('/homepage/branding'));
    assert.equal(branding.name, config.branding.name);
    assert.equal(branding.logoId, null);
    assert.equal(branding.faviconId, null);
    await courses.changeStatus(featured.id, 'archived', featured.version);
    const archived = await json<Home>(await request('/homepage'));
    assert.equal(archived.content.featured, undefined);
    await json(await request(opens, 'POST', { slug: featured.slug }), 404);
  } finally {
    try {
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      if (migrated) {
        if (saved) {
          const { version, ...config } = saved;
          await db.query('UPDATE homepage_settings SET config = $config, version = $version WHERE id = 1',
            { bind: { config: JSON.stringify(config), version } });
        }
        if (daily) await db.query('UPDATE daily_learning_settings SET mode = $mode, activities = $activities, version = $version WHERE id = 1',
          { bind: { ...daily, activities: JSON.stringify(daily.activities) } });
        for (const id of pathIds) await db.query('DELETE FROM learning_paths WHERE id=$id', { bind: { id } });
        for (const [ownerType, table, ids] of [
          ['book', 'books', bookIds], ['learning-media', 'learning_media', learningIds], ['course', 'courses', courseIds],
        ] as const) {
          for (const id of ids) {
            await db.query('DELETE FROM media_references WHERE owner_type=$ownerType AND owner_id=$id', { bind: { ownerType, id } });
            await db.query(`DELETE FROM ${table} WHERE id=$id`, { bind: { id } });
          }
        }
        for (const id of assets) await db.query('DELETE FROM media_assets WHERE id=$id', { bind: { id } });
        await db.query('DELETE FROM users WHERE login IN ($adminLogin,$reviewerLogin)', { bind: { adminLogin, reviewerLogin } });
        await db.query('DELETE FROM roles WHERE code=$role', { bind: { role } });
      }
    } finally { await db.close(); }
  }
});
