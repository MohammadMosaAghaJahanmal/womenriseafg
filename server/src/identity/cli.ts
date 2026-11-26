import { isUtf8 } from 'node:buffer';
import pino from 'pino';
import { createDatabase } from '../config/database';
import { loadSettings } from '../config/environment';
import { isStrongPassword, isValidLogin, normalizeLogin } from '../modules/auth/credentials';
import { hashPassword } from '../modules/auth/passwords';
import { EducationMigrationError, migrateEducation } from '../modules/education/migration';
import { MediaMigrationError, migrateMedia } from '../modules/media/migration';
import { CourseMigrationError, migrateCourses } from '../modules/courses/migration';
import { LearningMediaMigrationError, migrateLearningMedia } from '../modules/learning-media/migration';
import { BookMigrationError, migrateBooks } from '../modules/books/migration';
import { QuizMigrationError, migrateQuizzes } from '../modules/quizzes/migration';
import { DiscoveryMigrationError, migrateDiscovery } from '../modules/discovery/migration';
import { CertificateMigrationError, migrateCertificates } from '../modules/certificates/migration';
import { HomepageMigrationError, migrateHomepage } from '../modules/homepage/migration';
import { IdentityMigrationError, migrateIdentity } from './migration';
import {
  AdministratorAlreadyInitializedError, AdministratorUnavailableError, createIdentityStore,
  DuplicateLoginError, IdentitySchemaUnavailableError,
} from './store';

class CommandError extends Error {}

async function readPassword() {
  if (process.stdin.isTTY) {
    throw new CommandError('Provide the password on standard input from a source that does not echo it.');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const data = Buffer.from(chunk);
    length += data.length;
    if (length > 1024) throw new CommandError('The supplied password is too long.');
    chunks.push(data);
  }
  const input = Buffer.concat(chunks);
  if (!isUtf8(input)) throw new CommandError('The supplied password must use valid UTF-8.');
  const password = input.toString('utf8').replace(/\r?\n$/, '');
  if (!isStrongPassword(password)) throw new CommandError('The password does not satisfy the account password policy.');
  return password;
}

async function run(args: string[]) {
  const [command, name, ...remaining] = args;
  const requiresLogin = command === 'bootstrap' || command === 'recover';
  const takesNoArguments = command === 'migrate' || command === 'purge-sessions';
  if (remaining.length || (requiresLogin ? !name : (!takesNoArguments || name !== undefined))) {
    throw new CommandError('Use migrate, bootstrap USERNAME, recover USERNAME, or purge-sessions.');
  }
  if (requiresLogin && !isValidLogin(name ?? '')) throw new CommandError('The username does not satisfy the account username policy.');
  const login = name ? normalizeLogin(name) : '';

  const passwordHash = requiresLogin ? await hashPassword(await readPassword()) : '';
  const settings = loadSettings();
  const db = createDatabase(settings.database);
  const logger = pino({ level: settings.logLevel, base: undefined }, process.stderr);
  try {
    if (command === 'migrate') {
      console.log(await migrateIdentity(db) ? 'Identity migration applied.' : 'Identity schema is current.');
      console.log(await migrateEducation(db) ? 'Education migration applied.' : 'Education schema is current.');
      console.log(await migrateMedia(db) ? 'Media migration applied.' : 'Media schema is current.');
      console.log(await migrateCourses(db) ? 'Course migration applied.' : 'Course schema is current.');
      console.log(await migrateLearningMedia(db) ? 'Learning media migration applied.' : 'Learning media schema is current.');
      console.log(await migrateBooks(db) ? 'Book migration applied.' : 'Book schema is current.');
      console.log(await migrateQuizzes(db) ? 'Quiz migration applied.' : 'Quiz schema is current.');
      console.log(await migrateDiscovery(db) ? 'Discovery migration applied.' : 'Discovery schema is current.');
      console.log(await migrateCertificates(db) ? 'Certificate migration applied.' : 'Certificate schema is current.');
      console.log(await migrateHomepage(db) ? 'Homepage migration applied.' : 'Homepage schema is current.');
      return;
    }
    const store = createIdentityStore(db);
    if (command === 'bootstrap') {
      const account = await store.bootstrapAdministrator(login, passwordHash);
      logger.info({ event: 'admin_initialized', targetId: account.id, result: 'success' });
      console.log('Super administrator initialized.');
    } else if (command === 'recover') {
      const { userId, revoked } = await store.recoverAdministrator(login, passwordHash);
      logger.info({ event: 'admin_password_recovered', targetId: userId, revoked, result: 'success' });
      console.log('Administrator password reset. Revoked sessions:', revoked);
    } else {
      console.log('Expired sessions removed:', await store.purgeExpiredSessions());
    }
  } finally {
    await db.close();
  }
}

void run(process.argv.slice(2)).catch(error => {
  if (error instanceof CommandError || error instanceof AdministratorAlreadyInitializedError ||
      error instanceof AdministratorUnavailableError || error instanceof DuplicateLoginError ||
      error instanceof IdentitySchemaUnavailableError || error instanceof IdentityMigrationError ||
      error instanceof EducationMigrationError || error instanceof MediaMigrationError ||
      error instanceof CourseMigrationError || error instanceof LearningMediaMigrationError || error instanceof BookMigrationError ||
      error instanceof QuizMigrationError || error instanceof DiscoveryMigrationError || error instanceof CertificateMigrationError ||
      error instanceof HomepageMigrationError) {
    console.error(error.message);
  } else {
    console.error('Identity command failed. Check the database connection, permissions, and migration status.');
  }
  process.exitCode = 1;
});
