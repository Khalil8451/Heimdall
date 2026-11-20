import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync, fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { configuration } from '../apps/api/dist/configuration.js';
import { createApplication } from '../apps/api/dist/bootstrap.js';
const DATABASE_URL =
  'postgresql://heimdall_runtime:synthetic-password@127.0.0.1:1/heimdall';
test('configuration rejects missing credentials, unsafe exposure, URL overrides and invalid limits', () => {
  for (const patch of [
    { DATABASE_URL: '' },
    { DATABASE_URL: 'postgresql://postgres:secret@localhost/db' },
    { HOST: '0.0.0.0' },
    { AUTH_MODE: 'none' },
    { PORT: '3e3' },
    { PORT: '65536' },
    { DB_STATEMENT_MS: '-1' },
    { SHUTDOWN_MS: '0' },
    { DATABASE_URL: DATABASE_URL + '?options=-c%20statement_timeout=0' },
  ])
    assert.throws(() => configuration({ DATABASE_URL, ...patch }));
  assert.equal(configuration({ DATABASE_URL }).host, '127.0.0.1');
});
test('missing configuration fails in the real entry process before listening without leaking values', () => {
  const result = spawnSync(process.execPath, ['apps/api/dist/main.js'], {
    env: { ...process.env, DATABASE_URL: 'password-secret-invalid' },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /API_STARTUP_FAILED/);
  assert.ok(!result.stdout.includes('API_LISTENING'));
  assert.ok(!result.stderr.includes('password-secret'));
});
test('database outage leaves liveness responsive and readiness safely unavailable', async () => {
  const app = await createApplication({
    DATABASE_URL,
    DB_CONNECT_MS: '50',
    DB_STATEMENT_MS: '50',
  });
  try {
    await app.listen(0, '127.0.0.1');
    assert.deepEqual(
      (await request(app.getHttpServer()).get('/health/live')).body,
      { status: 'ok' },
    );
    const unavailable = await request(app.getHttpServer()).get('/health/ready');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, 'UNAVAILABLE');
    assert.ok(!JSON.stringify(unavailable.body).includes('postgres'));
  } finally {
    await app.close();
  }
});
for (const mode of ['drain', 'deadline'])
  test(
    'Linux termination ' + mode + ' during an active request',
    { skip: process.platform === 'win32', timeout: 10000 },
    async () => {
      const child = fork('scripts/fixtures/lifecycle-child.mjs', [], {
        env: {
          ...process.env,
          DATABASE_URL,
          SHUTDOWN_MS: mode === 'drain' ? '2000' : '200',
          TEST_DELAY_MS: mode === 'drain' ? '400' : '10000',
        },
        silent: true,
      });
      let output = '';
      let errors = '';
      child.stdout.on('data', (c) => (output += c));
      child.stderr.on('data', (c) => (errors += c));
      try {
        const exit = once(child, 'exit');
        const [ready] = await once(child, 'message');
        assert.equal(ready.event, 'listening');
        const started = once(child, 'message');
        const pending = fetch(
          'http://127.0.0.1:' + ready.port + '/slow-test-only',
        )
          .then(async (r) => ({ status: r.status, body: await r.text() }))
          .catch(() => null);
        await started;
        const before = performance.now();
        child.kill('SIGTERM');
        await delay(80);
        await assert.rejects(
          fetch('http://127.0.0.1:' + ready.port + '/health/live'),
        );
        const result = await pending;
        const [code] = await exit;
        assert.ok(performance.now() - before < 4000);
        assert.equal(code, mode === 'drain' ? 0 : 1);
        if (mode === 'drain') {
          assert.deepEqual(result, { status: 200, body: 'done' });
          assert.match(output, /SHUTDOWN_COMPLETE/);
        } else assert.match(errors, /SHUTDOWN_TIMEOUT/);
        assert.ok(!output.includes('synthetic-password'));
        assert.ok(!errors.includes('synthetic-password'));
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    },
  );
