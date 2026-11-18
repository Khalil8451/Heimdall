import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  checkDecisionMatrix,
  checkMarkdownLinks,
  checkPrivatePaths,
  checkRepository,
} from './check-docs.mjs';

test('local links accept existing paths and report broken, escaping, and malformed targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archaeologist-docs-'));
  try {
    await writeFile(join(root, 'known file.md'), '# Known\n');
    const errors = await checkMarkdownLinks(
      root,
      'README.md',
      [
        '[valid](known%20file.md)',
        '[external](https://example.com/unfetched)',
        '[heading](#unvalidated)',
        '[missing](absent.md)',
        '[escape](../outside.md)',
        '[encoding](bad%ZZ.md)',
        '```md\n[example](not-a-real-link.md)\n```',
      ].join('\n'),
    );
    assert.equal(errors.length, 3);
    assert.ok(errors.some((error) => error.includes('missing local link')));
    assert.ok(errors.some((error) => error.includes('escapes repository')));
    assert.ok(errors.some((error) => error.includes('invalid URL encoding')));
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('archaeologist-docs-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('public checks work with no internal docs and reject escaped links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archaeologist-docs-'));
  try {
    await writeFile(join(root, 'README.md'), '# Public clone\n');
    assert.deepEqual((await checkRepository(root)).errors, []);
    await writeFile(
      join(root, 'README.md'),
      '# Public clone\n[Private](../docs/project-status.md)\n',
    );
    assert.match((await checkRepository(root)).errors[0], /escapes repository/);
    await writeFile(join(root, 'README.md'), '# Public clone\n');
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'secret.md'), 'ignored local content');
    assert.equal((await checkRepository(root)).markdownCount, 1);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('archaeologist-docs-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('tracked private paths are rejected even if force-added or capitalized', () => {
  assert.deepEqual(
    checkPrivatePaths(['README.md', 'fixtures/README.md', 'apps/api/docs.ts']),
    [],
  );
  assert.equal(
    checkPrivatePaths([
      'docs/plan.md',
      'Tickets/AA-001.md',
      'internal-docs\\secret.json',
    ]).length,
    3,
  );
});

test('private validation can explicitly allow the public checkout without allowing all siblings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archaeologist-docs-'));
  try {
    await mkdir(join(root, 'private'));
    await mkdir(join(root, 'checkout'));
    await writeFile(join(root, 'checkout', 'README.md'), '# Public\n');
    const errors = await checkMarkdownLinks(
      join(root, 'private'),
      'README.md',
      '[repo](../checkout/README.md)\n[escape](../unrelated/file.md)',
      [join(root, 'checkout')],
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /escapes repository/);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('archaeologist-docs-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('matrix rejects misleading totals and invalid weighting', () => {
  const weights = [15, 12, 12, 12, 10, 6, 5, 10, 5, 5, 4, 4];
  const table = weights
    .map((weight, i) => `| Criterion ${i} | ${weight} | reason |`)
    .join('\n');
  const scores = Array(12).fill('4').join(' | ');
  assert.deepEqual(
    checkDecisionMatrix(`${table}\n| Option | ${scores} | 4.00 |`),
    [],
  );
  assert.match(
    checkDecisionMatrix(`${table}\n| Option | ${scores} | 4.99 |`)[0],
    /4.00/,
  );
  assert.match(
    checkDecisionMatrix('| Bad | 10 | reason |')[0],
    /summing to 100/,
  );
  assert.match(
    checkDecisionMatrix(`${table}\n| Option | 4 | 4 | 4.00 |`)[0],
    /12 scores/,
  );
});
