const API_BASE = 'https://v3.football.api-sports.io';

export const SHARED_LIVE_CACHE_SECONDS = 15;
export const SHARED_STATS_CACHE_SECONDS = 60;
export const SHARED_ODDS_CACHE_SECONDS = 15;

const GUARD_KEY = 'api-football';
const MIN_GAP_MS = 1250;
const MAX_SLOT_WAIT_MS = 12_000;
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 5 * 60_000;
const STALE_CACHE_SECONDS = 30 * 60;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(max = 300) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % Math.max(1, max);
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

function retryAfterMs(response) {
  const raw = response?.headers?.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

async function ensureGuard(env) {
  if (!env.DB) return false;
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS api_rate_guard (
        guard_key TEXT PRIMARY KEY,
        last_started_at INTEGER NOT NULL DEFAULT 0,
        cooldown_until INTEGER NOT NULL DEFAULT 0,
        consecutive_429 INTEGER NOT NULL DEFAULT 0,
        last_429_at INTEGER,
        updated_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`
      INSERT OR IGNORE INTO api_rate_guard (
        guard_key, last_started_at, cooldown_until, consecutive_429, updated_at
      ) VALUES (?, 0, 0, 0, ?)
    `).bind(GUARD_KEY, Date.now())
  ]);
  return true;
}

async function guardState(env) {
  if (!env.DB) return null;
  return env.DB.prepare(`
    SELECT last_started_at, cooldown_until, consecutive_429
    FROM api_rate_guard WHERE guard_key = ?
  `).bind(GUARD_KEY).first();
}

async function acquireSlot(env) {
  if (!(await ensureGuard(env))) {
    await sleep(jitter(300));
    return { protected: false };
  }

  const started = Date.now();
  while (Date.now() - started < MAX_SLOT_WAIT_MS) {
    const now = Date.now();
    const state = await guardState(env);
    const cooldownUntil = Number(state?.cooldown_until || 0);
    if (cooldownUntil > now) {
      return { protected: true, cooldownUntil, blocked: true };
    }

    const lastStarted = Number(state?.last_started_at || 0);
    const eligibleAt = lastStarted + MIN_GAP_MS;
    if (eligibleAt > now) {
      await sleep(Math.min(eligibleAt - now + jitter(220), 1600));
      continue;
    }

    const claim = await env.DB.prepare(`
      UPDATE api_rate_guard
      SET last_started_at = ?, updated_at = ?
      WHERE guard_key = ? AND last_started_at = ? AND cooldown_until <= ?
    `).bind(now, now, GUARD_KEY, lastStarted, now).run();
    if (Number(claim?.meta?.changes || 0) === 1) {
      await sleep(jitter(180));
      return { protected: true, blocked: false };
    }
    await sleep(100 + jitter(180));
  }

  return { protected: true, blocked: true, cooldownUntil: Date.now() + 5000 };
}

async function recordSuccess(env) {
  if (!env.DB) return;
  await env.DB.prepare(`
    UPDATE api_rate_guard
    SET cooldown_until = 0, consecutive_429 = 0, updated_at = ?
    WHERE guard_key = ?
  `).bind(Date.now(), GUARD_KEY).run();
}

async function recordRateLimit(env, response) {
  const now = Date.now();
  let strikes = 1;
  if (env.DB) {
    const state = await guardState(env).catch(() => null);
    strikes = Math.min(4, Number(state?.consecutive_429 || 0) + 1);
  }
  const providerWait = retryAfterMs(response);
  const exponential = DEFAULT_COOLDOWN_MS * (2 ** (strikes - 1));
  const waitMs = Math.min(MAX_COOLDOWN_MS, Math.max(DEFAULT_COOLDOWN_MS, providerWait || exponential)) + jitter(1500);
  const cooldownUntil = now + waitMs;
  if (env.DB) {
    await env.DB.prepare(`
      UPDATE api_rate_guard
      SET cooldown_until = MAX(cooldown_until, ?), consecutive_429 = ?,
          last_429_at = ?, updated_at = ?
      WHERE guard_key = ?
    `).bind(cooldownUntil, strikes, now, now, GUARD_KEY).run();
  }
  console.warn(JSON.stringify({ event: 'api_football_429', cooldownUntil, strikes }));
  return cooldownUntil;
}

async function cachedJson(cache, key) {
  if (!cache) return null;
  const response = await cache.match(key);
  return response ? response.json() : null;
}

async function storePayload(cache, freshKey, staleKey, payload, ttlSeconds) {
  if (!cache) return;
  const body = JSON.stringify(payload);
  await Promise.all([
    cache.put(freshKey, new Response(body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttlSeconds}` }
    })),
    cache.put(staleKey, new Response(body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${STALE_CACHE_SECONDS}` }
    }))
  ]);
}

export async function sharedApiFetch(path, env, ttlSeconds = ttlForPath(path)) {
  if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not configured');
  const apiUrl = `${API_BASE}${path}`;
  const cache = globalThis.caches?.default || null;
  const freshKey = new Request(apiUrl, { method: 'GET' });
  const staleUrl = new URL(apiUrl);
  staleUrl.searchParams.set('__nomad_stale', '1');
  const staleKey = new Request(staleUrl.toString(), { method: 'GET' });

  const fresh = await cachedJson(cache, freshKey);
  if (fresh) return { payload: fresh, cacheHit: true, stale: false, upstreamRequests: 0 };

  const slot = await acquireSlot(env);
  if (slot.blocked) {
    const stale = await cachedJson(cache, staleKey);
    if (stale) {
      return { payload: stale, cacheHit: true, stale: true, cooldownUntil: slot.cooldownUntil, upstreamRequests: 0 };
    }
    throw new Error(`API-Football cooldown active until ${new Date(slot.cooldownUntil).toISOString()}`);
  }

  const response = await fetch(apiUrl, {
    headers: { 'x-apisports-key': env.API_FOOTBALL_KEY, 'Accept': 'application/json' }
  });
  const payload = await response.json().catch(() => null);
  const detail = apiErrorDetail(payload);

  if (isRateLimit(response, payload)) {
    const cooldownUntil = await recordRateLimit(env, response);
    const stale = await cachedJson(cache, staleKey);
    if (stale) {
      return { payload: stale, cacheHit: true, stale: true, cooldownUntil, upstreamRequests: 1 };
    }
    throw new Error(detail || `API-Football rate limited until ${new Date(cooldownUntil).toISOString()}`);
  }
  if (!response.ok) throw new Error(payload?.message || `API HTTP ${response.status}`);
  if (detail) throw new Error(detail);

  await recordSuccess(env);
  await storePayload(cache, freshKey, staleKey, payload, ttlSeconds);
  return { payload, cacheHit: false, stale: false, upstreamRequests: 1 };
}

export async function sharedFixtureDetails(ids, env) {
  const unique = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  const items = new Map();
  let upstreamRequests = 0;
  let cacheHits = 0;
  let staleHits = 0;

  for (let index = 0; index < unique.length; index += 20) {
    const group = unique.slice(index, index + 20);
    if (!group.length) continue;
    const result = await sharedApiFetch(`/fixtures?ids=${group.join('-')}`, env, SHARED_STATS_CACHE_SECONDS);
    upstreamRequests += Number(result.upstreamRequests || 0);
    if (result.cacheHit) cacheHits += 1;
    if (result.stale) staleHits += 1;
    for (const item of Array.isArray(result.payload?.response) ? result.payload.response : []) {
      const fixtureId = Number(item?.fixture?.id);
      if (Number.isInteger(fixtureId)) items.set(fixtureId, item);
    }
  }

  return { items, upstreamRequests, cacheHits, staleHits, requestedFixtures: unique.length };
}
