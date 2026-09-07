import assert from 'node:assert/strict';
import test from 'node:test';

import { geometryToLinearRing } from '../scripts/geojson-ring.mjs';

test('closes a valid open polygon ring', () => {
  assert.deepEqual(geometryToLinearRing([
    { lon: -71, lat: 42 },
    { lon: -70, lat: 42 },
    { lon: -70, lat: 43 },
  ]), [
    [-71, 42],
    [-70, 42],
    [-70, 43],
    [-71, 42],
  ]);
});

test('does not close an already closed ring twice', () => {
  const ring = geometryToLinearRing([
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 0, lat: 1 },
    { lon: 0, lat: 0 },
  ]);

  assert.equal(ring?.length, 4);
});

test('rejects missing and non-finite coordinates', () => {
  for (const geometry of [
    [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 0 }],
    [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: Infinity, lat: 1 }],
    [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, null],
  ]) {
    assert.equal(geometryToLinearRing(geometry), null);
  }
});

test('rejects rings without three distinct positions', () => {
  assert.equal(geometryToLinearRing([
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 0, lat: 0 },
  ]), null);
});
