import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchWithTimeout } from '../scripts/fetch-timeout.js';

test('passes request options and an abort signal to fetch', async () => {
  let requestOptions;
  const expected = { ok: true };

  const result = await fetchWithTimeout(
    'https://example.test/data',
    { headers: { Accept: 'application/json' } },
    async (_url, options) => {
      requestOptions = options;
      return expected;
    },
    100,
  );

  assert.equal(result, expected);
  assert.equal(requestOptions.headers.Accept, 'application/json');
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.equal(requestOptions.signal.aborted, false);
});

test('aborts a request that exceeds its deadline', async () => {
  const neverResponds = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  await assert.rejects(
    fetchWithTimeout('https://example.test/hangs', {}, neverResponds, 10),
    /Timed out after 10ms fetching https:\/\/example\.test\/hangs/,
  );
});

test('rejects invalid deadlines before starting a request', async () => {
  let called = false;
  const fetchMock = async () => {
    called = true;
  };

  await assert.rejects(
    fetchWithTimeout('https://example.test/data', {}, fetchMock, 0),
    /positive finite number/,
  );
  assert.equal(called, false);
});
