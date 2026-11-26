import path from 'node:path';
import { isIP } from 'node:net';
import dotenv from 'dotenv';
import Joi from 'joi';

export const projectRoot = path.resolve(__dirname, '../../..');
export const clientBuild = path.join(projectRoot, 'client', 'dist');

interface Environment {
  NODE_ENV: 'development' | 'production' | 'test';
  HOST: string;
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  LOG_LEVEL: string;
  STORAGE_ROOT: string;
  MEDIA_MAX_UPLOAD_BYTES: number;
  SHORT_MAX_SECONDS: number;
  AUTH_PUBLIC_ORIGIN?: string;
  AUTH_TRUSTED_PROXY_IPS: string;
}

const schema = Joi.object<Environment>({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  HOST: Joi.string().trim().min(1).default('127.0.0.1'),
  PORT: Joi.number().port().min(1).default(3000),
  DB_HOST: Joi.string().trim().min(1).default('127.0.0.1'),
  DB_PORT: Joi.number().port().min(1).default(3306),
  DB_NAME: Joi.string().trim().min(1).default('womenriseafg'),
  DB_USER: Joi.string().trim().min(1).default('womenriseafg'),
  DB_PASSWORD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().pattern(/\S/).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  LOG_LEVEL: Joi.string().valid('silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  STORAGE_ROOT: Joi.string().trim().min(1).default('storage'),
  MEDIA_MAX_UPLOAD_BYTES: Joi.number().integer().min(1024).max(2147483647).default(134217728),
  SHORT_MAX_SECONDS: Joi.number().integer().min(1).max(600).default(90),
  AUTH_PUBLIC_ORIGIN: Joi.string().trim().empty(''),
  AUTH_TRUSTED_PROXY_IPS: Joi.string().trim().allow('').default(''),
});

function readAuthOrigin(raw: string | undefined, production: boolean): string | undefined {
  if (!raw) return;
  try {
    const url = new URL(raw);
    const allowedProtocol = url.protocol === 'https:' || (!production && url.protocol === 'http:');
    if (allowedProtocol && url.origin === raw) return url.origin;
  } catch {
    // Report the setting name without printing a potentially sensitive value.
  }
  throw new Error('Invalid environment settings: AUTH_PUBLIC_ORIGIN');
}

function contains(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..');
}

export function readSettings(env: NodeJS.ProcessEnv) {
  const { value, error } = schema.validate(env, { abortEarly: false, stripUnknown: true });
  if (error) {
    const fields = error.details.map(detail => detail.path.join('.')).join(', ');
    throw new Error('Invalid environment settings: ' + fields);
  }
  const storageRoot = path.resolve(projectRoot, value.STORAGE_ROOT);
  const clientPath = path.join(projectRoot, 'client');
  if (contains(clientPath, storageRoot) || contains(storageRoot, clientPath)) {
    throw new Error('Invalid environment settings: STORAGE_ROOT overlaps the client directory');
  }
  const sourceFolders = ['server', 'docs', '.git', 'node_modules'].map(folder => path.join(projectRoot, folder));
  if (sourceFolders.some(folder => contains(folder, storageRoot))) {
    throw new Error('Invalid environment settings: STORAGE_ROOT overlaps a project source directory');
  }
  const production = value.NODE_ENV === 'production';
  const origin = readAuthOrigin(value.AUTH_PUBLIC_ORIGIN, production);
  const trustedProxies = value.AUTH_TRUSTED_PROXY_IPS
    ? value.AUTH_TRUSTED_PROXY_IPS.split(',').map(address => address.trim())
    : [];
  if (trustedProxies.some(address => !isIP(address))) {
    throw new Error('Invalid environment settings: AUTH_TRUSTED_PROXY_IPS');
  }
  const origins = origin ? [origin] : production ? [] : ['localhost', '127.0.0.1'].flatMap(host => [
    'http://' + host + ':' + value.PORT, 'http://' + host + ':5173',
  ]);
  return {
    environment: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    storageRoot,
    mediaMaxUploadBytes: value.MEDIA_MAX_UPLOAD_BYTES,
    shortMaxSeconds: value.SHORT_MAX_SECONDS,
    auth: { origins, trustedProxies },
    database: {
      host: value.DB_HOST,
      port: value.DB_PORT,
      name: value.DB_NAME,
      user: value.DB_USER,
      password: value.DB_PASSWORD,
    },
  };
}

export function loadSettings() {
  const { error } = dotenv.config({ path: path.join(projectRoot, '.env'), override: false, quiet: true });
  if (error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw new Error('Unable to read the project environment file');
  }
  return readSettings(process.env);
}

export type Settings = ReturnType<typeof readSettings>;
