import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchCampusFeatureCollection } from '../scripts/campus-fetch.js';

test('loads and validates a campus FeatureCollection', async () => {
  const expected = { type: 'FeatureCollection', features: [] };
  const fetchMock = async (_url, options) => {
    assert.deepEqual(options, { cache: 'no-cache' });
    return new Response(JSON.stringify(expected), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.deepEqual(await fetchCampusFeatureCollection('/campus.geojson', fetchMock), expected);
});

test('treats only a 404 as definitively missing campus data', async () => {
  const fetchMock = async () => new Response('missing', { status: 404 });
  assert.equal(await fetchCampusFeatureCollection('/missing.geojson', fetchMock), null);
});

test('throws on transient HTTP failures so the caller can retry', async () => {
  const fetchMock = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(
    fetchCampusFeatureCollection('/campus.geojson', fetchMock),
    /HTTP 503/,
  );
});

test('throws on malformed successful responses instead of caching a false miss', async () => {
  const fetchMock = async () => new Response('{"features":{}}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(
    fetchCampusFeatureCollection('/campus.geojson', fetchMock),
    /Invalid campus GeoJSON/,
  );
});
