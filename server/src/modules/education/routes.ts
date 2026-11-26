import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import {
  EducationError, educationManagePermission, educationPublishPermission,
  type EducationInput, type EducationKind, type EducationStatus,
} from './contract';
import type { EducationStore } from './store';
import { adminListQuery, createInput, entryParams, kindParams, publicListQuery, statusInput, updateInput, versionInput } from './validation';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

const failure = {
  NOT_FOUND: [404, 'Educational entry not found.'],
  CONFLICT: [409, 'The value is already in use or the entry is still referenced.'],
  INVALID_REFERENCE: [422, 'Choose a valid category, grade, or translation language.'],
  INVALID_TRANSITION: [409, 'This action is unavailable in the current status.'],
  STALE_VERSION: [409, 'This entry changed. Reload it and try again.'],
} as const;

const handleEducationError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  if (!(error instanceof EducationError)) return next(error);
  const [status, message] = failure[error.code];
  next(new ApiError(status, error.code, message));
};

function validateEntryBody(update = false): RequestHandler {
  return (request, response, next) => {
    const { kind } = response.locals.validated.params as { kind: EducationKind };
    validateInput('body', (update ? updateInput : createInput)[kind])(request, response, next);
  };
}

export function createEducationRoutes(store: EducationStore, identity: IdentityStore, options: RouteOptions) {
  const router = Router();
  const admin = Router();
  const secure = requireSecureTransport(options.production);
  const writeAllowed = requireOriginAndJson(options.origins);
  const publishPermission = requirePermission(educationPublishPermission);

  function listEntries(publicOnly: boolean): RequestHandler {
    return async (_request, response) => {
      const { kind } = response.locals.validated.params as { kind: EducationKind };
      const query = response.locals.validated.query as { q: string; status?: EducationStatus; page: number; pageSize: number };
      response.json(await store.list(kind, {
        search: query.q, status: query.status, page: query.page, pageSize: query.pageSize, publicOnly,
      }));
    };
  }

  function audit(action: string, kind: EducationKind, id: string, actor: IdentitySession) {
    options.logger.info({ event: 'education_changed', action, kind, entryId: id, actorId: actor.id });
  }

  router.get('/education/:kind', validateInput('params', kindParams), validateInput('query', publicListQuery), listEntries(true));
  admin.use(secure, loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(educationManagePermission));
  admin.get('/summary', async (_request, response) => {
    response.json({ items: await store.summary() });
  });
  admin.get('/:kind', validateInput('params', kindParams), validateInput('query', adminListQuery), listEntries(false));
  admin.get('/:kind/:id', validateInput('params', entryParams), async (_request, response) => {
    const { kind, id } = response.locals.validated.params as { kind: EducationKind; id: string };
    response.json({ item: await store.get(kind, id) });
  });
  admin.post('/:kind', writeAllowed, validateInput('params', kindParams), validateEntryBody(), async (_request, response) => {
    const { kind } = response.locals.validated.params as { kind: EducationKind };
    const item = await store.create(kind, response.locals.validated.body as EducationInput);
    audit('created', kind, item.id, response.locals.identity);
    response.status(201).json({ item });
  });
  admin.put('/:kind/:id', writeAllowed, validateInput('params', entryParams), validateEntryBody(true), async (_request, response) => {
    const { kind, id } = response.locals.validated.params as { kind: EducationKind; id: string };
    const { version, ...values } = response.locals.validated.body as EducationInput & { version: number };
    const item = await store.update(kind, id, values, version);
    audit('updated', kind, id, response.locals.identity);
    response.json({ item });
  });
  admin.patch('/:kind/:id/status', writeAllowed, validateInput('params', entryParams), validateInput('body', statusInput),
    (request, response, next) => {
      const { status } = response.locals.validated.body as { status: EducationStatus };
      if (status === 'published' || status === 'archived') return publishPermission(request, response, next);
      next();
    }, async (_request, response) => {
      const { kind, id } = response.locals.validated.params as { kind: EducationKind; id: string };
      const { status, version } = response.locals.validated.body as { status: EducationStatus; version: number };
      const item = await store.changeStatus(kind, id, status, version);
      audit('status:' + status, kind, id, response.locals.identity);
      response.json({ item });
    });
  admin.delete('/:kind/:id', writeAllowed, validateInput('params', entryParams), validateInput('body', versionInput), async (_request, response) => {
    const { kind, id } = response.locals.validated.params as { kind: EducationKind; id: string };
    await store.remove(kind, id, (response.locals.validated.body as { version: number }).version);
    audit('deleted', kind, id, response.locals.identity);
    response.status(204).end();
  });
  router.use('/admin/education', admin);
  router.use(handleEducationError);
  return router;
}
