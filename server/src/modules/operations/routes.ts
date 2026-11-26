import { Router } from 'express';
import Joi from 'joi';
import { QueryTypes, type Sequelize } from 'sequelize';
import { administrationPermission } from '../../identity/roles';
import type { IdentitySession, IdentityStore } from '../../identity/store';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import type { MediaKind } from '../media/contract';
import type { createMediaFiles } from '../media/files';
import { operationsPermission } from './migration';

const kinds = ['backup', 'restore-drill'] as const;
const results = ['passed', 'failed'] as const;
const query = { type: QueryTypes.SELECT as const };

interface Options {
  production: boolean;
  origins: readonly string[];
  logger: { info: (entry: Record<string, unknown>) => void };
}

export function createOperationsRoutes(db: Sequelize, files: Pick<ReturnType<typeof createMediaFiles>, 'space'>,
  identity: IdentityStore, options: Options) {
  const router = Router();
  const admin = Router();
  const origin = requireOriginAndJson(options.origins);
  admin.use(requireSecureTransport(options.production), loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(operationsPermission));

  admin.get('/', validateInput('query', Joi.object({})), async (_request, response) => {
    const [storage, backupChecks, staffActivity, volume] = await Promise.all([
      db.query<{ kind: MediaKind; count: string; bytes: string }>(`
        SELECT kind, CAST(COUNT(*) AS CHAR) AS count, CAST(SUM(size_bytes) AS CHAR) AS bytes
        FROM media_assets WHERE status <> 'deleted' GROUP BY kind ORDER BY kind`, query),
      db.query<{ kind: typeof kinds[number]; result: typeof results[number]; recordedAt: Date }>(
        'SELECT kind, result, recorded_at AS recordedAt FROM operations_backup_checks ORDER BY kind', query),
      db.query<{ id: string; createdAt: Date; event: string }>(
        'SELECT id, event, created_at AS createdAt FROM staff_audit_events ORDER BY created_at DESC, id DESC LIMIT 10', query),
      files.space().catch(() => null),
    ]);
    response.json({ storage, volume, backupChecks, staffActivity, checkedAt: new Date().toISOString() });
  });

  admin.put('/backup-checks/:kind', origin, validateInput('params', Joi.object({ kind: Joi.string().valid(...kinds).required() })),
    validateInput('body', Joi.object({ result: Joi.string().valid(...results).required() }).required()), async (_request, response) => {
      const { kind } = response.locals.validated.params;
      const { result } = response.locals.validated.body;
      await db.query(`
        INSERT INTO operations_backup_checks (kind, result, recorded_at)
        VALUES ($kind, $result, NOW(3)) AS new_check
        ON DUPLICATE KEY UPDATE result = new_check.result, recorded_at = new_check.recorded_at`, { bind: { kind, result } });
      const actor = response.locals.identity as IdentitySession;
      options.logger.info({ event: 'operations_backup_check_recorded', actorId: actor.id, kind, result });
      response.status(204).end();
    });

  router.use('/admin/operations', admin);
  return router;
}

