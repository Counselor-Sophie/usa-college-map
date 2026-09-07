export function geometryToLinearRing(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 3) return null;

  const coordinates = [];
  const distinct = new Set();
  for (const point of geometry) {
    if (
      typeof point !== 'object' ||
      point === null ||
      !Number.isFinite(point.lon) ||
      !Number.isFinite(point.lat)
    ) {
      return null;
    }

    coordinates.push([point.lon, point.lat]);
    distinct.add(`${point.lon},${point.lat}`);
  }

  if (distinct.size < 3) return null;

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coordinates.push([...first]);
  }
  return coordinates;
}
