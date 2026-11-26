import Joi from 'joi';
import { educationKinds, educationStatuses, type EducationKind } from './contract';

const slug = Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required();
const id = Joi.string().uuid({ version: 'uuidv4' });
const version = Joi.number().integer().min(1).max(0xffffffff).required();
const status = Joi.string().valid(...educationStatuses);

const locale = Joi.string().trim().max(35).custom((value: string, helpers) => {
  try {
    const parsed = new Intl.Locale(value);
    if (parsed.toString() === parsed.baseName && parsed.baseName.length <= 35) return parsed.baseName;
  } catch {
    // Use the same validation result for malformed or unsupported language tags.
  }
  return helpers.error('any.invalid');
}).required();

const translations = Joi.array().items(Joi.object({
  locale,
  name: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().trim().allow('').max(1200).default(''),
})).min(1).max(32).unique('locale').required();

const extraFields = {
  categories: {},
  subjects: { categoryId: id.allow(null).default(null) },
  levels: {},
  grades: { gradeNumber: Joi.number().integer().min(1).max(12).required() },
  languages: { locale, direction: Joi.string().valid('ltr', 'rtl').required() },
  tags: {},
};

export const kindParams = Joi.object({ kind: Joi.string().valid(...educationKinds).required() });
export const entryParams = kindParams.keys({ id: id.required() });
const baseListQuery = Joi.object({
  q: Joi.string().trim().allow('').max(120).default(''),
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(10),
});
export const publicListQuery = baseListQuery;
export const adminListQuery = baseListQuery.keys({ status });
export const versionInput = Joi.object({ version }).required();
export const statusInput = versionInput.keys({ status: status.required() });

export const createInput = Object.fromEntries(educationKinds.map(kind => [
  kind, Joi.object({ slug, translations, ...extraFields[kind] }).required(),
])) as Record<EducationKind, Joi.ObjectSchema>;
export const updateInput = Object.fromEntries(educationKinds.map(kind => [
  kind, createInput[kind].keys({ version }),
])) as Record<EducationKind, Joi.ObjectSchema>;
