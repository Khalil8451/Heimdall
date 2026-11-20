import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSarif } from './check-sarif.mjs';
const document = (results, rules = []) => ({
  version: '2.1.0',
  runs: [{ tool: { driver: { rules } }, results }],
});
test('SARIF gate accepts complete empty analysis and blocks high security/error results', () => {
  assert.deepEqual(checkSarif(document([])), { total: 0, blocked: 0 });
  assert.deepEqual(
    checkSarif(
      document(
        [{ ruleId: 'high' }, { ruleId: 'moderate' }, { level: 'error' }],
        [
          { id: 'high', properties: { 'security-severity': '7.5' } },
          { id: 'moderate', properties: { 'security-severity': '5' } },
        ],
      ),
    ),
    { total: 3, blocked: 2 },
  );
});
test('SARIF gate rejects absent or unsuccessful analysis and invalid severity', () => {
  for (const input of [
    {},
    { version: '2.1.0', runs: [] },
    { version: '2.1.0', runs: [{}] },
    {
      version: '2.1.0',
      runs: [{ results: [], invocations: [{ executionSuccessful: false }] }],
    },
    document(
      [{ ruleId: 'bad' }],
      [{ id: 'bad', properties: { 'security-severity': 'NaN' } }],
    ),
  ])
    assert.throws(() => checkSarif(input));
});
