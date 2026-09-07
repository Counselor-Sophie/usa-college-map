const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  url,
  options = {},
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Fetch timeout must be a positive finite number');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (cause) {
    if (timedOut) {
      throw new Error(`Timed out after ${timeoutMs}ms fetching ${url}`, { cause });
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}
