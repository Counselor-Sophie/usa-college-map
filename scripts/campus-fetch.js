export async function fetchCampusFeatureCollection(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { cache: 'no-cache' });
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
