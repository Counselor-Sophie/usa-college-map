export function parseFetchOptions(args, defaultLimit) {
  let skipExisting = false;
  let limit = defaultLimit;
  let sawLimit = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--skip-existing') {
      skipExisting = true;
      continue;
    }

    if (arg === '--limit') {
      if (sawLimit) throw new Error('--limit may only be provided once');
      sawLimit = true;

      const rawLimit = args[++index];
      if (rawLimit === undefined || !/^[1-9]\d*$/.test(rawLimit)) {
        throw new Error('--limit must be followed by a positive integer');
      }

      limit = Number(rawLimit);
      if (!Number.isSafeInteger(limit)) {
        throw new Error('--limit is too large');
      }
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { skipExisting, limit };
}
