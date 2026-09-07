import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseEnrichOptions } from '../scripts/enrich-options.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parses force and explicit campus targets', () => {
  assert.deepEqual(
    parseEnrichOptions(['--force', 'mit'], ['mit', 'stanford-university']),
    { force: true, targets: ['mit'] },
  );
});

test('uses every available campus when no slug is specified', () => {
  assert.deepEqual(
    parseEnrichOptions([], ['mit', 'stanford-university']),
    { force: false, targets: ['mit', 'stanford-university'] },
  );
});

test('rejects unknown options before enrichment starts', () => {
  assert.throws(
    () => parseEnrichOptions(['--froce'], ['mit']),
    /Unknown option: --froce/,
  );
});

test('rejects missing campus files instead of reporting success', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/enrich-campuses.mjs', 'not-a-real-campus'],
    { cwd: ROOT, encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown campus slug: not-a-real-campus/);
  assert.doesNotMatch(result.stdout, /Done\./);
});
