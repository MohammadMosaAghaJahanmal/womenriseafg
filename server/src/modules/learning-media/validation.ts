import Joi from 'joi';
import { educationStatuses } from '../education/contract';
import { canonicalMediaLocale, mediaKinds } from '../media/contract';
import { aiOrigins, learningMediaKinds, type LearningMediaInput } from './contract';

const id = Joi.string().trim().lowercase().uuid({ version: 'uuidv4' });
const nullableId = id.allow(null).default(null);
const slug = Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const version = Joi.number().integer().min(1).max(0xffffffff).required();
const kind = Joi.string().valid(...learningMediaKinds);
const status = Joi.string().valid(...educationStatuses);
const locale = Joi.string().trim().max(35).custom((tag: string, helpers) =>
  canonicalMediaLocale(tag) ?? helpers.error('any.invalid'));
const text = (max: number) => Joi.string().trim().max(max).allow('').default('');
const metadata = (max: number) => Joi.string().trim().max(max).when('aiOrigin', {
  is: 'human',
  then: Joi.string().allow('').valid('').default(''),
  otherwise: Joi.string().min(1).required(),
});

const properties = {
  slug: slug.required(),
  kind: kind.required(),
  mediaId: nullableId,
  categoryId: nullableId,
  relatedCourseId: nullableId,
  relatedLessonId: nullableId,
  aiOrigin: Joi.string().valid(...aiOrigins).default('human'),
  aiTool: metadata(100),
  aiNotes: metadata(700),
  translations: Joi.array().items(Joi.object({
    locale: locale.required(),
    title: Joi.string().trim().min(1).max(150).required(),
    description: text(1000),
  })).min(1).max(6).unique('locale').required(),
};

function validateAssociations(item: LearningMediaInput, helpers: Joi.CustomHelpers) {
  if ((item.relatedLessonId && !item.relatedCourseId) || (item.kind === 'resource' && item.aiOrigin === 'human')) {
    return helpers.error('any.invalid');
  }
  return item;
}

export const itemId = Joi.object({ id: id.required() });
export const itemSlug = Joi.object({ slug: slug.required() });
export const newItem = Joi.object(properties).custom(validateAssociations).required();
export const updateItem = Joi.object({ ...properties, version }).custom(validateAssociations).required();
export const statusChange = Joi.object({ status: status.required(), reviewNote: text(1200), version }).required();
export const deleteItem = Joi.object({ version, confirm: Joi.boolean().valid(true).required() }).required();

const pagination = {
  q: Joi.string().trim().max(120).allow('').default(''),
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(12),
};

const filters = { categoryId: id, language: locale };
export const publicQuery = Joi.object({ ...pagination, ...filters });
export const adminQuery = Joi.object({ ...pagination, ...filters, status, kind, aiOnly: Joi.boolean() });
export const assetsQuery = Joi.object({
  ...pagination,
  kind: Joi.string().valid(...mediaKinds),
  status: Joi.string().valid('draft', 'published').default('published'),
});
