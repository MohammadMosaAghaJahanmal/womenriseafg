import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import Joi from 'joi';
import { QueryTypes, type Sequelize } from 'sequelize';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import type { CourseRecord } from '../courses/contract';
import type { CourseStore } from '../courses/store';
import { canonicalMediaLocale } from '../media/contract';

const id = Joi.string().uuid({ version: 'uuidv4' });
const issueInput = Joi.object({
  courseSlug: Joi.string().trim().lowercase().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).required(),
  completedLessonIds: Joi.array().items(id).min(1).max(2000).unique().required(),
  publicVerification: Joi.boolean().default(false),
  locale: Joi.string().trim().max(35).custom((value: string, helpers) => canonicalMediaLocale(value) ?? helpers.error('any.invalid')).required(),
}).required();

interface IssueInput {
  courseSlug: string;
  completedLessonIds: string[];
  publicVerification: boolean;
  locale: string;
}

export function meetsCompletionRequirement(lessonIds: readonly string[], completedIds: readonly string[]) {
  if (!lessonIds.length || lessonIds.length !== completedIds.length) return false;
  const completed = new Set(completedIds);
  return completed.size === lessonIds.length && lessonIds.every(lesson => completed.has(lesson));
}

function project(course: CourseRecord, code: string, locale: string, issued: Date, publicVerification: boolean) {
  const translation = course.translations.find(entry => entry.locale === locale) ??
    course.translations.find(entry => entry.locale === 'en') ?? course.translations[0]!;
  return { code, courseSlug: course.slug, courseTitle: translation.title, locale: translation.locale,
    issuedAt: issued.toISOString(), publicVerification };
}

function unavailable() {
  return new ApiError(404, 'NOT_FOUND', 'The course or public certificate is unavailable.');
}

export function createCertificateRoutes(db: Sequelize, courses: CourseStore, options: { origins: readonly string[]; production: boolean }) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });
  router.post('/certificates', requireSecureTransport(options.production), requireOriginAndJson(options.origins),
    validateInput('body', issueInput), limit, async (_request, response) => {
      const input = response.locals.validated.body as IssueInput;
      const course = await courses.findPublic(input.courseSlug);
      if (!course) throw unavailable();
      const lessonIds = course.chapters.flatMap(chapter => chapter.lessons.map(lesson => lesson.id));
      if (!meetsCompletionRequirement(lessonIds, input.completedLessonIds)) {
        throw new ApiError(422, 'INCOMPLETE_COURSE', 'Complete the current course curriculum first.');
      }
      const certificate = project(course, randomUUID(), input.locale, new Date(), input.publicVerification);
      if (certificate.publicVerification) {
        await db.query('INSERT INTO certificates (code, course_id, locale, issued_at) VALUES ($code, $courseId, $locale, $issued)',
          { bind: { code: certificate.code, courseId: course.id, locale: certificate.locale, issued: new Date(certificate.issuedAt) } });
      }
      response.status(201).json({ certificate });
    });
  router.get('/certificates/:code', validateInput('params', Joi.object({ code: id.required() })),
    async (_request, response) => {
      const { code } = response.locals.validated.params as { code: string };
      const [record] = await db.query<{ slug: string; locale: string; issuedAt: Date }>(`
        SELECT c.slug, claim.locale, claim.issued_at AS issuedAt
        FROM certificates claim JOIN courses c ON c.id = claim.course_id
        WHERE claim.code = $code AND c.status = 'published'
      `, { type: QueryTypes.SELECT, bind: { code } });
      const course = record && await courses.findPublic(record.slug);
      if (!course) throw unavailable();
      response.json({ certificate: project(course, code, record.locale, record.issuedAt, true) });
    });
  return router;
}
