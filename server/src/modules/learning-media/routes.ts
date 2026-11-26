import { Router, type ErrorRequestHandler, type Response } from 'express';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import type { EducationStatus } from '../education/contract';
import { MediaError, mediaManagePermission, type MediaAsset, type MediaListOptions } from '../media/contract';
import type { MediaStore } from '../media/store';
import {
  LearningMediaError, learningMediaManagePermission, learningMediaPublishPermission,
  type LearningMediaInput, type LearningMediaListOptions, type LearningMediaRecord,
} from './contract';
import type { LearningMediaStore } from './store';
import { adminQuery, assetsQuery, deleteItem, itemId, itemSlug, newItem, publicQuery, statusChange, updateItem } from './validation';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

const failures = {
  NOT_FOUND: [404, 'This learning material is unavailable.'],
  CONFLICT: [409, 'This code is in use or the entry is referenced.'],
  STALE_VERSION: [409, 'This entry has changed. Reload before saving again.'],
  INVALID_TRANSITION: [409, 'This status change is unavailable.'],
  INVALID_REFERENCE: [422, 'Select an available file, category, language, course or lesson.'],
  INVALID_SHORT: [422, 'Select a vertical 9:16 video within the configured duration limit.'],
  REVIEW_REQUIRED: [422, 'A human review note and approval are required.'],
  INCOMPLETE_CONTENT: [422, 'Complete the required language, file and editorial information before continuing.'],
  DRAFT_MEDIA_FORBIDDEN: [403, 'The media management permission is required to use a draft file.'],
} as const;

const handleError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (!(error instanceof LearningMediaError)) return next(error);
  const [status, message] = failures[error.code];
  next(new ApiError(status, error.code, message));
};

function publicItem(record: LearningMediaRecord) {
  const { id, slug, kind, categoryId, thumbnailId, durationMs, aiOrigin, aiTool, translations, updatedAt } = record;
  return { id, slug, kind, categoryId, thumbnailId, durationMs, aiOrigin, aiTool, translations, updatedAt };
}

function publicFile(file: MediaAsset) {
  const { id, kind, title, mimeType, sizeBytes, downloadAllowed, links, author, source, license, language } = file;
  return { id, kind, title, mimeType, sizeBytes, downloadAllowed, links, author, source, license, language };
}

function assetChoice(file: MediaAsset) {
  const { id, kind, title, originalName, language, width, height, durationMs, links, license, author, source, status, version } = file;
  return { id, kind, title, originalName, language, width, height, durationMs, links, license, author, source, status, version };
}

function actor(response: Response) {
  return response.locals.identity as IdentitySession;
}

function key(response: Response) {
  return (response.locals.validated.params as { id: string }).id;
}

export function createLearningMediaRoutes(store: LearningMediaStore, media: MediaStore, identity: IdentityStore, options: RouteOptions) {
  const router = Router();
  const admin = Router();
  const json = requireOriginAndJson(options.origins);
  const publish = requirePermission(learningMediaPublishPermission);
  const manageMedia = requirePermission(mediaManagePermission);
  const validateId = validateInput('params', itemId);

  function audit(response: Response, action: string, id: string) {
    options.logger.info({ event: 'learning_media_changed', action, itemId: id, actorId: actor(response).id });
  }

  function canUseDraftMedia(response: Response) {
    return actor(response).permissions.includes(mediaManagePermission);
  }

  for (const [path, filter] of [
    ['/videos', { kind: 'video' }], ['/shorts', { kind: 'short' }], ['/ai-learning', { aiOnly: true }],
  ] as const) {
    router.get(path, validateInput('query', publicQuery), async (_request, response) => {
      const query = response.locals.validated.query as LearningMediaListOptions;
      const result = await store.list({ ...query, ...filter, publicOnly: true });
      response.json({ ...result, items: result.items.map(publicItem) });
    });
    router.get(path + '/:slug', validateInput('params', itemSlug), async (_request, response) => {
      const { slug } = response.locals.validated.params as { slug: string };
      const item = await store.findPublic(slug, filter);
      if (!item?.mediaId) throw new LearningMediaError('NOT_FOUND');
      const [file, related] = await Promise.all([media.findPublic(item.mediaId), store.findPublicRelated(item)]);
      if (!file) throw new LearningMediaError('NOT_FOUND');
      response.json({ item: publicItem(item), media: publicFile(file), related });
    });
  }

  admin.use(requireSecureTransport(options.production), loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(learningMediaManagePermission));
  admin.get('/', validateInput('query', adminQuery), async (_request, response) => {
    response.json(await store.list(response.locals.validated.query as LearningMediaListOptions));
  });
  admin.get('/assets', validateInput('query', assetsQuery), (request, response, next) => {
    const { status } = response.locals.validated.query as MediaListOptions;
    if (status === 'draft') return manageMedia(request, response, next);
    next();
  }, async (_request, response) => {
    const query = response.locals.validated.query as MediaListOptions;
    const result = await media.list({ ...query, status: query.status ?? 'published' });
    response.json({ ...result, items: result.items.map(assetChoice) });
  });
  admin.get('/assets/:id', validateId, async (_request, response) => {
    let file = await media.findPublic(key(response));
    if (!file && canUseDraftMedia(response)) {
      try {
        const existing = await media.get(key(response));
        if (existing.status === 'draft') file = existing;
      } catch (error) {
        if (!(error instanceof MediaError) || error.code !== 'NOT_FOUND') throw error;
      }
    }
    if (!file) throw new LearningMediaError('NOT_FOUND');
    response.json({ item: assetChoice(file) });
  });
  admin.get('/:id', validateId, async (_request, response) => {
    response.json({ item: await store.get(key(response)) });
  });
  admin.post('/', json, validateInput('body', newItem), async (_request, response) => {
    const input = response.locals.validated.body as LearningMediaInput;
    const item = await store.create(input, actor(response).id, canUseDraftMedia(response));
    audit(response, 'created', item.id);
    response.status(201).json({ item });
  });
  admin.put('/:id', json, validateId, validateInput('body', updateItem), async (_request, response) => {
    const { version, ...input } = response.locals.validated.body as LearningMediaInput & { version: number };
    const item = await store.update(key(response), input, version, canUseDraftMedia(response));
    audit(response, 'updated', item.id);
    response.json({ item });
  });
  admin.patch('/:id/status', json, validateId, validateInput('body', statusChange), (request, response, next) => {
    const { status } = response.locals.validated.body as { status: EducationStatus };
    if (status === 'approved' || status === 'published' || status === 'archived') return publish(request, response, next);
    next();
  }, async (_request, response) => {
    const { status, version, reviewNote } = response.locals.validated.body as {
      status: EducationStatus; version: number; reviewNote: string;
    };
    const item = await store.changeStatus(key(response), status, version, actor(response).id, reviewNote, canUseDraftMedia(response));
    audit(response, 'status:' + status, item.id);
    response.json({ item });
  });
  admin.delete('/:id', json, validateId, validateInput('body', deleteItem), async (_request, response) => {
    const id = key(response);
    await store.remove(id, (response.locals.validated.body as { version: number }).version);
    audit(response, 'deleted', id);
    response.status(204).end();
  });
  router.use('/admin/learning-media', admin);
  router.use(handleError);
  return router;
}
