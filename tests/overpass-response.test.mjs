import assert from 'node:assert/strict';
import test from 'node:test';

import { validateOverpassResponse } from '../scripts/overpass-response.mjs';

const endpoint = 'https://overpass.example/api/interpreter';

test('accepts a normal Overpass payload, including an empty result', () => {
  const populated = { version: 0.6, elements: [{ type: 'way', id: 1 }] };
  const empty = { version: 0.6, elements: [] };

  assert.equal(validateOverpassResponse(populated, endpoint), populated);
  assert.equal(validateOverpassResponse(empty, endpoint), empty);
});

test('rejects HTTP-200 error remarks so the caller retries', () => {
  assert.throws(
    () => validateOverpassResponse({
      elements: [],
      remark: 'runtime error: Query timed out in "query" at line 3',
    }, endpoint),
    /Overpass error.*timed out/
  );
});

test('rejects malformed payloads instead of treating them as empty data', () => {
  for (const payload of [null, [], {}, { elements: null }, { elements: {} }]) {
    assert.throws(
      () => validateOverpassResponse(payload, endpoint),
      /Malformed Overpass response/
    );
  }
});
