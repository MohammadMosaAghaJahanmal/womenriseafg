import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { defaultSettings, sectionKeys } from '../src/modules/homepage/contract';
import { mergeRecentlyAdded, preferredCopy, type Candidate } from '../src/modules/homepage/reader';
import { courseOpen, editSettings, homeQuery } from '../src/modules/homepage/validation';

test('homepage settings permit only the complete ordered section list and known locales', () => {
  const settings = { ...defaultSettings, version: 1 };
  assert.equal(editSettings.validate(settings).error, undefined);
  const sections = [...settings.sections].reverse();
  const { value } = editSettings.validate({ ...settings, sections });
  assert.deepEqual(value.sections.map((section: { key: string }) => section.key), [...sectionKeys].reverse());
  assert.ok(editSettings.validate({ ...settings, sections: sections.slice(1) }).error);
  assert.ok(editSettings.validate({ ...settings, sections: [sections[1], ...sections.slice(1)] }).error);
  assert.ok(editSettings.validate({ ...settings, branding: { ...settings.branding, logoId: 'https://example.test/image' } }).error);
  assert.ok(editSettings.validate({ ...settings, announcements: [
    { enabled: true, translations: [{ locale: 'xx', title: 'Heading', body: 'Message' }] },
  ] }).error);
  const id = randomUUID();
  assert.ok(editSettings.validate({ ...settings, featuredCourseIds: [id, id] }).error);
  assert.equal(homeQuery.validate({ language: 'fa-af', preferred: 'ps' }).value.language, 'fa-AF');
  assert.ok(homeQuery.validate({ trackingId: randomUUID() }).error);
  assert.ok(courseOpen.validate({ slug: 'lesson', trackingId: randomUUID() }).error);
});

test('homepage ranking honors available copy and merges recent resources in date order', () => {
  const labels = [{ locale: 'en', title: 'First' }, { locale: 'ps', title: 'دویم' }];
  assert.equal(preferredCopy(labels, 'ps')?.title, 'دویم');
  assert.equal(preferredCopy(labels, 'fa-AF')?.title, 'First');
  assert.equal(preferredCopy(labels.slice(1), 'en')?.locale, 'ps');
  function make(id: string, date: string, kind: 'video' | 'ai' | 'book'): Candidate {
    return { subjectId: null, levelId: null, categoryId: null, createdAt: new Date(date),
      item: { id, kind, href: '/' + kind + '/' + id, imageId: null, description: '',
        locale: 'en', title: id, languages: ['en'] } };
  }
  const book = make('1', '2025-12-30', 'book');
  const video = make('2', '2025-12-29', 'video');
  const ai = make('2', '2025-12-29', 'ai');
  const newest = make('3', '2025-12-31', 'video');
  assert.deepEqual(mergeRecentlyAdded([[video, newest], [ai, book]], 3).map(({ item }) => item.id), ['3', '1', '2']);
  assert.deepEqual(mergeRecentlyAdded([[video, newest], [ai, book]], 1).map(({ item }) => item.id), ['3']);
});
