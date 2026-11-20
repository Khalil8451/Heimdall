import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createPool, initializeRoles, migrate } from '@heimdall/adapters';
export async function readMigrations() {
  const folder = new URL('../packages/adapters/migrations/', import.meta.url);
  const files = (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return Promise.all(
    files.map(async (file) => {
      if (!file.isFile() || !/^\d{3}-[a-z0-9-]+\.sql$/.test(file.name))
        throw new Error('INVALID_MIGRATION_FILE');
      return {
        version: Number(file.name.slice(0, 3)),
        sql: (await readFile(new URL(file.name, folder), 'utf8')).replaceAll(
          '\r\n',
          '\n',
        ),
      };
    }),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let pool;
  try {
    const action = process.argv[2];
    if (!['setup', 'migrate'].includes(action))
      throw new Error('INVALID_DATABASE_COMMAND');
    const key =
      action === 'setup' ? 'ADMIN_DATABASE_URL' : 'MIGRATION_DATABASE_URL';
    if (!process.env[key]) throw new Error('DATABASE_CONFIGURATION_REQUIRED');
    pool = createPool(process.env[key]);
    if (action === 'setup')
      await initializeRoles(pool, {
        migrator: process.env.MIGRATOR_PASSWORD ?? '',
        runtime: process.env.RUNTIME_PASSWORD ?? '',
      });
    else
      for (const result of await migrate(pool, await readMigrations()))
        console.info(JSON.stringify(result));
    console.info('Database command completed');
  } catch {
    console.error(
      'Database command failed; verify credentials, connectivity and migration history.',
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
