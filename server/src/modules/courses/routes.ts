import { json as parseJson, Router, type ErrorRequestHandler, type Response } from 'express';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import type { MediaAsset, MediaListOptions } from '../media/contract';
import type { MediaStore } from '../media/store';
import {
  CourseError, courseManagePermission, coursePublishPermission,
  type CourseInput, type CourseListOptions, type CourseRecord, type CourseStatus,
} from './contract';
import type { CourseStore } from './store';
import { adminQuery, assetsQuery, courseId, courseSlug, deleteCourse, lessonSlug,
  newCourse, publicQuery, statusChange, updateCourse } from './validation';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

const failures = {
  NOT_FOUND: [404, 'Course or lesson not found.'],
  CONFLICT: [409, 'The course slug is in use or this entry is still referenced.'],
  STALE_VERSION: [409, 'The course changed. Reload it and try again.'],
  INVALID_REFERENCE: [422, 'Select available course, taxonomy, language, or media resources.'],
  INVALID_TRANSITION: [409, 'This status change is unavailable.'],
  INCOMPLETE_COURSE: [422, 'Add a chapter, a lesson, and its required content before publishing.'],
  RESOURCE_DOWNLOAD_FORBIDDEN: [422, 'Choose a downloadable attachment or a resource that can be opened inline.'],
} as const;

const handleCourseError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (!(error instanceof CourseError)) return next(error);
  const [status, message] = failures[error.code];
  next(new ApiError(status, error.code, message));
};

function projectCourse(course: CourseRecord) {
  const { id, slug, subjectId, levelId, gradeId, thumbnailId, estimatedMinutes, instructor, status, updatedAt, translations } = course;
  const chapters = course.chapters.map(chapter => ({
    id: chapter.id,
    translations: chapter.translations,
    lessons: chapter.lessons.map(lesson => ({
      id: lesson.id,
      slug: lesson.slug,
      kind: lesson.kind,
      translations: lesson.translations.map(({ locale, title, description }) => ({ locale, title, description })),
      resourceLabels: lesson.resources.map(({ label }) => label),
    })),
  }));
  return { id, slug, subjectId, levelId, gradeId, thumbnailId, estimatedMinutes, instructor, status, updatedAt, translations,
    chapters, lessonCount: chapters.reduce((total, chapter) => total + chapter.lessons.length, 0) };
}

function projectMedia(file: MediaAsset | null) {
  if (!file) return null;
  const { id, kind, title, mimeType, sizeBytes, downloadAllowed, links } = file;
  return { id, kind, title, mimeType, sizeBytes, downloadAllowed, links };
}

function projectAssetChoice({ id, kind, title, language, originalName }: MediaAsset) {
  return { id, kind, title, language, originalName };
}

function courseKey(response: Response) {
  return (response.locals.validated.params as { id: string }).id;
}

export function createCourseRoutes(store: CourseStore, media: MediaStore, identity: IdentityStore, options: RouteOptions) {
  const router = Router();
  const admin = Router();
  const secure = requireSecureTransport(options.production);
  const json = requireOriginAndJson(options.origins);
  const curriculumBody = parseJson({ limit: '512kb' });
  const statusBody = parseJson({ limit: '32kb' });
  const publish = requirePermission(coursePublishPermission);
  const validateId = validateInput('params', courseId);

  function audit(response: Response, action: string, id: string) {
    const actor = response.locals.identity as IdentitySession;
    options.logger.info({ event: 'course_changed', action, courseId: id, actorId: actor.id });
  }

  async function published(slug: string) {
    const course = await store.findPublic(slug);
    if (!course) throw new CourseError('NOT_FOUND');
    return course;
  }

  router.get('/courses', validateInput('query', publicQuery), async (_request, response) => {
    const query = response.locals.validated.query as CourseListOptions;
    response.json(await store.list({ ...query, publicOnly: true }));
  });
  router.get('/courses/:slug', validateInput('params', courseSlug), async (_request, response) => {
    const course = await published(response.locals.validated.params.slug);
    const related = await store.findPublicRelated(course.relatedCourseIds);
    response.json({ course: projectCourse(course), related });
  });
  router.get('/courses/:slug/lessons/:lessonSlug', validateInput('params', lessonSlug), async (_request, response) => {
    const { slug, lessonSlug: target } = response.locals.validated.params as { slug: string; lessonSlug: string };
    const course = await published(slug);
    const lessons = course.chapters.flatMap(chapter => chapter.lessons);
    const position = lessons.findIndex(lesson => lesson.slug === target);
    const current = lessons[position];
    if (!current) throw new CourseError('NOT_FOUND');

    const { id, translations, mediaId, kind } = current;
    const [mediaFile, resourceFiles] = await Promise.all([
      mediaId ? media.findPublic(mediaId) : Promise.resolve(null),
      Promise.all(current.resources.map(async ({ mediaId, label }) => ({
        mediaId, label, media: projectMedia(await media.findPublic(mediaId)),
      }))),
    ]);
    response.json({
      course: projectCourse(course),
      lesson: { id, slug: current.slug, translations, mediaId, kind },
      previous: lessons[position - 1]?.slug ?? null,
      next: lessons[position + 1]?.slug ?? null,
      media: projectMedia(mediaFile),
      resources: resourceFiles.filter(file => file.media),
    });
  });

  admin.use(secure, loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(courseManagePermission));
  admin.get('/', validateInput('query', adminQuery), async (_request, response) => {
    response.json(await store.list(response.locals.validated.query as CourseListOptions));
  });
  admin.get('/assets', validateInput('query', assetsQuery), async (_request, response) => {
    const result = await media.list({ ...(response.locals.validated.query as MediaListOptions), status: 'published' });
    response.json({ ...result, items: result.items.map(projectAssetChoice) });
  });
  admin.get('/assets/:id', validateId, async (_request, response) => {
    const item = await media.findPublic(courseKey(response));
    if (!item) throw new CourseError('NOT_FOUND');
    response.json({ item: projectAssetChoice(item) });
  });
  admin.get('/:id', validateId, async (_request, response) => {
    response.json({ item: await store.get(courseKey(response)) });
  });
  admin.post('/', json, curriculumBody, validateInput('body', newCourse), async (_request, response) => {
    const actor = response.locals.identity as IdentitySession;
    const item = await store.create(response.locals.validated.body as CourseInput, actor.id);
    audit(response, 'created', item.id);
    response.status(201).json({ item });
  });
  admin.put('/:id', json, validateId, curriculumBody, validateInput('body', updateCourse), async (_request, response) => {
    const { version, ...input } = response.locals.validated.body as CourseInput & { version: number };
    const item = await store.update(courseKey(response), input, version);
    audit(response, 'updated', item.id);
    response.json({ item });
  });
  admin.patch('/:id/status', json, validateId, statusBody, validateInput('body', statusChange), (request, response, next) => {
    const { status } = response.locals.validated.body as { status: CourseStatus };
    if (status === 'published' || status === 'archived') return publish(request, response, next);
    next();
  }, async (_request, response) => {
    const { status, version } = response.locals.validated.body as { status: CourseStatus; version: number };
    const item = await store.changeStatus(courseKey(response), status, version);
    audit(response, 'status:' + status, item.id);
    response.json({ item });
  });
  admin.delete('/:id', json, validateId, statusBody, validateInput('body', deleteCourse), async (_request, response) => {
    const id = courseKey(response);
    await store.remove(id, (response.locals.validated.body as { version: number }).version);
    audit(response, 'deleted', id);
    response.status(204).end();
  });

  router.use('/admin/courses', admin);
  router.use(handleCourseError);
  return router;
}
