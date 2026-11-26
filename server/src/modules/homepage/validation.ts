import Joi from 'joi';
import { canonicalMediaLocale } from '../media/contract';
import { interfaceLocales, sectionKeys, siteThemes } from './contract';

const id = Joi.string().trim().lowercase().uuid({ version: 'uuidv4' });
const localizedText = (length: number) => Joi.string().trim().max(length).allow('').required();
const requiredText = (length: number) => Joi.string().trim().min(1).max(length).required();
const locale = Joi.string().valid(...interfaceLocales).required();
const contentLocale = Joi.string().trim().max(35).custom((value: string, helpers) =>
  canonicalMediaLocale(value) ?? helpers.error('any.invalid'));
const references = Joi.array().items(id).unique().max(8).required();

const branding = Joi.object({
  name: requiredText(60),
  logoId: id.allow(null).required(),
  faviconId: id.allow(null).required(),
  defaultTheme: Joi.string().valid(...siteThemes),
  translations: Joi.array().items(Joi.object({
    locale, slogan: localizedText(120), mission: localizedText(700),
  })).length(interfaceLocales.length).unique('locale').required(),
}).required();

const section = Joi.object({ key: Joi.string().valid(...sectionKeys).required(), enabled: Joi.boolean().required() });
const announcement = Joi.object({
  enabled: Joi.boolean().required(),
  translations: Joi.array().items(Joi.object({
    locale, title: requiredText(100), body: requiredText(500),
  })).min(1).max(interfaceLocales.length).unique('locale').required(),
});

export const editSettings = Joi.object({
  version: Joi.number().integer().min(1).max(0xffffffff).required(),
  branding,
  sections: Joi.array().items(section).length(sectionKeys.length).unique('key').required(),
  featuredCourseIds: references,
  recommendedBookIds: references,
  announcements: Joi.array().items(announcement).max(5).required(),
}).required();

export const homeQuery = Joi.object({ language: contentLocale, preferred: contentLocale });
export const courseOpen = Joi.object({
  slug: Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required(),
}).required();
export const imageQuery = Joi.object({
  q: Joi.string().trim().max(120).allow('').default(''),
  page: Joi.number().integer().min(1).max(1000).default(1),
  pageSize: Joi.number().integer().min(1).max(30).default(12),
});
