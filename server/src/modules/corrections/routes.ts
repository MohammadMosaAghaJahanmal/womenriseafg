import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import Joi from 'joi';
import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import { correctionManagePermission, correctionStates, correctionTarget, type CorrectionState } from './contract';
import { createCorrectionStore } from './store';

const reportInput = Joi.object({
  resource: Joi.string().max(175).custom((value: string, helpers) =>
    correctionTarget(value) ? value : helpers.error('any.invalid')).required(),
  message: Joi.string().max(2400).custom((value: string, helpers) => {
    const message = value.replace(/\r\n?/g, '\n').trim().normalize('NFC');
    const characters = Array.from(message).length;
    if (characters < 12 || characters > 1200 || /[\p{Cc}\p{Bidi_Control}\p{Surrogate}]/u.test(message.replace(/[\t\n]/g, ''))) {
      return helpers.error('any.invalid');
    }
    return message;
  }).required(),
}).required();
const state = Joi.string().valid(...correctionStates);
const params = Joi.object({ id: Joi.string().uuid({ version: 'uuidv4' }).required() });
const queueInput = Joi.object({
  status: state.default('open'), page: Joi.number().integer().min(1).max(5000).default(1),
});

const noStore: RequestHandler = (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
};

export function createCorrectionRoutes(db: Sequelize, identity: IdentityStore,
  options: { origins: readonly string[]; production: boolean; logger: Pick<Logger, 'info'> }) {
  const router = Router();
  const admin = Router();
  const store = createCorrectionStore(db);
  const secure = requireSecureTransport(options.production);
  const json = requireOriginAndJson(options.origins);
  const submissions = rateLimit({
    windowMs: 30 * 60 * 1000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });

  router.post('/corrections', noStore, secure, json, submissions, validateInput('body', reportInput),
    async (_request, response) => {
      const { resource, message } = response.locals.validated.body as { resource: string; message: string };
      if (!await store.submit(resource, message)) throw new ApiError(404, 'NOT_FOUND', 'This learning resource is unavailable.');
      response.status(201).end();
    });

  admin.use(noStore, secure, loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(correctionManagePermission));
  admin.get('/', validateInput('query', queueInput), async (_request, response) => {
    const { status, page } = response.locals.validated.query as { status: CorrectionState; page: number };
    response.json(await store.list(status, page));
  });
  admin.patch('/:id', json, validateInput('params', params), validateInput('body', Joi.object({ status: state.required() }).required()),
    async (_request, response) => {
      const { id } = response.locals.validated.params as { id: string };
      const { status } = response.locals.validated.body as { status: CorrectionState };
      if (!await store.changeState(id, status)) throw new ApiError(409, 'STALE_STATUS', 'The correction status changed.');
      const actor = response.locals.identity as IdentitySession;
      options.logger.info({ event: 'correction_status_changed', status, actorId: actor.id });
      response.status(204).end();
    });

  router.use('/admin/corrections', admin);
  return router;
}
