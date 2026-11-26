import { Router, json as parseJson, type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import { HomepageError, homepageManagePermission, type HomepageSettings, type HomeQuery } from './contract';
import type { HomepageStore } from './store';
import { courseOpen, editSettings, homeQuery, imageQuery } from './validation';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

const failures = {
  STALE_VERSION: [409, 'The homepage settings changed. Reload before saving.'],
  INVALID_REFERENCE: [422, 'Choose published courses, books and images.'],
  HOME_UNAVAILABLE: [503, 'Homepage settings are unavailable.'],
  COURSE_UNAVAILABLE: [404, 'This course is unavailable.'],
} as const;
const handleError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (!(error instanceof HomepageError)) return next(error);
  const [status, message] = failures[error.code];
  next(new ApiError(status, error.code, message));
};

export function createHomepageRoutes(store: HomepageStore, identity: IdentityStore, options: RouteOptions) {
  const router = Router();
  const admin = Router();
  const secure = requireSecureTransport(options.production);
  const json = requireOriginAndJson(options.origins);
  const limitOpens = rateLimit({
    windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });

  router.get('/homepage', validateInput('query', homeQuery), async (_request, response) => {
    response.json(await store.getHomepage(response.locals.validated.query as HomeQuery));
  });
  router.get('/homepage/branding', async (_request, response) => {
    response.json(await store.getBranding());
  });
  router.post('/homepage/course-opens', secure, json, limitOpens, validateInput('body', courseOpen), async (_request, response) => {
    const { slug } = response.locals.validated.body as { slug: string };
    await store.recordCourseOpen(slug);
    response.status(204).end();
  });

  admin.use(secure, loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(homepageManagePermission));
  admin.get('/', async (_request, response) => {
    response.json(await store.getSettings());
  });
  admin.get('/images', validateInput('query', imageQuery), async (_request, response) => {
    response.json(await store.publishedImages(response.locals.validated.query as { q: string; page: number; pageSize: number }));
  });
  admin.put('/', json, parseJson({ limit: '64kb' }), validateInput('body', editSettings), async (_request, response) => {
    const saved = await store.update(response.locals.validated.body as HomepageSettings);
    const actor = response.locals.identity as IdentitySession;
    options.logger.info({ event: 'homepage_settings_changed', version: saved.settings.version, actorId: actor.id });
    response.json(saved);
  });

  router.use('/admin/homepage', admin);
  router.use(handleError);
  return router;
}
