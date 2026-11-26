import { existsSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { createApp } from './app';
import { createDatabase } from './config/database';
import { clientBuild, loadSettings } from './config/environment';
import { createIdentityStore } from './identity/store';
import { createAuthRoutes } from './modules/auth/routes';
import { createEducationRoutes } from './modules/education/routes';
import { createEducationStore } from './modules/education/store';
import { createMediaFiles } from './modules/media/files';
import { createMediaRoutes } from './modules/media/routes';
import { createMediaStore } from './modules/media/store';
import { createCourseRoutes } from './modules/courses/routes';
import { createCourseStore } from './modules/courses/store';
import { createLearningMediaRoutes } from './modules/learning-media/routes';
import { createLearningMediaStore } from './modules/learning-media/store';
import { createBookRoutes } from './modules/books/routes';
import { createBookStore } from './modules/books/store';
import { createQuizRoutes } from './modules/quizzes/routes';
import { createQuizStore } from './modules/quizzes/store';
import { createDiscoveryRoutes } from './modules/discovery/routes';
import { createCollectionStore, createDiscoveryStore } from './modules/discovery/store';
import { createCertificateRoutes } from './modules/certificates/routes';
import { createCertificateManagementRoutes } from './modules/certificates/management';
import { createCorrectionRoutes } from './modules/corrections/routes';
import { createStaffRoutes } from './modules/staff/routes';
import { createOperationsRoutes } from './modules/operations/routes';
import { createHomepageRoutes } from './modules/homepage/routes';
import { createHomepageStore } from './modules/homepage/store';

const passengerLoader = globalThis as typeof globalThis & { PhusionPassenger?: { configure?: unknown } };

function start() {
  const settings = loadSettings();
  const production = settings.environment === 'production';
  const passenger = production && typeof passengerLoader.PhusionPassenger?.configure === 'function';
  if (production && !existsSync(path.join(clientBuild, 'index.html'))) {
    throw new Error('Missing production client build. Run npm run build first.');
  }
  const logger = pino({ level: settings.logLevel, base: undefined });
  const db = createDatabase(settings.database);
  const identity = createIdentityStore(db);
  const media = createMediaStore(db);
  const courses = createCourseStore(db);
  const files = createMediaFiles(settings.storageRoot, settings.mediaMaxUploadBytes);
  const routeOptions = { origins: settings.auth.origins, production, logger };
  const app = createApp({
    production,
    logger,
    checkDatabase: () => db.authenticate(),
    publicDirectory: production ? clientBuild : undefined,
    identityRoutes: createAuthRoutes(identity, routeOptions),
    educationRoutes: createEducationRoutes(createEducationStore(db), identity, routeOptions),
    mediaRoutes: createMediaRoutes(media, files,
      identity, { ...routeOptions, maxUploadBytes: settings.mediaMaxUploadBytes }),
    courseRoutes: createCourseRoutes(courses, media, identity, routeOptions),
    learningMediaRoutes: createLearningMediaRoutes(
      createLearningMediaStore(db, { shortMaxSeconds: settings.shortMaxSeconds }), media, identity, routeOptions),
    bookRoutes: createBookRoutes(createBookStore(db), media, files, identity, routeOptions),
    quizRoutes: createQuizRoutes(createQuizStore(db), identity, routeOptions),
    discoveryRoutes: createDiscoveryRoutes(createDiscoveryStore(db), identity, routeOptions, createCollectionStore(db)),
    certificateRoutes: createCertificateRoutes(db, courses, { ...routeOptions, managed: true }),
    certificateManagementRoutes: createCertificateManagementRoutes(db, identity, routeOptions),
    correctionRoutes: createCorrectionRoutes(db, identity, routeOptions),
    staffRoutes: createStaffRoutes(db, courses, identity, routeOptions),
    operationsRoutes: createOperationsRoutes(db, files, identity, routeOptions),
    homepageRoutes: createHomepageRoutes(createHomepageStore(db), identity, routeOptions),
    trustedProxies: settings.auth.trustedProxies,
    // The loader reports a synthetic loopback address to Express even on its Unix socket.
    passengerSocket: passenger ? () => typeof server.address() === 'string' : undefined,
  });
  const server = app.listen(settings.port, settings.host);
  server.once('listening', () => logger.info({
    event: 'server_started',
    ...(passenger ? { transport: 'passenger' } : { port: settings.port }),
  }));
  server.once('error', () => {
    logger.fatal({ event: 'server_listen_failed' });
    process.exitCode = 1;
    void db.close().catch(() => logger.error({ event: 'database_close_failed' }));
  });

  function stop() {
    // Drain active HTTP requests before closing their shared database pool.
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(async error => {
      try {
        if (error) throw error;
        await db.close();
        logger.info({ event: 'server_stopped' });
      } catch {
        process.exitCode = 1;
        logger.error({ event: 'shutdown_failed' });
      } finally {
        clearTimeout(deadline);
      }
    });
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  }
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

try {
  start();
} catch (error) {
  // Only the known, sanitized configuration and build messages are safe to print.
  const message = error instanceof Error &&
    /^(Invalid environment settings:|Missing production client build\.|Unable to read the project environment file)/.test(error.message)
    ? error.message : 'Unable to initialize the server.';
  pino({ base: undefined }).fatal({ event: 'startup_failed', message });
  process.exitCode = 1;
}
