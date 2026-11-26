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
import type { createMediaFiles } from '../media/files';
import type { MediaStore } from '../media/store';
import { fileQuery } from '../media/validation';
import { BookError, bookManagePermission, bookPublishPermission, type BookInput, type BookListOptions, type BookRecord } from './contract';
import type { BookStore } from './store';
import { adminQuery, assetsQuery, deleteBook, itemId, itemSlug, newBook, publicQuery, statusChange, updateBook } from './validation';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

const failures = {
  NOT_FOUND: [404, 'This book is unavailable.'],
  CONFLICT: [409, 'This book code is in use or the entry is referenced.'],
  STALE_VERSION: [409, 'This book has changed. Reload before saving again.'],
  INVALID_TRANSITION: [409, 'This book status change is unavailable.'],
  INVALID_REFERENCE: [422, 'Select an available PDF, cover, category, level, grade or language.'],
  REVIEW_REQUIRED: [422, 'A current review and approval are required.'],
  INCOMPLETE_CONTENT: [422, 'Add the required PDF, author, published content language, description and rights information.'],
  DRAFT_MEDIA_FORBIDDEN: [403, 'The media management permission is required to use a draft file.'],
  FILES_UNPUBLISHED: [422, 'Publish the reviewed PDF and cover in the media library before publishing this book.'],
} as const;

const handleError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (error instanceof BookError) {
    const [status, message] = failures[error.code];
    return next(new ApiError(status, error.code, message));
  }
  if (error instanceof MediaError) {
    if (error.code === 'NOT_FOUND') return next(new ApiError(404, 'NOT_FOUND', 'This book file is unavailable.'));
    if (error.code === 'STORAGE_UNAVAILABLE') return next(new ApiError(503, error.code, 'Book storage is temporarily unavailable.'));
  }
  next(error);
};

function publicBook(record: BookRecord) {
  const { id, slug, coverId, categoryId, levelId, gradeId, contentLanguage, author, publisher, publicationYear, edition,
    fileSizeBytes, downloadAllowed, license, source, translations, updatedAt } = record;
  return { id, slug, coverId, categoryId, levelId, gradeId, contentLanguage, author, publisher, publicationYear, edition,
    fileSizeBytes, downloadAllowed, license, source, translations, updatedAt };
}

function assetChoice(file: MediaAsset) {
  const { id, kind, title, originalName, language, status, version, sizeBytes, license, source, author, downloadAllowed } = file;
  return { id, kind, title, originalName, language, status, version, sizeBytes, license, source, author, downloadAllowed };
}

function actor(response: Response) {
  return response.locals.identity as IdentitySession;
}

function key(response: Response) {
  return (response.locals.validated.params as { id: string }).id;
}

export function createBookRoutes(store: BookStore, media: MediaStore, files: ReturnType<typeof createMediaFiles>,
  identity: IdentityStore, options: RouteOptions) {
  const router = Router();
  const admin = Router();
  const json = requireOriginAndJson(options.origins);
  const publish = requirePermission(bookPublishPermission);
  const manageMedia = requirePermission(mediaManagePermission);
  const validateId = validateInput('params', itemId);
  const validateSlug = validateInput('params', itemSlug);

  function audit(response: Response, action: string, id: string) {
    options.logger.info({ event: 'book_changed', action, bookId: id, actorId: actor(response).id });
  }

  function canUseDraftMedia(response: Response) {
    return actor(response).permissions.includes(mediaManagePermission);
  }

  async function publishedBook(response: Response) {
    const { slug } = response.locals.validated.params as { slug: string };
    const book = await store.findPublic(slug);
    if (!book?.pdfId) throw new BookError('NOT_FOUND');
    return book;
  }

  router.get('/books', validateInput('query', publicQuery), async (_request, response) => {
    const query = response.locals.validated.query as BookListOptions;
    const result = await store.list({ ...query, publicOnly: true });
    response.json({ ...result, items: result.items.map(publicBook) });
  });
  router.get('/books/:slug', validateSlug, async (_request, response) => {
    const item = await publishedBook(response);
    response.json({ item: publicBook(item) });
  });
  router.get('/books/:slug/file', validateSlug, validateInput('query', fileQuery), async (request, response) => {
    const { slug } = response.locals.validated.params as { slug: string };
    const pdfId = await store.findPublicPdfId(slug);
    const file = pdfId && await media.findPublic(pdfId);
    if (!file || file.kind !== 'pdf') throw new BookError('NOT_FOUND');
    const { download } = response.locals.validated.query as { download: boolean };
    if (download && !file.downloadAllowed) {
      throw new ApiError(403, 'DOWNLOAD_FORBIDDEN', 'Download is unavailable for this book.');
    }
    await files.send(request, response, file, { public: true, download });
  });

  admin.use(requireSecureTransport(options.production), loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(bookManagePermission));
  admin.get('/', validateInput('query', adminQuery), async (_request, response) => {
    response.json(await store.list(response.locals.validated.query as BookListOptions));
  });
  admin.get('/assets', validateInput('query', assetsQuery), (request, response, next) => {
    const { status } = response.locals.validated.query as MediaListOptions;
    if (status === 'draft') return manageMedia(request, response, next);
    next();
  }, async (_request, response) => {
    const query = response.locals.validated.query as MediaListOptions;
    const result = await media.list({ ...query, kind: query.kind ?? 'pdf', status: query.status ?? 'published' });
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
    if (!file || (file.kind !== 'pdf' && file.kind !== 'image')) throw new BookError('NOT_FOUND');
    response.json({ item: assetChoice(file) });
  });
  admin.get('/:id', validateId, async (_request, response) => {
    response.json({ item: await store.get(key(response)) });
  });
  admin.post('/', json, validateInput('body', newBook), async (_request, response) => {
    const item = await store.create(response.locals.validated.body as BookInput, actor(response).id, canUseDraftMedia(response));
    audit(response, 'created', item.id);
    response.status(201).json({ item });
  });
  admin.put('/:id', json, validateId, validateInput('body', updateBook), async (_request, response) => {
    const { version, ...input } = response.locals.validated.body as BookInput & { version: number };
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
  admin.delete('/:id', json, validateId, validateInput('body', deleteBook), async (_request, response) => {
    const id = key(response);
    await store.remove(id, (response.locals.validated.body as { version: number }).version);
    audit(response, 'deleted', id);
    response.status(204).end();
  });
  router.use('/admin/books', admin);
  router.use(handleError);
  return router;
}
