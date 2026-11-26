import type { Sequelize } from 'sequelize';
import { migrateBooks } from '../../src/modules/books/migration';
import { migrateCurriculumAuthoring } from '../../src/modules/courses/authoringMigration';
import { migrateLearningMedia } from '../../src/modules/learning-media/migration';
import { migrateLearningMediaAltText } from '../../src/modules/learning-media/altMigration';
import { migrateQuizzes } from '../../src/modules/quizzes/migration';

export const fixtureCredit = {
  source: 'Synthetic test fixture', creator: 'Test author', license: 'CC0-1.0', attribution: '',
  origin: 'human', tool: '', notes: '',
} as const;

export async function migrateAuthoringFixtures(db: Sequelize) {
  for (const migrate of [migrateLearningMedia, migrateBooks, migrateQuizzes, migrateCurriculumAuthoring, migrateLearningMediaAltText]) {
    await migrate(db);
  }
}
