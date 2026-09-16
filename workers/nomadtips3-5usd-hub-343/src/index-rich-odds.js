import base, { FiveUsdHub } from './index-v2.js';
export { FiveUsdHub };

const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const ACCOUNT_LIMIT_PER_MINUTE = 40;
const RICH_CACHE_MS = 20_000;
const RICH_MAX_PROVIDER_CALLS_PER_MINUTE = 15;
const RESERVED_HEADROOM_PER_MINUTE = 8;
const TIMEOUT_MS = 15_000;
const now = () => Date.now();
const finite = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);

function response(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra
    }
  });
}

function safeFixtureId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,96}$/.test(id) ? id : null;
}

async function hubHealth(env) {
  try {
    const stub = env.HUB.get(env.HUB.idFromName('global'));
    const r = await stub.fetch('https://hub.internal/health');
    const j = await r.json();
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

async function providerJson(url, key) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      signal: ac.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${key}`
      }
    });
    const text = await r.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    if (!r.ok) {
      const err = new Error(`provider:HTTP_${r.status}`);
      err.status = r.status;
      err.retryAfter = finite(r.headers.get('retry-after'));
      err.payload = payload;
      throw err;
    }
    if (!payload || typeof payload !== 'object') throw new Error('provider:INVALID_JSON');
    return {
      payload,
      rateLimitLimit: finite(r.headers.get('x-ratelimit-limit')),
      rateLimitRemaining: finite(r.headers.get('x-ratelimit-remaining')),
      rateLimitReset: finite(r.headers.get('x-ratelimit-reset'))
    };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('provider:TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class RichOddsGate20260916 {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.inflight = new Map();
  }

  async currentBudget() {
    const health = await hubHealth(this.env);
    const bulkRpm = Math.max(0, Number(health?.estimatedBulkRequestsPerMinute || 0));
    const available = Math.max(0, Math.floor(ACCOUNT_LIMIT_PER_MINUTE - bulkRpm - RESERVED_HEADROOM_PER_MINUTE));
    return {
      bulkRpm,
      richBudget: Math.min(RICH_MAX_PROVIDER_CALLS_PER_MINUTE, available),
      accountLimit: ACCOUNT_LIMIT_PER_MINUTE,
      reservedHeadroom: RESERVED_HEADROOM_PER_MINUTE
    };
  }

  async callWindow() {
    const cutoff = now() - 60_000;
    const stored = await this.ctx.storage.get('richProviderCalls');
    const calls = Array.isArray(stored) ? stored.filter(ts => Number(ts) > cutoff) : [];
    return calls;
  }

  async recordCall(calls, at) {
    const next = [...calls, at].slice(-120);
    await this.ctx.storage.put('richProviderCalls', next);
  }

  async loadRich(id) {
    const at = now();
    const cached = await this.ctx.storage.get(`rich:${id}`);
    if (cached?.fetchedAt && at - Number(cached.fetchedAt) < RICH_CACHE_MS && cached?.payload) {
      return {
        ok: true,
        fixtureId: id,
        cache: 'HIT',
        fetchedAt: Number(cached.fetchedAt),
        ageMs: Math.max(0, at - Number(cached.fetchedAt)),
        provider: cached.payload,
        guard: cached.guard || null
      };
    }

    const blockedUntil = finite(await this.ctx.storage.get('richBlockedUntil'));
    if (blockedUntil && at < blockedUntil) {
      const retry = Math.max(1, Math.ceil((blockedUntil - at) / 1000));
      const err = new Error('RICH_ODDS_PROVIDER_BACKOFF');
      err.status = 429;
      err.retryAfter = retry;
      throw err;
    }

    const budget = await this.currentBudget();
    const calls = await this.callWindow();
    if (budget.richBudget <= 0 || calls.length >= budget.richBudget) {
      const oldest = calls[0] || at;
      const retry = Math.max(1, Math.ceil((60_000 - (at - oldest)) / 1000));
      const err = new Error('RICH_ODDS_GUARD');
      err.status = 429;
      err.retryAfter = retry;
      err.guard = { ...budget, richCallsLast60s: calls.length };
      throw err;
    }

    if (!this.env.FIVEDOLLAR_API_KEY) {
      const err = new Error('FIVEDOLLAR_API_KEY_MISSING');
      err.status = 503;
      throw err;
    }

    await this.recordCall(calls, at);
    try {
      const result = await providerJson(`${API_BASE}/fixtures/${encodeURIComponent(id)}/odds`, this.env.FIVEDOLLAR_API_KEY);
      const guard = {
        ...budget,
        richCallsLast60s: calls.length + 1,
        providerRemaining: result.rateLimitRemaining,
        providerLimit: result.rateLimitLimit,
        providerReset: result.rateLimitReset
      };
      const entry = { fetchedAt: now(), payload: result.payload, guard };
      await this.ctx.storage.put(`rich:${id}`, entry);
      return {
        ok: true,
        fixtureId: id,
        cache: 'MISS',
        fetchedAt: entry.fetchedAt,
        ageMs: 0,
        provider: result.payload,
        guard
      };
    } catch (err) {
      if (Number(err?.status) === 429) {
        const retry = Math.max(1, Number(err?.retryAfter || 5));
        await this.ctx.storage.put('richBlockedUntil', now() + retry * 1000);
      }
      throw err;
    }
  }

  async fetch(request) {
    if (request.method !== 'GET') return response({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    const url = new URL(request.url);
    const id = safeFixtureId(url.searchParams.get('fixture_id') || url.searchParams.get('fixtureId') || url.searchParams.get('id'));
    if (!id) return response({ ok: false, error: 'INVALID_FIXTURE_ID' }, 400);

    if (this.inflight.has(id)) return this.inflight.get(id);
    const task = this.loadRich(id)
      .then(body => response(body, 200, { 'x-nomad-rich-cache': body.cache }))
      .catch(err => {
        const status = Number(err?.status || 502);
        const retry = finite(err?.retryAfter);
        return response({
          ok: false,
          fixtureId: id,
          error: String(err?.message || err),
          retryAfterSec: retry,
          guard: err?.guard || null
        }, status, retry ? { 'retry-after': String(retry) } : {});
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, task);
    return task;
  }
}

function richStub(env) {
  return env.RICH_GATE.get(env.RICH_GATE.idFromName('global'));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/rich-odds') {
      const internal = new URL(request.url);
      internal.protocol = 'https:';
      internal.hostname = 'rich-odds.internal';
      internal.pathname = '/rich-odds';
      return richStub(env).fetch(new Request(internal, request));
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    return base.scheduled(event, env, ctx);
  }
};
