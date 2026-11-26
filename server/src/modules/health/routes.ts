import { Router } from 'express';
import Joi from 'joi';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';

export function createHealthRoutes(checkDatabase: () => Promise<void>): Router {
  const router = Router();
  const noParameters = validateInput('query', Joi.object({}));
  let pending: Promise<void> | undefined;

  async function probe() {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        checkDatabase(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Readiness timeout')), 5000);
          timeout.unref();
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  router.get('/health', noParameters, (_request, response) => {
    response.json({ status: 'ok' });
  });
  router.get('/ready', noParameters, async (_request, response) => {
    try {
      // Concurrent readiness checks share a probe so monitoring cannot exhaust the small connection pool.
      pending ??= probe().finally(() => { pending = undefined; });
      await pending;
      response.json({ status: 'ready' });
    } catch {
      throw new ApiError(503, 'UNAVAILABLE', 'Service temporarily unavailable.');
    }
  });
  return router;
}
