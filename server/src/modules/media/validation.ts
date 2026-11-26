import Joi from 'joi';
import { canonicalMediaLocale, isValidMediaSlot, mediaKinds, mediaRelations, mediaStatuses, type MediaRelation } from './contract';

const uuid = Joi.string().uuid({ version: 'uuidv4' }).required();
const version = Joi.number().integer().min(1).max(0xffffffff).required();
const status = Joi.string().valid(...mediaStatuses);
const kind = Joi.string().valid(...mediaKinds);
const locale = Joi.string().trim().max(35).custom((tag: string, helpers) => canonicalMediaLocale(tag) ?? helpers.error('any.invalid'));

const metadata = {
  title: Joi.string().trim().min(1).max(150).required(),
  license: Joi.string().trim().min(1).max(150).required(),
  source: Joi.string().trim().min(1).max(700).required(),
  author: Joi.string().trim().allow('').max(150).default(''),
  language: locale.empty('').allow(null).default(null),
  downloadAllowed: Joi.boolean().default(false),
};

export const assetParams = Joi.object({ id: uuid });
export const listQuery = Joi.object({
  q: Joi.string().trim().allow('').max(120).default(''),
  kind,
  status,
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(10),
  orphans: Joi.boolean().default(false),
});
export const uploadMetadata = Joi.object({ kind: kind.required(), ...metadata }).required();
export const updateMetadata = Joi.object({ ...metadata, version }).required();
export const statusInput = Joi.object({ status: status.required(), version }).required();
export const deleteInput = Joi.object({ version, confirm: Joi.boolean().valid(true).required() }).required();
export const cleanupInput = Joi.object({ confirm: Joi.boolean().valid(true).required() }).required();
export const fileQuery = Joi.object({ download: Joi.boolean().default(false) });

const link = {
  relation: Joi.string().valid(...mediaRelations).required(),
  slot: Joi.string().trim().max(35).required(),
  version,
};

function validSlot<T extends { relation: MediaRelation; slot: string }>(value: T, helpers: Joi.CustomHelpers) {
  return isValidMediaSlot(value.relation, value.slot) ? value : helpers.error('any.invalid');
}

export const attachInput = Joi.object({ ...link, assetId: uuid }).custom(validSlot).required();
export const detachInput = Joi.object(link).custom(validSlot).required();
