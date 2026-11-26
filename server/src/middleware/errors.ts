import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Resource not found.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'The request could not be completed.';
  if (error instanceof ApiError) {
    ({ status, code, message } = error);
  } else if (error instanceof URIError) {
    status = 400;
    code = 'INVALID_PATH';
    message = 'Invalid request path.';
  } else if (error && typeof error === 'object' && 'status' in error) {
    // Express and its body parser attach status codes. Never forward their messages or payloads.
    switch (error.status) {
      case 400: [status, code, message] = [400, 'INVALID_REQUEST', 'Invalid request.']; break;
      case 403: [status, code, message] = [403, 'FORBIDDEN', 'Access denied.']; break;
      case 404: [status, code, message] = [404, 'NOT_FOUND', 'Resource not found.']; break;
      case 413: [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.']; break;
      case 415: [status, code, message] = [415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported content type.']; break;
    }
  }
  response.set('Cache-Control', 'no-store').status(status).json({ error: { code, message } });
};
