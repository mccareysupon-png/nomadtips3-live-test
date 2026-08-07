const API_BASE = 'https://v3.football.api-sports.io';

export const SHARED_LIVE_CACHE_SECONDS = 15;
export const SHARED_STATS_CACHE_SECONDS = 60;
export const SHARED_ODDS_CACHE_SECONDS = 15;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function apiErrorDetail(payload) {
  const errors = payload?.errors;
  if (!errors) return '';
  if (typeof errors === 'string') return errors.trim();
  if (Array.isArray(errors)) return errors.length ? JSON.stringify(errors) : '';
  if (typeof errors === 'object') return Object.keys(errors).length ? JSON.stringify(errors) : '';
  return String(errors);
}

function isRateLimit(response, payload) {
  const detail = `${response?.status || ''} ${payload?.message || ''} ${apiErrorDetail(payload)}`;
  return response?.status === 429 || /too many requests|rate.?limit|requests per minute/i.test(detail);
}

function ttlForPath(path) {
  if (path.startsWith('/fixtures?live=')) return SHARED_LIVE_CACHE_SECONDS;
  if (path.startsWith('/fixtures?ids=')) return SHARED_STATS_CACHE_SECONDS;
  if (path.startsWith('/odds/live')) return SHARED_ODDS_CACHE_SECONDS;
  return 60;
}

export async function sharedApiFetch(path, env, ttlSeconds = ttlForPath(path)) {
  if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not configured');
  const apiUrl = `${API_BASE}${path}`;
  const cache = caches.default;
  const key = new Request(apiUrl, { method: 'GET' });
  const cached = await cache.match(key);
  if (cached) {
    return { payload: await cached.json(), cacheHit: true, upstreamRequests: 0 };
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(apiUrl, {
      headers: {
        'x-apisports-key': env.API_FOOTBALL_KEY,
        'Accept': 'application/json'
      }
    });
    const payload = await response.json().catch(() => null);
    const detail = apiErrorDetail(payload);
    if (isRateLimit(response, payload)) {
      lastError = new Error(detail || payload?.message || `API HTTP ${response.status}`);
      if (attempt === 0) {
        await sleep(1800);
        continue;
      }
      throw lastError;
    }
    if (!response.ok) throw new Error(payload?.message || `API HTTP ${response.status}`);
    if (detail) throw new Error(detail);

    await cache.put(key, new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttlSeconds}`
      }
    }));
    return { payload, cacheHit: false, upstreamRequests: 1 };
  }
  throw lastError || new Error('API request failed');
}

export async function sharedFixtureDetails(ids, env) {
  const unique = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  const items = new Map();
  let upstreamRequests = 0;
  let cacheHits = 0;

  for (let index = 0; index < unique.length; index += 20) {
    const group = unique.slice(index, index + 20);
    if (!group.length) continue;
    const result = await sharedApiFetch(`/fixtures?ids=${group.join('-')}`, env, SHARED_STATS_CACHE_SECONDS);
    upstreamRequests += Number(result.upstreamRequests || 0);
    if (result.cacheHit) cacheHits += 1;
    for (const item of Array.isArray(result.payload?.response) ? result.payload.response : []) {
      const fixtureId = Number(item?.fixture?.id);
      if (Number.isInteger(fixtureId)) items.set(fixtureId, item);
    }
    if (index + 20 < unique.length) await sleep(250);
  }

  return { items, upstreamRequests, cacheHits, requestedFixtures: unique.length };
}
