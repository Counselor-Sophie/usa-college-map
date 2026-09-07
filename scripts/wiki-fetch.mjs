import { fetchWithTimeout } from './fetch-timeout.js';

const USER_AGENT = 'usa-college-map/1.0 (https://github.com/Counselor-Sophie/usa-college-map)';

export async function fetchJSON(url, fetchImpl = fetch, timeoutMs) {
  const response = await fetchWithTimeout(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
  }, fetchImpl, timeoutMs);

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new Error(`Invalid JSON fetching ${url}`, { cause });
  }
}
