import { buildIndex, fromCachedSnapshot } from './fixture-index.mjs';
import { indexFixtures } from './seo.mjs';

const REFRESH_MS = 300_000;
const RETRY_MS = 60_000;
const HISTORY_SECONDS = 30 * 86_400;

export function createFixtureCache(seed, { now = Date.now } = {}) {
  let latest = seed;
  let indexed;
  let nextRefresh = 0;

  function use(index) {
    latest = index;
    indexed = indexFixtures(index);
  }

  async function refresh({ cache, key, getSnapshot }) {
    const checkedAt = now();
    try {
      const response = await cache.match(key);
      if (response?.ok) {
        const cached = await response.json();
        const newer = cached.index?.observedAt >= latest.observedAt;
        if (newer && Array.isArray(cached.index.entries) && cached.index.entries.length > 0) {
          use(cached.index);
          if (cached.checkedAt + REFRESH_MS > checkedAt) {
            nextRefresh = cached.checkedAt + REFRESH_MS;
            return;
          }
        }
      }
    } catch {
      // Cache eviction or an unavailable cache must not remove match pages.
    }

    let current;
    try {
      current = buildIndex(fromCachedSnapshot(await getSnapshot()), latest, checkedAt);
    } catch {
      nextRefresh = now() + RETRY_MS;
      return;
    }
    if (current !== latest) use(current);
    try {
      await cache.put(key, new Response(JSON.stringify({ checkedAt, index: latest }), {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=' + HISTORY_SECONDS,
        },
      }));
    } catch {
      // The in-memory index still serves requests if the edge cache is unavailable.
    }
  }

  return options => {
    if (!indexed) use(seed);
    if (now() >= nextRefresh) {
      nextRefresh = now() + REFRESH_MS;
      options.waitUntil(refresh(options));
    }
    return { fixtures: indexed, observedAt: latest.observedAt };
  };
}
