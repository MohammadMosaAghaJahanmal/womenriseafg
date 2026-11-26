import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { isPublicAsset } from './config/staticAssets';
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
  passengerSocket?: () => boolean;
}

const privateRoots = /^\/(?:api|media|uploads?|storage|server|client|src|docs|node_modules)(?:\/|$)/i;
const privateNavigation = /^\/(?:admin|account|login|register|design-preview|certificates|courses\/[^/]+\/certificate|downloads|my-learning|saved|settings)(?:\/|$)/i;
const fingerprintedAsset = /^assets\/[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8}\.(?:js|mjs|css|woff2|svg|webp|png|jpe?g)$/;
const compressibleAsset = /^(?:index\.html|offline\.html|offline-fallback\.(?:css|js)|assets\/[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8}\.(?:js|mjs|css))$/;
const forwardingHeaders = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-port', 'x-forwarded-proto'];

function staticCache(asset: string) {
  return fingerprintedAsset.test(asset) ? 'public, max-age=31536000, immutable' : 'no-cache';
}

export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  const passengerSocket = options.passengerSocket;
  if (passengerSocket) {
    app.set('trust proxy', (_address: string, hop: number) => hop === 0 && passengerSocket());
    app.use((request, _response, next) => {
      // Passenger authenticates the !~ headers. Replace forwarded values before Express reads them.
      for (const header of forwardingHeaders) delete request.headers[header];
      const address = request.headers['!~passenger-client-address'];
      if (passengerSocket() && typeof address === 'string' && isIP(address)) {
        request.headers['x-forwarded-for'] = address;
        if (request.headers['!~passenger-proto'] === 'https') request.headers['x-forwarded-proto'] = 'https';
      }
      next();
    });
  } else {
    app.set('trust proxy', options.trustedProxies?.length ? options.trustedProxies : false);
  }
  app.use(helmet({
    strictTransportSecurity: options.production,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'"],
        frameSrc: ["'none'"],
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
    app.use(async (request, response, next) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') return next();
      if (request.path === '/' && !request.accepts('html')) return next();
      const asset = request.path === '/' ? 'index.html' : request.path.slice(1);
      if (/\.(?:br|gz)$/.test(asset) && compressibleAsset.test(asset.slice(0, -3))) {
        return notFound(request, response, next);
      }
      if (!compressibleAsset.test(asset)) return next();
      response.vary('Accept-Encoding');
      if (request.headers.range) return next();
      const encoding = request.acceptsEncodings('br', 'gzip', 'identity');
      if (encoding !== 'br' && encoding !== 'gzip') return next();
      const compressed = path.join(publicDirectory, asset + (encoding === 'br' ? '.br' : '.gz'));
      try {
        await access(compressed);
      } catch { return next(); }
      response.type(path.extname(asset)).set('Content-Encoding', encoding).set('Cache-Control', staticCache(asset));
      response.sendFile(compressed, { cacheControl: false, acceptRanges: false }, error => {
        if (error) next(error);
      });
    });
    const servePublicAsset = express.static(publicDirectory, {
      index: false, redirect: false, dotfiles: 'ignore',
      setHeaders(response, filename) {
        const asset = path.relative(publicDirectory, filename).split(path.sep).join('/');
        response.setHeader('Cache-Control', staticCache(asset));
      },
    });
    app.use((request, response, next) => {
      const asset = decodeURIComponent(request.path).slice(1);
      if (!isPublicAsset(asset)) return next();
      servePublicAsset(request, response, next);
    });
    app.get('/{*path}', (request, response, next) => {
      const pathname = decodeURIComponent(request.path);
      if (/^\/assets(?:\/|$)/i.test(pathname) || pathname.split('/').some(segment => segment.includes('.')) ||
          !request.accepts('html')) {
        next();
        return;
      }
      const privatePage = privateNavigation.test(pathname);
      if (privatePage) response.set('X-Robots-Tag', 'noindex, nofollow');
      response.set('Cache-Control', privatePage ? 'no-store' : 'no-cache').sendFile(path.join(publicDirectory, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
