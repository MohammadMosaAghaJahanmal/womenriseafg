import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import Joi from 'joi';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import { educationStatuses, type EducationStatus } from '../education/contract';
import { canonicalMediaLocale } from '../media/contract';
import {
  activityKinds, dailyModes, DiscoverableKind, discoverableKinds, DiscoveryError, discoveryManagePermission,
  discoveryPublishPermission, type DailySettings, type PathInput, type PathListQuery, type SearchQuery,
} from './contract';
import type { DiscoveryStore } from './store';

const id = Joi.string().trim().lowercase().uuid({ version: 'uuidv4' });
const slug = Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const locale = Joi.string().trim().max(35).custom((tag: string, helpers) => canonicalMediaLocale(tag) ?? helpers.error('any.invalid'));
const q = Joi.string().trim().max(120).allow('').default('');
const pageFields = { page: Joi.number().integer().min(1).max(10000).default(1), pageSize: Joi.number().integer().min(1).max(30).default(12) };
const scope = {
  q, kind: Joi.string().valid(...discoverableKinds), language: locale, preferred: locale,
  subjectId: id, categoryId: id, levelId: id, gradeId: id,
};
const searchQuery = Joi.object({ ...scope, ...pageFields });
const suggestionQuery = Joi.object({ q: Joi.string().trim().min(2).max(120).required(), language: locale, preferred: locale });
const activity = Joi.object({ kind: Joi.string().valid(...activityKinds).required(), id: id.required() });
const activities = Joi.array().items(activity).max(24).unique((first, second) => first.id === second.id && first.kind === second.kind).default([]);
const pathFields = {
  slug: slug.required(), subjectId: id.allow(null).default(null), levelId: id.allow(null).default(null),
  translations: Joi.array().items(Joi.object({
    locale: locale.required(), title: Joi.string().trim().min(1).max(150).required(),
    description: Joi.string().trim().max(1000).allow('').default(''),
  })).min(1).max(6).unique('locale').required(),
  activities,
};
const version = Joi.number().integer().min(1).max(0xffffffff).required();
const dailyBody = Joi.object({ mode: Joi.string().valid(...dailyModes).required(), activities, version }).required();
const pathBody = Joi.object(pathFields).required();
const pathUpdate = Joi.object({ ...pathFields, version }).required();
const pathStatus = Joi.object({ status: Joi.string().valid(...educationStatuses).required(), version }).required();
const pathDeletion = Joi.object({ version, confirm: Joi.boolean().valid(true).required() }).required();
const pathList = Joi.object({ q, ...pageFields, status: Joi.string().valid(...educationStatuses) });
const collectionList = Joi.object({ q, ...pageFields, language: locale, preferred: locale });
const localeQuery = Joi.object({ language: locale });
const pathSlug = Joi.object({ slug: slug.required() });
const pathId = Joi.object({ id: id.required() });
const target = Joi.object({ kind: Joi.string().valid(...discoverableKinds).required(), id: id.required() });

const failures = {
  NOT_FOUND: [404, 'This learning path is unavailable.'],
  CONFLICT: [409, 'This path code is already in use.'],
  STALE_VERSION: [409, 'This entry has changed. Reload before saving again.'],
  INVALID_TRANSITION: [409, 'This status change is unavailable.'],
  INVALID_REFERENCE: [422, 'Choose published activities, languages and filter values.'],
  INCOMPLETE_PATH: [422, 'Add a description and at least one activity.'],
} as const;
const handleError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (!(error instanceof DiscoveryError)) return next(error);
  const [status, message] = failures[error.code];
  next(new ApiError(status, error.code, message));
};

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

export function createDiscoveryRoutes(store: DiscoveryStore, identity: IdentityStore, options: RouteOptions, collections?: DiscoveryStore) {
  const router = Router();
  const admin = Router();
  const json = requireOriginAndJson(options.origins);
  const publish = requirePermission(discoveryPublishPermission);
  const validateId = validateInput('params', pathId);
  const validateLocale = validateInput('query', localeQuery);

  function audit(action: string, id: string, actor: IdentitySession) {
    options.logger.info({ event: 'discovery_changed', action, entryId: id, actorId: actor.id });
  }

  const listPublic: (paths: boolean) => RequestHandler = paths => async (_request, response) => {
    const query = response.locals.validated.query as SearchQuery;
    response.json(await store.search(paths ? { ...query, kind: 'path' } : query));
  };
  router.get('/search', validateInput('query', searchQuery), listPublic(false));
  router.get('/search/suggestions', validateInput('query', suggestionQuery), async (_request, response) => {
    const { q, language, preferred } = response.locals.validated.query as Pick<SearchQuery, 'q' | 'language' | 'preferred'>;
    const { items } = await store.search({ q, language, preferred, page: 1, pageSize: 6 });
    response.json({ items });
  });
  router.get('/learning-paths', validateInput('query', searchQuery), listPublic(true));
  function groupDetail(path: string, groups: DiscoveryStore) {
    router.get(path + '/:slug', validateInput('params', pathSlug), validateLocale, async (_request, response) => {
      const { slug } = response.locals.validated.params as { slug: string };
      const { language } = response.locals.validated.query as { language?: string };
      response.json({ item: await groups.publicPath(slug, language) });
    });
  }
  groupDetail('/learning-paths', store);
  if (collections) {
    router.get('/collections', validateInput('query', collectionList), async (_request, response) => {
      response.json(await collections.publicCollections(response.locals.validated.query));
    });
    groupDetail('/collections', collections);
  }
  router.get('/daily-learning', validateLocale, async (_request, response) => {
    const { language } = response.locals.validated.query as { language?: string };
    response.json(await store.daily(language));
  });
  router.get('/recommendations/:kind/:id', validateInput('params', target), validateLocale, async (_request, response) => {
    const { kind, id } = response.locals.validated.params as { kind: DiscoverableKind; id: string };
    const { language } = response.locals.validated.query as { language?: string };
    response.json({ items: await store.recommendations(kind, id, language) });
  });

  admin.use(requireSecureTransport(options.production), loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(discoveryManagePermission));
  function mountGroups(base: string, kind: string, groups: DiscoveryStore) {
    admin.get(base, validateInput('query', pathList), async (_request, response) => {
      response.json(await groups.adminPaths(response.locals.validated.query as PathListQuery));
    });
    admin.get(base + '/:id', validateId, async (_request, response) => {
      response.json({ item: await groups.get(response.locals.validated.params.id as string) });
    });
    admin.post(base, json, validateInput('body', pathBody), async (_request, response) => {
      const item = await groups.create(response.locals.validated.body as PathInput);
      audit(kind + ':created', item.id, response.locals.identity);
      response.status(201).json({ item });
    });
    admin.put(base + '/:id', json, validateId, validateInput('body', pathUpdate), async (_request, response) => {
      const id = response.locals.validated.params.id as string;
      const { version, ...input } = response.locals.validated.body as PathInput & { version: number };
      const item = await groups.update(id, input, version);
      audit(kind + ':updated', id, response.locals.identity);
      response.json({ item });
    });
    admin.patch(base + '/:id/status', json, validateId, validateInput('body', pathStatus), (request, response, next) => {
      const { status } = response.locals.validated.body as { status: EducationStatus };
      if (status === 'approved' || status === 'published' || status === 'archived') return publish(request, response, next);
      next();
    }, async (_request, response) => {
      const id = response.locals.validated.params.id as string;
      const { status, version } = response.locals.validated.body as { status: EducationStatus; version: number };
      const item = await groups.changeStatus(id, status, version);
      audit(kind + ':' + status, id, response.locals.identity);
      response.json({ item });
    });
    admin.delete(base + '/:id', json, validateId, validateInput('body', pathDeletion), async (_request, response) => {
      const id = response.locals.validated.params.id as string;
      await groups.remove(id, (response.locals.validated.body as { version: number }).version);
      audit(kind + ':deleted', id, response.locals.identity);
      response.status(204).end();
    });
  }
  mountGroups('/paths', 'path', store);
  if (collections) mountGroups('/collections', 'collection', collections);
  admin.get('/daily-learning', async (_request, response) => {
    const settings = await store.dailySettings();
    response.json({ settings, previews: await store.activityPreviews(settings.activities) });
  });
  admin.put('/daily-learning', json, publish, validateInput('body', dailyBody), async (_request, response) => {
    const settings = await store.updateDaily(response.locals.validated.body as DailySettings);
    audit('daily:updated', 'daily-learning', response.locals.identity);
    response.json({ settings });
  });

  router.use('/admin/discovery', admin);
  router.use(handleError);
  return router;
}
