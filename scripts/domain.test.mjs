import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DomainError } from '@heimdall/domain';
import { classifyFailure } from '@heimdall/application';
test('pure error classification preserves stable codes without framework setup', () => {
  for (const code of ['INVALID_INPUT', 'CONFLICT'])
    assert.equal(classifyFailure(new DomainError(code)), code);
  for (const value of [
    null,
    undefined,
    new Error('secret'),
    { code: 'CONFLICT' },
    'secret',
  ])
    assert.equal(classifyFailure(value), 'INTERNAL');
});
