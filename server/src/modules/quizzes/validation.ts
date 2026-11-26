import Joi from 'joi';
import { educationStatuses } from '../education/contract';
import { provenanceInput } from '../courses/provenance';
import { canonicalMediaLocale } from '../media/contract';
import { normalizeAnswer, questionKinds, quizQuestionLimit, type QuestionInput } from './contract';

const id = Joi.string().trim().lowercase().uuid({ version: 'uuidv4' });
const slug = Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const version = Joi.number().integer().min(1).max(0xffffffff).required();
const status = Joi.string().valid(...educationStatuses);
const kind = Joi.string().valid(...questionKinds);
const locale = Joi.string().trim().max(35).custom((tag: string, helpers) =>
  canonicalMediaLocale(tag) ?? helpers.error('any.invalid'));
const text = (max: number) => Joi.string().trim().max(max).allow('').default('');
const requiredText = (max: number) => Joi.string().trim().min(1).max(max).required();
const options = Joi.array().items(Joi.number().integer().min(0).max(7)).max(8).unique().default([]);

const question = {
  kind: kind.required(),
  provenance: provenanceInput,
  correctOptions: options,
  translations: Joi.array().min(1).max(6).unique('locale').items(Joi.object({
    locale: locale.required(), prompt: requiredText(300), explanation: text(400),
    provenance: provenanceInput,
    options: Joi.array().items(Joi.string().trim().min(1).max(100)).max(8).default([]),
    acceptedAnswers: Joi.array().items(Joi.string().trim().min(1).max(100)).max(8).default([]),
  })).required(),
};

const quiz = {
  slug: slug.required(), courseId: id.allow(null).default(null),
  provenance: provenanceInput,
  passingScore: Joi.number().integer().min(1).max(100).default(70),
  questionIds: Joi.array().items(id).max(quizQuestionLimit).unique().default([]),
  translations: Joi.array().min(1).max(6).unique('locale').items(Joi.object({
    locale: locale.required(), title: requiredText(150), description: text(500),
    provenance: provenanceInput,
  })).required(),
};

function validQuestion(input: QuestionInput, helpers: Joi.CustomHelpers) {
  const optionCount = input.translations[0]!.options.length;
  const answers = input.correctOptions.length;
  if (input.kind === 'short-answer') {
    if (answers || input.translations.some(translation => translation.options.length || !translation.acceptedAnswers.length ||
        new Set(translation.acceptedAnswers.map(answer => normalizeAnswer(answer, translation.locale))).size !== translation.acceptedAnswers.length)) {
      return helpers.error('any.invalid');
    }
  } else if (optionCount < 2 || (input.kind === 'true-false' && optionCount !== 2) ||
    (input.kind === 'multiple-choice' ? answers < 2 : answers !== 1) || input.correctOptions.some(position => position >= optionCount) ||
    input.translations.some(translation => translation.acceptedAnswers.length || translation.options.length !== optionCount ||
      new Set(translation.options.map(label => normalizeAnswer(label, translation.locale))).size !== optionCount)) {
    return helpers.error('any.invalid');
  }
  return input;
}

export const newQuiz = Joi.object(quiz).required();
export const updateQuiz = Joi.object({ ...quiz, version }).required();
export const newQuestion = Joi.object(question).custom(validQuestion).required();
export const updateQuestion = Joi.object({ ...question, version }).custom(validQuestion).required();
export const itemId = Joi.object({ id: id.required() });
export const itemSlug = Joi.object({ slug: slug.required() });
export const quizStatus = Joi.object({ status: status.required(), version }).required();
export const deletion = Joi.object({ confirm: Joi.boolean().valid(true).required(), version }).required();
export const attempt = Joi.object({ version, language: locale.required(), answers: Joi.array().min(1).max(quizQuestionLimit)
  .unique('questionId').items(Joi.object({ questionId: id.required(), options, text: text(200) })).required() }).required();

const paging = {
  q: Joi.string().trim().max(120).allow('').default(''),
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(12),
};

export const adminQuery = Joi.object({ ...paging, status });
export const publicQuery = Joi.object({ ...paging, language: locale, courseId: id, standalone: Joi.boolean() });
export const bankQuery = Joi.object({ ...paging, kind });
