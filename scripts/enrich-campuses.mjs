// Second-pass enrichment: for every named building in each campus geojson,
// pre-fetch Wikipedia summary (photo + extract + url + built year + height)
// and bake it into the feature properties. No runtime Wikipedia calls after this.
//
// Run:
//   node scripts/enrich-campuses.mjs                 # all colleges
//   node scripts/enrich-campuses.mjs stanford-university  # one slug
//   node scripts/enrich-campuses.mjs --force         # re-enrich even buildings we've tried before

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './atomic-json-write.mjs';
import { parseEnrichOptions } from './enrich-options.mjs';
import { isRelevantMatch } from './wikipedia-match.mjs';
import { fetchJSON } from './wiki-fetch.mjs';

const CONCURRENCY = 4;
const BATCH_DIR = 'data/buildings';

// Quick map of slug → college name (for search context: "Hoover Tower Stanford")
const COLLEGE_NAME = {
  'harvard-university': 'Harvard',
  'stanford-university': 'Stanford',
  'mit': 'Massachusetts Institute of Technology',
  'yale-university': 'Yale',
  'princeton-university': 'Princeton',
  'columbia-university': 'Columbia',
  'university-of-pennsylvania': 'University of Pennsylvania',
  'brown-university': 'Brown',
  'duke-university': 'Duke',
  'northwestern-university': 'Northwestern',
  'university-of-chicago': 'University of Chicago',
  'caltech': 'Caltech',
  'johns-hopkins-university': 'Johns Hopkins',
  'cornell-university': 'Cornell',
  'rice-university': 'Rice',
  'vanderbilt-university': 'Vanderbilt',
  'university-of-notre-dame': 'Notre Dame',
  'georgetown-university': 'Georgetown',
  'uc-berkeley': 'UC Berkeley',
  'ucla': 'University of California Los Angeles',
  'uc-san-diego': 'UC San Diego',
  'uc-santa-barbara': 'UC Santa Barbara',
  'uc-davis': 'UC Davis',
  'uc-irvine': 'UC Irvine',
  'university-of-michigan': 'University of Michigan',
  'university-of-virginia': 'University of Virginia',
  'carnegie-mellon-university': 'Carnegie Mellon',
  'emory-university': 'Emory',
  'usc': 'University of Southern California',
  'nyu': 'New York University',
  'university-of-north-carolina': 'University of North Carolina',
  'university-of-georgia': 'University of Georgia',
  'university-of-texas-at-austin': 'University of Texas at Austin',
  'university-of-florida': 'University of Florida',
  'university-of-washington': 'University of Washington',
  'ohio-state-university': 'Ohio State',
  'university-of-wisconsin': 'University of Wisconsin',
  'university-of-arizona': 'University of Arizona',
  'boston-university': 'Boston University',
  'tulane-university': 'Tulane',
  'university-of-miami': 'University of Miami',
  'pepperdine-university': 'Pepperdine',
  'villanova-university': 'Villanova',
  'boston-college': 'Boston College',
  'tufts-university': 'Tufts',
  'northeastern-university': 'Northeastern',
  'wake-forest-university': 'Wake Forest',
  'george-washington-university': 'George Washington University',
  'university-of-rochester': 'University of Rochester',
  'case-western-reserve': 'Case Western Reserve',
  'lehigh-university': 'Lehigh',
  'university-of-colorado-boulder': 'University of Colorado Boulder',
  'university-of-utah': 'University of Utah',
  'brigham-young-university': 'Brigham Young University',
  'university-of-hawaii-at-manoa': 'University of Hawaii',
  'hawaii-pacific-university': 'Hawaii Pacific',
  'university-of-alaska-anchorage': 'University of Alaska Anchorage',
  'university-of-alaska-fairbanks': 'University of Alaska Fairbanks',
};

function extractWikipediaTitle(tags) {
  if (typeof tags.wikipedia !== 'string') return null;
  const parts = tags.wikipedia.split(':');
  if (parts.length >= 2 && parts[0] === 'en') return parts.slice(1).join(':').replace(/ /g, '_');
  return null;
}

async function titleFromWikidata(qid) {
  if (!qid) return null;
  const data = await fetchJSON(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const entity = data?.entities?.[qid];
  const sitelink = entity?.sitelinks?.enwiki;
  return sitelink?.title?.replace(/ /g, '_') || null;
}

async function fetchWikipediaSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const data = await fetchJSON(url);
  if (!data || data.type === 'disambiguation' || data.title === 'Not found.') return null;
  return data;
}

async function searchWikipedia(query, collegeName) {
  // Search only with college context — building names alone are too ambiguous.
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${query} ${collegeName}`)}&srlimit=3&format=json&origin=*`;
  const data = await fetchJSON(url);
  const hits = data?.query?.search || [];
  if (!hits.length) return null;

  // Verify each candidate by fetching its summary.
  for (const hit of hits) {
    const title = hit.title.replace(/ /g, '_');
    const summary = await fetchWikipediaSummary(title);
    if (!summary) continue;
    if (isRelevantMatch(summary, query, collegeName)) {
      return { title, summary };
    }
  }
  return null;
}

async function fetchWikidataFacts(qid) {
  if (!qid) return {};
  const data = await fetchJSON(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const entity = data?.entities?.[qid];
  const claims = entity?.claims || {};
  const facts = {};
  const inception = claims.P571?.[0]?.mainsnak?.datavalue?.value?.time;
  if (inception) facts.built = inception.split('-')[0].replace(/^\+/, '');
  const height = claims.P2048?.[0]?.mainsnak?.datavalue?.value;
  if (height?.amount) facts.height = `${Math.round(Number(height.amount))} m`;
  return facts;
}

async function enrichBuilding(feature, collegeName) {
  const t = feature.properties || {};
  if (!t.name) return null;

  // Prefer explicit OSM tags (trust them)
  let title = extractWikipediaTitle(t);
  let summary = null;
  if (!title && t.wikidata) title = await titleFromWikidata(t.wikidata);
  if (title) summary = await fetchWikipediaSummary(title);

  // Otherwise search with stricter relevance (article must mention the college)
  if (!summary) {
    const hit = await searchWikipedia(t.name, collegeName);
    if (hit) { title = hit.title; summary = hit.summary; }
  }

  if (!summary) return { _wikiTried: true };

  const qid = summary.wikibase_item || t.wikidata;
  const facts = await fetchWikidataFacts(qid);

  return {
    _wikiTried: true,
    wikiTitle: title,
    wikiDescription: summary.description || null,
    wikiExtract: summary.extract || null,
    wikiUrl: summary.content_urls?.desktop?.page || null,
    wikiPhoto: summary.originalimage?.source || summary.thumbnail?.source || null,
    wikiBuilt: facts.built || null,
    wikiHeight: facts.height || null,
  };
}

async function enrichCampus(slug, force) {
  const file = path.join(BATCH_DIR, `${slug}.geojson`);
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error(`Couldn't read ${file}`, { cause });
  }

  const collegeName = COLLEGE_NAME[slug] || slug;
  const toEnrich = data.features.filter((f) => {
    const p = f.properties || {};
    if (!p.name) return false;
    if (!force && p._wikiTried) return false;
    return true;
  });

  if (!toEnrich.length) {
    console.log(`  ✓ ${slug}: nothing to enrich`);
    return;
  }

  console.log(`  → ${slug}: enriching ${toEnrich.length}/${data.features.length} named buildings...`);

  const WIKI_FIELDS = ['wikiTitle','wikiDescription','wikiExtract','wikiUrl','wikiPhoto','wikiBuilt','wikiHeight'];
  let succeeded = 0;
  let retryableFailures = 0;
  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, () => (async () => {
    while (idx < toEnrich.length) {
      const feature = toEnrich[idx++];
      try {
        const enrichment = await enrichBuilding(feature, collegeName);
        if (enrichment) {
          // Only replace cached data after a definitive response. A transient
          // failure should not destroy the last known-good enrichment.
          for (const k of WIKI_FIELDS) delete feature.properties[k];
          delete feature.properties._wikiTried;
          Object.assign(feature.properties, enrichment);
          if (enrichment.wikiTitle) succeeded++;
        }
      } catch {
        // Network/API failures are not evidence that no article exists. Keep
        // cached data, but remove the marker so a normal future run retries.
        delete feature.properties._wikiTried;
        retryableFailures++;
      }
    }
  })());
  await Promise.all(workers);

  await writeJsonAtomic(file, data);
  console.log(`  ✓ ${slug}: ${succeeded}/${toEnrich.length} buildings matched a Wikipedia article`);
  if (retryableFailures) {
    console.warn(`  ! ${slug}: ${retryableFailures} transient failure(s) left unmarked for retry`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const availableSlugs = readdirSync(BATCH_DIR)
    .filter((f) => f.endsWith('.geojson'))
    .map((f) => f.replace(/\.geojson$/, ''));
  const { force, targets } = parseEnrichOptions(args, availableSlugs);

  console.log(`Enriching ${targets.length} campus(es) (force=${force})...`);
  for (const slug of targets) {
    await enrichCampus(slug, force);
  }
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
