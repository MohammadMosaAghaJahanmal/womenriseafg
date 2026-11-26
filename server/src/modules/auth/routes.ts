import { Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import Joi from 'joi';
import type { Logger } from 'pino';
import { administrationPermission } from '../../identity/roles';
import { DuplicateLoginError, SessionPrincipalChangedError, type IdentityAccount, type IdentitySession, type IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { loginInput, registerInput, type Credentials } from './credentials';
import { hashPassword, verifyPassword } from './passwords';
import { requireOriginAndJson, requireSecureTransport } from './request';
import { loadIdentity, newSession, requestTokenHash, requirePermission, sessionCookie, sessionPermissions } from './session';

interface RouteOptions {
  origins: readonly string[];
  production: boolean;
  logger: Pick<Logger, 'info'>;
}

function publicAccount(account: IdentityAccount | null, adminScope: boolean) {
  if (!account) return null;
  return { username: account.login, permissions: sessionPermissions(account.permissions, adminScope) };
}

function invalidCredentials() {
  return new ApiError(401, 'INVALID_CREDENTIALS', 'The sign-in details did not match.');
}

export function createAuthRoutes(store: IdentityStore, options: RouteOptions): Router {
  const router = Router();
  const cookie = sessionCookie(options.production);
  const secure = requireSecureTransport(options.production);
  const writeAllowed = requireOriginAndJson(options.origins);
  const session = loadIdentity(store, cookie.name);
  const noBodyFields = validateInput('body', Joi.object({}).required());
  const credentialsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });

  function sendSession(response: Response, account: IdentityAccount, token: string, status: number, adminScope: boolean) {
    // The browser stores a session cookie while the server independently enforces a fixed expiry.
    response.cookie(cookie.name, token, cookie.options).status(status).json({ user: publicAccount(account, adminScope) });
  }

  function audit(response: Response, event: 'admin_sign_in' | 'admin_sign_out', result: 'success' | 'denied', actorId?: string) {
    options.logger.info({ event, result, actorId, requestId: response.get('X-Request-Id') });
  }

  function login(admin: boolean): RequestHandler {
    return async (request, response) => {
      const { username, password } = response.locals.validated.body as Credentials;
      const record = await store.findCredentials(username);
      const valid = await verifyPassword(password, record?.passwordHash ?? null);
      if (!record?.active || !valid) {
        if (admin) audit(response, 'admin_sign_in', 'denied');
        throw invalidCredentials();
      }
      const { token, tokenHash, expiresAt } = newSession(admin);
      try {
        const account = await store.createSession(record.id, {
          tokenHash, expiresAt, replaceTokenHash: requestTokenHash(request, cookie.name),
        }, record.passwordHash, admin);
        if (admin) audit(response, 'admin_sign_in', 'success', account.id);
        sendSession(response, account, token, 200, admin);
      } catch (error) {
        if (error instanceof SessionPrincipalChangedError) {
          if (admin) audit(response, 'admin_sign_in', 'denied');
          throw invalidCredentials();
        }
        throw error;
      }
    };
  }

  router.get('/auth/session', secure, session, (_request, response) => {
    const account: IdentitySession | null = response.locals.identity;
    response.json({ user: publicAccount(account, account?.adminScope === true) });
  });
  router.post('/auth/register', secure, writeAllowed, credentialsLimiter, validateInput('body', registerInput), async (request, response) => {
    const { username, password } = response.locals.validated.body as Credentials;
    const passwordHash = await hashPassword(password);
    const { token, tokenHash, expiresAt } = newSession(false);
    try {
      const account = await store.createStudent(username, passwordHash, {
        tokenHash, expiresAt, replaceTokenHash: requestTokenHash(request, cookie.name),
      });
      sendSession(response, account, token, 201, false);
    } catch (error) {
      if (error instanceof DuplicateLoginError) {
        throw new ApiError(409, 'USERNAME_TAKEN', 'Choose another username.');
      }
      throw error;
    }
  });
  router.post('/auth/login', secure, writeAllowed, credentialsLimiter, validateInput('body', loginInput), login(false));
  router.post('/auth/admin-login', secure, writeAllowed, credentialsLimiter, validateInput('body', loginInput), login(true));
  router.post('/auth/logout', secure, writeAllowed, noBodyFields, async (request, response) => {
    // Expire the browser's credential even if server-side revocation fails.
    response.clearCookie(cookie.name, cookie.options);
    const tokenHash = requestTokenHash(request, cookie.name);
    if (tokenHash) {
      const adminActorId = await store.revokeSession(tokenHash);
      if (adminActorId) audit(response, 'admin_sign_out', 'success', adminActorId);
    }
    response.status(204).end();
  });
  router.get('/admin/access', secure, session, requirePermission(administrationPermission), (_request, response) => {
    response.json({ user: publicAccount(response.locals.identity, true) });
  });
  return router;
}
