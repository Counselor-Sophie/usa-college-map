export function validateOverpassResponse(payload, endpoint) {
  if (typeof payload !== 'object' || payload === null || !Array.isArray(payload.elements)) {
    throw new Error(`Malformed Overpass response from ${endpoint}`);
  }

  if (typeof payload.remark === 'string' && payload.remark.trim()) {
    throw new Error(`Overpass error from ${endpoint}: ${payload.remark.trim()}`);
  }

  return payload;
}
