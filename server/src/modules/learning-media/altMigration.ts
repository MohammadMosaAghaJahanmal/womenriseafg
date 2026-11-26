import { createHash } from 'node:crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';

const version = '018-learning-media-alt-text';

export class LearningMediaAltMigrationError extends Error {}

function readColumn(db: Sequelize, transaction: Transaction) {
  return db.query<{ columnType: string; nullable: string }>(`
    SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'learning_media_translations' AND COLUMN_NAME = 'image_alt'
  `, { type: QueryTypes.SELECT, transaction });
}

export async function migrateLearningMediaAltText(db: Sequelize) {
  const lock = 'womenriseafg:media-alt:' + createHash('sha256').update(db.getDatabaseName()).digest('hex').slice(0, 40);
  const lockOptions = { type: QueryTypes.SELECT as const, bind: { lock } };
  return db.transaction(async transaction => {
    const [acquired] = await db.query<{ held: number | null }>('SELECT GET_LOCK($lock, 15) AS held', { ...lockOptions, transaction });
    if (acquired?.held !== 1) throw new LearningMediaAltMigrationError('Could not acquire the media accessibility migration lock.');
    try {
      const records = await db.query<{ version: string }>('SELECT version FROM identity_schema_migrations',
        { type: QueryTypes.SELECT, transaction });
      const versions = new Set(records.map(record => record.version));
      if (!versions.has('006-learning-media')) {
        throw new LearningMediaAltMigrationError('Apply the learning media migration before the media accessibility migration.');
      }
      const applied = versions.has(version);
      const [existing] = await readColumn(db, transaction);
      if (!applied && !existing) {
        await db.query('ALTER TABLE learning_media_translations ADD COLUMN image_alt VARCHAR(500) NULL', { transaction });
      }
      const [column] = await readColumn(db, transaction);
      if (column?.columnType !== 'varchar(500)' || column.nullable !== 'YES') {
        throw new LearningMediaAltMigrationError('The learning media accessibility schema is incompatible.');
      }
      if (!applied) {
        await db.query('INSERT INTO identity_schema_migrations (version, applied_at) VALUES ($version, $appliedAt)',
          { bind: { version, appliedAt: new Date() }, transaction });
      }
      return !applied;
    } finally {
      await db.query('SELECT RELEASE_LOCK($lock)', { ...lockOptions, transaction });
    }
  });
}
