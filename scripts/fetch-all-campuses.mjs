// Batch-fetches OSM building data for every college in the list,
// applies the campus filter (same rules as the client), and saves
// one geojson file per college to data/buildings/{slug}.geojson.
//
// Run:
//   node scripts/fetch-all-campuses.mjs
//
// Re-run whenever you want fresh data or add/remove colleges.

import { mkdirSync, existsSync } from 'node:fs';
import { writeJsonAtomic } from './atomic-json-write.mjs';
import { parseFetchOptions } from './fetch-options.mjs';
import { fetchWithTimeout } from './fetch-timeout.js';
import { geometryToLinearRing } from './geojson-ring.mjs';
import { validateOverpassResponse } from './overpass-response.mjs';

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const BUFFER_KM = 1.5;            // half-side of the bbox in km
const CONCURRENCY = 3;            // parallel college fetches
const MAX_RETRY = 3;
const REQUEST_TIMEOUT_MS = 120_000;

// Mirror of the client classifier — keep in sync with index.html.
function classify(t) {
  if (!t) return 'other';
  const b = t.building, a = t.amenity, l = t.leisure;
  if (b === 'university' || b === 'school' || b === 'college' || a === 'research_institute' || b === 'kindergarten') return 'academic';
  if (b === 'dormitory' || b === 'residential' || b === 'apartments' || b === 'house' || b === 'detached' || b === 'semidetached_house' || b === 'terrace') return 'residential';
  if (a === 'library' || b === 'library') return 'library';
  if (a === 'cafe' || a === 'restaurant' || a === 'food_court' || a === 'fast_food' || b === 'cafeteria') return 'dining';
  if (l === 'sports_centre' || l === 'stadium' || b === 'stadium' || b === 'sports_hall' || b === 'grandstand') return 'athletic';
  if (a === 'place_of_worship' || b === 'chapel' || b === 'church' || b === 'cathedral') return 'religious';
  if (a === 'hospital' || a === 'clinic' || b === 'hospital') return 'medical';
  return 'other';
}

function landuseToCategory(landuse) {
  switch (landuse) {
    case 'university': case 'school': case 'college': return 'academic';
    case 'hospital': return 'medical';
    case 'religious': return 'religious';
    case 'recreation_ground': return 'athletic';
    default: return null;
  }
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const STRONG_BUILDING = new Set(['university','school','college','dormitory','library','hospital','stadium','cathedral','chapel','church','grandstand','kindergarten']);
const STRONG_AMENITY  = new Set(['university','library','research_institute','place_of_worship','hospital','clinic']);
const STRONG_LEISURE  = new Set(['sports_centre','stadium']);
const CAMPUS_OPERATOR = /university|college|school|institute|academy/i;

function bboxFor(lat, lng, km) {
  const latDelta = km / 111;
  const lngDelta = km / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    south: lat - latDelta,
    north: lat + latDelta,
    west: lng - lngDelta,
    east: lng + lngDelta,
  };
}

async function queryOverpass(body) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(body),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'usa-college-map/1.0 (https://github.com/Counselor-Sophie/usa-college-map)',
          },
        }, fetch, REQUEST_TIMEOUT_MS);
        if (res.status === 429 || res.status === 504 || res.status === 502) {
          lastErr = new Error(`${res.status} @ ${url}`);
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status} @ ${url}`);
          break;
        }
        return validateOverpassResponse(await res.json(), url);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastErr || new Error('All Overpass endpoints failed');
}

async function fetchCollege(college) {
  const { lat, lng, slug, name } = college;
  const out = `data/buildings/${slug}.geojson`;

  const b = bboxFor(lat, lng, BUFFER_KM);
  const query = `[out:json][timeout:90];
(
  way["building"](${b.south},${b.west},${b.north},${b.east});
  way["landuse"~"^(university|college|school|hospital|religious|recreation_ground)$"](${b.south},${b.west},${b.north},${b.east});
  way["amenity"="university"](${b.south},${b.west},${b.north},${b.east});
);
out geom tags;`;

  const t0 = Date.now();
  const data = await queryOverpass(query);
  const dt = Date.now() - t0;

  // Partition into buildings + context zones
  const buildings = [];
  const zones = [];
  let invalidGeometry = 0;
  for (const el of data.elements || []) {
    if (el.type !== 'way') continue;
    const ring = geometryToLinearRing(el.geometry);
    if (!ring) {
      invalidGeometry++;
      continue;
    }
    const tags = el.tags || {};
    if (tags.building) {
      buildings.push({ el, tags, ring });
    } else if (tags.landuse || tags.amenity === 'university') {
      const cat = tags.amenity === 'university' ? 'academic' : landuseToCategory(tags.landuse);
      if (cat) zones.push({ category: cat, ring });
    }
  }

  // Apply campus filter (same rules as client)
  const features = [];
  for (const b_ of buildings) {
    const t = b_.tags;
    const cat = classify(t);

    const strong =
      STRONG_BUILDING.has(t.building) ||
      STRONG_AMENITY.has(t.amenity) ||
      STRONG_LEISURE.has(t.leisure) ||
      (typeof t.operator === 'string' && CAMPUS_OPERATOR.test(t.operator));

    let finalCat = cat;
    if (!strong) {
      const cx = b_.ring.reduce((s, c) => s + c[0], 0) / b_.ring.length;
      const cy = b_.ring.reduce((s, c) => s + c[1], 0) / b_.ring.length;
      let zone = null;
      for (const z of zones) {
        if (pointInPolygon([cx, cy], z.ring)) { zone = z; break; }
      }
      if (!zone) continue; // drop: not campus-affiliated
      if (finalCat === 'other') finalCat = zone.category;
    }

    features.push({
      type: 'Feature',
      id: b_.el.id,
      properties: { osmId: b_.el.id, category: finalCat, ...t },
      geometry: { type: 'Polygon', coordinates: [b_.ring] },
    });
  }

  const fc = { type: 'FeatureCollection', features };
  mkdirSync('data/buildings', { recursive: true });
  await writeJsonAtomic(out, fc);

  const named = features.filter((f) => f.properties.name).length;
  console.log(`  ✓ ${name}: ${features.length} buildings (${named} named) in ${dt}ms`);
  if (invalidGeometry) {
    console.warn(`  ! ${name}: skipped ${invalidGeometry} way(s) with invalid polygon geometry`);
  }
}

// ─────────────────────────────────────────────────────────────
// Colleges — must match the list in index.html
// ─────────────────────────────────────────────────────────────
const COLLEGES = [
  { name: "Harvard University", slug: "harvard-university", lat: 42.3770, lng: -71.1167 },
  { name: "Stanford University", slug: "stanford-university", lat: 37.4275, lng: -122.1697 },
  { name: "MIT", slug: "mit", lat: 42.3601, lng: -71.0942 },
  { name: "Yale University", slug: "yale-university", lat: 41.3163, lng: -72.9254 },
  { name: "Princeton University", slug: "princeton-university", lat: 40.3440, lng: -74.6514 },
  { name: "Columbia University", slug: "columbia-university", lat: 40.8075, lng: -73.9626 },
  { name: "University of Pennsylvania", slug: "university-of-pennsylvania", lat: 39.9493, lng: -75.1553 },
  { name: "Brown University", slug: "brown-university", lat: 41.8268, lng: -71.4025 },
  { name: "Duke University", slug: "duke-university", lat: 36.0010, lng: -78.9382 },
  { name: "Northwestern University", slug: "northwestern-university", lat: 42.0565, lng: -87.6753 },
  { name: "University of Chicago", slug: "university-of-chicago", lat: 41.7886, lng: -87.5987 },
  { name: "Caltech", slug: "caltech", lat: 34.1377, lng: -118.1253 },
  { name: "Johns Hopkins University", slug: "johns-hopkins-university", lat: 39.3299, lng: -76.6205 },
  { name: "Cornell University", slug: "cornell-university", lat: 42.4534, lng: -76.4735 },
  { name: "Rice University", slug: "rice-university", lat: 29.7174, lng: -95.4018 },
  { name: "Vanderbilt University", slug: "vanderbilt-university", lat: 36.1447, lng: -86.8027 },
  { name: "University of Notre Dame", slug: "university-of-notre-dame", lat: 41.7055, lng: -86.2353 },
  { name: "Georgetown University", slug: "georgetown-university", lat: 38.9076, lng: -77.0723 },
  { name: "UC Berkeley", slug: "uc-berkeley", lat: 37.8716, lng: -122.2727 },
  { name: "UCLA", slug: "ucla", lat: 34.0689, lng: -118.4452 },
  { name: "UC San Diego", slug: "uc-san-diego", lat: 32.8801, lng: -117.2379 },
  { name: "UC Santa Barbara", slug: "uc-santa-barbara", lat: 34.4140, lng: -119.8489 },
  { name: "UC Davis", slug: "uc-davis", lat: 38.5816, lng: -121.4944 },
  { name: "UC Irvine", slug: "uc-irvine", lat: 33.6405, lng: -117.8443 },
  { name: "University of Michigan", slug: "university-of-michigan", lat: 42.2780, lng: -83.7382 },
  { name: "University of Virginia", slug: "university-of-virginia", lat: 38.0336, lng: -78.5080 },
  { name: "Carnegie Mellon University", slug: "carnegie-mellon-university", lat: 40.4443, lng: -79.9608 },
  { name: "Emory University", slug: "emory-university", lat: 33.7930, lng: -84.3134 },
  { name: "USC", slug: "usc", lat: 34.0224, lng: -118.2851 },
  { name: "NYU", slug: "nyu", lat: 40.7295, lng: -73.9965 },
  { name: "University of North Carolina", slug: "university-of-north-carolina", lat: 35.9049, lng: -79.0469 },
  { name: "University of Georgia", slug: "university-of-georgia", lat: 33.9480, lng: -83.3773 },
  { name: "University of Texas at Austin", slug: "university-of-texas-at-austin", lat: 30.2849, lng: -97.7341 },
  { name: "University of Florida", slug: "university-of-florida", lat: 29.6436, lng: -82.3549 },
  { name: "University of Washington", slug: "university-of-washington", lat: 47.6553, lng: -122.3035 },
  { name: "Ohio State University", slug: "ohio-state-university", lat: 40.0067, lng: -83.0305 },
  { name: "University of Wisconsin", slug: "university-of-wisconsin", lat: 43.0766, lng: -89.4125 },
  { name: "University of Arizona", slug: "university-of-arizona", lat: 32.2319, lng: -110.9501 },
  { name: "Boston University", slug: "boston-university", lat: 42.3505, lng: -71.1054 },
  { name: "Tulane University", slug: "tulane-university", lat: 29.9399, lng: -90.1209 },
  { name: "University of Miami", slug: "university-of-miami", lat: 25.7181, lng: -80.2793 },
  { name: "Pepperdine University", slug: "pepperdine-university", lat: 34.0392, lng: -118.7065 },
  { name: "Villanova University", slug: "villanova-university", lat: 40.0357, lng: -75.3385 },
  { name: "Boston College", slug: "boston-college", lat: 42.3355, lng: -71.1685 },
  { name: "Tufts University", slug: "tufts-university", lat: 42.4045, lng: -71.1198 },
  { name: "Northeastern University", slug: "northeastern-university", lat: 42.3398, lng: -71.0892 },
  { name: "Wake Forest University", slug: "wake-forest-university", lat: 36.1337, lng: -80.2754 },
  { name: "George Washington University", slug: "george-washington-university", lat: 38.8997, lng: -77.0486 },
  { name: "University of Rochester", slug: "university-of-rochester", lat: 43.1285, lng: -77.6268 },
  { name: "Case Western Reserve", slug: "case-western-reserve", lat: 41.5025, lng: -81.6739 },
  { name: "Lehigh University", slug: "lehigh-university", lat: 40.6075, lng: -75.3776 },
  { name: "University of Colorado Boulder", slug: "university-of-colorado-boulder", lat: 40.0076, lng: -105.2659 },
  { name: "University of Utah", slug: "university-of-utah", lat: 40.7649, lng: -111.8421 },
  { name: "Brigham Young University", slug: "brigham-young-university", lat: 40.2523, lng: -111.6493 },
  { name: "University of Hawaii at Manoa", slug: "university-of-hawaii-at-manoa", lat: 21.3069, lng: -157.8212 },
  { name: "Hawaii Pacific University", slug: "hawaii-pacific-university", lat: 21.3093, lng: -157.8623 },
  { name: "University of Alaska Anchorage", slug: "university-of-alaska-anchorage", lat: 61.1922, lng: -149.8924 },
  { name: "University of Alaska Fairbanks", slug: "university-of-alaska-fairbanks", lat: 64.8438, lng: -147.7339 },
];

async function main() {
  const { skipExisting, limit } = parseFetchOptions(process.argv.slice(2), COLLEGES.length);
  mkdirSync('data/buildings', { recursive: true });

  const todo = COLLEGES.slice(0, limit).filter((c) => {
    if (skipExisting && existsSync(`data/buildings/${c.slug}.geojson`)) {
      console.log(`skip ${c.name} (cached)`);
      return false;
    }
    return true;
  });

  console.log(`Fetching ${todo.length} of ${COLLEGES.length} campuses, ${CONCURRENCY} in parallel...`);
  const failures = [];
  let done = 0;

  const workers = Array.from({ length: CONCURRENCY }, () => (async () => {
    while (todo.length) {
      const c = todo.shift();
      const idx = ++done;
      console.log(`[${idx}] start ${c.name}`);
      try {
        await fetchCollege(c);
      } catch (err) {
        console.error(`  ✗ ${c.name}: ${err.message}`);
        failures.push(c);
      }
    }
  })());
  await Promise.all(workers);

  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`, failures.map((c) => c.slug).join(', '));
    console.error('Re-run to retry failed colleges.');
    process.exit(1);
  }
  console.log('\nAll colleges fetched.');
}

main().catch((err) => { console.error(err); process.exit(1); });
