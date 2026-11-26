import { createHash } from 'node:crypto';
import { Router } from 'express';
import Joi from 'joi';
import type { Logger } from 'pino';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { defineIdentityModels } from '../../identity/models';
import { administrationPermission, administratorRoles } from '../../identity/roles';
import type { IdentityStore } from '../../identity/store';
import { ApiError } from '../../middleware/errors';
import { validateInput } from '../../middleware/validation';
import { requireOriginAndJson, requireSecureTransport } from '../auth/request';
import { loadIdentity, requirePermission, sessionCookie } from '../auth/session';
import { CertificateMigrationError } from './migration';

const permission = 'certificates:manage';
const migration = '017-certificate-management';
const layouts = ['classic', 'simple'] as const;
const languages = ['en', 'ps', 'fa-AF'] as const;
const template = Joi.object({
  layout: Joi.string().valid(...layouts).required(),
  enabled: Joi.boolean().required(),
  titles: Joi.object(Object.fromEntries(languages.map(language => [language,
    Joi.string().trim().max(120).allow('').default('')]))).default(),
});
const settingsInput = Joi.object({
  templates: Joi.array().items(template).length(layouts.length).unique('layout')
    .has(Joi.object({ enabled: Joi.boolean().valid(true).required() }).unknown()).required(),
  version: Joi.number().integer().min(1).max(0xffffffff).required(),
}).required();
const receiptParam = Joi.object({ code: Joi.string().uuid({ version: 'uuidv4' }).required() });
const receiptInput = Joi.object({ withdrawn: Joi.boolean().required() }).required();

interface Template {
  layout: (typeof layouts)[number];
  enabled: boolean;
  titles: Record<(typeof languages)[number], string>;
}

const defaultTemplates: Template[] = layouts.map(layout => ({ layout, enabled: true,
  titles: { en: '', ps: '', 'fa-AF': '' } }));

export async function migrateCertificateManagement(db: Sequelize) {
  const lock = 'womenriseafg:cert-manage:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 32);
  return db.transaction(async connection => {
    const options = { type: QueryTypes.SELECT as const, transaction: connection, bind: { lock } };
    const [status] = await db.query<{ held: number }>('SELECT GET_LOCK($lock, 15) AS held', options);
    if (status?.held !== 1) throw new CertificateMigrationError('Could not acquire the certificate management migration lock.');
    try {
      const [entry] = await db.query<{ version: string }>(
        'SELECT version FROM identity_schema_migrations WHERE version = $migration',
        { type: QueryTypes.SELECT, transaction: connection, bind: { migration } });
      if (entry) return false;
      await db.query(`CREATE TABLE IF NOT EXISTS certificate_template_settings (
        id TINYINT UNSIGNED PRIMARY KEY,
        version INT UNSIGNED NOT NULL DEFAULT 1,
        templates JSON NOT NULL,
        CHECK (id = 1),
        CHECK (JSON_TYPE(templates) = 'ARRAY')
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction: connection });
      await db.query(`CREATE TABLE IF NOT EXISTS certificate_withdrawals (
        code CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        withdrawn_at DATETIME(3) NOT NULL,
        CONSTRAINT certificate_withdrawals_receipt_fk FOREIGN KEY (code) REFERENCES certificates (code) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction: connection });
      await db.transaction(async transaction => {
        const { Permission, RolePermission } = defineIdentityModels(db);
        await Permission.upsert({ code: permission }, { transaction });
        for (const roleCode of administratorRoles) await RolePermission.upsert({ roleCode, permissionCode: permission }, { transaction });
        await db.query('INSERT INTO certificate_template_settings (id, templates) VALUES (1, $templates) ON DUPLICATE KEY UPDATE id = 1',
          { bind: { templates: JSON.stringify(defaultTemplates) }, transaction });
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($migration, NOW(3))',
          { bind: { migration }, transaction });
      });
      return true;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', options);
    }
  });
}

export function createCertificateManagementRoutes(db: Sequelize, identity: IdentityStore, options: {
  origins: readonly string[]; production: boolean; logger: Pick<Logger, 'info'>;
}) {
  const router = Router();
  const admin = Router();
  const json = requireOriginAndJson(options.origins);
  const readSettings = async (transaction?: Transaction, lock = false) => {
    const [row] = await db.query<{ templates: string; version: number }>(
      `SELECT CAST(templates AS CHAR) AS templates, version FROM certificate_template_settings WHERE id = 1${lock ? ' FOR UPDATE' : ''}`,
      { type: QueryTypes.SELECT, transaction });
    if (!row) throw new Error('Certificate settings unavailable.');
    return { templates: JSON.parse(row.templates) as Template[], version: row.version };
  };
  const readReceipt = async (code: string, transaction?: Transaction, lock = false) => {
    const [receipt] = await db.query<{ code: string; courseSlug: string; locale: string; issuedAt: Date; withdrawn: number }>(
      `SELECT c.code, course.slug AS courseSlug, c.locale, c.issued_at AS issuedAt,
        EXISTS (SELECT 1 FROM certificate_withdrawals w WHERE w.code = c.code) AS withdrawn
        FROM certificates c JOIN courses course ON course.id = c.course_id WHERE c.code = $code${lock ? ' FOR UPDATE' : ''}`,
      { type: QueryTypes.SELECT, transaction, bind: { code } });
    if (!receipt) throw new ApiError(404, 'NOT_FOUND', 'No public verification record matches this code.');
    return { ...receipt, withdrawn: Boolean(receipt.withdrawn) };
  };
  router.get('/certificate-templates', async (_request, response) => {
    const settings = await readSettings();
    response.json({ templates: settings.templates.filter(item => item.enabled) });
  });
  admin.use(requireSecureTransport(options.production), loadIdentity(identity, sessionCookie(options.production).name),
    requirePermission(administrationPermission), requirePermission(permission));
  admin.get('/', async (_request, response) => { response.json(await readSettings()); });
  admin.put('/', json, validateInput('body', settingsInput), async (_request, response) => {
    const input = response.locals.validated.body as { templates: Template[]; version: number };
    const result = await db.transaction(async transaction => {
      const current = await readSettings(transaction, true);
      if (current.version !== input.version) throw new ApiError(409, 'STALE_VERSION', 'The settings changed. Reload before saving.');
      await db.query('UPDATE certificate_template_settings SET templates = $templates, version = version + 1 WHERE id = 1',
        { bind: { templates: JSON.stringify(input.templates) }, transaction });
      return readSettings(transaction);
    });
    options.logger.info({ event: 'certificate_templates_changed', actorId: response.locals.identity.id });
    response.json(result);
  });
  admin.get('/:code', validateInput('params', receiptParam), async (_request, response) => {
    response.json({ receipt: await readReceipt(response.locals.validated.params.code) });
  });
  admin.patch('/:code', json, validateInput('params', receiptParam), validateInput('body', receiptInput), async (_request, response) => {
    const { code } = response.locals.validated.params as { code: string };
    const { withdrawn } = response.locals.validated.body as { withdrawn: boolean };
    const result = await db.transaction(async transaction => {
      const current = await readReceipt(code, transaction, true);
      if (current.withdrawn !== withdrawn) await db.query(withdrawn
        ? 'INSERT INTO certificate_withdrawals (code, withdrawn_at) VALUES ($code, NOW(3))'
        : 'DELETE FROM certificate_withdrawals WHERE code = $code', { bind: { code }, transaction });
      return { ...current, withdrawn };
    });
    options.logger.info({ event: 'certificate_verification_changed', withdrawn, actorId: response.locals.identity.id });
    response.json({ receipt: result });
  });
  router.use('/admin/certificates', admin);
  return router;
}
