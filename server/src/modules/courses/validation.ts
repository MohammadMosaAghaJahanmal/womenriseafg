import Joi from 'joi';
import { educationStatuses } from '../education/contract';
import { canonicalMediaLocale, mediaKinds } from '../media/contract';
import { lessonKinds, type CourseInput } from './contract';
import { provenanceInput } from './provenance';

const id = Joi.string().uuid({ version: 'uuidv4' });
const slug = Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nullableId = id.allow(null).default(null);
const version = Joi.number().integer().min(1).max(0xffffffff).required();
const status = Joi.string().valid(...educationStatuses);
const locale = Joi.string().trim().max(35).custom((tag: string, helpers) => canonicalMediaLocale(tag) ?? helpers.error('any.invalid'));
const titleFields = { locale: locale.required(), title: Joi.string().trim().min(1).max(150).required() };
const freeText = (max: number) => Joi.string().trim().max(max).allow('').default('');
const translations = (fields: Record<string, Joi.Schema> = {}) =>
  Joi.array().items(Joi.object({ ...titleFields, ...fields })).min(1).max(12).unique('locale').required();
const lesson = Joi.object({
  id,
  slug: slug.required(),
  kind: Joi.string().valid(...lessonKinds).required(),
  mediaId: nullableId,
  quizId: nullableId,
  translations: translations({ description: freeText(2400), body: freeText(12000), imageAlt: freeText(500), provenance: provenanceInput }),
  resources: Joi.array().items(Joi.object({ mediaId: id.required(), label: freeText(150) }))
    .unique('mediaId').max(12).default([]),
});
const chapter = Joi.object({
  id,
  translations: translations(),
  lessons: Joi.array().items(lesson).max(100).default([]),
});
const courseFields = {
  slug: slug.required(),
  subjectId: nullableId,
  levelId: nullableId,
  gradeId: nullableId,
  thumbnailId: nullableId,
  estimatedMinutes: Joi.number().integer().min(1).max(14400).allow(null).default(null),
  instructor: freeText(150),
  provenance: provenanceInput,
  tagIds: Joi.array().items(id).max(20).unique().default([]),
  relatedCourseIds: Joi.array().items(id).max(8).unique().default([]),
  translations: translations({ description: freeText(2400), objectives: freeText(2400), prerequisites: freeText(2400), provenance: provenanceInput }),
  chapters: Joi.array().items(chapter).max(20).default([]),
};
function curriculumIntegrity(input: CourseInput, helpers: Joi.CustomHelpers) {
  const lessons = input.chapters.flatMap(group => group.lessons);
  const chapterIds = input.chapters.flatMap(group => group.id ? [group.id] : []);
  const lessonIds = lessons.flatMap(item => item.id ? [item.id] : []);
  if (lessons.length > 100 || new Set(lessons.map(item => item.slug)).size !== lessons.length ||
      new Set(chapterIds).size !== chapterIds.length || new Set(lessonIds).size !== lessonIds.length ||
      lessons.some(item => item.kind === 'quiz' ? !!item.mediaId : !!item.quizId || (item.kind === 'text' && !!item.mediaId))) {
    return helpers.error('any.invalid');
  }
  return input;
}

export const newCourse = Joi.object(courseFields).custom(curriculumIntegrity).required();
export const updateCourse = Joi.object({ ...courseFields, version }).custom(curriculumIntegrity).required();
export const statusChange = Joi.object({ status: status.required(), version }).required();
export const deleteCourse = Joi.object({ version, confirm: Joi.boolean().valid(true).required() }).required();
export const courseId = Joi.object({ id: id.required() });
export const courseSlug = Joi.object({ slug: slug.required() });
export const lessonSlug = courseSlug.keys({ lessonSlug: slug.required() });
const listPagination = {
  q: Joi.string().trim().max(120).allow('').default(''),
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(12),
};
export const adminQuery = Joi.object({ ...listPagination, status });
export const publicQuery = Joi.object({ ...listPagination, language: locale, subjectId: id, levelId: id });
export const assetsQuery = Joi.object({ ...listPagination, kind: Joi.string().valid(...mediaKinds) });
