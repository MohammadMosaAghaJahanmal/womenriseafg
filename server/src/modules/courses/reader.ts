import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { normalizeEducationSearch } from '../education/models';
import { publicEducationEntry } from '../education/store';
import type { CourseListOptions, CourseRecord, CourseSummary } from './contract';
import type { CourseModels, CourseRow } from './models';

export const publishedLocale = (field: string) => `EXISTS (
  SELECT 1 FROM education_languages lang
  JOIN education_entries entry ON entry.id = lang.entry_id AND entry.status = 'published'
  WHERE lang.locale = ${field}
)`;
const visibleTitle = `EXISTS (SELECT 1 FROM course_translations ct
  WHERE ct.course_id = c.id AND ${publishedLocale('ct.locale')})`;
export const visibleLesson = `EXISTS (SELECT 1 FROM chapter_translations ch
  WHERE ch.chapter_id = l.chapter_id AND ${publishedLocale('ch.locale')})
  AND EXISTS (SELECT 1 FROM lesson_translations lt WHERE lt.lesson_id = l.id
    AND ${publishedLocale('lt.locale')} AND (l.kind <> 'text' OR LENGTH(TRIM(lt.body)) > 0))`;
export const publicCourse = `c.status = 'published' AND ${visibleTitle}
  AND EXISTS (SELECT 1 FROM lessons l WHERE l.course_id = c.id AND ${visibleLesson})`;

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const group = result.get(key(row));
    if (group) group.push(row);
    else result.set(key(row), [row]);
  }
  return result;
}

export function courseReader(db: Sequelize, models: CourseModels) {
  const { Course, CourseTranslation, Chapter, ChapterTranslation, Lesson, LessonTranslation, LessonResource, CourseTag, CourseRelated } = models;

  async function publicLocales(transaction: Transaction) {
    const rows = await db.query<{ locale: string }>(`
      SELECT lang.locale FROM education_languages lang
      JOIN education_entries entry ON entry.id = lang.entry_id AND entry.status = 'published'
    `, { type: QueryTypes.SELECT, transaction });
    return new Set(rows.map(row => row.locale));
  }

  async function publicTaxonomies(courses: CourseRow[], tags: string[], transaction: Transaction) {
    const ids = [...new Set([
      ...courses.flatMap(course => [course.subjectId, course.levelId, course.gradeId]),
      ...tags,
    ].filter((id): id is string => id !== null))];
    if (!ids.length) return new Set<string>();
    const rows = await db.query<{ id: string }>(`
      SELECT e.id FROM education_entries e WHERE e.id IN (:ids) ${publicEducationEntry}
    `, { type: QueryTypes.SELECT, replacements: { ids }, transaction });
    return new Set(rows.map(row => row.id));
  }

  function basics(row: CourseRow, taxonomies?: Set<string>) {
    const visible = (id: string | null) => id && (!taxonomies || taxonomies.has(id)) ? id : null;
    const { id, slug, status, subjectId, levelId, gradeId, thumbnailId, estimatedMinutes, instructor, updatedAt } = row;
    return { id, slug, status, subjectId: visible(subjectId), levelId: visible(levelId), gradeId: visible(gradeId),
      thumbnailId, estimatedMinutes, instructor, updatedAt: updatedAt.toISOString() };
  }

  async function translations(ids: string[], transaction: Transaction, locales?: Set<string>) {
    const entries = await CourseTranslation.findAll({ where: { courseId: ids }, order: [['locale', 'ASC']], transaction });
    return groupBy(entries.map(entry => entry.get()).filter(row => !locales || locales.has(row.locale)),
      row => row.courseId);
  }

  async function record(row: CourseRow, transaction: Transaction, publicOnly = false): Promise<CourseRecord> {
    const courseId = row.id;
    const locales = publicOnly ? await publicLocales(transaction) : undefined;
    const translated = await translations([courseId], transaction, locales);
    const [chapters, lessons, tags, related] = await Promise.all([
      Chapter.findAll({ where: { courseId }, order: [['position', 'ASC'], ['id', 'ASC']], transaction }),
      Lesson.findAll({ where: { courseId }, order: [['position', 'ASC'], ['id', 'ASC']], transaction }),
      CourseTag.findAll({ where: { courseId }, order: [['tagId', 'ASC']], transaction }),
      CourseRelated.findAll({ where: { courseId }, order: [['position', 'ASC']], transaction }),
    ]);
    const chapterIds = chapters.map(chapter => chapter.getDataValue('id'));
    const lessonIds = lessons.map(lesson => lesson.getDataValue('id'));
    const [chapterTranslations, lessonTranslations, lessonResources] = await Promise.all([
      chapterIds.length ? ChapterTranslation.findAll({ where: { chapterId: chapterIds }, order: [['locale', 'ASC']], transaction }) : [],
      lessonIds.length ? LessonTranslation.findAll({ where: { lessonId: lessonIds }, order: [['locale', 'ASC']], transaction }) : [],
      lessonIds.length ? LessonResource.findAll({ where: { lessonId: lessonIds }, order: [['position', 'ASC']], transaction }) : [],
    ]);
    const titles = groupBy(chapterTranslations.map(entry => entry.get()).filter(entry => !locales || locales.has(entry.locale)), entry => entry.chapterId);
    const content = groupBy(lessonTranslations.map(entry => entry.get()).filter(entry => !locales || locales.has(entry.locale)), entry => entry.lessonId);
    const files = groupBy(lessonResources.map(entry => entry.get()), entry => entry.lessonId);
    const orderedLessons = groupBy(lessons.map(entry => entry.get()), entry => entry.chapterId);
    const tagIds = tags.map(tag => tag.getDataValue('tagId'));
    const taxonomies = publicOnly ? await publicTaxonomies([row], tagIds, transaction) : undefined;
    const relatedIds = related.map(link => link.getDataValue('relatedId'));
    return {
      ...basics(row, taxonomies), version: row.version, createdAt: row.createdAt.toISOString(),
      translations: (translated.get(courseId) ?? []).map(({ locale, title, description, objectives, prerequisites }) =>
        ({ locale, title, description, objectives, prerequisites })),
      tagIds: taxonomies ? tagIds.filter(id => taxonomies.has(id)) : tagIds,
      relatedCourseIds: publicOnly && relatedIds.length
        ? await publicRelatedIds(relatedIds, transaction)
        : relatedIds,
      chapters: chapters.map(chapter => {
        const id = chapter.getDataValue('id');
        return {
          id,
          translations: (titles.get(id) ?? []).map(({ locale, title }) => ({ locale, title })),
          lessons: (orderedLessons.get(id) ?? []).map(({ id, slug, kind, mediaId }) => ({
            id, slug, kind, mediaId,
            translations: (content.get(id) ?? [])
              .filter(entry => !publicOnly || kind !== 'text' || entry.body.trim())
              .map(({ locale, title, description, body }) => ({ locale, title, description, body })),
            resources: (files.get(id) ?? []).map(({ mediaId, label }) => ({ mediaId, label })),
          })).filter(lesson => !publicOnly || lesson.translations.length),
        };
      }).filter(chapter => !publicOnly || (chapter.translations.length && chapter.lessons.length)),
    };
  }

  async function summaries(pageRows: { id: string; lessonCount: string | number }[], transaction: Transaction, publicOnly: boolean) {
    if (!pageRows.length) return [];
    const ids = pageRows.map(row => row.id);
    const found = await Course.findAll({ where: { id: ids }, transaction });
    const courses = new Map(found.map(entry => [entry.getDataValue('id'), entry.get()]));
    const locales = publicOnly ? await publicLocales(transaction) : undefined;
    const names = await translations(ids, transaction, locales);
    const taxonomies = publicOnly ? await publicTaxonomies(found.map(entry => entry.get()), [], transaction) : undefined;
    return pageRows.flatMap(({ id, lessonCount }): CourseSummary[] => {
      const course = courses.get(id);
      if (!course) return [];
      return [{
        ...basics(course, taxonomies), lessonCount: Number(lessonCount),
        translations: (names.get(id) ?? []).map(({ locale, title, description, objectives, prerequisites }) =>
          ({ locale, title, description, objectives, prerequisites })),
      }];
    });
  }

  async function publicRelatedIds(ids: string[], transaction: Transaction): Promise<string[]> {
    const rows = await db.query<{ id: string }>(`
      SELECT c.id FROM courses c WHERE c.id IN (:ids) AND ${publicCourse}
    `, { type: QueryTypes.SELECT, replacements: { ids }, transaction });
    const eligible = new Set(rows.map(row => row.id));
    return ids.filter(id => eligible.has(id));
  }

  return {
    record,

    list({ q, page, pageSize, language, subjectId, levelId, status, publicOnly = false }: CourseListOptions) {
      return db.transaction(async transaction => {
        const search = normalizeEducationSearch(q);
        const filters = ['1 = 1'];
        if (publicOnly) filters.push(publicCourse);
        else if (status) filters.push('c.status = :status');
        if (subjectId) filters.push(`c.subject_id = :subjectId
          ${publicOnly ? `AND EXISTS (SELECT 1 FROM education_entries e WHERE e.id = c.subject_id ${publicEducationEntry})` : ''}`);
        if (levelId) filters.push(`c.level_id = :levelId
          ${publicOnly ? `AND EXISTS (SELECT 1 FROM education_entries e WHERE e.id = c.level_id ${publicEducationEntry})` : ''}`);
        const eligibleLines = `ct.course_id = c.id ${publicOnly ? 'AND ' + publishedLocale('ct.locale') : ''}
          ${language ? 'AND ct.locale = :language' : ''}`;
        if (language) filters.push(`EXISTS (SELECT 1 FROM course_translations ct WHERE ${eligibleLines})`);
        if (search) filters.push(`(
          LOCATE(:search, CONVERT(c.slug USING utf8mb4) COLLATE utf8mb4_unicode_ci) > 0
          OR EXISTS (SELECT 1 FROM course_translations ct WHERE ${eligibleLines} AND LOCATE(:search, ct.search_text) > 0)
        )`);
        const from = `FROM courses c WHERE ${filters.join(' AND ')}`;
        const options = { type: QueryTypes.SELECT as const, transaction,
          replacements: { search, status, language, subjectId, levelId, limit: pageSize, offset: (page - 1) * pageSize } };
        const [count] = await db.query<{ total: string | number }>(`SELECT COUNT(*) AS total ${from}`, options);
        const rows = await db.query<{ id: string; lessonCount: string | number }>(`
          SELECT c.id, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id
            ${publicOnly ? 'AND ' + visibleLesson : ''}) AS lessonCount
          ${from} ORDER BY c.updated_at DESC, c.id ASC LIMIT :limit OFFSET :offset
        `, options);
        return { items: await summaries(rows, transaction, publicOnly), total: Number(count?.total ?? 0), page, pageSize };
      });
    },

    findPublic(slug: string) {
      return db.transaction(async transaction => {
        const [result] = await db.query<{ id: string }>(`SELECT c.id FROM courses c WHERE c.slug = :slug AND ${publicCourse}`,
          { replacements: { slug }, type: QueryTypes.SELECT, transaction });
        const course = result && await Course.findByPk(result.id, { transaction });
        return course ? record(course.get(), transaction, true) : null;
      });
    },

    findPublicRelated(ids: string[]): Promise<CourseSummary[]> {
      if (!ids.length) return Promise.resolve([]);
      return db.transaction(async transaction => {
        const rows = await db.query<{ id: string; lessonCount: string | number }>(`
          SELECT c.id, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND ${visibleLesson}) AS lessonCount
          FROM courses c WHERE c.id IN (:ids) AND ${publicCourse}
        `, { replacements: { ids }, type: QueryTypes.SELECT, transaction });
        const ordered = new Map(ids.map((id, index) => [id, index]));
        rows.sort((first, second) => (ordered.get(first.id) ?? 0) - (ordered.get(second.id) ?? 0));
        return summaries(rows, transaction, true);
      });
    },
  };
}
