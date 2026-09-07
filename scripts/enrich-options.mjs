export function parseEnrichOptions(args, availableSlugs) {
  const available = new Set(availableSlugs);
  const targets = [];
  let force = false;

  for (const arg of args) {
    if (arg === '--force') {
      if (force) throw new Error('--force may only be provided once');
      force = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!available.has(arg)) {
      throw new Error(`Unknown campus slug: ${arg}`);
    }
    if (targets.includes(arg)) {
      throw new Error(`Campus slug may only be provided once: ${arg}`);
    }
    targets.push(arg);
  }

  return {
    force,
    targets: targets.length ? targets : [...availableSlugs],
  };
}
