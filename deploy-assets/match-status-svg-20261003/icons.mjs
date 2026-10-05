import { readFileSync } from 'node:fs';

const loadIcon = key => readFileSync(new URL(`./svg/${key}.svg`, import.meta.url), 'utf8').trim();

// Real SVG assets are the source of truth. The deploy rail only converts them to data URIs.
export const icons = Object.freeze({
  all: loadIcon('all'),
  live: loadIcon('live'),
  signal: loadIcon('signal'),
  scheduled: loadIcon('scheduled'),
  unknown: loadIcon('unknown'),
  finished: loadIcon('finished'),
});

export const iconUri = key => `data:image/svg+xml,${encodeURIComponent(icons[key]).replaceAll("'", '%27')}`;
