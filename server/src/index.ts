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

function start() {
  const settings = loadSettings();
  const production = settings.environment === 'production';
  if (production && !existsSync(path.join(clientBuild, 'index.html'))) {
    throw new Error('Missing production client build. Run npm run build first.');
  }
  const logger = pino({ level: settings.logLevel, base: undefined });
  const db = createDatabase(settings.database);
  const identity = createIdentityStore(db);
  const routeOptions = { origins: settings.auth.origins, production, logger };
  const app = createApp({
    production,
    logger,
    checkDatabase: () => db.authenticate(),
    publicDirectory: production ? clientBuild : undefined,
    identityRoutes: createAuthRoutes(identity, routeOptions),
    educationRoutes: createEducationRoutes(createEducationStore(db), identity, routeOptions),
    trustedProxies: settings.auth.trustedProxies,
  });
  const server = app.listen(settings.port, settings.host);
  server.once('listening', () => logger.info({ event: 'server_started', port: settings.port }));
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
