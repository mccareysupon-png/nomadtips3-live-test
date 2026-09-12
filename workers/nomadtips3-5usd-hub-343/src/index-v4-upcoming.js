import baseWorker, { FiveUsdHub as FastFiveUsdHub } from './index-v3-fast.js';

const VERSION = 'nomad343-5usd-hub-v6-upcoming-overlay';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const UPCOMING_REFRESH_MS = 120_000;
const UPCOMING_PAGE_SIZE = 100;
const UPCOMING_MAX_PAGES = 3;
const UPCOMING_TIMEOUT_MS = 10_000;
const UPCOMING_META_KEY = 'upcomingMetaV1';
const UPCOMING_ROWS_KEY = 'upcomingRowsV1';
const UPCOMING_STATE_KEY = 'upcomingStateV1';

const now = () => Date.now();
const finite = value => value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);
const text = value => value === null || value === undefined ? null : String(value);

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
function fixtureId(fixture) { return text(fixture?.id ?? fixture?.fixture_id ?? fixture?.fixture?.id ?? null); }
function kickoffUtc(fixture) { return text(fixture?.kickoff_utc ?? fixture?.kickoffUtc ?? fixture?.start_time ?? fixture?.kickoff ?? fixture?.date ?? null); }
function normalizeScheduled(fixture) {
  const kickoff = kickoffUtc(fixture);
  return {
    fixtureId: fixtureId(fixture),
    league: league(fixture),
    home: team(fixture, 'home'),
    away: team(fixture, 'away'),
    kickoffUtc: kickoff,
    kickoffAt: kickoff && Number.isFinite(Date.parse(kickoff)) ? Date.parse(kickoff) : finite(fixture?.kickoff_ts ?? fixture?.start_time) ? finite(fixture?.kickoff_ts ?? fixture?.start_time) * 1000 : null,
    status: text(fixture?.status?.name ?? fixture?.status ?? 'scheduled'),
    statusReason: text(fixture?.status_reason ?? fixture?.status?.reason ?? null),
    statusCode: text(fixture?.status_code ?? fixture?.status?.code ?? fixture?.status?.short ?? null),
    boardState: 'scheduled',
    minute: null,
    goals: score(fixture?.goals ?? fixture?.score),
    corners: score(fixture?.corners),
    cards: cards(fixture?.cards),
    statistics: null,
    events: null,
    providerOdds: null,
    providerOddsUpdatedAt: null,
  };
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
function bangkokWindow(timestamp = now()) {
  const shift = 7 * 3_600_000;
  const local = new Date(timestamp + shift);
  const startMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - shift;
  return { startMs, endMs: startMs + 86_400_000, start: Math.floor(startMs / 1000), end: Math.floor((startMs + 86_400_000) / 1000) };
}

export class FiveUsdHub extends FastFiveUsdHub {
  constructor(ctx, env) {
    super(ctx, env);
    this.upcomingPromise = null;
  }

  async fetchUpcomingPage(page, window) {
    if (!this.env.FIVEDOLLAR_API_KEY) throw new Error('provider:FIVEDOLLAR_API_KEY_MISSING');
    await this.reserveFastRequest();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPCOMING_TIMEOUT_MS);
    try {
      const url = `${API_BASE}/fixtures?start_time=${window.start}&end_time=${window.end}&status=scheduled&per_page=${UPCOMING_PAGE_SIZE}&page=${page}`;
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json', authorization: `Bearer ${this.env.FIVEDOLLAR_API_KEY}` },
      });
      const raw = await response.text();
      let payload = null;
      try { payload = JSON.parse(raw); } catch {}
      if (!response.ok) throw new Error(`provider:HTTP_${response.status}`);
      if (!payload || typeof payload !== 'object') throw new Error('provider:INVALID_JSON');
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('provider:TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async refreshUpcomingIfDue() {
    const meta = await this.ctx.storage.get(UPCOMING_META_KEY) || null;
    const window = bangkokWindow();
    const sameWindow = meta?.windowStart === window.start && meta?.windowEnd === window.end;
    if (sameWindow && meta?.fetchedAt && now() - Number(meta.fetchedAt) < UPCOMING_REFRESH_MS) return meta;
    if (this.upcomingPromise) return this.upcomingPromise;

    this.upcomingPromise = (async () => {
      const attemptAt = now();
      try {
        const rows = [];
        let page = 1;
        let more = false;
        do {
          const payload = await this.fetchUpcomingPage(page, window);
          rows.push(...extractFixtures(payload));
          more = hasMore(payload);
          page += 1;
        } while (more && page <= UPCOMING_MAX_PAGES);

        const normalized = rows.map(normalizeScheduled).filter(row => row.fixtureId);
        const nextMeta = {
          version: VERSION,
          fetchedAt: now(),
          fixtureCount: normalized.length,
          pages: page - 1,
          truncated: Boolean(more && page > UPCOMING_MAX_PAGES),
          windowStart: window.start,
          windowEnd: window.end,
          refreshMs: UPCOMING_REFRESH_MS,
        };
        await this.ctx.storage.put(UPCOMING_ROWS_KEY, normalized);
        await this.ctx.storage.put(UPCOMING_META_KEY, nextMeta);
        await this.ctx.storage.put(UPCOMING_STATE_KEY, { lastAttemptAt: attemptAt, lastSuccessAt: nextMeta.fetchedAt, lastError: null });
        return nextMeta;
      } catch (error) {
        const previous = await this.ctx.storage.get(UPCOMING_STATE_KEY) || {};
        await this.ctx.storage.put(UPCOMING_STATE_KEY, { ...previous, lastAttemptAt: attemptAt, lastError: String(error?.message || error) });
        return await this.ctx.storage.get(UPCOMING_META_KEY) || null;
      }
    })().finally(() => { this.upcomingPromise = null; });

    return this.upcomingPromise;
  }

  async snapshot() {
    const base = await super.snapshot();
    if (!base?.ok) return base;

    const upcomingMeta = await this.refreshUpcomingIfDue();
    const upcomingRows = upcomingMeta ? (await this.ctx.storage.get(UPCOMING_ROWS_KEY) || []) : [];
    const map = new Map((Array.isArray(base.fixtures) ? base.fixtures : []).map(row => [String(row?.fixtureId ?? ''), row]));

    // Never overwrite a richer/current base row. The overlay only restores scheduled
    // fixtures omitted by the old status=all pagination cap.
    for (const row of upcomingRows) {
      const key = String(row?.fixtureId ?? '');
      if (key && !map.has(key)) map.set(key, row);
    }

    const fixtures = [...map.values()].sort((a, b) => Number(a?.kickoffAt || 0) - Number(b?.kickoffAt || 0));
    const counts = {
      scheduled: fixtures.filter(row => row?.boardState === 'scheduled').length,
      live: fixtures.filter(row => row?.boardState === 'live').length,
      finished: fixtures.filter(row => row?.boardState === 'finished').length,
      unknown: fixtures.filter(row => row?.boardState === 'unknown').length,
    };
    const state = await this.ctx.storage.get(UPCOMING_STATE_KEY) || {};

    return {
      ...base,
      fixtureCount: fixtures.length,
      counts,
      fixtures,
      upcoming: {
        version: VERSION,
        active: true,
        refreshMs: UPCOMING_REFRESH_MS,
        fetchedAt: upcomingMeta?.fetchedAt ?? null,
        fixtureCount: upcomingRows.length,
        pages: upcomingMeta?.pages ?? 0,
        truncated: Boolean(upcomingMeta?.truncated),
        windowStart: upcomingMeta?.windowStart ?? null,
        windowEnd: upcomingMeta?.windowEnd ?? null,
        lastError: state.lastError ?? null,
      },
    };
  }

  async health() {
    const base = await super.health();
    const meta = await this.ctx.storage.get(UPCOMING_META_KEY) || null;
    const state = await this.ctx.storage.get(UPCOMING_STATE_KEY) || {};
    return {
      ...base,
      upcoming: {
        version: VERSION,
        active: true,
        refreshMs: UPCOMING_REFRESH_MS,
        fetchedAt: meta?.fetchedAt ?? null,
        fixtureCount: meta?.fixtureCount ?? 0,
        pages: meta?.pages ?? 0,
        truncated: Boolean(meta?.truncated),
        windowStart: meta?.windowStart ?? null,
        windowEnd: meta?.windowEnd ?? null,
        lastAttemptAt: state.lastAttemptAt ?? null,
        lastSuccessAt: state.lastSuccessAt ?? null,
        lastError: state.lastError ?? null,
      },
    };
  }
}

export default baseWorker;
