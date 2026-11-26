import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { errorHandler, notFound } from './middleware/errors';
import { createHealthRoutes } from './modules/health/routes';

interface AppOptions {
  checkDatabase: () => Promise<void>;
  logger: Logger;
  production: boolean;
  publicDirectory?: string;
  identityRoutes?: Router;
  educationRoutes?: Router;
  mediaRoutes?: Router;
  courseRoutes?: Router;
  learningMediaRoutes?: Router;
  bookRoutes?: Router;
  quizRoutes?: Router;
  discoveryRoutes?: Router;
  certificateRoutes?: Router;
  homepageRoutes?: Router;
  trustedProxies?: string[];
}

const privateRoots = /^\/(?:api|media|uploads?|storage|server|client|src|docs|node_modules)(?:\/|$)/i;

export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustedProxies?.length ? options.trustedProxies : false);
  app.use(helmet({
    strictTransportSecurity: options.production,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: options.production ? [] : null,
      },
    },
  }));

  app.use((request, response, next) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    response.set('X-Request-Id', requestId);
    response.on('finish', () => {
      // A URL, IP, user agent, cookie or request body can identify a learner.
      options.logger.info({
        event: 'request_completed',
        requestId,
        method: request.method,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    next();
  });

  const parseJson = express.json({ limit: '32kb' });
  const parseCertificateJson = express.json({ limit: '96kb' });
  app.use('/api', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (options.courseRoutes && /^\/v1\/admin\/courses(?:\/|$)/i.test(request.path)) return next();
    if (options.homepageRoutes && request.method === 'PUT' && /^\/v1\/admin\/homepage\/?$/i.test(request.path)) return next();
    if (options.certificateRoutes && request.method === 'POST' && /^\/v1\/certificates\/?$/i.test(request.path)) {
      return parseCertificateJson(request, response, next);
    }
    parseJson(request, response, next);
  });
  app.use('/api/v1', createHealthRoutes(options.checkDatabase));
  if (options.identityRoutes) app.use('/api/v1', options.identityRoutes);
  if (options.educationRoutes) app.use('/api/v1', options.educationRoutes);
  if (options.mediaRoutes) app.use('/api/v1', options.mediaRoutes);
  if (options.courseRoutes) app.use('/api/v1', options.courseRoutes);
  if (options.learningMediaRoutes) app.use('/api/v1', options.learningMediaRoutes);
  if (options.bookRoutes) app.use('/api/v1', options.bookRoutes);
  if (options.quizRoutes) app.use('/api/v1', options.quizRoutes);
  if (options.discoveryRoutes) app.use('/api/v1', options.discoveryRoutes);
  if (options.certificateRoutes) app.use('/api/v1', options.certificateRoutes);
  if (options.homepageRoutes) app.use('/api/v1', options.homepageRoutes);
  app.use('/api', notFound);

  if (options.publicDirectory) {
    const publicDirectory = options.publicDirectory;
    app.use((request, response, next) => {
      const pathname = decodeURIComponent(request.path);
      if (privateRoots.test(pathname) || pathname.includes('\\') ||
          pathname.split('/').some(segment => segment.startsWith('.'))) {
        notFound(request, response, next);
        return;
      }
      next();
    });
    app.use(express.static(publicDirectory, { index: false, redirect: false, dotfiles: 'ignore' }));
    app.get('/{*path}', (request, response, next) => {
      const pathname = decodeURIComponent(request.path);
      if (/^\/assets(?:\/|$)/i.test(pathname) || pathname.split('/').some(segment => segment.includes('.')) ||
          !request.accepts('html')) {
        next();
        return;
      }
      response.set('Cache-Control', 'no-cache').sendFile(path.join(publicDirectory, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
