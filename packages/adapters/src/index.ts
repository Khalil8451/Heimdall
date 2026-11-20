import { createHash } from 'node:crypto';
import pg from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
export function createPool(
  connectionString: string,
  limits: { statementMs?: number; connectMs?: number; max?: number } = {},
) {
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const config: PoolConfig = {
    connectionString,
    max: limits.max ?? 5,
    connectionTimeoutMillis: limits.connectMs ?? 1000,
    idleTimeoutMillis: 10000,
    statement_timeout: limits.statementMs ?? 2000,
    query_timeout: (limits.statementMs ?? 2000) + 1000,
    idle_in_transaction_session_timeout: 5000,
    application_name: 'heimdall',
  };
  const pool = new pg.Pool(config);
  pool.on('error', () => console.error('DB_IDLE_CONNECTION'));
  return pool;
}
export function poolMetrics(pool: pg.Pool) {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}
export async function transaction<T>(
  pool: pg.Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      destroy = true;
    }
    throw error;
  } finally {
    client.release(destroy);
  }
}
export interface Migration {
  version: number;
  sql: string;
}
export async function migrate(pool: pg.Pool, migrations: readonly Migration[]) {
  if (migrations.some((m, i) => m.version !== i + 1 || !m.sql.trim()))
    throw new Error('INVALID_MIGRATION_SEQUENCE');
  const hashed = migrations.map((m) => ({
    ...m,
    checksum: createHash('sha256').update(m.sql).digest('hex'),
  }));
  return transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [862140]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS app.schema_migrations(version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await client.query(
      'GRANT SELECT ON app.schema_migrations TO heimdall_runtime',
    );
    const applied = await client.query<{ version: number; checksum: string }>(
      'SELECT version,checksum FROM app.schema_migrations ORDER BY version',
    );
    if (
      applied.rows.some(
        (row, i) =>
          row.version !== hashed[i]?.version ||
          row.checksum !== hashed[i]?.checksum,
      )
    )
      throw new Error('MIGRATION_HISTORY_MISMATCH');
    const results: { version: number; durationMs: number }[] = [];
    for (const migration of hashed.slice(applied.rows.length)) {
      const started = performance.now();
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO app.schema_migrations(version,checksum) VALUES($1,$2)',
        [migration.version, migration.checksum],
      );
      results.push({
        version: migration.version,
        durationMs: performance.now() - started,
      });
    }
    return results;
  });
}
/** Administrator-only local setup. PostgreSQL quotes parameterized role passwords as literals. */
export async function initializeRoles(
  pool: pg.Pool,
  passwords: { migrator: string; runtime: string },
) {
  if (Object.values(passwords).some((p) => p.length < 20))
    throw new Error('STRONG_LOCAL_PASSWORDS_REQUIRED');
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [862139]);
    await client.query(
      `DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='heimdall_migrator') THEN CREATE ROLE heimdall_migrator NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='heimdall_runtime') THEN CREATE ROLE heimdall_runtime NOLOGIN; END IF; END $$`,
    );
    const migrator = await client.query<{ ddl: string }>(
      "SELECT format('ALTER ROLE heimdall_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', $1::text) AS ddl",
      [passwords.migrator],
    );
    const runtime = await client.query<{ ddl: string }>(
      "SELECT format('ALTER ROLE heimdall_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', $1::text) AS ddl",
      [passwords.runtime],
    );
    await client.query(migrator.rows[0]!.ddl);
    await client.query(runtime.rows[0]!.ddl);
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await client.query(
      'CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION heimdall_migrator',
    );
    await client.query('GRANT USAGE ON SCHEMA app TO heimdall_runtime');
  });
}
