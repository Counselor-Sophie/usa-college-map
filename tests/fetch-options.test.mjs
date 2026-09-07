import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFetchOptions } from '../scripts/fetch-options.mjs';

test('uses all campuses by default', () => {
  assert.deepEqual(parseFetchOptions([], 58), {
    skipExisting: false,
    limit: 58,
  });
});

test('parses the supported options in either order', () => {
  assert.deepEqual(parseFetchOptions(['--limit', '5', '--skip-existing'], 58), {
    skipExisting: true,
    limit: 5,
  });
  assert.deepEqual(parseFetchOptions(['--skip-existing', '--limit', '3'], 58), {
    skipExisting: true,
    limit: 3,
  });
});

test('rejects missing, non-numeric, zero, and negative limits', () => {
  for (const args of [
    ['--limit'],
    ['--limit', 'nope'],
    ['--limit', '0'],
    ['--limit', '-1'],
    ['--limit', '1.5'],
  ]) {
    assert.throws(() => parseFetchOptions(args, 58), /positive integer/);
  }
});

test('rejects unsafe, repeated, and unknown options', () => {
  assert.throws(
    () => parseFetchOptions(['--limit', '9007199254740992'], 58),
    /too large/
  );
  assert.throws(
    () => parseFetchOptions(['--limit', '2', '--limit', '3'], 58),
    /only be provided once/
  );
  assert.throws(() => parseFetchOptions(['--limt', '2'], 58), /Unknown option/);
});
