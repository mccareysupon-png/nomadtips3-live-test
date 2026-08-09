const API_BASE = 'https://v3.football.api-sports.io';

export const SHARED_LIVE_CACHE_SECONDS = 15;
export const SHARED_STATS_CACHE_SECONDS = 60;
export const SHARED_ODDS_CACHE_SECONDS = 15;

const GUARD_KEY = 'api-football';
const BASE_MIN_GAP_MS = 9000;
const DERATE_GAPS_MS = [9000, 12000, 18000, 30000];
const MAX_SLOT_WAIT_MS = 30_000;
const DEFAULT_COOLDOWN_MS = 90_000;
const MAX_COOLDOWN_MS = 5 * 60_000;
const UPSTREAM_TIMEOUT_MS = 15_000;

const STALE_LIVE_SECONDS = 90;
const STALE_STATS_SECONDS = 180;
const STALE_ODDS_SECONDS = 90;
const STALE_DEFAULT_SECONDS = 300;

let guardSchemaReady = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(max = 300) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % Math.max(1, max);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function staleTtlForPath(path) {
  if (path.startsWith('/fixtures?live=')) return STALE_LIVE_SECONDS;
  if (path.startsWith('/fixtures?ids=')) return STALE_STATS_SECONDS;
  if (path.startsWith('/odds/live')) return STALE_ODDS_SECONDS;
  return STALE_DEFAULT_SECONDS;
}

function retryAfterMs(response) {
  const raw = response?.headers?.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function headerNumber(response, names) {
  for (const name of names) {
    const raw = response?.headers?.get(name);
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function rateMeta(response) {
  return {
    limit: headerNumber(response, ['x-ratelimit-requests-limit', 'x-ratelimit-limit', 'X-RateLimit-Limit']),
    remaining: headerNumber(response, ['x-ratelimit-requests-remaining', 'x-ratelimit-remaining', 'X-RateLimit-Remaining']),
    retryAfterMs: retryAfterMs(response),
    status: Number(response?.status || 0) || null
  };
}

function quotaLevel(remaining) {
  if (!Number.isFinite(remaining)) return 0;
  if (remaining <= 1) return 3;
  if (remaining <= 2) return 2;
  if (remaining <= 4) return 1;
  return 0;
}

function strikeLevel(strikes) {
  if (strikes >= 3) return 3;
  if (strikes >= 2) return 2;
  if (strikes >= 1) return 1;
  return 0;
}

function effectiveDerate(state) {
  const storedLevel = Math.max(0, Math.min(3, Number(state?.derate_level || 0)));
  const remaining = nullableNumber(state?.rate_limit_remaining);
  return Math.max(
    storedLevel,
    quotaLevel(remaining),
    strikeLevel(Number(state?.consecutive_429 || 0))
  );
}

function effectiveGapMs(state) {
  return DERATE_GAPS_MS[effectiveDerate(state)] || BASE_MIN_GAP_MS;
}

async function addGuardColumn(env, sql) {
  try { await env.DB.prepare(sql).run(); } catch (error) {
    if (!/duplicate column|already exists/i.test(String(error?.message || error))) throw error;
  }
}

async function ensureGuard(env) {
  if (!env.DB) return false;
  if (guardSchemaReady) return true;
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
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN rate_limit_limit INTEGER`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN rate_limit_remaining INTEGER`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN retry_after_ms INTEGER`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN last_status INTEGER`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN last_response_at INTEGER`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN derate_level INTEGER NOT NULL DEFAULT 0`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN success_streak INTEGER NOT NULL DEFAULT 0`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN circuit_open_until INTEGER NOT NULL DEFAULT 0`);
  await addGuardColumn(env, `ALTER TABLE api_rate_guard ADD COLUMN last_action TEXT NOT NULL DEFAULT 'NORMAL'`);
  guardSchemaReady = true;
  return true;
}

async function guardState(env) {
  if (!env.DB) return null;
  return env.DB.prepare(`SELECT * FROM api_rate_guard WHERE guard_key = ?`)
    .bind(GUARD_KEY).first();
}

async function acquireSlot(env) {
  if (!(await ensureGuard(env))) {
    await sleep(jitter(300));
    return { protected: false, effectiveGapMs: BASE_MIN_GAP_MS };
  }

  const started = Date.now();
  while (Date.now() - started < MAX_SLOT_WAIT_MS) {
    const now = Date.now();
    const state = await guardState(env);
    const cooldownUntil = Number(state?.cooldown_until || 0);
    const circuitUntil = Number(state?.circuit_open_until || 0);
    const blockedUntil = Math.max(cooldownUntil, circuitUntil);
    if (blockedUntil > now) {
      return {
        protected: true,
        blocked: true,
        blockedReason: circuitUntil >= cooldownUntil ? 'CIRCUIT_OPEN' : 'COOLDOWN',
        cooldownUntil: blockedUntil,
        effectiveGapMs: effectiveGapMs(state),
        derateLevel: effectiveDerate(state)
      };
    }

    const gap = effectiveGapMs(state);
    const lastStarted = Number(state?.last_started_at || 0);
    const eligibleAt = lastStarted + gap;
    if (eligibleAt > now) {
      await sleep(Math.min(eligibleAt - now + jitter(220), 1800));
      continue;
    }

    const claim = await env.DB.prepare(`
      UPDATE api_rate_guard
      SET last_started_at = ?, updated_at = ?
      WHERE guard_key = ? AND last_started_at = ?
        AND cooldown_until <= ? AND circuit_open_until <= ?
    `).bind(now, now, GUARD_KEY, lastStarted, now, now).run();
    if (Number(claim?.meta?.changes || 0) === 1) {
      await sleep(jitter(180));
      return {
        protected: true,
        blocked: false,
        effectiveGapMs: gap,
        derateLevel: effectiveDerate(state)
      };
    }
    await sleep(100 + jitter(180));
  }

  return {
    protected: true,
    blocked: true,
    blockedReason: 'SLOT_TIMEOUT',
    cooldownUntil: Date.now() + 5000,
    effectiveGapMs: BASE_MIN_GAP_MS,
    derateLevel: 1
  };
}

async function recordResponseMeta(env, response, action = null) {
  if (!env.DB) return;
  await ensureGuard(env);
  const meta = rateMeta(response);
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE api_rate_guard
    SET rate_limit_limit = COALESCE(?, rate_limit_limit),
        rate_limit_remaining = COALESCE(?, rate_limit_remaining),
        retry_after_ms = ?, last_status = ?, last_response_at = ?,
        last_action = COALESCE(?, last_action), updated_at = ?
    WHERE guard_key = ?
  `).bind(meta.limit, meta.remaining, meta.retryAfterMs, meta.status, now, action, now, GUARD_KEY).run();
}

async function recordSuccess(env, response) {
  if (!env.DB) return;
  await ensureGuard(env);
  await recordResponseMeta(env, response, 'UPSTREAM_OK');
  const now = Date.now();
  const state = await guardState(env).catch(() => null);
  const meta = rateMeta(response);
  const storedLevel = Math.max(0, Math.min(3, Number(state?.derate_level || 0)));
  const currentLevel = Math.max(storedLevel, strikeLevel(Number(state?.consecutive_429 || 0)));
  const safeQuota = meta.remaining === null || meta.remaining >= 5;
  let streak = Number(state?.success_streak || 0) + 1;
  let nextLevel = currentLevel;
  let strikes = Number(state?.consecutive_429 || 0);
  let cooldownUntil = Number(state?.cooldown_until || 0);
  let circuitUntil = Number(state?.circuit_open_until || 0);

  if (streak >= 3 && safeQuota && cooldownUntil <= now && circuitUntil <= now) {
    nextLevel = Math.max(0, currentLevel - 1);
    strikes = 0;
    cooldownUntil = 0;
    circuitUntil = 0;
    streak = 0;
  }

  nextLevel = Math.max(nextLevel, quotaLevel(meta.remaining));
  await env.DB.prepare(`
    UPDATE api_rate_guard
    SET cooldown_until = ?, circuit_open_until = ?, consecutive_429 = ?,
        derate_level = ?, success_streak = ?,
        rate_limit_limit = COALESCE(?, rate_limit_limit), rate_limit_remaining = ?,
        last_action = ?, updated_at = ?
    WHERE guard_key = ?
  `).bind(
    cooldownUntil,
    circuitUntil,
    strikes,
    nextLevel,
    streak,
    meta.limit,
    meta.remaining,
    nextLevel > 0 ? 'DERATING' : 'NORMAL',
    now,
    GUARD_KEY
  ).run();
}

async function recordRateLimit(env, response) {
  const now = Date.now();
  let strikes = 1;
  let currentLevel = 0;
  if (env.DB) {
    await ensureGuard(env);
    await recordResponseMeta(env, response, 'RATE_LIMIT');
    const state = await guardState(env).catch(() => null);
    strikes = Math.min(4, Number(state?.consecutive_429 || 0) + 1);
    currentLevel = effectiveDerate(state);
  }
  const providerWait = retryAfterMs(response);
  const exponential = DEFAULT_COOLDOWN_MS * (2 ** (strikes - 1));
  const waitMs = Math.min(MAX_COOLDOWN_MS, Math.max(DEFAULT_COOLDOWN_MS, providerWait || exponential)) + jitter(1500);
  const cooldownUntil = now + waitMs;
  const derateLevel = Math.max(currentLevel, strikeLevel(strikes));
  const circuitOpenUntil = strikes >= 2 ? cooldownUntil : 0;
  if (env.DB) {
    await env.DB.prepare(`
      UPDATE api_rate_guard
      SET cooldown_until = MAX(cooldown_until, ?),
          circuit_open_until = MAX(circuit_open_until, ?),
          consecutive_429 = ?, derate_level = ?, success_streak = 0,
          last_429_at = ?, last_action = ?, updated_at = ?
      WHERE guard_key = ?
    `).bind(
      cooldownUntil,
      circuitOpenUntil,
      strikes,
      derateLevel,
      now,
      strikes >= 2 ? 'CIRCUIT_OPEN' : 'WAITING_API',
      now,
      GUARD_KEY
    ).run();
  }
  console.warn(JSON.stringify({ event: 'api_football_429', cooldownUntil, strikes, derateLevel, circuitOpen: strikes >= 2 }));
  return { cooldownUntil, strikes, derateLevel, circuitOpenUntil };
}

async function cachedJson(cache, key) {
  if (!cache) return null;
  const response = await cache.match(key);
  return response ? response.json() : null;
}

async function storePayload(cache, freshKey, staleKey, payload, ttlSeconds, staleSeconds) {
  if (!cache) return;
  const body = JSON.stringify(payload);
  await Promise.all([
    cache.put(freshKey, new Response(body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttlSeconds}` }
    })),
    cache.put(staleKey, new Response(body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${staleSeconds}` }
    }))
  ]);
}

export async function repairSharedApiGuard(env) {
  if (!(await ensureGuard(env))) return { repaired: false, reason: 'D1 unavailable' };
  const now = Date.now();
  const state = await guardState(env);
  const changes = [];
  let lastStarted = Number(state?.last_started_at || 0);
  let cooldownUntil = Number(state?.cooldown_until || 0);
  let circuitUntil = Number(state?.circuit_open_until || 0);

  if (lastStarted && now - lastStarted > 2 * 60_000) {
    lastStarted = 0;
    changes.push('STALE_SLOT_RESET');
  }
  if (cooldownUntil && cooldownUntil <= now) {
    cooldownUntil = 0;
    changes.push('EXPIRED_COOLDOWN_CLEARED');
  }
  if (circuitUntil && circuitUntil <= now) {
    circuitUntil = 0;
    changes.push('EXPIRED_CIRCUIT_CLEARED');
  }

  if (changes.length) {
    await env.DB.prepare(`
      UPDATE api_rate_guard
      SET last_started_at = ?, cooldown_until = ?, circuit_open_until = ?,
          last_action = 'REPAIRED_STALE_GUARD', updated_at = ?
      WHERE guard_key = ?
    `).bind(lastStarted, cooldownUntil, circuitUntil, now, GUARD_KEY).run();
  }
  return { repaired: changes.length > 0, changes };
}

export async function getSharedApiGuardStatus(env) {
  const now = Date.now();
  if (!(await ensureGuard(env))) {
    return {
      protected: false,
      minGapMs: BASE_MIN_GAP_MS,
      effectiveGapMs: BASE_MIN_GAP_MS,
      maxSlotWaitMs: MAX_SLOT_WAIT_MS,
      cooldownActive: false,
      circuitOpen: false,
      cooldownUntil: null,
      circuitOpenUntil: null,
      cooldownRemainingMs: 0,
      consecutive429: 0,
      derateLevel: 0,
      rateLimitLimit: null,
      rateLimitRemaining: null,
      last429At: null,
      action: 'NORMAL'
    };
  }
  const state = await guardState(env);
  const cooldownUntil = Number(state?.cooldown_until || 0);
  const circuitUntil = Number(state?.circuit_open_until || 0);
  const last429At = Number(state?.last_429_at || 0);
  const lastResponseAt = Number(state?.last_response_at || 0);
  const derateLevel = effectiveDerate(state);
  const limit = nullableNumber(state?.rate_limit_limit);
  const remaining = nullableNumber(state?.rate_limit_remaining);
  return {
    protected: true,
    minGapMs: BASE_MIN_GAP_MS,
    effectiveGapMs: effectiveGapMs(state),
    maxSlotWaitMs: MAX_SLOT_WAIT_MS,
    upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
    cooldownActive: cooldownUntil > now,
    circuitOpen: circuitUntil > now,
    cooldownUntil: cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
    circuitOpenUntil: circuitUntil ? new Date(circuitUntil).toISOString() : null,
    cooldownRemainingMs: Math.max(0, Math.max(cooldownUntil, circuitUntil) - now),
    consecutive429: Number(state?.consecutive_429 || 0),
    derateLevel,
    successStreak: Number(state?.success_streak || 0),
    rateLimitLimit: limit,
    rateLimitRemaining: remaining,
    retryAfterMs: Number(state?.retry_after_ms || 0) || null,
    lastStatus: Number(state?.last_status || 0) || null,
    lastResponseAt: lastResponseAt ? new Date(lastResponseAt).toISOString() : null,
    last429At: last429At ? new Date(last429At).toISOString() : null,
    lastStartedAt: Number(state?.last_started_at || 0)
      ? new Date(Number(state.last_started_at)).toISOString()
      : null,
    action: circuitUntil > now
      ? 'CIRCUIT_OPEN'
      : cooldownUntil > now
        ? 'WAITING_API'
        : derateLevel > 0
          ? 'DERATING'
          : String(state?.last_action || 'NORMAL')
  };
}

async function upstreamFetch(apiUrl, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(apiUrl, {
      headers: { 'x-apisports-key': env.API_FOOTBALL_KEY, 'Accept': 'application/json' },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function sharedApiFetch(path, env, ttlSeconds = ttlForPath(path)) {
  if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not configured');
  const apiUrl = `${API_BASE}${path}`;
  const cache = globalThis.caches?.default || null;
  const freshKey = new Request(apiUrl, { method: 'GET' });
  const staleUrl = new URL(apiUrl);
  staleUrl.searchParams.set('__nomad_stale', '1');
  const staleKey = new Request(staleUrl.toString(), { method: 'GET' });
  const staleSeconds = staleTtlForPath(path);

  const fresh = await cachedJson(cache, freshKey);
  if (fresh) return { payload: fresh, cacheHit: true, stale: false, upstreamRequests: 0 };

  const slot = await acquireSlot(env);
  if (slot.blocked) {
    const stale = await cachedJson(cache, staleKey);
    if (stale) {
      return {
        payload: stale,
        cacheHit: true,
        stale: true,
        staleTtlSeconds: staleSeconds,
        cooldownUntil: slot.cooldownUntil,
        guardAction: slot.blockedReason,
        upstreamRequests: 0
      };
    }
    throw new Error(`API-Football ${slot.blockedReason || 'cooldown'} active until ${new Date(slot.cooldownUntil).toISOString()}`);
  }

  let response;
  try {
    response = await upstreamFetch(apiUrl, env);
  } catch (error) {
    const stale = await cachedJson(cache, staleKey);
    if (stale) {
      return {
        payload: stale,
        cacheHit: true,
        stale: true,
        staleTtlSeconds: staleSeconds,
        fallbackReason: /abort/i.test(String(error?.name || error?.message || '')) ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FETCH_FAILED',
        upstreamRequests: 1
      };
    }
    if (/abort/i.test(String(error?.name || error?.message || ''))) {
      throw new Error(`API-Football upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
    }
    throw error;
  }

  const payload = await response.json().catch(() => null);
  const detail = apiErrorDetail(payload);

  if (isRateLimit(response, payload)) {
    const limited = await recordRateLimit(env, response);
    const stale = await cachedJson(cache, staleKey);
    if (stale) {
      return {
        payload: stale,
        cacheHit: true,
        stale: true,
        staleTtlSeconds: staleSeconds,
        cooldownUntil: limited.cooldownUntil,
        guardAction: limited.circuitOpenUntil ? 'CIRCUIT_OPEN' : 'WAITING_API',
        upstreamRequests: 1
      };
    }
    throw new Error(detail || `API-Football rate limited until ${new Date(limited.cooldownUntil).toISOString()}`);
  }

  await recordResponseMeta(env, response, response.ok ? 'UPSTREAM_OK' : 'UPSTREAM_ERROR');
  if (!response.ok) throw new Error(payload?.message || `API HTTP ${response.status}`);
  if (detail) throw new Error(detail);

  await recordSuccess(env, response);
  await storePayload(cache, freshKey, staleKey, payload, ttlSeconds, staleSeconds);
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
