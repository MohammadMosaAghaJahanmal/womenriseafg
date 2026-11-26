import type { RequestHandler } from 'express';
import { ApiError } from '../../middleware/errors';

export function requireSecureTransport(production: boolean): RequestHandler {
  return (request, _response, next) => {
    if (production && !request.secure) {
      return next(new ApiError(400, 'HTTPS_REQUIRED', 'A secure HTTPS connection is required.'));
    }
    next();
  };
}

export function requireWriteOrigin(origins: readonly string[]): RequestHandler {
  return (request, _response, next) => {
    if (!origins.length) return next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Account actions are unavailable.'));
    const origin = request.get('Origin');
    if (!origin || !origins.includes(origin)) {
      return next(new ApiError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.'));
    }
    next();
  };
}

export function requireOriginAndJson(origins: readonly string[]): RequestHandler {
  const verifyOrigin = requireWriteOrigin(origins);
  return (request, response, next) => verifyOrigin(request, response, error => {
    if (error) return next(error);
    if (!request.is('application/json')) {
      return next(new ApiError(415, 'JSON_REQUIRED', 'An application/json body is required.'));
    }
    next();
  });
}
