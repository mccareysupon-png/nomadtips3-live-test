const VERSION = 'nomad343-ball46-full-market-v2';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const BOOKMAKERS = Object.freeze([
  'bet365','pinnacle','williamhill','ladbrokes','vcbet','1xbet','bwin','easybets','interwetten',
  'betfair','snai','macauslot','betsson','betathome','18bet','10bet','12bet','coral','crown'
]);
const CACHE_MS = 12_000;
const STALE_CACHE_MS = 180_000;
const PROVIDER_LIMIT_PER_MINUTE = 40;
const MAX_FULL_MARKET_CALLS_PER_MINUTE = 30;
const TIMEOUT_MS = 15_000;
const PRICE_KEYS = new Set(['home','away','draw','over','under','yes','no']);
const now = () => Date.now();

function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function response(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

function safeFixtureId(value) {
  const id = String(value ?? '').trim();
  return /^[A-Za-z0-9_-]{1,96}$/.test(id) ? id : null;
}

function sanitizeValue(value, key = '', depth = 0) {
  if (depth > 12 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(v => sanitizeValue(v, '', depth + 1));
  if (typeof value !== 'object') {
    if (PRICE_KEYS.has(String(key).toLowerCase())) {
      const n = finite(value);
      return n !== null && n > 0 ? n : null;
    }
    return value;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = sanitizeValue(v, k, depth + 1);
  return out;
}

function sanitizeProviderPayload(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  if (!data || typeof data !== 'object') return null;
  const clean = sanitizeValue(data);
  if (Array.isArray(clean.bookmakers)) {
    clean.bookmakers = clean.bookmakers.map(row => ({
      ...row,
      odds: row?.odds && typeof row.odds === 'object' ? row.odds : {}
    }));
  }
  return clean;
}

async function providerRequest(fixtureId, key) {
  const url = new URL(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds`);
  url.searchParams.set('bookmakers', BOOKMAKERS.join(','));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${key}`
      }
    });
    const raw = await r.text();
    let payload = null;
    try { payload = JSON.parse(raw); } catch {}
    const limit = finite(r.headers.get('x-ratelimit-limit'));
    const remaining = finite(r.headers.get('x-ratelimit-remaining'));
    const reset = finite(r.headers.get('x-ratelimit-reset'));
    const retryAfter = finite(r.headers.get('retry-after'));
    if (!r.ok) {
      const err = new Error(`provider:HTTP_${r.status}`);
      err.status = r.status;
      err.retryAfter = retryAfter;
      err.providerLimit = limit;
      err.providerRemaining = remaining;
      err.providerReset = reset;
      err.payload = payload;
      throw err;
    }
    if (!payload || typeof payload !== 'object' || Number(payload.success) !== 1) {
      const err = new Error('provider:INVALID_ODDS_RESPONSE');
      err.status = 502;
      err.payload = payload;
      throw err;
    }
    return { payload, limit, remaining, reset };
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeout = new Error('provider:TIMEOUT');
      timeout.status = 504;
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class FullMarketGate {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.inflight = new Map();
  }

  async callWindow() {
    const cutoff = now() - 60_000;
    const stored = await this.ctx.storage.get('providerCalls');
    return Array.isArray(stored) ? stored.filter(ts => Number(ts) > cutoff) : [];
  }

  async saveCallWindow(calls) {
    await this.ctx.storage.put('providerCalls', calls.slice(-120));
  }

  async cached(fixtureId) {
    const row = await this.ctx.storage.get(`fixture:${fixtureId}`);
    return row && row.fullOdds ? row : null;
  }

  buildBody(fixtureId, entry, { cached = false, stale = false, guard = null } = {}) {
    const at = Number(entry?.fetchedAt || now());
    return {
      ok: true,
      version: VERSION,
      fixtureId,
      fullOdds: entry.fullOdds,
      fetchedAt: at,
      ageMs: Math.max(0, now() - at),
      source: '5DollarFootballAPI_FULL_MARKET',
      bookmakerCount: Array.isArray(entry?.fullOdds?.bookmakers) ? entry.fullOdds.bookmakers.length : 0,
      requestedBookmakers: BOOKMAKERS,
      cached,
      stale,
      externalRequestsAdded: cached ? 0 : 1,
      guard: guard ?? entry?.guard ?? null
    };
  }

  async load(fixtureId) {
    const at = now();
    const cached = await this.cached(fixtureId);
    if (cached && at - Number(cached.fetchedAt || 0) < CACHE_MS) {
      return this.buildBody(fixtureId, cached, { cached: true, stale: false });
    }

    const blockedUntil = finite(await this.ctx.storage.get('blockedUntil'));
    if (blockedUntil !== null && at < blockedUntil) {
      if (cached && at - Number(cached.fetchedAt || 0) < STALE_CACHE_MS) {
        return this.buildBody(fixtureId, cached, {
          cached: true,
          stale: true,
          guard: { reason: 'PROVIDER_BACKOFF', retryAfterSec: Math.max(1, Math.ceil((blockedUntil - at) / 1000)) }
        });
      }
      const err = new Error('FULL_MARKET_PROVIDER_BACKOFF');
      err.status = 429;
      err.retryAfter = Math.max(1, Math.ceil((blockedUntil - at) / 1000));
      throw err;
    }

    const calls = await this.callWindow();
    if (calls.length >= MAX_FULL_MARKET_CALLS_PER_MINUTE) {
      const oldest = Number(calls[0] || at);
      const retryAfter = Math.max(1, Math.ceil((60_000 - (at - oldest)) / 1000));
      if (cached && at - Number(cached.fetchedAt || 0) < STALE_CACHE_MS) {
        return this.buildBody(fixtureId, cached, {
          cached: true,
          stale: true,
          guard: { reason: 'LOCAL_RATE_GUARD', retryAfterSec: retryAfter, callsLast60s: calls.length }
        });
      }
      const err = new Error('FULL_MARKET_LOCAL_RATE_GUARD');
      err.status = 429;
      err.retryAfter = retryAfter;
      err.guard = { callsLast60s: calls.length };
      throw err;
    }

    if (!this.env.FIVEDOLLAR_API_KEY) {
      const err = new Error('FIVEDOLLAR_API_KEY_MISSING');
      err.status = 503;
      throw err;
    }

    const nextCalls = [...calls, at];
    await this.saveCallWindow(nextCalls);

    try {
      const result = await providerRequest(fixtureId, this.env.FIVEDOLLAR_API_KEY);
      const fullOdds = sanitizeProviderPayload(result.payload);
      if (!fullOdds) throw Object.assign(new Error('FULL_MARKET_EMPTY_PROVIDER_DATA'), { status: 502 });
      const guard = {
        accountLimitPerMinute: PROVIDER_LIMIT_PER_MINUTE,
        fullMarketMaxPerMinute: MAX_FULL_MARKET_CALLS_PER_MINUTE,
        callsLast60s: nextCalls.length,
        providerLimit: result.limit,
        providerRemaining: result.remaining,
        providerReset: result.reset
      };
      const entry = { fetchedAt: now(), fullOdds, guard };
      await this.ctx.storage.put(`fixture:${fixtureId}`, entry);
      return this.buildBody(fixtureId, entry, { cached: false, stale: false, guard });
    } catch (err) {
      if (Number(err?.status) === 429) {
        const retryAfter = Math.max(1, Number(err?.retryAfter || 5));
        await this.ctx.storage.put('blockedUntil', now() + retryAfter * 1000);
      }
      if (cached && now() - Number(cached.fetchedAt || 0) < STALE_CACHE_MS) {
        return this.buildBody(fixtureId, cached, {
          cached: true,
          stale: true,
          guard: { reason: String(err?.message || err), retryAfterSec: finite(err?.retryAfter) }
        });
      }
      throw err;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return response({ ok: false, version: VERSION, error: 'METHOD_NOT_ALLOWED' }, 405);
    if (url.pathname === '/health') {
      const calls = await this.callWindow();
      return response({
        ok: true,
        component: 'BALL46_FULL_MARKET_GATE',
        version: VERSION,
        bookmakerCount: BOOKMAKERS.length,
        bookmakers: BOOKMAKERS,
        cacheMs: CACHE_MS,
        staleCacheMs: STALE_CACHE_MS,
        accountLimitPerMinute: PROVIDER_LIMIT_PER_MINUTE,
        maxFullMarketCallsPerMinute: MAX_FULL_MARKET_CALLS_PER_MINUTE,
        callsLast60s: calls.length
      });
    }
    if (url.pathname !== '/fixture-odds') return response({ ok: false, version: VERSION, error: 'NOT_FOUND' }, 404);
    const fixtureId = safeFixtureId(url.searchParams.get('fixtureId') || url.searchParams.get('fixture_id') || url.searchParams.get('id'));
    if (!fixtureId) return response({ ok: false, version: VERSION, error: 'INVALID_FIXTURE_ID' }, 400);

    if (this.inflight.has(fixtureId)) return this.inflight.get(fixtureId);
    const task = this.load(fixtureId)
      .then(body => response(body, 200, { 'x-nomad-full-market-cache': body.cached ? (body.stale ? 'STALE' : 'HIT') : 'MISS' }))
      .catch(err => {
        const status = Number(err?.status || 502);
        const retryAfter = finite(err?.retryAfter);
        return response({
          ok: false,
          version: VERSION,
          fixtureId,
          error: String(err?.message || err),
          retryAfterSec: retryAfter,
          guard: err?.guard || null
        }, status, retryAfter ? { 'retry-after': String(retryAfter) } : {});
      })
      .finally(() => this.inflight.delete(fixtureId));
    this.inflight.set(fixtureId, task);
    return task;
  }
}

function gate(env) {
  return env.FULL_MARKET_GATE.get(env.FULL_MARKET_GATE.idFromName('global'));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['/fixture-odds','/health'].includes(url.pathname)) {
      return response({ ok: false, version: VERSION, error: 'NOT_FOUND' }, 404);
    }
    return gate(env).fetch(request);
  }
};
