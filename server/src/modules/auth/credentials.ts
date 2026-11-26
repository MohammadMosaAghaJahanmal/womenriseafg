import Joi from 'joi';

export function normalizeLogin(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLogin(value: string) {
  // ASCII pseudonyms keep case-folding consistent across MySQL and the UI.
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(value.trim());
}

function isPasswordInput(value: string) {
  return value.length > 0 && Buffer.byteLength(value, 'utf8') <= 512 && [...value].length <= 128;
}

export function isStrongPassword(value: string) {
  return isPasswordInput(value) && [...value].length >= 15 && /\S/u.test(value);
}

const username = Joi.string().max(128).required().custom((value: string, helpers) =>
  isValidLogin(value) ? normalizeLogin(value) : helpers.error('any.invalid'));
const password = Joi.string().max(512, 'utf8').required();

export type Credentials = { username: string; password: string };

export const registerInput = Joi.object<Credentials>({
  username,
  password: password.custom((value: string, helpers) =>
    isStrongPassword(value) ? value : helpers.error('any.invalid')),
}).required();

export const loginInput = Joi.object<Credentials>({
  username,
  password: password.custom((value: string, helpers) =>
    isPasswordInput(value) ? value : helpers.error('any.invalid')),
}).required();
