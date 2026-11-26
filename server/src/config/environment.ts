import path from 'node:path';
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
});

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
  return {
    environment: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    storageRoot,
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
