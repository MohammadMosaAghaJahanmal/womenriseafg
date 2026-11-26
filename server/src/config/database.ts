import { Sequelize } from 'sequelize';
import type { Settings } from './environment';

export function createDatabase(config: Settings['database']): Sequelize {
  return new Sequelize(config.name, config.user, config.password, {
    dialect: 'mysql',
    host: config.host,
    port: config.port,
    logging: false,
    dialectOptions: { charset: 'utf8mb4', connectTimeout: 3000 },
    define: { charset: 'utf8mb4' },
    pool: { min: 0, max: 3, idle: 10000, acquire: 4000 },
    retry: { max: 0 },
  });
}
