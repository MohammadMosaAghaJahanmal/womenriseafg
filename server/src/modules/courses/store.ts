import { randomUUID } from 'node:crypto';
import { ForeignKeyConstraintError, QueryTypes, UniqueConstraintError, type Sequelize, type Transaction } from 'sequelize';
import { transitionAllowed, type EducationKind, type EducationStatus } from '../education/contract';
import { defineEducationModels, normalizeEducationSearch } from '../education/models';
import { defineMediaModels } from '../media/models';
import type { MediaKind } from '../media/contract';
import { publishedQuizLocale, standaloneQuiz } from '../quizzes/visibility';
import { CourseError, type ChapterRecord, type CourseInput, type CourseStatus } from './contract';
import { defineCourseModels } from './models';
import { completeProvenance, emptyProvenance } from './provenance';
import { courseReader } from './reader';

const editable: readonly CourseStatus[] = ['draft', 'educational-review', 'translation-review'];
const removals: readonly CourseStatus[] = ['draft', 'archived'];

function courseFields(input: CourseInput) {
  const { slug, subjectId, levelId, gradeId, thumbnailId, estimatedMinutes, instructor } = input;
  return { slug, subjectId, levelId, gradeId, thumbnailId, estimatedMinutes, instructor };
}

function requireUnique(values: string[]) {
  if (new Set(values).size !== values.length) throw new CourseError('CONFLICT');
}

function rethrow(error: unknown, deletion = false): never {
  if (error instanceof UniqueConstraintError) throw new CourseError('CONFLICT');
  if (error instanceof ForeignKeyConstraintError) throw new CourseError(deletion ? 'CONFLICT' : 'INVALID_REFERENCE');
  throw error;
}

export function createCourseStore(db: Sequelize) {
  const models = defineCourseModels(db);
  const { Course, CourseTranslation, Chapter, ChapterTranslation, Lesson, LessonTranslation, LessonResource, CourseTag, CourseRelated } = models;
  const { Entry } = defineEducationModels(db);
  const { Asset, Reference } = defineMediaModels(db);
  const reader = courseReader(db, models);
  const withTransaction = <T>(transaction: Transaction | undefined, work: (current: Transaction) => Promise<T>) =>
    transaction ? work(transaction) : db.transaction(work);

  async function requireVersion(id: string, version: number, transaction: Transaction) {
    const course = await Course.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!course) throw new CourseError('NOT_FOUND');
    if (course.getDataValue('version') !== version) throw new CourseError('STALE_VERSION');
    return course;
  }

  async function validateTaxonomy(input: CourseInput, transaction: Transaction, published = false) {
    const selected: [string | null, EducationKind][] = [
      [input.subjectId, 'subjects'], [input.levelId, 'levels'], [input.gradeId, 'grades'],
      ...input.tagIds.map((id): [string, EducationKind] => [id, 'tags']),
    ];
    const ids = selected.flatMap(([id]) => id ? [id] : []);
    if (!ids.length) return;
    const entries = await Entry.findAll({ where: { id: ids }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.SHARE });
    const actual = new Map(entries.map(entry => [entry.getDataValue('id'), entry.get()]));
    for (const [id, kind] of selected) {
      if (id === null) continue;
      const target = actual.get(id);
      if (!target || target.kind !== kind || (published ? target.status !== 'published' : target.status === 'archived')) {
        throw new CourseError('INVALID_REFERENCE');
      }
    }
  }

  async function localesFor(input: CourseInput, transaction: Transaction) {
    const availableTranslations = [
      ...input.translations,
      ...input.chapters.flatMap(chapter => [...chapter.translations, ...chapter.lessons.flatMap(lesson => lesson.translations)]),
    ];
    const locales = [...new Set(availableTranslations.map(translation => translation.locale))];
    if (!locales.length) return new Map<string, EducationStatus>();
    const rows = await db.query<{ locale: string; status: EducationStatus }>(`
      SELECT language.locale, entry.status FROM education_languages language
      JOIN education_entries entry ON entry.id = language.entry_id
      WHERE language.locale IN (:locales) ORDER BY language.locale LOCK IN SHARE MODE
    `, { replacements: { locales }, type: QueryTypes.SELECT, transaction });
    if (rows.length !== locales.length) throw new CourseError('INVALID_REFERENCE');
    return new Map(rows.map(row => [row.locale, row.status]));
  }

  async function validateRelated(courseId: string, ids: string[], transaction: Transaction) {
    requireUnique(ids);
    if (!ids.length) return;
    if (ids.includes(courseId) || await Course.count({ where: { id: ids }, transaction }) !== ids.length) {
      throw new CourseError('INVALID_REFERENCE');
    }
  }

  async function checkMedia(input: CourseInput, transaction: Transaction, publishing = false) {
    const references: [string, MediaKind | null][] = input.thumbnailId ? [[input.thumbnailId, 'image']] : [];
    for (const lesson of input.chapters.flatMap(chapter => chapter.lessons)) {
      for (const { mediaId } of lesson.resources) references.push([mediaId, null]);
      if (lesson.kind === 'quiz') {
        if (lesson.mediaId) throw new CourseError('INVALID_REFERENCE');
        continue;
      }
      if (lesson.quizId || (lesson.kind === 'text' && lesson.mediaId)) throw new CourseError('INVALID_REFERENCE');
      if (lesson.kind !== 'text') {
        if (lesson.mediaId) references.push([lesson.mediaId, lesson.kind]);
        else if (publishing) throw new CourseError('INCOMPLETE_COURSE');
      }
    }
    const ids = [...new Set(references.map(([id]) => id))];
    if (!ids.length) return ids;
    const rows = await Asset.findAll({ where: { id: ids }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    const visible = new Map(rows.map(asset => [asset.getDataValue('id'), asset.get()]));
    for (const [id, kind] of references) {
      const asset = visible.get(id);
      if (!asset || asset.status === 'deleted' || asset.status === 'archived' ||
          (publishing && asset.status !== 'published') || (kind !== null && kind !== asset.kind)) {
        throw new CourseError('INVALID_REFERENCE');
      }
      if (asset.status === 'published' && asset.kind === 'attachment' && !asset.downloadAllowed) {
        throw new CourseError('RESOURCE_DOWNLOAD_FORBIDDEN');
      }
    }
    return ids;
  }

  async function checkQuizzes(input: CourseInput, transaction: Transaction, publishing = false) {
    const lessons = input.chapters.flatMap(chapter => chapter.lessons).filter(lesson => lesson.kind === 'quiz');
    if (publishing && lessons.some(lesson => !lesson.quizId)) throw new CourseError('INCOMPLETE_COURSE');
    const ids = [...new Set(lessons.flatMap(lesson => lesson.quizId ? [lesson.quizId] : []))];
    if (!ids.length) return;
    const rows = await db.query<{ id: string }>(`
      SELECT z.id FROM quizzes z WHERE z.id IN (:ids)
      AND ${publishing ? standaloneQuiz : "z.course_id IS NULL AND z.status <> 'archived'"} ORDER BY z.id FOR SHARE
    `, { replacements: { ids }, type: QueryTypes.SELECT, transaction });
    if (rows.length !== ids.length) throw new CourseError('INVALID_REFERENCE');
  }

  async function syncReferences(courseId: string, ids: string[], transaction: Transaction, published = false) {
    const where = { ownerType: 'course', ownerId: courseId };
    await Reference.destroy({ where, transaction });
    if (ids.length) await Reference.bulkCreate(ids.map(assetId => ({ ...where, assetId, published })), { transaction });
  }

  async function writeContent(courseId: string, input: CourseInput, transaction: Transaction) {
    const [existingChapters, existingLessons] = await Promise.all([
      Chapter.findAll({ where: { courseId }, transaction }),
      Lesson.findAll({ where: { courseId }, transaction }),
    ]);
    const chapterIds = new Set(existingChapters.map(chapter => chapter.getDataValue('id')));
    const lessons = new Map(existingLessons.map(lesson => [lesson.getDataValue('id'), lesson.get()]));
    const suppliedChapters = input.chapters.flatMap(chapter => chapter.id ? [chapter.id] : []);
    const suppliedLessons = input.chapters.flatMap(chapter => chapter.lessons.flatMap(lesson => lesson.id ? [lesson.id] : []));
    requireUnique(suppliedChapters);
    requireUnique(suppliedLessons);
    requireUnique(input.chapters.flatMap(chapter => chapter.lessons.map(lesson => lesson.slug)));
    if (suppliedChapters.some(id => !chapterIds.has(id)) || suppliedLessons.some(id => !lessons.has(id))) {
      throw new CourseError('INVALID_REFERENCE');
    }
    const chapters: ChapterRecord[] = input.chapters.map(chapter => ({
      ...chapter,
      id: chapter.id ?? randomUUID(),
      lessons: chapter.lessons.map(lesson => ({ ...lesson, id: lesson.id ?? randomUUID() })),
    }));
    const nextLessons = chapters.flatMap(chapter => chapter.lessons);
    const unusedLessons = [...lessons.keys()].filter(id => !suppliedLessons.includes(id));
    if (unusedLessons.length) await Lesson.destroy({ where: { id: unusedLessons }, transaction });

    // Make intermediate slugs disjoint from valid slugs so a reorder can swap lesson routes.
    for (const lesson of nextLessons) {
      const previous = lessons.get(lesson.id);
      if (previous && previous.slug !== lesson.slug) {
        await Lesson.update({ slug: '.' + lesson.id }, { where: { id: lesson.id }, transaction });
      }
    }
    const chapterRows = chapters.map(({ id }, position) => ({ id, courseId, position }));
    if (chapterRows.length) await Chapter.bulkCreate(chapterRows, { updateOnDuplicate: ['position'], transaction });
    const lessonRows = chapters.flatMap(chapter => chapter.lessons.map(({ id, slug, kind, mediaId, quizId }, position) =>
      ({ id, courseId, chapterId: chapter.id, slug, kind, mediaId, quizId: quizId ?? null, position })));
    if (lessonRows.length) await Lesson.bulkCreate(lessonRows, {
      updateOnDuplicate: ['slug', 'kind', 'mediaId', 'quizId', 'chapterId', 'position'], transaction,
    });
    const unusedChapters = [...chapterIds].filter(id => !suppliedChapters.includes(id));
    if (unusedChapters.length) await Chapter.destroy({ where: { id: unusedChapters }, transaction });

    await CourseTranslation.destroy({ where: { courseId }, transaction });
    await CourseTranslation.bulkCreate(input.translations.map(translation => ({
      ...translation, courseId,
      searchText: normalizeEducationSearch([translation.title, translation.description, translation.objectives, translation.prerequisites].join(' ')),
    })), { transaction });
    if (chapters.length) {
      await ChapterTranslation.destroy({ where: { chapterId: chapterRows.map(chapter => chapter.id) }, transaction });
      await ChapterTranslation.bulkCreate(chapters.flatMap(chapter =>
        chapter.translations.map(translation => ({ ...translation, chapterId: chapter.id }))), { transaction });
    }
    if (nextLessons.length) {
      const where = { lessonId: lessonRows.map(lesson => lesson.id) };
      await LessonTranslation.destroy({ where, transaction });
      await LessonTranslation.bulkCreate(nextLessons.flatMap(lesson =>
        lesson.translations.map(translation => ({ ...translation, imageAlt: translation.imageAlt ?? '', lessonId: lesson.id }))), { transaction });
      await LessonResource.destroy({ where, transaction });
      await LessonResource.bulkCreate(nextLessons.flatMap(lesson => lesson.resources.map((resource, position) =>
        ({ ...resource, lessonId: lesson.id, position }))), { transaction });
    }
    await CourseTag.destroy({ where: { courseId }, transaction });
    await CourseTag.bulkCreate(input.tagIds.map(tagId => ({ courseId, tagId })), { transaction });
    await CourseRelated.destroy({ where: { courseId }, transaction });
    await CourseRelated.bulkCreate(input.relatedCourseIds.map((relatedId, position) => ({ courseId, relatedId, position })), { transaction });
  }

  async function validatePublication(input: CourseInput, transaction: Transaction) {
    const locales = await localesFor(input, transaction);
    const inPublicLanguage = (translation: { locale: string }) => locales.get(translation.locale) === 'published';
    if (!input.translations.some(inPublicLanguage) || !input.chapters.some(chapter => chapter.lessons.length)) {
      throw new CourseError('INCOMPLETE_COURSE');
    }
    for (const chapter of input.chapters) {
      if (!chapter.translations.some(inPublicLanguage) || chapter.lessons.some(lesson =>
        !lesson.translations.some(translation => inPublicLanguage(translation) &&
          (lesson.kind !== 'text' || translation.body.trim()) && (lesson.kind !== 'image' || translation.imageAlt?.trim())))) {
        throw new CourseError('INCOMPLETE_COURSE');
      }
    }
    await validateTaxonomy(input, transaction, true);
    await checkQuizzes(input, transaction, true);
    return checkMedia(input, transaction, true);
  }

  function checkProvenance(input: CourseInput) {
    const translations = [
      ...input.translations,
      ...input.chapters.flatMap(chapter => chapter.lessons.flatMap(lesson => lesson.translations)),
    ];
    if (!completeProvenance(input.provenance) || translations.some(item => item.provenance && !completeProvenance(item.provenance))) {
      throw new CourseError('INCOMPLETE_PROVENANCE');
    }
  }

  return {
    list: reader.list,
    findPublic: reader.findPublic,
    findPublicRelated: reader.findPublicRelated,
    async lessonQuizSlug(id: string) {
      const [row] = await db.query<{ slug: string }>(`
        SELECT z.slug FROM quizzes z WHERE z.id = :id AND ${standaloneQuiz}
      `, { replacements: { id }, type: QueryTypes.SELECT });
      return row?.slug ?? null;
    },
    lessonQuizTitles(id: string) {
      return db.query<{ title: string; locale: string }>(`
        SELECT qt.title, qt.locale FROM quizzes z JOIN quiz_translations qt ON z.id = qt.quiz_id
        WHERE z.id = :id AND ${standaloneQuiz} AND ${publishedQuizLocale('qt.locale')}
        ORDER BY qt.locale
      `, { replacements: { id }, type: QueryTypes.SELECT });
    },

    get(id: string, existingTransaction?: Transaction) {
      return withTransaction(existingTransaction, async transaction => {
        const course = await Course.findByPk(id, { transaction });
        if (!course) throw new CourseError('NOT_FOUND');
        return reader.record(course.get(), transaction);
      });
    },

    async create(input: CourseInput, actorId: string) {
      try {
        return await db.transaction(async transaction => {
          const id = randomUUID();
          const now = new Date();
          await localesFor(input, transaction);
          await validateTaxonomy(input, transaction);
          await validateRelated(id, input.relatedCourseIds, transaction);
          const ids = await checkMedia(input, transaction);
          await checkQuizzes(input, transaction);
          const course = await Course.create({ ...courseFields(input), provenance: input.provenance ?? emptyProvenance, id, status: 'draft', version: 1,
            creatorId: actorId, createdAt: now, updatedAt: now }, { transaction });
          await writeContent(id, input, transaction);
          await syncReferences(id, ids, transaction);
          return reader.record(course.get(), transaction);
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async update(id: string, input: CourseInput, version: number, existingTransaction?: Transaction) {
      try {
        return await withTransaction(existingTransaction, async transaction => {
          const course = await requireVersion(id, version, transaction);
          if (!editable.includes(course.getDataValue('status'))) throw new CourseError('INVALID_TRANSITION');
          await localesFor(input, transaction);
          await validateTaxonomy(input, transaction);
          await validateRelated(id, input.relatedCourseIds, transaction);
          const ids = await checkMedia(input, transaction);
          await checkQuizzes(input, transaction);
          await course.update({ ...courseFields(input), provenance: input.provenance ?? course.getDataValue('provenance'),
            version: version + 1, updatedAt: new Date() }, { transaction });
          await writeContent(id, input, transaction);
          await syncReferences(id, ids, transaction);
          return reader.record(course.get(), transaction);
        });
      } catch (error) {
        rethrow(error);
      }
    },

    changeStatus(id: string, status: CourseStatus, version: number, existingTransaction?: Transaction) {
      return withTransaction(existingTransaction, async transaction => {
        const course = await requireVersion(id, version, transaction);
        const current = course.getDataValue('status');
        if (!transitionAllowed(current, status)) throw new CourseError('INVALID_TRANSITION');
        if (status === 'approved' || status === 'published') {
          const input = await reader.record(course.get(), transaction);
          checkProvenance(input);
          if (status === 'published') {
            const ids = await validatePublication(input, transaction);
            await syncReferences(id, ids, transaction, true);
          }
        }
        if (current === 'published') {
          await Reference.update({ published: false }, { where: { ownerType: 'course', ownerId: id }, transaction });
        }
        await course.update({ status, version: version + 1, updatedAt: new Date() }, { transaction });
        return reader.record(course.get(), transaction);
      });
    },

    async remove(id: string, version: number) {
      try {
        await db.transaction(async transaction => {
          const course = await requireVersion(id, version, transaction);
          if (!removals.includes(course.getDataValue('status'))) throw new CourseError('INVALID_TRANSITION');
          await syncReferences(id, [], transaction);
          await course.destroy({ transaction });
        });
      } catch (error) {
        rethrow(error, true);
      }
    },
  };
}

export type CourseStore = ReturnType<typeof createCourseStore>;
