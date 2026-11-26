import { createDatabase } from '../../config/database';
import { loadSettings } from '../../config/environment';
import { createCorrectionStore } from './store';

async function run() {
  const [age, flag, target, ...extra] = process.argv.slice(2);
  if (!age || !/^[1-9][0-9]{0,3}$/.test(age) || extra.length || (flag !== undefined && (flag !== '--apply' || !target))) {
    console.error('Usage: node server/dist/modules/corrections/retention-cli.js RESOLVED_DAYS [--apply SCHEMA]');
    process.exitCode = 1;
    return;
  }
  const settings = loadSettings();
  if (flag && target !== settings.database.name) {
    console.error('The supplied schema does not match the configured database.');
    process.exitCode = 1;
    return;
  }
  const cutoff = new Date(Date.now() - Number(age) * 86_400_000);
  const db = createDatabase(settings.database);
  try {
    const count = await createCorrectionStore(db).retention(cutoff, flag === '--apply');
    console.log((flag ? 'Resolved reports removed: ' : 'Resolved reports eligible: ') + count + ' (before ' + cutoff.toISOString() + ')');
  } finally {
    await db.close();
  }
}

void run().catch(() => {
  console.error('Correction retention command failed. Check configuration, privileges and migrations.');
  process.exitCode = 1;
});
