import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchJSON } from '../scripts/wiki-fetch.mjs';

test('returns parsed JSON and sends the project user agent', async () => {
  let requestOptions;
  const result = await fetchJSON('https://example.test/data', async (_url, options) => {
    requestOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({ found: true }),
    };
  });

  assert.deepEqual(result, { found: true });
  assert.match(requestOptions.headers['User-Agent'], /usa-college-map/);
  assert.equal(requestOptions.headers.Accept, 'application/json');
  assert.ok(requestOptions.signal instanceof AbortSignal);
});

test('times out a Wikipedia request instead of stalling the enrichment run', async () => {
  const neverResponds = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  await assert.rejects(
    fetchJSON('https://example.test/hangs', neverResponds, 10),
    /Timed out after 10ms/,
  );
});

test('treats a 404 as a definitive missing resource', async () => {
  const result = await fetchJSON('https://example.test/missing', async () => ({
    ok: false,
    status: 404,
  }));

  assert.equal(result, null);
});

test('throws on transient HTTP failures so callers can retry', async () => {
  await assert.rejects(
    fetchJSON('https://example.test/limited', async () => ({ ok: false, status: 429 })),
    /HTTP 429/
  );
  await assert.rejects(
    fetchJSON('https://example.test/unavailable', async () => ({ ok: false, status: 503 })),
    /HTTP 503/
  );
});

test('throws on malformed JSON so callers do not cache a false miss', async () => {
  await assert.rejects(
    fetchJSON('https://example.test/broken', async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    })),
    /Invalid JSON/
  );
});
