import legacyWorker, { FullMarketHub as LegacyFullMarketHub } from './index.js';

const VERSION = 'nomad343-full-market-v4-account-orchestrator';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const HUB_SNAPSHOT_URL = 'https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot';
const HUB_HEALTH_URL = 'https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/health';
const ENGINE_HEALTH_URL = 'https://nomadtips3-engine-343.mccarey-supon.workers.dev/health';

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
const ACCOUNT_RESERVE = 4;
const ACCOUNT_GUARD_PER_MIN = ACCOUNT_RATE_LIMIT_PER_MIN - ACCOUNT_RESERVE;
const RATE_WINDOW_MS = 60_000;
const STALE_MS = 5 * 60_000;
const EXTERNAL_STATE_TTL_MS = 2_000;
const HUB_SNAPSHOT_TTL_MS = 15_000;
const PROVIDER_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_AFTER_SECONDS = 3;

const now = () => Date.now();
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const normalized = value => String(value ?? '').toLowerCase().replace(/[\s_-]/g, '');

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
  if (!found.size && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const book of BOOKMAKERS) {
      const direct = payload?.[book.slug] ?? payload?.data?.[book.slug];
      if (direct && typeof direct === 'object') found.add(book.slug);
    }
  }
  return BOOKMAKERS.filter(x => found.has(x.slug)).map(x => x.slug);
}

async function fetchJson(url, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== 'object') {
      throw new Error(`HTTP_${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function providerRateHint(response) {
  const remaining = num(
    response.headers.get('x-ratelimit-remaining') ??
    response.headers.get('ratelimit-remaining')
  );
  const limit = num(
    response.headers.get('x-ratelimit-limit') ??
    response.headers.get('ratelimit-limit')
  );
  const resetRaw =
    response.headers.get('x-ratelimit-reset') ??
    response.headers.get('ratelimit-reset');
  const retryAfter = num(response.headers.get('retry-after'));
  let resetAt = null;
  const reset = num(resetRaw);
  if (reset !== null) {
    resetAt = reset > 10_000_000_000 ? reset : reset > 1_000_000_000 ? reset * 1000 : now() + reset * 1000;
  }
  return {
    observedAt: now(),
    remaining,
    limit,
    resetAt,
    retryAfter
  };
}

export class FullMarketHub extends LegacyFullMarketHub {
  constructor(ctx, env) {
    super(ctx, env);
    this.queueTail = Promise.resolve();
    this.externalStateCache = null;
    this.externalStatePromise = null;
    this.hubSnapshotCache = null;
    this.hubSnapshotPromise = null;
  }

  async externalAccountState(force = false) {
    const at = now();
    if (!force && this.externalStateCache && at - this.externalStateCache.at < EXTERNAL_STATE_TTL_MS) {
      return this.externalStateCache.value;
    }
    if (this.externalStatePromise) return this.externalStatePromise;

    this.externalStatePromise = (async () => {
      const settled = await Promise.allSettled([
        fetchJson(HUB_HEALTH_URL, 4_000),
        fetchJson(ENGINE_HEALTH_URL, 4_000)
      ]);
      const hub = settled[0].status === 'fulfilled' ? settled[0].value : null;
      const engine = settled[1].status === 'fulfilled' ? settled[1].value : null;
      const timestamp = now();

      const hubFetchedAt = num(hub?.fetchedAt);
      const hubUsed = hubFetchedAt !== null && timestamp - hubFetchedAt < RATE_WINDOW_MS
        ? Math.max(0, Math.round(num(hub?.providerRequestCount) ?? 0))
        : 0;

      const engineFinishedAt = num(engine?.finishedAt);
      const engineUsed = engineFinishedAt !== null && timestamp - engineFinishedAt < RATE_WINDOW_MS
        ? Math.max(0, Math.round(num(engine?.refereeRequests) ?? 0))
        : 0;

      const value = {
        at: timestamp,
        hubOnline: Boolean(hub),
        engineOnline: Boolean(engine),
        hubUsed,
        engineUsed,
        observedExternalUsed: hubUsed + engineUsed,
        hubFetchedAt,
        engineFinishedAt
      };
      this.externalStateCache = { at: timestamp, value };
      return value;
    })().finally(() => {
      this.externalStatePromise = null;
    });

    return this.externalStatePromise;
  }

  async hubSnapshot(force = false) {
    const at = now();
    if (!force && this.hubSnapshotCache && at - this.hubSnapshotCache.at < HUB_SNAPSHOT_TTL_MS) {
      return this.hubSnapshotCache.value;
    }
    if (this.hubSnapshotPromise) return this.hubSnapshotPromise;

    this.hubSnapshotPromise = (async () => {
      const payload = await fetchJson(HUB_SNAPSHOT_URL, 8_000);
      const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
      const byId = new Map();
      for (const fixture of fixtures) {
        const id = String(fixture?.fixtureId ?? '').trim();
        if (id) byId.set(id, fixture);
      }
      const value = {
        ok: payload?.ok === true,
        fetchedAt: num(payload?.fetchedAt),
        ageMs: num(payload?.ageMs),
        stale: Boolean(payload?.stale),
        fixtureCount: fixtures.length,
        providerRequestCount: num(payload?.providerRequestCount),
        byId
      };
      this.hubSnapshotCache = { at: now(), value };
      return value;
    })().finally(() => {
      this.hubSnapshotPromise = null;
    });

    return this.hubSnapshotPromise;
  }

  async hubOdds(fixtureId) {
    try {
      const snapshot = await this.hubSnapshot(false);
      const fixture = snapshot.byId.get(String(fixtureId));
      const fullOdds = fixture?.providerOdds;
      if (!fullOdds || typeof fullOdds !== 'object') return null;
      return {
        fullOdds: clone(fullOdds),
        fetchedAt: snapshot.fetchedAt ?? now(),
        stale: Boolean(snapshot.stale),
        availableBookmakers: availableBookmakers(fullOdds),
        fixture
      };
    } catch {
      return null;
    }
  }

  async providerHint() {
    return await this.ctx.storage.get('providerRateHint') || null;
  }

  async accountBudget(control, at = now()) {
    const [times, external, hint, blockedUntilRaw] = await Promise.all([
      this.rateState(at),
      this.externalAccountState(false),
      this.providerHint(),
      this.ctx.storage.get('providerBlockedUntil')
    ]);

    const blockedUntil = num(blockedUntilRaw);
    const localUsed = times.length;
    const trackedUsed = localUsed + Number(external?.observedExternalUsed || 0);
    const sidecarRemaining = Math.max(0, Number(control.softLimitPerMinute || 0) - localUsed);
    const trackedAccountRemaining = Math.max(0, ACCOUNT_GUARD_PER_MIN - trackedUsed);

    let providerRemaining = num(hint?.remaining);
    const hintObservedAt = num(hint?.observedAt);
    if (hintObservedAt !== null && at - hintObservedAt >= RATE_WINDOW_MS) providerRemaining = null;
    if (hint?.resetAt && num(hint.resetAt) !== null && at >= Number(hint.resetAt)) providerRemaining = null;

    let ok = true;
    let reason = null;
    let retryAfter = null;

    if (blockedUntil !== null && at < blockedUntil) {
      ok = false;
      reason = 'PROVIDER_BACKOFF';
      retryAfter = Math.max(1, Math.ceil((blockedUntil - at) / 1000));
    } else if (localUsed >= Number(control.softLimitPerMinute || 0)) {
      ok = false;
      reason = 'FULL_MARKET_SOFT_RATE_LIMIT';
      retryAfter = DEFAULT_RETRY_AFTER_SECONDS;
    } else if (trackedUsed >= ACCOUNT_GUARD_PER_MIN) {
      ok = false;
      reason = 'ACCOUNT_RATE_GUARD';
      retryAfter = DEFAULT_RETRY_AFTER_SECONDS;
    } else if (providerRemaining !== null && providerRemaining <= ACCOUNT_RESERVE) {
      ok = false;
      reason = 'PROVIDER_REMAINING_GUARD';
      retryAfter = hint?.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS;
    }

    return {
      ok,
      reason,
      retryAfter,
      localUsed,
      trackedUsed,
      observedExternalUsed: Number(external?.observedExternalUsed || 0),
      sidecarRemaining,
      trackedAccountRemaining,
      providerRemaining,
      external,
      hint
    };
  }

  async consumeProviderBudget(control, at = now()) {
    const budget = await this.accountBudget(control, at);
    if (!budget.ok) return { ok: false, used: budget.localUsed, ...budget };

    const times = await this.rateState(at);
    times.push(at);
    await this.ctx.storage.put('providerRequestTimes', times);
    return {
      ok: true,
      used: times.length,
      ...budget,
      localUsed: times.length,
      trackedUsed: budget.trackedUsed + 1,
      sidecarRemaining: Math.max(0, Number(control.softLimitPerMinute || 0) - times.length),
      trackedAccountRemaining: Math.max(0, ACCOUNT_GUARD_PER_MIN - (budget.trackedUsed + 1))
    };
  }

  minGapMs(control) {
    const perMinute = Math.max(1, Math.min(Number(control.softLimitPerMinute || 1), ACCOUNT_GUARD_PER_MIN));
    return Math.ceil(RATE_WINDOW_MS / perMinute);
  }

  async waitForProviderGap(control) {
    const lastAt = num(await this.ctx.storage.get('lastProviderRequestAt'));
    if (lastAt === null) return;
    const waitMs = this.minGapMs(control) - (now() - lastAt);
    if (waitMs > 0) await sleep(waitMs);
  }

  enqueueProvider(task) {
    const run = this.queueTail.then(task, task);
    this.queueTail = run.catch(() => null);
    return run;
  }

  async providerFetch(fixtureId) {
    if (!this.env.FIVEDOLLAR_API_KEY) {
      throw Object.assign(new Error('FIVEDOLLAR_API_KEY_MISSING'), { status: 500 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    const url = `${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=${encodeURIComponent(BOOKMAKER_QUERY)}`;

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.env.FIVEDOLLAR_API_KEY}`
        }
      });

      const hint = providerRateHint(response);
      await this.ctx.storage.put('providerRateHint', hint);

      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch {}

      if (!response.ok) {
        if (response.status === 429) {
          const seconds = hint.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS;
          await this.ctx.storage.put('providerBlockedUntil', now() + Math.max(1, seconds) * 1000);
        }
        const error = new Error(`5USD_FULL_MARKET_HTTP_${response.status}`);
        error.status = response.status;
        error.retryAfter = hint.retryAfter;
        error.providerBody = payload ?? text.slice(0, 300);
        throw error;
      }

      if (!payload || typeof payload !== 'object') {
        throw Object.assign(new Error('5USD_FULL_MARKET_SHAPE'), { status: 502 });
      }

      await this.ctx.storage.delete('providerBlockedUntil');
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('5USD_FULL_MARKET_TIMEOUT'), { status: 504 });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  rateMeta(control, usedInWindow, extra = {}) {
    return {
      accountLimitPerMinute: ACCOUNT_RATE_LIMIT_PER_MIN,
      accountGuardPerMinute: ACCOUNT_GUARD_PER_MIN,
      accountReserve: ACCOUNT_RESERVE,
      sidecarSoftLimitPerMinute: control.softLimitPerMinute,
      usedInWindow,
      orchestrated: true,
      burstFriendly: false,
      ...extra
    };
  }

  stalePayload(fixtureId, previous, control, source, extra = {}) {
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
      limited: Boolean(extra.limited),
      refreshing: Boolean(extra.refreshing),
      queued: Boolean(extra.queued),
      source,
      control,
      rate: this.rateMeta(control, extra.usedInWindow ?? 0, extra.rate || {}),
      ...(extra.refreshError ? { refreshError: extra.refreshError } : {}),
      ...(extra.retryAfter !== undefined ? { retryAfter: extra.retryAfter } : {})
    };
  }

  bulkPayload(fixtureId, bulk, control, extra = {}) {
    return {
      ok: true,
      fixtureId,
      version: VERSION,
      fullOdds: clone(bulk.fullOdds),
      fetchedAt: bulk.fetchedAt,
      requestedBookmakers: BOOKMAKERS,
      availableBookmakers: bulk.availableBookmakers || availableBookmakers(bulk.fullOdds),
      cached: true,
      stale: Boolean(bulk.stale),
      limited: Boolean(extra.limited),
      refreshing: Boolean(extra.refreshing),
      queued: Boolean(extra.queued),
      source: 'FULL_MARKET_BULK_HUB_CACHE',
      control,
      rate: this.rateMeta(control, extra.usedInWindow ?? 0, extra.rate || {})
    };
  }

  async freshFixtureNow(fixtureId, previous, control, source = '5USD_ULTRA_10BOOK') {
    const requestAt = now();

    await this.waitForProviderGap(control);
    const budget = await this.consumeProviderBudget(control, now());

    if (!budget.ok) {
      await this.recordTelemetry({
        at: now(),
        kind: 'soft_guard',
        source,
        fixtureId,
        status: 429,
        note: budget.reason || 'FULL_MARKET_RATE_GUARD'
      });

      const staleAge = previous?.fetchedAt ? now() - Number(previous.fetchedAt) : null;
      if (previous?.fullOdds && staleAge !== null && staleAge <= STALE_MS) {
        return this.stalePayload(fixtureId, previous, control, 'FULL_MARKET_STALE_ACCOUNT_GUARD', {
          limited: true,
          usedInWindow: budget.localUsed,
          retryAfter: budget.retryAfter,
          rate: {
            trackedAccountUsed: budget.trackedUsed,
            observedExternalUsed: budget.observedExternalUsed,
            providerRemaining: budget.providerRemaining,
            guardReason: budget.reason
          }
        });
      }

      const bulk = await this.hubOdds(fixtureId);
      if (bulk?.fullOdds) {
        return this.bulkPayload(fixtureId, bulk, control, {
          limited: true,
          usedInWindow: budget.localUsed,
          rate: {
            trackedAccountUsed: budget.trackedUsed,
            observedExternalUsed: budget.observedExternalUsed,
            providerRemaining: budget.providerRemaining,
            guardReason: budget.reason
          }
        });
      }

      const error = new Error(budget.reason || 'FULL_MARKET_RATE_GUARD');
      error.status = 429;
      error.retryAfter = budget.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS;
      throw error;
    }

    try {
      await this.ctx.storage.put('lastProviderRequestAt', now());
      const fullOdds = await this.providerFetch(fixtureId);
      await this.recordTelemetry({
        at: requestAt,
        kind: 'provider',
        source,
        fixtureId,
        status: 200,
        note: 'ORCHESTRATED_QUEUE'
      });

      const fetchedAt = now();
      const record = {
        fullOdds: clone(fullOdds),
        fetchedAt,
        availableBookmakers: availableBookmakers(fullOdds)
      };
      await this.ctx.storage.put(`fixture:${fixtureId}`, record);
      await this.rememberFixture(fixtureId);

      const currentBudget = await this.accountBudget(control, now());
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
        refreshing: false,
        queued: false,
        source,
        control,
        rate: this.rateMeta(control, currentBudget.localUsed, {
          trackedAccountUsed: currentBudget.trackedUsed,
          observedExternalUsed: currentBudget.observedExternalUsed,
          providerRemaining: currentBudget.providerRemaining
        })
      };
    } catch (error) {
      await this.recordTelemetry({
        at: requestAt,
        kind: 'provider',
        source,
        fixtureId,
        status: num(error?.status) ?? 502,
        note: String(error?.message || error)
      });

      const staleAge = previous?.fetchedAt ? now() - Number(previous.fetchedAt) : null;
      if (previous?.fullOdds && staleAge !== null && staleAge <= STALE_MS) {
        const currentBudget = await this.accountBudget(control, now());
        return this.stalePayload(fixtureId, previous, control, 'FULL_MARKET_STALE_PROVIDER_FALLBACK', {
          limited: Number(error?.status) === 429,
          usedInWindow: currentBudget.localUsed,
          refreshError: String(error?.message || error),
          retryAfter: num(error?.retryAfter),
          rate: {
            trackedAccountUsed: currentBudget.trackedUsed,
            observedExternalUsed: currentBudget.observedExternalUsed,
            providerRemaining: currentBudget.providerRemaining
          }
        });
      }

      const bulk = await this.hubOdds(fixtureId);
      if (bulk?.fullOdds) {
        const currentBudget = await this.accountBudget(control, now());
        return this.bulkPayload(fixtureId, bulk, control, {
          limited: Number(error?.status) === 429,
          usedInWindow: currentBudget.localUsed,
          rate: {
            trackedAccountUsed: currentBudget.trackedUsed,
            observedExternalUsed: currentBudget.observedExternalUsed,
            providerRemaining: currentBudget.providerRemaining
          }
        });
      }

      throw error;
    }
  }

  queueFixtureRefresh(fixtureId, previous, control, source) {
    const key = String(fixtureId);
    if (this.inflight.has(key)) return this.inflight.get(key);

    const task = this.enqueueProvider(() =>
      this.freshFixtureNow(key, previous, control, source)
    ).finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, task);
    return task;
  }

  backgroundRefresh(fixtureId, previous, control, source) {
    const task = this.queueFixtureRefresh(fixtureId, previous, control, source);
    if (typeof this.ctx.waitUntil === 'function') {
      this.ctx.waitUntil(task.catch(() => null));
    }
    return task;
  }

  async fixtureOdds(fixtureId) {
    const control = await this.control();
    const cached = await this.cached(fixtureId);
    const age = cached?.fetchedAt ? Math.max(0, now() - Number(cached.fetchedAt)) : null;
    const freshWindowMs = Math.max(control.refreshSeconds, control.workerCacheSeconds) * 1000;

    if (cached?.fullOdds && age !== null && age <= freshWindowMs) {
      const budget = await this.accountBudget(control, now());
      await this.recordTelemetry({
        kind: 'cache',
        source: 'FULL_MARKET_DETAIL_CACHE',
        fixtureId,
        status: 200
      });
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
        refreshing: false,
        queued: false,
        source: 'FULL_MARKET_DETAIL_CACHE',
        control,
        rate: this.rateMeta(control, budget.localUsed, {
          trackedAccountUsed: budget.trackedUsed,
          observedExternalUsed: budget.observedExternalUsed,
          providerRemaining: budget.providerRemaining
        })
      };
    }

    if (cached?.fullOdds && age !== null && age <= STALE_MS) {
      const budget = await this.accountBudget(control, now());
      this.backgroundRefresh(fixtureId, cached, control, '5USD_ULTRA_10BOOK');
      await this.recordTelemetry({
        kind: 'cache',
        source: 'FULL_MARKET_STALE_WHILE_REFRESH',
        fixtureId,
        status: 200
      });
      return this.stalePayload(fixtureId, cached, control, 'FULL_MARKET_STALE_WHILE_REFRESH', {
        refreshing: true,
        queued: true,
        usedInWindow: budget.localUsed,
        rate: {
          trackedAccountUsed: budget.trackedUsed,
          observedExternalUsed: budget.observedExternalUsed,
          providerRemaining: budget.providerRemaining
        }
      });
    }

    const bulk = await this.hubOdds(fixtureId);
    if (bulk?.fullOdds) {
      const budget = await this.accountBudget(control, now());
      this.backgroundRefresh(fixtureId, cached, control, '5USD_ULTRA_10BOOK');
      await this.recordTelemetry({
        kind: 'cache',
        source: 'FULL_MARKET_BULK_HUB_CACHE',
        fixtureId,
        status: 200
      });
      return this.bulkPayload(fixtureId, bulk, control, {
        refreshing: true,
        queued: true,
        usedInWindow: budget.localUsed,
        rate: {
          trackedAccountUsed: budget.trackedUsed,
          observedExternalUsed: budget.observedExternalUsed,
          providerRemaining: budget.providerRemaining
        }
      });
    }

    return this.queueFixtureRefresh(fixtureId, cached, control, '5USD_ULTRA_10BOOK');
  }

  async eventRefresh(fixtureId) {
    const control = await this.control();

    if (!control.eventTrigger) {
      const budget = await this.accountBudget(control, now());
      return {
        ok: true,
        fixtureId,
        version: VERSION,
        skipped: true,
        reason: 'EVENT_TRIGGER_OFF',
        control,
        rate: this.rateMeta(control, budget.localUsed, {
          trackedAccountUsed: budget.trackedUsed,
          observedExternalUsed: budget.observedExternalUsed,
          providerRemaining: budget.providerRemaining
        })
      };
    }

    const previous = await this.cached(fixtureId);
    return this.queueFixtureRefresh(fixtureId, previous, control, '5USD_ULTRA_EVENT_TRIGGER');
  }

  async settingsResponse() {
    const base = await super.settingsResponse();
    const budget = await this.accountBudget(base.control, now());
    return {
      ...base,
      version: VERSION,
      usedInWindow: budget.localUsed,
      accountLimitPerMinute: ACCOUNT_RATE_LIMIT_PER_MIN,
      accountGuardPerMinute: ACCOUNT_GUARD_PER_MIN,
      accountReserve: ACCOUNT_RESERVE,
      account: {
        trackedUsed: budget.trackedUsed,
        observedExternalUsed: budget.observedExternalUsed,
        trackedRemainingBeforeGuard: budget.trackedAccountRemaining,
        providerRemaining: budget.providerRemaining,
        guardReason: budget.reason
      }
    };
  }

  async health() {
    const base = await super.health();
    const budget = await this.accountBudget(base.control, now());
    return {
      ...base,
      version: VERSION,
      orchestration: {
        mode: 'BULK_FIRST_DETAIL_QUEUE',
        bulkSource: '5USD_HUB_SNAPSHOT',
        detailSource: 'FIXTURE_ODDS_10BOOK',
        globalQueue: true,
        oneProviderRequestAtATime: true,
        minGapMs: this.minGapMs(base.control),
        accountGuardPerMinute: ACCOUNT_GUARD_PER_MIN,
        accountReserve: ACCOUNT_RESERVE
      },
      rate: this.rateMeta(base.control, budget.localUsed, {
        trackedAccountUsed: budget.trackedUsed,
        observedExternalUsed: budget.observedExternalUsed,
        providerRemaining: budget.providerRemaining,
        guardReason: budget.reason
      })
    };
  }

  async monitor() {
    const base = await super.monitor();
    const control = await this.control();
    const budget = await this.accountBudget(control, now());
    return {
      ...base,
      version: VERSION,
      total: {
        ...(base.total || {}),
        tracked60s: budget.trackedUsed,
        remainingBefore40AtLeast: Math.max(0, ACCOUNT_RATE_LIMIT_PER_MIN - budget.trackedUsed),
        remainingBeforeGuard: budget.trackedAccountRemaining
      },
      controller: {
        mode: 'BULK_FIRST_DETAIL_QUEUE',
        globalQueue: true,
        oneProviderRequestAtATime: true,
        minGapMs: this.minGapMs(control),
        accountGuardPerMinute: ACCOUNT_GUARD_PER_MIN,
        accountReserve: ACCOUNT_RESERVE,
        localFullMarketUsed60s: budget.localUsed,
        observedExternalUsed60s: budget.observedExternalUsed,
        trackedAccountUsed60s: budget.trackedUsed,
        providerRemaining: budget.providerRemaining,
        guardReason: budget.reason
      },
      coverage: {
        ...(base.coverage || {}),
        fullMarketExact: true,
        bulkCacheReusedByFullMarket: true,
        note: 'Full Market now reuses HUB bulk odds first and serializes 10-book detail requests. Other shared-key consumers remain observed, not rewritten.'
      }
    };
  }
}

export default legacyWorker;
