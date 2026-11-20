import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createApplication } from '../apps/api/dist/bootstrap.js';
import { LISTEN_OPTIONS } from '../apps/api/dist/app.module.js';
test('application bootstraps, binds loopback defaults, responds to HTTP and closes', async () => {
  const app = await createApplication({
    DATABASE_URL:
      'postgresql://heimdall_runtime:synthetic-password@127.0.0.1:1/heimdall',
  });
  try {
    assert.deepEqual(app.get(LISTEN_OPTIONS), {
      host: '127.0.0.1',
      port: 3000,
    });
    await app.listen(0, '127.0.0.1');
    const response = await request(app.getHttpServer()).get('/');
    assert.equal(response.status, 404);
    assert.equal(response.headers['x-powered-by'], undefined);
  } finally {
    await app.close();
  }
});
test('missing provider wiring rejects visibly instead of exiting the process', async () => {
  await assert.rejects(
    Test.createTestingModule({
      providers: [
        {
          provide: 'broken',
          inject: ['missing'],
          useFactory: (value) => value,
        },
      ],
    }).compile(),
    /dependencies/i,
  );
});
test('framework boundaries reject Nest, persistence and adapter imports in either pure layer', async () => {
  const lint = new ESLint();
  for (const layer of ['domain', 'application']) {
    for (const source of [
      '@nestjs/common',
      'express',
      'pg',
      'typeorm',
      'mongoose',
      '@heimdall/adapters',
      '../../apps/api/src/bootstrap.js',
    ]) {
      const [result] = await lint.lintText('import "' + source + '";', {
        filePath: 'packages/' + layer + '/src/boundary-probe.ts',
      });
      assert.ok(
        result.messages.some((m) => m.ruleId === 'no-restricted-imports'),
        layer + ': ' + source,
      );
    }
    const [valid] = await lint.lintText(
      'export const name: string = "plain";',
      { filePath: 'packages/' + layer + '/src/boundary-probe.ts' },
    );
    assert.equal(valid.errorCount, 0);
  }
});

test('application can import domain while package internals stay private', async () => {
  const [result] = await new ESLint().lintText('import "@heimdall/domain";', {
    filePath: 'packages/application/src/probe.ts',
  });
  assert.equal(result.errorCount, 0);
  await assert.rejects(import('@heimdall/domain/dist/index.js'), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  });
});

test('pure layers reject dynamic and type-only framework imports', async () => {
  const lint = new ESLint();
  for (const layer of ['domain', 'application'])
    for (const source of [
      'import type { Injectable } from "@nestjs/common";',
      'const nest = import("@nestjs/core");',
      'const nest = require("@nestjs/core");',
    ]) {
      const [result] = await lint.lintText(source, {
        filePath: 'packages/' + layer + '/src/probe.ts',
      });
      assert.ok(result.errorCount > 0, source);
    }
  const [local] = await lint.lintText('import "./local.js";', {
    filePath: 'packages/domain/src/probe.ts',
  });
  assert.equal(local.errorCount, 0);
});
