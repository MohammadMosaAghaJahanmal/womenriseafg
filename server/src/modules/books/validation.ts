import Joi from 'joi';
import { educationStatuses } from '../education/contract';
import { canonicalMediaLocale } from '../media/contract';

const id = Joi.string().trim().lowercase().uuid({ version: 'uuidv4' });
const nullableId = id.allow(null).default(null);
const slug = Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const version = Joi.number().integer().min(1).max(0xffffffff).required();
const status = Joi.string().valid(...educationStatuses);
const locale = Joi.string().trim().max(35).custom((tag: string, helpers) =>
  canonicalMediaLocale(tag) ?? helpers.error('any.invalid'));
const text = (max: number) => Joi.string().trim().max(max).allow('').default('');

const fields = {
  slug: slug.required(),
  pdfId: nullableId,
  coverId: nullableId,
  categoryId: nullableId,
  levelId: nullableId,
  gradeId: nullableId,
  contentLanguage: locale.allow(null).default(null),
  author: text(150),
  publisher: text(150),
  publicationYear: Joi.number().integer().min(1).max(9999).allow(null).default(null),
  edition: text(100),
  translations: Joi.array().items(Joi.object({
    locale: locale.required(),
    title: Joi.string().trim().min(1).max(150).required(),
    description: text(1000),
  })).min(1).max(6).unique('locale').required(),
};

export const itemId = Joi.object({ id: id.required() });
export const itemSlug = Joi.object({ slug: slug.required() });
export const newBook = Joi.object(fields).required();
export const updateBook = Joi.object({ ...fields, version }).required();
export const statusChange = Joi.object({ status: status.required(), reviewNote: text(1200), version }).required();
export const deleteBook = Joi.object({ version, confirm: Joi.boolean().valid(true).required() }).required();

const pagination = {
  q: Joi.string().trim().max(120).allow('').default(''),
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(12),
};
const filters = { categoryId: id, levelId: id, language: locale };

export const publicQuery = Joi.object({ ...pagination, ...filters });
export const adminQuery = Joi.object({ ...pagination, ...filters, status });
export const assetsQuery = Joi.object({
  ...pagination,
  kind: Joi.string().valid('pdf', 'image').default('pdf'),
  status: Joi.string().valid('draft', 'published').default('published'),
});
