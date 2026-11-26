import type { RequestHandler } from 'express';
import type { AnySchema } from 'joi';
import { ApiError } from './errors';

// Express 5 exposes query as a getter. Keep validated input separate from the raw request.
export function validateInput(source: 'query' | 'params' | 'body', schema: AnySchema): RequestHandler {
  return (request, response, next) => {
    const { error, value } = schema.validate(request[source], { abortEarly: false, allowUnknown: false });
    if (error) {
      next(new ApiError(400, 'INVALID_INPUT', 'Invalid request input.'));
      return;
    }
    response.locals.validated ??= {};
    response.locals.validated[source] = value;
    next();
  };
}
