import { randomUUID } from 'node:crypto';
import { Router, type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport, requireWriteOrigin } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import {
  MediaError, mediaManagePermission, mediaPublishPermission,
  type MediaKind, type MediaLink, type MediaListOptions, type MediaMetadata, type MediaStatus, type StoredFile,
} from './contract';
import type { createMediaFiles } from './files';
import type { MediaStore } from './store';
import { assetParams, attachInput, cleanupInput, deleteInput, detachInput, fileQuery, listQuery,
  statusInput, updateMetadata, uploadMetadata } from './validation';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info' | 'warn'>;
  maxUploadBytes?: number;
}

const failures = {
  NOT_FOUND: [404, 'Media asset not found.'],
  CONFLICT: [409, 'This file is already stored or the asset is still in use.'],
  STALE_VERSION: [409, 'This asset changed. Reload it and try again.'],
  INVALID_LINK: [422, 'Choose a compatible asset and slot.'],
  INVALID_TRANSITION: [409, 'This action is unavailable in the current status.'],
  INVALID_REFERENCE: [422, 'Choose a valid content language or publish the linked assets first.'],
  PENDING_LEARNING_REVIEW: [409, 'Approve the linked learning material before publishing this file.'],
  INVALID_FILE: [400, 'The file type or contents are invalid.'],
  UPLOAD_TOO_LARGE: [413, 'The file exceeds the upload limit.'],
  STORAGE_UNAVAILABLE: [503, 'Media storage is temporarily unavailable.'],
} as const;

const handleMediaError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (!(error instanceof MediaError)) return next(error);
  const [status, message] = failures[error.code];
  next(new ApiError(status, error.code, message));
};

function readUploadMetadata(request: Request): MediaMetadata & { kind: MediaKind } {
  const input = request.body;
  if (!input || Object.keys(input).length !== 1 || typeof input.metadata !== 'string') {
    throw new ApiError(400, 'INVALID_INPUT', 'Upload metadata is required.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(input.metadata); }
  catch { throw new ApiError(400, 'INVALID_INPUT', 'Upload metadata is invalid.'); }
  const { value, error } = uploadMetadata.validate(parsed, { abortEarly: false, allowUnknown: false });
  if (error) throw new ApiError(400, 'INVALID_INPUT', 'Upload metadata is invalid.');
  return value;
}

const requireMultipart: RequestHandler = (request, _response, next) => {
  if (!request.is('multipart/form-data')) {
    return next(new ApiError(415, 'MULTIPART_REQUIRED', 'A multipart file upload is required.'));
  }
  next();
};

function mediaId(response: Response) {
  return (response.locals.validated.params as { id: string }).id;
}

export function createMediaRoutes(store: MediaStore, files: ReturnType<typeof createMediaFiles>, identity: IdentityStore, options: RouteOptions) {
  const router = Router();
  const admin = Router();
  const secure = requireSecureTransport(options.production);
  const json = requireOriginAndJson(options.origins);
  const verifyUploadOrigin = requireWriteOrigin(options.origins);
  const validateId = validateInput('params', assetParams);
  const validateDownload = validateInput('query', fileQuery);
  const publish = requirePermission(mediaPublishPermission);

  function audit(response: Response, action: string, id?: string) {
    const actor = response.locals.identity as IdentitySession;
    options.logger.info({ event: 'media_changed', action, assetId: id, actorId: actor.id });
  }

  async function clearDeleted(id: string, key: string) {
    try {
      await files.remove(key);
      await store.completeDelete(id);
      return true;
    } catch {
      options.logger.warn({ event: 'media_cleanup_pending', assetId: id });
      return false;
    }
  }

  async function untrackedFiles() {
    const aged = await files.staleObjects();
    if (!aged.length) return [];
    const registered = new Set(await store.storageKeys());
    return aged.filter(key => !registered.has(key));
  }

  function deliver(publicFile: boolean): RequestHandler {
    return async (request, response) => {
      const file = publicFile ? await store.findPublic(mediaId(response)) : await store.get(mediaId(response));
      if (!file) throw new MediaError('NOT_FOUND');
      const { download } = response.locals.validated.query as { download: boolean };
      const attach = download || file.kind === 'attachment';
      if (publicFile && attach && !file.downloadAllowed) {
        throw new ApiError(403, 'DOWNLOAD_FORBIDDEN', 'Download is unavailable for this media asset.');
      }
      await files.send(request, response, file, { public: publicFile, download: attach });
    };
  }

  router.get('/media/:id/file', validateId, validateDownload, deliver(true));

  admin.use(secure, loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(mediaManagePermission));
  admin.get('/', validateInput('query', listQuery), async (_request, response) => {
    response.json(await store.list(response.locals.validated.query as MediaListOptions));
  });
  admin.get('/usage', async (_request, response) => {
    const [usage, space, orphans] = await Promise.all([store.usage(), files.space(), untrackedFiles()]);
    response.json({ ...usage, ...space, orphanFiles: orphans.length, maxUploadBytes: options.maxUploadBytes });
  });
  admin.post('/cleanup', json, validateInput('body', cleanupInput), async (_request, response) => {
    const pending = await store.pendingDeletes();
    let removed = await files.cleanupStaleUploads();
    for (const item of pending) if (await clearDeleted(item.id, item.storageKey)) removed++;
    const orphans = await untrackedFiles();
    for (const key of orphans.slice(0, 100)) {
      try {
        await files.remove(key);
        removed++;
      } catch {
        options.logger.warn({ event: 'media_orphan_cleanup_pending' });
      }
    }
    audit(response, 'cleanup');
    const [usage, remaining] = await Promise.all([store.usage(), untrackedFiles()]);
    response.json({ removed, pending: usage.pendingDeletes + remaining.length });
  });

  admin.post('/', verifyUploadOrigin, requireMultipart, files.receive, async (request, response) => {
    let stored: StoredFile | undefined;
    let committed = false;
    let writeStarted = false;
    let rejected = false;
    try {
      const { kind, ...metadata } = readUploadMetadata(request);
      if (!request.file) throw new MediaError('INVALID_FILE');
      const id = randomUUID();
      stored = await files.persist(request.file, id, kind);
      if (request.aborted || response.destroyed) return;
      const user = response.locals.identity as IdentitySession;
      writeStarted = true;
      const item = await store.create(id, kind, metadata, stored, user.id);
      committed = true;
      audit(response, 'uploaded', id);
      response.status(201).json({ item });
    } catch (error) {
      rejected = error instanceof MediaError;
      throw error;
    } finally {
      const cleanup = [files.discard(request.file)];
      // An ambiguous database failure might follow a commit. Retain bytes for aged reconciliation.
      if (stored && !committed && (!writeStarted || rejected)) cleanup.push(files.remove(stored.storageKey));
      if ((await Promise.allSettled(cleanup)).some(result => result.status === 'rejected')) {
        options.logger.warn({ event: 'media_upload_cleanup_pending' });
      }
    }
  });

  admin.get('/:id/file', validateId, validateDownload, deliver(false));
  admin.get('/:id', validateId, async (_request, response) => {
    response.json({ item: await store.get(mediaId(response)) });
  });
  admin.put('/:id', json, validateId, validateInput('body', updateMetadata), async (_request, response) => {
    const id = mediaId(response);
    const { version, ...metadata } = response.locals.validated.body as MediaMetadata & { version: number };
    const item = await store.update(id, metadata, version);
    audit(response, 'updated', id);
    response.json({ item });
  });
  admin.patch('/:id/status', json, validateId, validateInput('body', statusInput), (request, response, next) => {
    const { status } = response.locals.validated.body as { status: MediaStatus };
    if (status === 'published' || status === 'archived') return publish(request, response, next);
    next();
  }, async (_request, response) => {
    const id = mediaId(response);
    const { status, version } = response.locals.validated.body as { status: MediaStatus; version: number };
    const item = await store.setStatus(id, status, version);
    audit(response, 'status:' + status, id);
    response.json({ item });
  });
  admin.post('/:id/links', json, validateId, validateInput('body', attachInput), async (_request, response) => {
    const id = mediaId(response);
    const { version, ...link } = response.locals.validated.body as MediaLink & { version: number };
    const item = await store.attach(id, link, version);
    audit(response, 'linked', id);
    response.json({ item });
  });
  admin.delete('/:id/links', json, validateId, validateInput('body', detachInput), async (_request, response) => {
    const id = mediaId(response);
    const { relation, slot, version } = response.locals.validated.body as Omit<MediaLink, 'assetId'> & { version: number };
    const item = await store.detach(id, relation, slot, version);
    audit(response, 'unlinked', id);
    response.json({ item });
  });
  admin.delete('/:id', json, validateId, validateInput('body', deleteInput), async (_request, response) => {
    const id = mediaId(response);
    const { version } = response.locals.validated.body as { version: number };
    const file = await store.markDeleted(id, version);
    const removed = await clearDeleted(id, file.storageKey);
    audit(response, 'deleted', id);
    response.json({ cleanupPending: !removed });
  });

  router.use('/admin/media', admin);
  router.use(handleMediaError);
  return router;
}
