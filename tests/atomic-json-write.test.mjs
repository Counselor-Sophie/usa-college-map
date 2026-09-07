import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { writeJsonAtomic } from '../scripts/atomic-json-write.mjs';

test('replaces an existing JSON file only after the new contents are complete', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'college-map-json-'));
  const target = join(directory, 'campus.geojson');
  try {
    await writeFile(target, '{"old":true}', 'utf8');
    await writeJsonAtomic(target, { type: 'FeatureCollection', features: [] });

    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), {
      type: 'FeatureCollection',
      features: [],
    });
    assert.deepEqual(await readdir(directory), ['campus.geojson']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preserves the cached file and removes the temporary file when replacement fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'college-map-json-'));
  const target = join(directory, 'campus.geojson');
  try {
    await writeFile(target, '{"cached":true}', 'utf8');
    const fileOperations = {
      writeFile,
      async rename() {
        throw new Error('simulated replacement failure');
      },
      rm,
    };

    await assert.rejects(
      writeJsonAtomic(target, { cached: false }, fileOperations),
      /simulated replacement failure/,
    );
    assert.equal(await readFile(target, 'utf8'), '{"cached":true}');
    assert.deepEqual(await readdir(directory), ['campus.geojson']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
