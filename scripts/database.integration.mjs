import request from 'supertest';
import { createApplication } from '../apps/api/dist/bootstrap.js';
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createPool,
  initializeRoles,
  migrate,
  poolMetrics,
  transaction,
} from '@heimdall/adapters';
import { readMigrations } from './database.mjs';
const image =
  'postgres:18.7@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc';
const name = 'heimdall-db-test-' + randomUUID();
const passwords = {
  admin: randomUUID(),
  migrator: randomUUID() + "'\\",
  runtime: randomUUID() + "'\\",
};
const docker = (args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      POSTGRES_PASSWORD: passwords.admin,
      POSTGRES_ADMIN_PASSWORD: passwords.admin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let volumeCreated = false;
const volume = name + '-data';
let created = false,
  admin,
  migrator,
  runtime,
  base,
  migrations;
function poolFor(user, password, limits) {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  return createPool(url.href, limits);
}
before(async () => {
  docker(['volume', 'create', '--label', 'heimdall.test=database', volume]);
  volumeCreated = true;
  docker([
    'run',
    '--detach',
    '--name',
    name,
    '--label',
    'heimdall.test=database',
    '--env',
    'POSTGRES_PASSWORD',
    '--env',
    'POSTGRES_DB=heimdall',
    '--publish',
    '127.0.0.1::5432',
    '--mount',
    'type=volume,source=' + volume + ',target=/var/lib/postgresql',
    '--memory',
    '512m',
    '--cpus',
    '1',
    image,
  ]);
  created = true;
  const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
  base = 'postgresql://127.0.0.1:' + port + '/heimdall';
  admin = poolFor('postgres', passwords.admin);
  for (let attempt = 0; ; attempt++) {
    try {
      await admin.query('SELECT 1');
      break;
    } catch (error) {
      if (attempt >= 40) throw error;
      await delay(250);
    }
  }
  assert.match(
    (await admin.query('SHOW server_version')).rows[0].server_version,
    /^18\.7/,
  );
  await initializeRoles(admin, passwords);
  await initializeRoles(admin, passwords);
  migrator = poolFor('heimdall_migrator', passwords.migrator);
  runtime = poolFor('heimdall_runtime', passwords.runtime);
  migrations = await readMigrations();
});
after(async () => {
  await Promise.allSettled([admin?.end(), migrator?.end(), runtime?.end()]);
  if (created) docker(['rm', '--force', name]);
  if (volumeCreated) docker(['volume', 'rm', volume]);
});
test('fresh initialization, repeat, prior-version upgrade and concurrent migrations', async () => {
  assert.equal((await migrate(migrator, migrations)).length, 1);
  assert.deepEqual(await migrate(migrator, migrations), []);
  const upgrade = [
    ...migrations,
    {
      version: 2,
      sql: 'SELECT pg_sleep(0.05); CREATE TABLE app.migration_probe(id integer PRIMARY KEY,value text NOT NULL);',
    },
  ];
  const results = await Promise.all([
    migrate(migrator, upgrade),
    migrate(migrator, upgrade),
  ]);
  assert.equal(results.flat().length, 1);
  assert.equal(
    (
      await migrator.query(
        'SELECT count(*)::int AS count FROM app.schema_migrations',
      )
    ).rows[0].count,
    2,
  );
  migrations = upgrade;
});
test('applied checksum drift, missing history and failed migrations fail closed and roll back', async () => {
  await assert.rejects(
    migrate(migrator, [
      { ...migrations[0], sql: migrations[0].sql + '-- drift' },
      migrations[1],
    ]),
    /MIGRATION_HISTORY_MISMATCH/,
  );
  await assert.rejects(
    migrate(migrator, migrations.slice(0, 1)),
    /MIGRATION_HISTORY_MISMATCH/,
  );
  await assert.rejects(
    migrate(migrator, [
      ...migrations,
      {
        version: 3,
        sql: 'CREATE TABLE app.failed_probe(id integer); SELECT * FROM app.absent_relation;',
      },
    ]),
  );
  assert.equal(
    (await migrator.query("SELECT to_regclass('app.failed_probe') AS name"))
      .rows[0].name,
    null,
  );
  assert.deepEqual(await migrate(migrator, migrations), []);
});
test('runtime can perform parameterized data work but cannot change schema, metadata, roles or read role secrets', async () => {
  const value = "'); DROP TABLE app.migration_probe; --";
  await transaction(runtime, async (client) => {
    await client.query(
      'INSERT INTO app.migration_probe(id,value) VALUES($1,$2)',
      [1, value],
    );
  });
  assert.equal(
    (
      await runtime.query(
        'SELECT value FROM app.migration_probe WHERE id=$1',
        [1],
      )
    ).rows[0].value,
    value,
  );
  for (const sql of [
    'ALTER TABLE app.migration_probe ADD COLUMN secret text',
    'CREATE TABLE public.forbidden(id integer)',
    "UPDATE app.schema_migrations SET checksum='fake'",
    'SELECT rolpassword FROM pg_authid',
    'SET ROLE heimdall_migrator',
  ])
    await assert.rejects(runtime.query(sql), (error) => error.code === '42501');
  await assert.rejects(
    transaction(runtime, async (client) => {
      await client.query(
        'INSERT INTO app.migration_probe(id,value) VALUES($1,$2)',
        [2, 'rollback'],
      );
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(
    (
      await runtime.query(
        'SELECT count(*)::int AS count FROM app.migration_probe WHERE id=2',
      )
    ).rows[0].count,
    0,
  );
});
test('statement timeout, bounded pool wait and lost connections recover using real PostgreSQL', async () => {
  const bounded = poolFor('heimdall_runtime', passwords.runtime, {
    statementMs: 60,
    connectMs: 100,
    max: 1,
  });
  try {
    await assert.rejects(
      bounded.query('SELECT pg_sleep(1)'),
      (error) => error.code === '57014',
    );
    const held = await bounded.connect();
    const waiting = bounded.connect();
    const rejected = assert.rejects(waiting, /timeout/);
    await delay(20);
    assert.equal(poolMetrics(bounded).waiting, 1);
    await rejected;
    held.release();
    const client = await bounded.connect();
    client.on('error', () => {});
    const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0]
      .pid;
    await admin.query('SELECT pg_terminate_backend($1)', [pid]);
    await delay(20);
    await assert.rejects(client.query('SELECT 1'));
    client.release(true);
    assert.equal((await bounded.query('SELECT 1 AS value')).rows[0].value, 1);
  } finally {
    await bounded.end();
  }
});

test('Compose binds only loopback and named-volume data survives container restart', async () => {
  const config = JSON.parse(docker(['compose', 'config', '--format', 'json']));
  assert.equal(config.services.postgres.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services.postgres.image, image);
  assert.equal(
    config.services.postgres.volumes[0].target,
    '/var/lib/postgresql',
  );
  await Promise.all([admin.end(), migrator.end(), runtime.end()]);
  docker(['restart', name]);
  // Docker may assign a new ephemeral host port when restarting the container.
  const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
  base = 'postgresql://127.0.0.1:' + port + '/heimdall';
  admin = poolFor('postgres', passwords.admin);
  migrator = poolFor('heimdall_migrator', passwords.migrator);
  runtime = poolFor('heimdall_runtime', passwords.runtime);
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await admin.query(
        'SELECT count(*)::int AS count FROM app.schema_migrations',
      );
      assert.equal(result.rows[0].count, 2);
      break;
    } catch (error) {
      if (attempt >= 40) throw error;
      await delay(250);
    }
  }
  assert.equal(
    (
      await runtime.query(
        'SELECT count(*)::int AS count FROM app.migration_probe',
      )
    ).rows[0].count,
    1,
  );
});

test('readiness checks real migration compatibility and recovers after a database outage', async () => {
  const url = new URL(base);
  url.username = 'heimdall_runtime';
  url.password = passwords.runtime;
  const app = await createApplication({
    DATABASE_URL: url.href,
    DB_STATEMENT_MS: '50',
    DB_CONNECT_MS: '100',
  });
  let paused = false;
  try {
    await app.listen(0, '127.0.0.1');
    // The extra fixture migration correctly makes this application version unready.
    assert.equal(
      (await request(app.getHttpServer()).get('/health/ready')).status,
      503,
    );
    await migrator.query(
      'DELETE FROM app.schema_migrations WHERE version=$1',
      [2],
    );
    assert.equal(
      (await request(app.getHttpServer()).get('/health/ready')).status,
      200,
    );
    const checksum = (
      await migrator.query(
        'SELECT checksum FROM app.schema_migrations WHERE version=1',
      )
    ).rows[0].checksum;
    await migrator.query(
      'UPDATE app.schema_migrations SET checksum=$1 WHERE version=1',
      ['drift'],
    );
    assert.equal(
      (await request(app.getHttpServer()).get('/health/ready')).status,
      503,
    );
    await migrator.query(
      'UPDATE app.schema_migrations SET checksum=$1 WHERE version=1',
      [checksum],
    );
    docker(['pause', name]);
    paused = true;
    assert.equal(
      (await request(app.getHttpServer()).get('/health/live')).status,
      200,
    );
    const started = performance.now();
    assert.equal(
      (await request(app.getHttpServer()).get('/health/ready')).status,
      503,
    );
    assert.ok(performance.now() - started < 2500);
    docker(['unpause', name]);
    paused = false;
    for (let i = 0; ; i++) {
      const ready = await request(app.getHttpServer()).get('/health/ready');
      if (ready.status === 200) break;
      if (i >= 20) assert.fail('readiness did not recover');
      await delay(100);
    }
  } finally {
    if (paused) docker(['unpause', name]);
    await app.close();
  }
});
