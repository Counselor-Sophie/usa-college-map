import assert from 'node:assert/strict';
import test from 'node:test';

import { isRelevantMatch } from '../scripts/wikipedia-match.mjs';

test('accepts a specific campus building with college evidence', () => {
  const summary = {
    title: 'Hoover Tower',
    description: '285-foot structure on the campus of Stanford University',
    extract: 'Hoover Tower is a structure on the campus of Stanford University.',
  };

  assert.equal(isRelevantMatch(summary, 'Hoover Tower', 'Stanford University'), true);
});

test('rejects an unrelated building with the same name', () => {
  const summary = {
    title: 'Murray House',
    description: 'Building in Stanley, Hong Kong',
    extract: 'Murray House is a Victorian-era building in Stanley, Hong Kong.',
  };

  assert.equal(isRelevantMatch(summary, 'Murray House', 'Stanford University'), false);
});

test('rejects a person whose name contains the building name', () => {
  const summary = {
    title: 'Jesús Huerta de Soto',
    description: 'Spanish economist of the Austrian School',
    extract: 'Jesús Huerta de Soto is a professor in Madrid, Spain.',
  };

  assert.equal(isRelevantMatch(summary, 'Soto', 'Stanford University'), false);
});

test('rejects a generic building name matched to a different campus landmark', () => {
  const summary = {
    title: 'Hoover Tower',
    description: 'Tower on the campus of Stanford University',
    extract: 'Hoover Tower is located at Stanford University.',
  };

  assert.equal(isRelevantMatch(summary, 'Tower Building', 'Stanford University'), false);
});

test('matches short college names as words instead of substrings', () => {
  const summary = {
    title: 'Committee Hall',
    description: 'Academic building',
    extract: 'Committee Hall is the main building for a regional committee.',
  };

  assert.equal(isRelevantMatch(summary, 'Committee Hall', 'MIT'), false);
});

test('accepts a college acronym derived from its full name', () => {
  const summary = {
    title: 'Great Dome',
    description: 'Academic building at MIT',
    extract: 'The Great Dome is a landmark on the MIT campus.',
  };

  assert.equal(
    isRelevantMatch(summary, 'Great Dome', 'Massachusetts Institute of Technology'),
    true
  );
});

test('does not infer the college from a shared word in the building name', () => {
  const summary = {
    title: 'Washington Hall',
    description: 'Academic building at the University of Notre Dame',
    extract: 'Washington Hall is a historic campus building at the University of Notre Dame.',
  };

  assert.equal(
    isRelevantMatch(summary, 'Washington Hall', 'University of Washington'),
    false
  );
});

test('still accepts an explicit single-token college phrase', () => {
  const summary = {
    title: 'Washington Hall',
    description: 'Academic building at Stanford',
    extract: 'Washington Hall is located on the Stanford campus.',
  };

  assert.equal(isRelevantMatch(summary, 'Washington Hall', 'Stanford'), true);
});
