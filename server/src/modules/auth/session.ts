import { createHash, randomBytes } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { accountPermission } from '../../identity/roles';
import { ApiError } from '../../middleware/errors';

const hour = 3600000;
export function sessionCookie(production: boolean) {
  const options = { httpOnly: true, secure: production, sameSite: 'strict' as const, path: '/' };
  return { name: production ? '__Host-womenriseafg_session' : 'womenriseafg_session', options };
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newSession(administrator: boolean) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + hour * (administrator ? 2 : 8));
  return { token, tokenHash: hashSessionToken(token), expiresAt };
}

export function requestTokenHash(request: Request, cookieName: string) {
  const matches = (request.get('Cookie') ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(cookieName + '='));
  if (matches.length !== 1) return undefined;
  const token = matches[0]!.slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? hashSessionToken(token) : undefined;
}

export function loadIdentity(store: IdentityStore, cookieName: string): RequestHandler {
  return async (request, response, next) => {
    const tokenHash = requestTokenHash(request, cookieName);
    const account = tokenHash ? await store.findSession(tokenHash) : null;
    response.locals.identity = account;
    next();
  };
}

export function sessionPermissions(permissions: string[], adminScope: boolean) {
  return adminScope ? permissions : permissions.filter(permission => permission === accountPermission);
}

export function requirePermission(permission: string): RequestHandler {
  return (_request, response, next) => {
    const account: IdentitySession | null | undefined = response.locals.identity;
    if (!account) return next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    if (!sessionPermissions(account.permissions, account.adminScope).includes(permission)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Access denied.'));
    }
    next();
  };
}
