import { DurableObject } from 'cloudflare:workers';

const VERSION = 'nomad343-full-market-v2-settings';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const BOOKMAKERS = [
  { slug: 'bet365', name: 'Bet365', role: 'MAIN', order: 1 },
  { slug: 'pinnacle', name: 'Pinnacle', role: 'REFEREE', order: 2 },
  { slug: 'crown', name: 'Crown', role: 'REFEREE ASIA', order: 3 },
  { slug: '1xbet', name: '1xBet', role: 'GLOBAL MASS', order: 4 },
  { slug: '12bet', name: '12Bet', role: 'ASIA', order: 5 },
  { slug: 'interwetten', name: 'Interwetten', role: 'EUROPE', order: 6 },
  { slug: 'macauslot', name: 'Macau Slot', role: 'EAST ASIA', order: 7 },
  { slug: '18bet', name: '18Bet', role: 'ASIA #2', order: 8 },
  { slug: 'vcbet', name: 'VCBet', role: 'RESERVE', order: 9 },
  { slug: 'easybets', name: 'Easybets', role: 'RESERVE', order: 10 }
];
const BOOKMAKER_QUERY = BOOKMAKERS.map(x => x.slug).join(',');
const ACCOUNT_RATE_LIMIT_PER_MIN = 40;
const SIDECAR_SOFT_LIMIT_PER_MIN = 24;
const DEFAULT_CONTROL = Object.freeze({
  refreshSeconds: 30,
  workerCacheSeconds: 30,
  eventTrigger: true,
  softLimitPerMinute: SIDECAR_SOFT_LIMIT_PER_MIN
});
const STALE_MS = 5 * 60_000;
const BUDGET_WINDOW_MS = 60_000;
const MAX_RECENT_FIXTURES = 64;

const now = () => Date.now();
const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const normalized = value => String(value ?? '').toLowerCase().replace(/[\s_-]/g, '');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function sanitizeControl(raw = {}) {
  return {
    refreshSeconds: clamp(Math.round(num(raw.refreshSeconds) ?? DEFAULT_CONTROL.refreshSeconds), 10, 120),
    workerCacheSeconds: clamp(Math.round(num(raw.workerCacheSeconds) ?? DEFAULT_CONTROL.workerCacheSeconds), 10, 120),
    eventTrigger: raw.eventTrigger === undefined ? DEFAULT_CONTROL.eventTrigger : Boolean(raw.eventTrigger),
    softLimitPerMinute: clamp(Math.round(num(raw.softLimitPerMinute) ?? DEFAULT_CONTROL.softLimitPerMinute), 1, 36)
  };
}

function bookmakerArray(payload) {
  const roots = [payload?.data, payload, payload?.data?.odds, payload?.odds].filter(Boolean);
  for (const root of roots) {
    if (Array.isArray(root?.bookmakers)) return root.bookmakers;
    if (Array.isArray(root)) return root;
  }
  return [];
}

function availableBookmakers(payload) {
  const found = new Set();
  for (const row of bookmakerArray(payload)) {
    const key = normalized(row?.slug ?? row?.bookmaker?.slug ?? row?.name ?? row?.bookmaker?.name);
    if (!key) continue;
    for (const book of BOOKMAKERS) {
      const target = normalized(book.slug);
      if (key === target || key.includes(target) || target.includes(key)) found.add(book.slug);
    }
  }
  return BOOKMAKERS.filter(x => found.has(x.slug)).map(x => x.slug);
}

function response(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      ...extraHeaders
    }
  });
}

export class FullMarketHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.inflight = new Map();
  }

  async control() {
    return sanitizeControl(await this.ctx.storage.get('fullMarketControl') || DEFAULT_CONTROL);
  }

  async saveControl(raw) {
    const next = sanitizeControl(raw);
    await this.ctx.storage.put('fullMarketControl', next);
    return next;
  }

  async rateState(at = now()) {
    const raw = await this.ctx.storage.get('providerRequestTimes') || [];
    const times = raw.filter(value => Number.isFinite(Number(value)) && at - Number(value) < BUDGET_WINDOW_MS);
    if (times.length !== raw.length) await this.ctx.storage.put('providerRequestTimes', times);
    return times;
  }

  async consumeProviderBudget(control, at = now()) {
    const times = await this.rateState(at);
    if (times.length >= control.softLimitPerMinute) return { ok: false, used: times.length };
    times.push(at);
    await this.ctx.storage.put('providerRequestTimes', times);
    return { ok: true, used: times.length };
  }

  async rememberFixture(fixtureId) {
    const key = String(fixtureId);
    const raw = await this.ctx.storage.get('recentFixtures') || [];
    const next = raw.filter(x => String(x) !== key);
    next.push(key);
    const evicted = next.length > MAX_RECENT_FIXTURES ? next.splice(0, next.length - MAX_RECENT_FIXTURES) : [];
    if (evicted.length) await this.ctx.storage.delete(evicted.map(id => `fixture:${id}`));
    await this.ctx.storage.put('recentFixtures', next);
  }

  async cached(fixtureId) {
    return await this.ctx.storage.get(`fixture:${fixtureId}`) || null;
  }

  async providerFetch(fixtureId) {
    if (!this.env.FIVEDOLLAR_API_KEY) throw Object.assign(new Error('FIVEDOLLAR_API_KEY_MISSING'), { status: 500 });
    const url = `${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=${encodeURIComponent(BOOKMAKER_QUERY)}`;
    const r = await fetch(url, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.env.FIVEDOLLAR_API_KEY}`
      }
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!r.ok) {
      const error = new Error(`5USD_FULL_MARKET_HTTP_${r.status}`);
      error.status = r.status;
      error.retryAfter = num(r.headers.get('retry-after'));
      error.providerBody = json ?? text.slice(0, 300);
      throw error;
    }
    if (!json || typeof json !== 'object') throw Object.assign(new Error('5USD_FULL_MARKET_SHAPE'), { status: 502 });
    return json;
  }

  rateMeta(control, usedInWindow) {
    return {
      accountLimitPerMinute: ACCOUNT_RATE_LIMIT_PER_MIN,
      sidecarSoftLimitPerMinute: control.softLimitPerMinute,
      usedInWindow,
      burstFriendly: true
    };
  }

  async freshFixture(fixtureId, previous, control, source = '5USD_ULTRA_10BOOK') {
    const budget = await this.consumeProviderBudget(control);
    if (!budget.ok) {
      const staleAge = previous?.fetchedAt ? now() - Number(previous.fetchedAt) : null;
      if (previous?.fullOdds && staleAge !== null && staleAge <= STALE_MS) {
        return {
          ok: true,
          fixtureId,
          version: VERSION,
          fullOdds: clone(previous.fullOdds),
          fetchedAt: previous.fetchedAt,
          requestedBookmakers: BOOKMAKERS,
          availableBookmakers: previous.availableBookmakers || availableBookmakers(previous.fullOdds),
          cached: true,
          stale: true,
          limited: true,
          source: 'FULL_MARKET_STALE_RATE_GUARD',
          control,
          rate: this.rateMeta(control, budget.used)
        };
      }
      const error = new Error('FULL_MARKET_SOFT_RATE_LIMIT');
      error.status = 429;
      error.retryAfter = 3;
      throw error;
    }

    try {
      const fullOdds = await this.providerFetch(fixtureId);
      const fetchedAt = now();
      const record = {
        fullOdds: clone(fullOdds),
        fetchedAt,
        availableBookmakers: availableBookmakers(fullOdds)
      };
      await this.ctx.storage.put(`fixture:${fixtureId}`, record);
      await this.rememberFixture(fixtureId);
      return {
        ok: true,
        fixtureId,
        version: VERSION,
        fullOdds,
        fetchedAt,
        requestedBookmakers: BOOKMAKERS,
        availableBookmakers: record.availableBookmakers,
        cached: false,
        stale: false,
        limited: false,
        source,
        control,
        rate: this.rateMeta(control, budget.used)
      };
    } catch (error) {
      const staleAge = previous?.fetchedAt ? now() - Number(previous.fetchedAt) : null;
      if (previous?.fullOdds && staleAge !== null && staleAge <= STALE_MS) {
        return {
          ok: true,
          fixtureId,
          version: VERSION,
          fullOdds: clone(previous.fullOdds),
          fetchedAt: previous.fetchedAt,
          requestedBookmakers: BOOKMAKERS,
          availableBookmakers: previous.availableBookmakers || availableBookmakers(previous.fullOdds),
          cached: true,
          stale: true,
          limited: Number(error?.status) === 429,
          source: 'FULL_MARKET_STALE_PROVIDER_FALLBACK',
          refreshError: String(error?.message || error),
          retryAfter: num(error?.retryAfter),
          control,
          rate: this.rateMeta(control, budget.used)
        };
      }
      throw error;
    }
  }

  async fixtureOdds(fixtureId) {
    const control = await this.control();
    const cached = await this.cached(fixtureId);
    const age = cached?.fetchedAt ? Math.max(0, now() - Number(cached.fetchedAt)) : null;
    const freshWindowMs = Math.max(control.refreshSeconds, control.workerCacheSeconds) * 1000;
    if (cached?.fullOdds && age !== null && age <= freshWindowMs) {
      const times = await this.rateState();
      return {
        ok: true,
        fixtureId,
        version: VERSION,
        fullOdds: clone(cached.fullOdds),
        fetchedAt: cached.fetchedAt,
        requestedBookmakers: BOOKMAKERS,
        availableBookmakers: cached.availableBookmakers || availableBookmakers(cached.fullOdds),
        cached: true,
        stale: false,
        limited: false,
        source: 'FULL_MARKET_CACHE',
        control,
        rate: this.rateMeta(control, times.length)
      };
    }

    if (this.inflight.has(fixtureId)) return this.inflight.get(fixtureId);
    const task = this.freshFixture(fixtureId, cached, control).finally(() => this.inflight.delete(fixtureId));
    this.inflight.set(fixtureId, task);
    return task;
  }

  async eventRefresh(fixtureId) {
    const control = await this.control();
    if (!control.eventTrigger) {
      const times = await this.rateState();
      return { ok: true, fixtureId, version: VERSION, skipped: true, reason: 'EVENT_TRIGGER_OFF', control, rate: this.rateMeta(control, times.length) };
    }
    const previous = await this.cached(fixtureId);
    if (this.inflight.has(fixtureId)) return this.inflight.get(fixtureId);
    const task = this.freshFixture(fixtureId, previous, control, '5USD_ULTRA_EVENT_TRIGGER').finally(() => this.inflight.delete(fixtureId));
    this.inflight.set(fixtureId, task);
    return task;
  }

  async settingsResponse() {
    const control = await this.control();
    const times = await this.rateState();
    return {
      ok: true,
      component: 'NOMAD343_FULL_MARKET',
      version: VERSION,
      control,
      defaults: DEFAULT_CONTROL,
      accountLimitPerMinute: ACCOUNT_RATE_LIMIT_PER_MIN,
      usedInWindow: times.length
    };
  }

  async health() {
    const control = await this.control();
    const times = await this.rateState();
    return {
      ok: true,
      component: 'NOMAD343_FULL_MARKET',
      version: VERSION,
      bookmakers: BOOKMAKERS,
      bookmakerQuery: BOOKMAKER_QUERY,
      cacheMs: Math.max(control.refreshSeconds, control.workerCacheSeconds) * 1000,
      staleMs: STALE_MS,
      control,
      rate: this.rateMeta(control, times.length)
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/status')) return response(await this.health());
    if (request.method === 'GET' && url.pathname === '/settings') return response(await this.settingsResponse());
    if (request.method === 'PUT' && url.pathname === '/settings') {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return response({ ok: false, version: VERSION, error: 'INVALID_SETTINGS_BODY' }, 400);
      const control = await this.saveControl(body.control || body);
      return response({ ...(await this.settingsResponse()), control });
    }
    if (request.method === 'GET' && url.pathname === '/fixture-odds') {
      const fixtureId = String(url.searchParams.get('fixtureId') || '').trim();
      if (!fixtureId) return response({ ok: false, version: VERSION, error: 'FIXTURE_ID_REQUIRED' }, 400);
      try {
        return response(await this.fixtureOdds(fixtureId));
      } catch (error) {
        const status = Number(error?.status) === 429 ? 429 : Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 502;
        const retryAfter = num(error?.retryAfter);
        const headers = retryAfter !== null ? { 'retry-after': String(retryAfter) } : {};
        return response({ ok: false, version: VERSION, fixtureId, error: String(error?.message || error), retryAfter, requestedBookmakers: BOOKMAKERS }, status, headers);
      }
    }
    if (['GET', 'POST'].includes(request.method) && url.pathname === '/event-refresh') {
      const fixtureId = String(url.searchParams.get('fixtureId') || '').trim();
      if (!fixtureId) return response({ ok: false, version: VERSION, error: 'FIXTURE_ID_REQUIRED' }, 400);
      try {
        return response(await this.eventRefresh(fixtureId));
      } catch (error) {
        const status = Number(error?.status) === 429 ? 429 : Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 502;
        const retryAfter = num(error?.retryAfter);
        const headers = retryAfter !== null ? { 'retry-after': String(retryAfter) } : {};
        return response({ ok: false, version: VERSION, fixtureId, error: String(error?.message || error), retryAfter }, status, headers);
      }
    }
    return response({ ok: false, version: VERSION, error: 'NOT_FOUND' }, 404);
  }
}

function stub(env) {
  const id = env.FULL_MARKET.idFromName('global');
  return env.FULL_MARKET.get(id);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD', 'PUT', 'POST'].includes(request.method)) return response({ ok: false, version: VERSION, error: 'METHOD_NOT_ALLOWED' }, 405);
    const target = new URL('https://full-market.internal');
    target.pathname = url.pathname;
    target.search = url.search;
    const init = { method: request.method, headers: request.headers };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
    const r = await stub(env).fetch(new Request(target, init));
    if (request.method === 'HEAD') return new Response(null, { status: r.status, headers: r.headers });
    return r;
  }
};
