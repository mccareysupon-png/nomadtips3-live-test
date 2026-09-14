import legacyDefault, { FullMarketHub as LegacyFullMarketHub } from './index.js';

const VERSION = 'nomad343-full-market-v5-central-scheduler';
const MAX_CENTRAL_FIXTURES = 512;
const LIVE_TTL_MS = 180_000;
const UPCOMING_TTL_MS = 30 * 60_000;
const SCHEDULER_MAX_PROVIDER_CALLS = 18;
const DEFAULT_HUB_SNAPSHOT_URL = 'https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot';

const now = () => Date.now();
const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();
const finite = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      ...headers
    }
  });
}

function fixtureId(fixture) {
  return text(fixture?.fixtureId ?? fixture?.id ?? fixture?.fixture_id ?? fixture?.fixture?.id);
}

function fixtureState(fixture) {
  const raw = lower(fixture?.boardState ?? fixture?.status ?? fixture?.statusCode ?? fixture?.status_code);
  if (/finished|full[_ ]?time|ended|\bft\b|aet|penalties|\bpen\b/.test(raw)) return 'finished';
  if (/live|in[_ ]?play|inplay|playing|first|second|half|\b1h\b|\b2h\b/.test(raw)) return 'live';
  return 'upcoming';
}

function kickoffMs(fixture) {
  const raw = fixture?.kickoffAt ?? fixture?.kickoffUtc ?? fixture?.startAt ?? fixture?.start_time ?? fixture?.date ?? fixture?.timestamp ?? null;
  if (raw === null || raw === undefined || raw === '') return Number.MAX_SAFE_INTEGER;
  if (Number.isFinite(Number(raw))) {
    const n = Number(raw);
    return n < 10_000_000_000 ? n * 1000 : n;
  }
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

async function fetchHubSnapshot(env) {
  const url = text(env.HUB_SNAPSHOT_URL) || DEFAULT_HUB_SNAPSHOT_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || typeof j !== 'object' || j.ok !== true) throw new Error(`HUB_SNAPSHOT_HTTP_${r.status}`);
    return j;
  } finally {
    clearTimeout(timer);
  }
}

export class FullMarketHub extends LegacyFullMarketHub {
  constructor(ctx, env) {
    super(ctx, env);
    this.centralSchedulerPromise = null;
  }

  async rememberFixture(fixtureIdValue) {
    const key = text(fixtureIdValue);
    if (!key) return;
    const raw = await this.ctx.storage.get('recentFixtures') || [];
    const next = raw.filter(id => text(id) !== key);
    next.push(key);
    const evicted = next.length > MAX_CENTRAL_FIXTURES ? next.splice(0, next.length - MAX_CENTRAL_FIXTURES) : [];
    if (evicted.length) await this.ctx.storage.delete(evicted.map(id => `fixture:${id}`));
    await this.ctx.storage.put('recentFixtures', next);
  }

  async cachedRecords(ids) {
    const clean = [...new Set((ids || []).map(text).filter(Boolean))];
    if (!clean.length) return new Map();
    const keys = clean.map(id => `fixture:${id}`);
    const rows = await this.ctx.storage.get(keys);
    const out = new Map();
    for (const id of clean) {
      const row = rows instanceof Map ? rows.get(`fixture:${id}`) : null;
      if (row) out.set(id, row);
    }
    return out;
  }

  async cacheOnlyFixture(fixtureIdValue) {
    const id = text(fixtureIdValue);
    if (!id) return { ok: false, version: VERSION, error: 'FIXTURE_ID_REQUIRED' };
    const record = await this.cached(id);
    if (!record?.fullOdds) {
      return { ok: true, version: VERSION, fixtureId: id, cached: false, available: false, source: 'CENTRAL_CACHE_MISS', fullOdds: null, fetchedAt: null, availableBookmakers: [] };
    }
    return {
      ok: true,
      version: VERSION,
      fixtureId: id,
      cached: true,
      available: true,
      source: 'CENTRAL_CACHE_ONLY',
      fullOdds: clone(record.fullOdds),
      fetchedAt: record.fetchedAt ?? null,
      availableBookmakers: Array.isArray(record.availableBookmakers) ? record.availableBookmakers : []
    };
  }

  async cacheSnapshot() {
    const ids = await this.ctx.storage.get('recentFixtures') || [];
    const records = await this.cachedRecords(ids);
    const fixtures = [];
    for (const id of ids) {
      const record = records.get(text(id));
      if (!record?.fullOdds) continue;
      fixtures.push({
        fixtureId: text(id),
        fullOdds: clone(record.fullOdds),
        fetchedAt: record.fetchedAt ?? null,
        availableBookmakers: Array.isArray(record.availableBookmakers) ? record.availableBookmakers : []
      });
    }
    const lastTick = await this.ctx.storage.get('centralLastTick') || null;
    return {
      ok: true,
      component: 'NOMAD343_FULL_MARKET_CENTRAL_CACHE',
      version: VERSION,
      generatedAt: now(),
      fixtureCount: fixtures.length,
      providerCallsTriggeredByViewer: 0,
      schedulerMaxProviderCallsPerMinute: SCHEDULER_MAX_PROVIDER_CALLS,
      liveTtlMs: LIVE_TTL_MS,
      upcomingTtlMs: UPCOMING_TTL_MS,
      lastTick,
      fixtures
    };
  }

  async schedulerTick() {
    if (this.centralSchedulerPromise) return this.centralSchedulerPromise;
    this.centralSchedulerPromise = this.runSchedulerTick().finally(() => { this.centralSchedulerPromise = null; });
    return this.centralSchedulerPromise;
  }

  async runSchedulerTick() {
    const startedAt = now();
    let hub;
    try {
      hub = await fetchHubSnapshot(this.env);
    } catch (error) {
      const summary = { ok: false, version: VERSION, startedAt, finishedAt: now(), error: String(error?.message || error), providerCalls: 0 };
      await this.ctx.storage.put('centralLastTick', summary);
      return summary;
    }

    const fixtures = Array.isArray(hub.fixtures) ? hub.fixtures : [];
    const active = fixtures.map(f => ({ fixture: f, id: fixtureId(f), state: fixtureState(f), kickoff: kickoffMs(f) })).filter(x => x.id && x.state !== 'finished');
    const ids = active.map(x => x.id);
    const records = await this.cachedRecords(ids);
    const at = now();

    const due = active.filter(item => {
      const record = records.get(item.id);
      const age = record?.fetchedAt ? Math.max(0, at - Number(record.fetchedAt)) : Number.POSITIVE_INFINITY;
      return age >= (item.state === 'live' ? LIVE_TTL_MS : UPCOMING_TTL_MS);
    });

    due.sort((a, b) => {
      if (a.state !== b.state) return a.state === 'live' ? -1 : 1;
      const ar = records.get(a.id), br = records.get(b.id);
      const aa = ar?.fetchedAt ? Number(ar.fetchedAt) : 0;
      const ba = br?.fetchedAt ? Number(br.fetchedAt) : 0;
      if (a.state === 'live' && aa !== ba) return aa - ba;
      if (a.state === 'upcoming' && a.kickoff !== b.kickoff) return a.kickoff - b.kickoff;
      return aa - ba;
    });

    const control = await this.control();
    const rateTimes = await this.rateState(at);
    const remainingSoft = Math.max(0, Number(control.softLimitPerMinute || 0) - rateTimes.length);
    const allowance = Math.min(SCHEDULER_MAX_PROVIDER_CALLS, remainingSoft, due.length);
    const selected = due.slice(0, allowance);
    const results = [];

    for (const item of selected) {
      const previous = records.get(item.id) || null;
      try {
        const result = await this.freshFixture(item.id, previous, control, 'CENTRAL_SCHEDULER');
        results.push({ fixtureId: item.id, state: item.state, ok: true, cached: Boolean(result?.cached), limited: Boolean(result?.limited), source: result?.source ?? null });
      } catch (error) {
        const status = finite(error?.status);
        results.push({ fixtureId: item.id, state: item.state, ok: false, status, error: String(error?.message || error) });
        if (status === 429) break;
      }
    }

    const providerCalls = results.filter(x => x.ok && !x.cached && !x.limited).length;
    const summary = {
      ok: true,
      version: VERSION,
      startedAt,
      finishedAt: now(),
      hubVersion: hub.version ?? null,
      catalogFixtures: fixtures.length,
      activeFixtures: active.length,
      dueFixtures: due.length,
      selectedFixtures: selected.length,
      providerCalls,
      softLimitPerMinute: control.softLimitPerMinute,
      usedBeforeTick: rateTimes.length,
      results
    };
    await this.ctx.storage.put('centralLastTick', summary);
    return summary;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/cache-snapshot') return json(await this.cacheSnapshot());
    if (request.method === 'GET' && url.pathname === '/fixture-odds-cache') return json(await this.cacheOnlyFixture(url.searchParams.get('fixtureId')));
    if (request.method === 'POST' && url.pathname === '/scheduler-tick') return json(await this.schedulerTick());
    if (request.method === 'GET' && url.pathname === '/central-health') {
      const snapshot = await this.cacheSnapshot();
      return json({ ok: true, component: 'NOMAD343_FULL_MARKET_CENTRAL', version: VERSION, fixtureCount: snapshot.fixtureCount, lastTick: snapshot.lastTick, viewerProviderCalls: 0 });
    }
    return super.fetch(request);
  }
}

function stub(env) {
  const id = env.FULL_MARKET.idFromName('global');
  return env.FULL_MARKET.get(id);
}

export default {
  async fetch(request, env) {
    return legacyDefault.fetch(request, env);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(stub(env).fetch('https://full-market.internal/scheduler-tick', { method: 'POST' }));
  }
};
