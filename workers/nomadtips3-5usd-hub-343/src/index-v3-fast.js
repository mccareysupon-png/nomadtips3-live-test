import baseWorker, { FiveUsdHub as BaseFiveUsdHub } from './index-v2.js';

const FAST_VERSION = 'nomad343-5usd-hub-v5-fast-live-3s';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const FAST_REFRESH_MS = 3_000;
const FAST_STALE_MS = 15_000;
const FAST_WINDOW_MS = 60_000;
const FAST_REQUEST_BUDGET = 20;
const FAST_PAGE_SIZE = 500;
const FAST_TIMEOUT_MS = 10_000;
const RATE_KEY = 'fastLiveRateWindowV1';
const META_KEY = 'fastLiveMetaV1';
const ROWS_KEY = 'fastLiveRowsV1';
const STATE_KEY = 'fastLiveStateV1';

const now = () => Date.now();
const finite = value => value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);
const text = value => value === null || value === undefined ? null : String(value);
const plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function pair(value) {
  if (!value || typeof value !== 'object') return null;
  const home = finite(value.home), away = finite(value.away);
  return home === null && away === null ? null : { home, away };
}
function score(value) {
  if (!value || typeof value !== 'object') return null;
  return { home: finite(value.home), away: finite(value.away), halfHome: finite(value.half_home ?? value.halfHome), halfAway: finite(value.half_away ?? value.halfAway) };
}
function cards(value) {
  if (!value || typeof value !== 'object') return null;
  const side = item => item && typeof item === 'object' ? { yellow: finite(item.yellow), red: finite(item.red) } : null;
  return { home: side(value.home), away: side(value.away) };
}
function team(fixture, side) {
  const root = fixture?.teams?.[side] ?? fixture?.[`${side}_team`] ?? fixture?.[side] ?? {};
  return { id: text(root?.id ?? fixture?.[`${side}_id`] ?? null), name: text(root?.name ?? fixture?.[`${side}_name`] ?? null) };
}
function league(fixture) {
  const root = fixture?.league ?? fixture?.competition ?? {};
  return { id: text(root?.id ?? fixture?.league_id ?? fixture?.competition_id ?? null), name: text(root?.name ?? fixture?.league_name ?? fixture?.competition_name ?? null), country: text(root?.country?.name ?? root?.country ?? fixture?.country ?? null) };
}
function statistics(root) {
  if (!root || typeof root !== 'object') return null;
  const out = {
    attacks: pair(root.attacks),
    dangerousAttacks: pair(root.dangerous_attacks ?? root.dangerousAttacks),
    shotsOnTarget: pair(root.shots_on_target ?? root.shotsOnTarget),
    shotsOffTarget: pair(root.shots_off_target ?? root.shotsOffTarget),
    possession: pair(root.possession),
  };
  if (!Object.values(out).some(Boolean)) return null;
  const half = root.first_half ?? root.half;
  out.half = half && typeof half === 'object' ? {
    attacks: pair(half.attacks),
    dangerousAttacks: pair(half.dangerous_attacks ?? half.dangerousAttacks),
    shotsOnTarget: pair(half.shots_on_target ?? half.shotsOnTarget),
    shotsOffTarget: pair(half.shots_off_target ?? half.shotsOffTarget),
    possession: pair(half.possession),
  } : null;
  return out;
}
function fixtureId(fixture) { return text(fixture?.id ?? fixture?.fixture_id ?? fixture?.fixture?.id ?? null); }
function kickoffUtc(fixture) { return text(fixture?.kickoff_utc ?? fixture?.kickoffUtc ?? fixture?.start_time ?? fixture?.kickoff ?? fixture?.date ?? null); }
function boardState(status, statusCode) {
  const value = `${status || ''} ${statusCode || ''}`.toLowerCase();
  if (/unknown/.test(value)) return 'unknown';
  if (/finished|full_time|full time|\bft\b|ended|\bfull\b/.test(value)) return 'finished';
  if (/in_play|in play|live|half/.test(value) || /^\d+$/.test(String(statusCode || ''))) return 'live';
  return 'scheduled';
}
function providerOddsRaw(fixture) {
  const out = {};
  if (fixture?.bookmakers !== undefined && fixture?.bookmakers !== null) out.bookmakers = fixture.bookmakers;
  if (fixture?.bet365 !== undefined && fixture?.bet365 !== null) out.bet365 = fixture.bet365;
  if (fixture?.markets !== undefined && fixture?.markets !== null) out.markets = fixture.markets;
  if (fixture?.odds !== undefined && fixture?.odds !== null) out.odds = fixture.odds;
  return Object.keys(out).length ? out : null;
}
function normalizeFastFixture(fixture, observedAt) {
  const id = fixtureId(fixture);
  const status = text(fixture?.status?.name ?? fixture?.status ?? null);
  const statusCode = text(fixture?.status_code ?? fixture?.status?.code ?? fixture?.status?.short ?? null);
  const kickoff = kickoffUtc(fixture);
  const odds = providerOddsRaw(fixture);
  return {
    fixtureId: id,
    league: league(fixture),
    home: team(fixture, 'home'),
    away: team(fixture, 'away'),
    kickoffUtc: kickoff,
    kickoffAt: kickoff && Number.isFinite(Date.parse(kickoff)) ? Date.parse(kickoff) : finite(fixture?.kickoff_ts ?? fixture?.start_time) ? finite(fixture?.kickoff_ts ?? fixture?.start_time) * 1000 : null,
    status,
    statusReason: text(fixture?.status_reason ?? fixture?.status?.reason ?? null),
    statusCode,
    boardState: boardState(status, statusCode),
    minute: finite(fixture?.minute ?? fixture?.elapsed ?? fixture?.status?.minute ?? fixture?.status?.elapsed ?? statusCode),
    goals: score(fixture?.goals ?? fixture?.score),
    corners: score(fixture?.corners),
    cards: cards(fixture?.cards),
    statistics: statistics(fixture?.statistics ?? fixture?.stats ?? null),
    events: Array.isArray(fixture?.events) ? fixture.events : null,
    providerOdds: odds,
    providerOddsUpdatedAt: odds ? observedAt : null,
  };
}
function deepKeep(base, extra) {
  if (extra === null || extra === undefined) return base;
  if (base === null || base === undefined) return extra;
  if (Array.isArray(base) || Array.isArray(extra)) return Array.isArray(extra) && extra.length ? extra : base;
  if (plainObject(base) && plainObject(extra)) {
    const out = { ...base };
    for (const [key, value] of Object.entries(extra)) out[key] = deepKeep(out[key], value);
    return out;
  }
  return extra;
}
function mergeFixture(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  return deepKeep(base, extra);
}
function extractFixtures(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  return [];
}
function hasMore(payload) {
  const page = payload?.pagination ?? payload?.meta?.pagination ?? payload?.meta ?? {};
  const raw = page?.has_more ?? page?.hasMore ?? payload?.has_more ?? payload?.hasMore ?? false;
  return raw === true || raw === 1 || raw === '1' || raw === 'true';
}

export class FiveUsdHub extends BaseFiveUsdHub {
  constructor(ctx, env) {
    super(ctx, env);
    this.fastLivePromise = null;
  }

  async reserveFastRequest() {
    const at = now();
    let result = null;
    await this.ctx.storage.transaction(async tx => {
      const rows = ((await tx.get(RATE_KEY)) || []).filter(ts => at - Number(ts) < FAST_WINDOW_MS);
      if (rows.length >= FAST_REQUEST_BUDGET) {
        const waitMs = Math.max(250, FAST_WINDOW_MS - (at - Number(rows[0] || at)));
        result = { ok: false, used: rows.length, retryAfterMs: waitMs };
        await tx.put(RATE_KEY, rows);
        return;
      }
      rows.push(at);
      await tx.put(RATE_KEY, rows);
      result = { ok: true, used: rows.length, retryAfterMs: 0 };
    });
    if (!result?.ok) {
      const error = new Error('FAST_LIVE_RATE_GUARD');
      error.code = 'FAST_LIVE_RATE_GUARD';
      error.retryAfterMs = result?.retryAfterMs ?? FAST_REFRESH_MS;
      throw error;
    }
    return result;
  }

  async fastRateStats() {
    const at = now();
    const rows = ((await this.ctx.storage.get(RATE_KEY)) || []).filter(ts => at - Number(ts) < FAST_WINDOW_MS);
    return { usedLast60s: rows.length, internalCeiling: FAST_REQUEST_BUDGET, providerCeiling: 40 };
  }

  async fetchFastLive() {
    if (!this.env.FIVEDOLLAR_API_KEY) throw new Error('provider:FIVEDOLLAR_API_KEY_MISSING');
    await this.reserveFastRequest();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FAST_TIMEOUT_MS);
    try {
      const url = `${API_BASE}/fixtures?status=live&include=odds,events,stats&per_page=${FAST_PAGE_SIZE}&page=1`;
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json', authorization: `Bearer ${this.env.FIVEDOLLAR_API_KEY}` } });
      const raw = await response.text();
      let payload = null;
      try { payload = JSON.parse(raw); } catch {}
      if (!response.ok) {
        const error = new Error(`provider:HTTP_${response.status}`);
        error.status = response.status;
        throw error;
      }
      if (!payload || typeof payload !== 'object') throw new Error('provider:INVALID_JSON');
      const fetchedAt = now();
      const rows = extractFixtures(payload).map(row => normalizeFastFixture(row, fetchedAt)).filter(row => row.fixtureId);
      return { fetchedAt, rows, rawCount: rows.length, truncated: hasMore(payload) };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('provider:TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async refreshFastLiveIfDue(baseSnapshot = null) {
    const meta = await this.ctx.storage.get(META_KEY) || null;
    const baseFresh = baseSnapshot?.fetchedAt && now() - Number(baseSnapshot.fetchedAt) < FAST_REFRESH_MS;
    if (baseFresh) return meta;
    if (meta?.fetchedAt && now() - Number(meta.fetchedAt) < FAST_REFRESH_MS) return meta;
    if (this.fastLivePromise) return this.fastLivePromise;
    this.fastLivePromise = (async () => {
      const attemptAt = now();
      try {
        const result = await this.fetchFastLive();
        const nextMeta = { version: FAST_VERSION, fetchedAt: result.fetchedAt, fixtureCount: result.rows.length, truncated: result.truncated, refreshMs: FAST_REFRESH_MS };
        await this.ctx.storage.put(ROWS_KEY, result.rows);
        await this.ctx.storage.put(META_KEY, nextMeta);
        await this.ctx.storage.put(STATE_KEY, { lastAttemptAt: attemptAt, lastSuccessAt: result.fetchedAt, lastError: null });
        return nextMeta;
      } catch (error) {
        const previous = await this.ctx.storage.get(STATE_KEY) || {};
        await this.ctx.storage.put(STATE_KEY, { ...previous, lastAttemptAt: attemptAt, lastError: String(error?.message || error) });
        return await this.ctx.storage.get(META_KEY) || null;
      }
    })().finally(() => { this.fastLivePromise = null; });
    return this.fastLivePromise;
  }

  async snapshot() {
    const base = await super.snapshot();
    if (!base?.ok) return base;
    const fastMeta = await this.refreshFastLiveIfDue(base);
    const fastRows = fastMeta ? (await this.ctx.storage.get(ROWS_KEY) || []) : [];
    const useFast = Boolean(fastMeta?.fetchedAt && Number(fastMeta.fetchedAt) > Number(base.fetchedAt || 0) && Array.isArray(fastRows));
    if (!useFast) {
      const state = await this.ctx.storage.get(STATE_KEY) || {};
      return { ...base, fastLive: { version: FAST_VERSION, refreshMs: FAST_REFRESH_MS, active: true, used: false, lastError: state.lastError ?? null, rate: await this.fastRateStats() } };
    }
    const map = new Map((Array.isArray(base.fixtures) ? base.fixtures : []).map(row => [String(row?.fixtureId ?? ''), row]));
    for (const row of fastRows) map.set(String(row.fixtureId), mergeFixture(map.get(String(row.fixtureId)), row));
    const fixtures = [...map.values()].sort((a, b) => Number(a?.kickoffAt || 0) - Number(b?.kickoffAt || 0));
    const fetchedAt = Number(fastMeta.fetchedAt);
    const state = await this.ctx.storage.get(STATE_KEY) || {};
    return {
      ...base,
      fetchedAt,
      ageMs: Math.max(0, now() - fetchedAt),
      stale: now() - fetchedAt > FAST_STALE_MS,
      fixtureCount: fixtures.length,
      counts: {
        scheduled: fixtures.filter(row => row?.boardState === 'scheduled').length,
        live: fixtures.filter(row => row?.boardState === 'live').length,
        finished: fixtures.filter(row => row?.boardState === 'finished').length,
        unknown: fixtures.filter(row => row?.boardState === 'unknown').length,
      },
      fixtures,
      fastLive: { version: FAST_VERSION, refreshMs: FAST_REFRESH_MS, active: true, used: true, fetchedAt, fixtureCount: fastRows.length, truncated: Boolean(fastMeta.truncated), lastError: state.lastError ?? null, rate: await this.fastRateStats() },
    };
  }

  async health() {
    const base = await super.health();
    const meta = await this.ctx.storage.get(META_KEY) || null;
    const state = await this.ctx.storage.get(STATE_KEY) || {};
    return {
      ...base,
      fastLive: {
        version: FAST_VERSION,
        active: true,
        refreshMs: FAST_REFRESH_MS,
        fetchedAt: meta?.fetchedAt ?? null,
        ageMs: meta?.fetchedAt ? Math.max(0, now() - Number(meta.fetchedAt)) : null,
        fixtureCount: meta?.fixtureCount ?? 0,
        truncated: Boolean(meta?.truncated),
        lastAttemptAt: state.lastAttemptAt ?? null,
        lastSuccessAt: state.lastSuccessAt ?? null,
        lastError: state.lastError ?? null,
        rate: await this.fastRateStats(),
      },
    };
  }
}

export default baseWorker;
