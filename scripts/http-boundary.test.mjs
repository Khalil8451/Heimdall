import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { Controller, Post, HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DomainError } from '@heimdall/domain';
import request from 'supertest';
import { z } from 'zod';
import {
  configureHttpBoundary,
  OwnedBody,
  OwnedResponse,
  ownedOperation,
  problemSchema,
} from '../apps/api/dist/http-boundary.js';
const contract = {
  request: z.strictObject({
    enabled: z.boolean(),
    count: z.number().int().min(0),
    name: z.string().max(40),
  }),
  response: z.strictObject({ accepted: z.boolean(), count: z.number().int() }),
};
class Probe {
  execute(body) {
    return { accepted: body.enabled, count: body.count };
  }
  badOutput() {
    return { accepted: true, count: 1, secret: 'private-response' };
  }
  unexpected() {
    throw new Error('secret-password <script>');
  }
  conflict() {
    throw new DomainError('CONFLICT');
  }
  invalid() {
    throw new DomainError('INVALID_INPUT');
  }
}
Controller('probe')(Probe);
for (const name of [
  'execute',
  'badOutput',
  'unexpected',
  'conflict',
  'invalid',
]) {
  const descriptor = Object.getOwnPropertyDescriptor(Probe.prototype, name);
  Post(name)(Probe.prototype, name, descriptor);
  OwnedResponse(contract)(Probe.prototype, name, descriptor);
}
OwnedBody(contract)(Probe.prototype, 'execute', 0);
for (const status of [400, 404, 409, 413, 422, 429, 503]) {
  const name = 'status' + status;
  Object.defineProperty(Probe.prototype, name, {
    value() {
      throw new HttpException('secret-' + status, status);
    },
    configurable: true,
  });
  Post(name)(
    Probe.prototype,
    name,
    Object.getOwnPropertyDescriptor(Probe.prototype, name),
  );
}
let app;
const logs = [];
const requests = [];
before(async () => {
  const module = await Test.createTestingModule({
    controllers: [Probe],
  }).compile();
  app = module.createNestApplication({ bodyParser: false, logger: false });
  configureHttpBoundary(
    app,
    (event) => logs.push(event),
    (event) => requests.push(event),
  );
  await app.listen(0, '127.0.0.1');
});
after(async () => {
  await app?.close();
});
const send = () => request(app.getHttpServer());
test('owned request and response contract accepts only intentional primitive types', async () => {
  const valid = await send()
    .post('/probe/execute')
    .send({ enabled: false, count: 0, name: 'ok' });
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body, { accepted: false, count: 0 });
  for (const body of [
    { enabled: 'false', count: 0, name: 'ok' },
    { enabled: true, count: '1', name: 'ok' },
    { enabled: true, count: 1 },
    { enabled: true, count: 1, name: 'ok', secret: 'private-input' },
  ]) {
    const result = await send().post('/probe/execute').send(body);
    assert.equal(result.status, 400);
    problemSchema.parse(result.body);
    assert.ok(result.body.diagnostics.length <= 10);
    assert.ok(!JSON.stringify(result.body).includes('private-input'));
  }
});
test('malformed JSON, oversized bodies and missing routes use safe problem envelopes', async () => {
  for (const [result, status] of [
    [
      await send()
        .post('/probe/execute')
        .set('Content-Type', 'application/json')
        .send('{"secret":'),
      400,
    ],
    [
      await send()
        .post('/probe/execute')
        .send({ name: 'x'.repeat(17000) }),
      413,
    ],
    [await send().get('/missing'), 404],
  ]) {
    assert.equal(result.status, status);
    problemSchema.parse(result.body);
    assert.match(result.headers['content-type'], /application\/problem\+json/);
    assert.ok(!JSON.stringify(result.body).includes('stack'));
  }
});
test('stable domain and HTTP codes survive mapping without leaking exception details', async () => {
  for (const [path, status, code] of [
    ['conflict', 409, 'CONFLICT'],
    ['invalid', 422, 'INVALID_INPUT'],
    ...Object.entries({
      400: 'BAD_REQUEST',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'INVALID_INPUT',
      429: 'RATE_LIMITED',
      503: 'UNAVAILABLE',
    }).map(([s, c]) => ['status' + s, Number(s), c]),
  ]) {
    const result = await send().post('/probe/' + path);
    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
    assert.ok(!JSON.stringify(result.body).includes('secret'));
    problemSchema.parse(result.body);
  }
});
test('unexpected exceptions and response contract violations each log once without secrets', async () => {
  for (const path of ['unexpected', 'badOutput']) {
    const beforeCount = logs.length;
    const result = await send().post('/probe/' + path);
    assert.equal(result.status, 500);
    assert.equal(logs.length, beforeCount + 1);
    assert.deepEqual(logs.at(-1), {
      code: 'INTERNAL',
      requestId: result.body.requestId,
    });
    assert.ok(!JSON.stringify(result.body).includes('secret'));
  }
});
test('correlation IDs are validated and match header, problem and owning-boundary log', async () => {
  const valid = '550e8400-e29b-41d4-a716-446655440000';
  for (const input of [valid, '<script>unsafe', 'x'.repeat(100)]) {
    const result = await send()
      .post('/probe/unexpected')
      .set('x-request-id', input);
    assert.equal(result.body.requestId, result.headers['x-request-id']);
    assert.equal(logs.at(-1).requestId, result.body.requestId);
    assert.ok(z.uuid().safeParse(result.body.requestId).success);
    if (input === valid) assert.equal(result.body.requestId, valid);
    else assert.notEqual(result.body.requestId, input);
  }
});
test('OpenAPI request and response schemas derive from the same owned contract', () => {
  const operation = ownedOperation(contract);
  const input = operation.requestBody.content['application/json'].schema;
  const output = operation.responses['200'].content['application/json'].schema;
  assert.deepEqual(input.required, ['enabled', 'count', 'name']);
  assert.equal(input.additionalProperties, false);
  assert.equal(input.properties.enabled.type, 'boolean');
  assert.equal(input.properties.count.type, 'integer');
  assert.deepEqual(output.required, ['accepted', 'count']);
  assert.equal(output.additionalProperties, false);
  assert.throws(() =>
    ownedOperation({
      request: z.string().transform((s) => s.length),
      response: z.date(),
    }),
  );
});

test('request telemetry excludes request data and credentials', async () => {
  const response = await send()
    .post('/probe/execute')
    .set('Authorization', 'Bearer secret')
    .send({ enabled: true, count: 1, name: 'private-input' });
  const event = requests.find(
    (e) => e.requestId === response.headers['x-request-id'],
  );
  assert.deepEqual(Object.keys(event).sort(), [
    'durationMs',
    'requestId',
    'status',
  ]);
  assert.equal(event.status, 200);
  assert.ok(event.durationMs >= 0);
});
