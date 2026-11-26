import { json as parseJson, Router, type ErrorRequestHandler, type Response } from 'express';
import Joi from 'joi';
import type { Sequelize } from 'sequelize';
import { administrationPermission, staffManagePermission, staffWorkspacePermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import { CourseError, type CourseInput, type CourseListOptions, type CourseRecord } from '../courses/contract';
import type { CourseStore } from '../courses/store';
import { updateCourse } from '../courses/validation';
import { canonicalMediaLocale } from '../media/contract';
import { assignableRoles, lanes, StaffError, type AssignmentInput, type StaffRole } from './contract';
import { createStaffStore } from './store';

const id = Joi.string().uuid({ version: 'uuidv4' }).required();
const locale = Joi.string().trim().max(35).custom((tag: string, helpers) => canonicalMediaLocale(tag) ?? helpers.error('any.invalid'));
const paging = {
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(20),
};
const fields = {
  version: Joi.number().integer().min(1).required(),
  entryId: id,
  locale: locale.required(),
  title: Joi.string().trim().max(150).required(),
};
const text = (max: number) => Joi.string().trim().max(max).allow('').default('');
type CopyPatch = { version: number; entryId: string; locale: string; title: string } & (
  { scope: 'course'; description: string; objectives: string; prerequisites: string } |
  { scope: 'chapter' } |
  { scope: 'lesson'; description: string; body: string; imageAlt: string }
);

const copyInput = Joi.alternatives().try(
  Joi.object({ ...fields, scope: Joi.valid('course').required(), description: text(2400), objectives: text(2400), prerequisites: text(2400) }),
  Joi.object({ ...fields, scope: Joi.valid('chapter').required() }),
  Joi.object({ ...fields, scope: Joi.valid('lesson').required(), description: text(2400), body: text(12000), imageAlt: text(500) }),
).required();
const editable = ['draft', 'educational-review', 'translation-review'] as const;

function actor(response: Response) {
  return (response.locals.identity as IdentitySession).id;
}
function target(response: Response) {
  return (response.locals.validated.params as { id: string }).id;
}
function replaceCopy<T extends { locale: string }>(values: T[], locale: string, translating: boolean, edit: (previous?: T) => T) {
  const existing = values.find(item => item.locale === locale);
  if (!translating && !existing) throw new StaffError('INVALID_ASSIGNMENT');
  const updated = edit(existing);
  return existing ? values.map(item => item === existing ? updated : item) : [...values, updated];
}

function revisedCourse(course: CourseRecord, patch: CopyPatch, translating: boolean): CourseInput {
  const { slug, subjectId, levelId, gradeId, thumbnailId, estimatedMinutes, instructor, tagIds, relatedCourseIds, provenance } = course;
  const input: CourseInput = {
    slug, subjectId, levelId, gradeId, thumbnailId, estimatedMinutes, instructor, tagIds, relatedCourseIds, provenance,
    translations: course.translations,
    chapters: course.chapters,
  };
  const { locale, title } = patch;
  const copy = { locale, title };
  if (patch.scope === 'course' && patch.entryId === course.id) {
    const { description, objectives, prerequisites } = patch;
    input.translations = replaceCopy(input.translations, locale, translating,
      existing => ({ ...existing, ...copy, description, objectives, prerequisites }));
  } else if (patch.scope === 'chapter' && input.chapters.some(chapter => chapter.id === patch.entryId)) {
    input.chapters = input.chapters.map(chapter => chapter.id === patch.entryId
      ? { ...chapter, translations: replaceCopy(chapter.translations, locale, translating, existing => ({ ...existing, ...copy })) } : chapter);
  } else if (patch.scope === 'lesson' && input.chapters.some(chapter => chapter.lessons.some(lesson => lesson.id === patch.entryId))) {
    const { description, body, imageAlt } = patch;
    input.chapters = input.chapters.map(chapter => ({
      ...chapter,
      lessons: chapter.lessons.map(lesson => lesson.id === patch.entryId ? {
        ...lesson, translations: replaceCopy(lesson.translations, locale, translating,
          existing => ({ ...existing, ...copy, description, body, imageAlt })),
      } : lesson),
    }));
  } else {
    throw new StaffError('NOT_FOUND');
  }
  return input;
}

export function createStaffRoutes(db: Sequelize, courses: CourseStore, identity: IdentityStore,
  options: { origins: readonly string[]; production: boolean }) {
  const router = Router();
  const admin = Router();
  const staff = Router();
  const store = createStaffStore(db, courses);
  const secure = requireSecureTransport(options.production);
  const session = loadIdentity(identity, sessionCookie(options.production).name);
  const write = requireOriginAndJson(options.origins);
  const routeId = validateInput('params', Joi.object({ id }));
  const pageQuery = validateInput('query', Joi.object(paging));

  admin.use(secure, session, requirePermission(administrationPermission), requirePermission(staffManagePermission));
  admin.get('/users', validateInput('query', Joi.object({
    ...paging, prefix: Joi.string().lowercase().trim().pattern(/^[a-z0-9._-]*$/).max(32).allow('').default(''),
  })), async (_request, response) => response.json(await store.listUsers(response.locals.validated.query, response.locals.validated.query.prefix)));
  admin.patch('/users/:id', routeId, write, validateInput('body', Joi.object({
    role: Joi.string().valid(...assignableRoles).allow(null).required(), active: Joi.boolean().required(),
    revision: Joi.string().isoDate().required(),
  }).required()), async (_request, response) => {
    const payload = response.locals.validated.body as { role: StaffRole | null; active: boolean; revision: string };
    await store.setUser({ ...payload, id: target(response), actorId: actor(response) });
    response.status(204).end();
  });
  admin.get('/courses', validateInput('query', Joi.object({
    ...paging, q: text(120), status: Joi.string().valid(...editable).default('draft'),
  })), async (_request, response) => {
    const result = await courses.list(response.locals.validated.query as CourseListOptions);
    response.json({ total: result.total, items: result.items.map(({ id, slug, translations }) => ({ id, slug, translations })) });
  });
  admin.get('/assignments', pageQuery, async (_request, response) => response.json(await store.listAssignments(response.locals.validated.query)));
  admin.post('/assignments', write, validateInput('body', Joi.object({
    courseId: id, assigneeId: id, lane: Joi.string().valid(...lanes).required(),
    locale: Joi.when('lane', { is: 'translate', then: locale.required(), otherwise: Joi.valid(null).required() }), instructions: text(1000),
  }).required()), async (_request, response) => {
    response.status(201).json({ item: await store.assign(response.locals.validated.body as AssignmentInput, actor(response)) });
  });
  admin.post('/assignments/:id/revoke', routeId, write, validateInput('body', Joi.object({}).required()), async (_request, response) => {
    await store.revoke(target(response), actor(response));
    response.status(204).end();
  });
  admin.get('/audit', pageQuery, async (_request, response) => response.json(await store.listAudit(response.locals.validated.query)));

  staff.use(secure, session, requirePermission(staffWorkspacePermission));
  staff.get('/assignments', pageQuery, async (_request, response) =>
    response.json(await store.listAssignments(response.locals.validated.query, actor(response))));
  staff.get('/assignments/:id', routeId, async (_request, response) => {
    const item = await store.usingAssignment(target(response), actor(response), async (assignment, transaction) => ({
      assignment, course: await courses.get(assignment.courseId, transaction),
    }));
    response.json({ item });
  });
  staff.patch('/assignments/:id/copy', routeId, write, parseJson({ limit: '64kb' }), validateInput('body', copyInput), async (_request, response) => {
    const patch = response.locals.validated.body as CopyPatch;
    const userId = actor(response);
    const course = await store.usingAssignment(target(response), userId, async (assignment, transaction) => {
      const translating = assignment.lane === 'translate';
      if (assignment.lane === 'review' || (translating && assignment.locale !== patch.locale)) throw new StaffError('INVALID_ASSIGNMENT');
      const current = await courses.get(assignment.courseId, transaction);
      if (current.version !== patch.version) throw new StaffError('STALE_VERSION');
      const { error, value } = updateCourse.validate({ ...revisedCourse(current, patch, translating), version: patch.version });
      if (error) throw new StaffError('INVALID_ASSIGNMENT');
      const { version, ...input } = value as CourseInput & { version: number };
      const changed = await courses.update(assignment.courseId, input, version, transaction);
      await store.auditEdit(assignment.id, userId, transaction);
      return changed;
    });
    response.json({ course });
  });
  staff.post('/assignments/:id/complete', routeId, write, validateInput('body', Joi.object({
    action: Joi.string().valid('submit', 'approve', 'return').required(),
    version: Joi.number().integer().min(1).required(),
  }).required()), async (_request, response) => {
    const { action, version } = response.locals.validated.body as { action: 'submit' | 'approve' | 'return'; version: number };
    const userId = actor(response);
    await store.usingAssignment(target(response), userId, async (assignment, transaction) => {
      if ((assignment.lane === 'review') === (action === 'submit')) throw new StaffError('INVALID_ASSIGNMENT');
      const course = await courses.get(assignment.courseId, transaction);
      if (course.version !== version) throw new StaffError('STALE_VERSION');
      if (action === 'approve' || action === 'return') {
        if (course.status !== 'educational-review' && course.status !== 'translation-review') throw new StaffError('INVALID_ASSIGNMENT');
        await courses.changeStatus(assignment.courseId, action === 'approve' ? 'approved' : 'draft', version, transaction);
      }
      await store.complete(assignment, userId, action === 'submit' ? 'assignment_completed'
        : action === 'approve' ? 'course_approved' : 'course_returned', transaction);
    });
    response.status(204).end();
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
    if (!(error instanceof StaffError) && !(error instanceof CourseError)) return next(error);
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'PROTECTED_ACCOUNT' ? 403
      : error.code === 'STALE_VERSION' || error.code === 'INVALID_TRANSITION' ? 409 : 422;
    return next(new ApiError(status, error.code, 'The requested staff action is unavailable.'));
  };
  router.use('/admin/staff', admin);
  router.use('/staff', staff);
  router.use(handleError);
  return router;
}

