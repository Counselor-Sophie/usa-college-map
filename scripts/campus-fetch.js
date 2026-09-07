import { fetchWithTimeout } from './fetch-timeout.js';

export async function fetchCampusFeatureCollection(url, fetchImpl = fetch, timeoutMs) {
  const response = await fetchWithTimeout(url, { cache: 'no-cache' }, fetchImpl, timeoutMs);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const featureCollection = await response.json();
  if (
    !featureCollection ||
    featureCollection.type !== 'FeatureCollection' ||
    !Array.isArray(featureCollection.features)
  ) {
    throw new Error(`Invalid campus GeoJSON from ${url}`);
  }
  return featureCollection;
}
