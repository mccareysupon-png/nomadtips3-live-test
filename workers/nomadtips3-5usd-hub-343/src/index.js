const VERSION = 'nomad343-5usd-hub-v1';
const PROVIDER = '5DollarFootballAPI';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const PAGE_SIZE = 500;
const REFRESH_MS = 120_000;
const STALE_AFTER_MS = 180_000;
const PROVIDER_TIMEOUT_MS = 15_000;
const MAX_PAGES = 5;
const CHUNK_TARGET_BYTES = 72_000;
const ALLOWED_ORIGINS = new Set([
  'https://www.nomadtips3.com',
  'https://nomadtips3.com',
  'https://mccareysupon-png.github.io',
  'http://localhost:8787',
  'http://127.0.0.1:8787'
]);

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const text = (value) => value === null || value === undefined ? null : String(value);
const now = () => Date.now();
const encoder = new TextEncoder();

function cors(request) {
  const origin = request.headers.get('origin') || '';
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin'
  });
  if (ALLOWED_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  else headers.set('access-control-allow-origin', 'https://www.nomadtips3.com');
  return headers;
}
function json(request, body, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: cors(request) });
}

function pair(source) {
  if (!source || typeof source !== 'object') return null;
  const home = finite(source.home);
  const away = finite(source.away);
  return home === null && away === null ? null : { home, away };
}
function goals(source) {
  if (!source || typeof source !== 'object') return null;
  return {
    home: finite(source.home),
    away: finite(source.away),
    halfHome: finite(source.half_home ?? source.halfHome),
    halfAway: finite(source.half_away ?? source.halfAway)
  };
}
function cards(source) {
  if (!source || typeof source !== 'object') return null;
  const side = (value) => value && typeof value === 'object' ? {
    yellow: finite(value.yellow),
    red: finite(value.red)
  } : null;
  return { home: side(source.home), away: side(source.away) };
}
function teamName(fixture, side) {
  return text(
    fixture?.teams?.[side]?.name ??
    fixture?.[`${side}_team`]?.name ??
    fixture?.[side]?.name ??
    fixture?.[`${side}_name`] ??
    null
  );
}
function teamId(fixture, side) {
  return text(
    fixture?.teams?.[side]?.id ??
    fixture?.[`${side}_team`]?.id ??
    fixture?.[side]?.id ??
    fixture?.[`${side}_id`] ??
    null
  );
}
function leagueInfo(fixture) {
  const root = fixture?.league ?? fixture?.competition ?? null;
  return {
    id: text(root?.id ?? fixture?.league_id ?? fixture?.competition_id ?? null),
    name: text(root?.name ?? fixture?.league_name ?? fixture?.competition_name ?? null),
    country: text(root?.country?.name ?? root?.country ?? fixture?.country ?? null)
  };
}
function statistics(root) {
  if (!root || typeof root !== 'object') return null;
  const normalized = {
    attacks: pair(root.attacks),
    dangerousAttacks: pair(root.dangerous_attacks ?? root.dangerousAttacks),
    shotsOnTarget: pair(root.shots_on_target ?? root.shotsOnTarget),
    shotsOffTarget: pair(root.shots_off_target ?? root.shotsOffTarget),
    possession: pair(root.possession)
  };
  const hasAny = Object.values(normalized).some(Boolean);
  if (!hasAny) return null;
  const halfRoot = root.half;
  normalized.half = halfRoot && typeof halfRoot === 'object' ? {
    attacks: pair(halfRoot.attacks),
    dangerousAttacks: pair(halfRoot.dangerous_attacks ?? halfRoot.dangerousAttacks),
    shotsOnTarget: pair(halfRoot.shots_on_target ?? halfRoot.shotsOnTarget),
    shotsOffTarget: pair(halfRoot.shots_off_target ?? halfRoot.shotsOffTarget),
    possession: pair(halfRoot.possession)
  } : null;
  return normalized;
}
function fixtureId(fixture) {
  return text(fixture?.id ?? fixture?.fixture_id ?? fixture?.fixture?.id ?? null);
}
function normalizeFixture(fixture) {
  const id = fixtureId(fixture);
  const statusCode = text(fixture?.status_code ?? fixture?.status?.code ?? fixture?.status?.short ?? null);
  const minute = finite(fixture?.minute ?? fixture?.elapsed ?? fixture?.status?.minute ?? fixture?.status?.elapsed ?? statusCode);
  const oddsEnvelope = fixture?.odds ?? fixture?.bookmakers ?? fixture?.markets ?? fixture?.bet365 ?? null;
  return {
    fixtureId: id,
    league: leagueInfo(fixture),
    home: { id: teamId(fixture, 'home'), name: teamName(fixture, 'home') },
    away: { id: teamId(fixture, 'away'), name: teamName(fixture, 'away') },
    status: text(fixture?.status?.name ?? fixture?.status ?? 'in_play'),
    statusCode,
    minute,
    goals: goals(fixture?.goals ?? fixture?.score),
    corners: goals(fixture?.corners),
    cards: cards(fixture?.cards),
    statistics: statistics(fixture?.statistics ?? fixture?.stats ?? null),
    events: Array.isArray(fixture?.events) ? fixture.events : null,
    providerOdds: oddsEnvelope
  };
}
function extractFixtures(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  return [];
}
function pagination(payload) {
  const p = payload?.pagination ?? payload?.meta?.pagination ?? payload?.meta ?? {};
  const rawHasMore = p?.has_more ?? p?.hasMore ?? payload?.has_more ?? payload?.hasMore ?? false;
  return {
    hasMore: rawHasMore === true || rawHasMore === 1 || rawHasMore === '1' || rawHasMore === 'true',
    currentPage: finite(p?.current_page ?? p?.currentPage ?? p?.page),
    totalPages: finite(p?.total_pages ?? p?.totalPages ?? p?.last_page),
    total: finite(p?.total)
  };
}
async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', headers, signal: controller.signal });
    const body = await response.text();
    let payload = null;
    try { payload = JSON.parse(body); } catch {}
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
async function fetchAllLive(env) {
  if (!env.FIVEDOLLAR_API_KEY) throw new Error('provider:FIVEDOLLAR_API_KEY_MISSING');
  const headers = { accept: 'application/json', authorization: `Bearer ${env.FIVEDOLLAR_API_KEY}` };
  const fixtures = [];
  let page = 1;
  let hasMore = false;
  do {
    const url = `${API_BASE}/fixtures?status=live&include=events,stats&per_page=${PAGE_SIZE}&page=${page}`;
    const payload = await fetchJson(url, headers);
    fixtures.push(...extractFixtures(payload));
    hasMore = pagination(payload).hasMore;
    page += 1;
  } while (hasMore && page <= MAX_PAGES);
  return {
    fixtures,
    requestCount: page - 1,
    hasMoreAfterGuard: hasMore && page > MAX_PAGES
  };
}
function chunkFixtures(fixtures) {
  const chunks = [];
  let current = [];
  for (const fixture of fixtures) {
    const candidate = [...current, fixture];
    if (current.length && encoder.encode(JSON.stringify(candidate)).byteLength > CHUNK_TARGET_BYTES) {
      chunks.push(current);
      current = [fixture];
    } else {
      current = candidate;
    }
  }
  if (current.length || !chunks.length) chunks.push(current);
  return chunks;
}

export class FiveUsdHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.refreshPromise = null;
  }

  async state() {
    return await this.ctx.storage.get('state') || {
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null
    };
  }

  async meta() {
    return await this.ctx.storage.get('meta') || null;
  }

  async refreshIfDue(force = false) {
    const meta = await this.meta();
    if (!force && meta?.fetchedAt && now() - meta.fetchedAt < REFRESH_MS) return meta;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refresh().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async refresh() {
    const attemptAt = now();
    const previousMeta = await this.meta();
    const previousState = await this.state();
    await this.ctx.storage.put('state', { ...previousState, lastAttemptAt: attemptAt });
    try {
      const provider = await fetchAllLive(this.env);
      const normalized = provider.fixtures.map(normalizeFixture).filter((fixture) => fixture.fixtureId);
      const chunks = chunkFixtures(normalized);
      const snapshotId = attemptAt.toString(36);
      for (let i = 0; i < chunks.length; i += 1) {
        await this.ctx.storage.put(`snapshot:${snapshotId}:${i}`, JSON.stringify(chunks[i]));
      }
      const meta = {
        version: VERSION,
        provider: PROVIDER,
        fetchedAt: now(),
        snapshotId,
        chunkCount: chunks.length,
        fixtureCount: normalized.length,
        providerRequestCount: provider.requestCount,
        hasMoreAfterGuard: provider.hasMoreAfterGuard,
        include: 'events,stats',
        pageSize: PAGE_SIZE,
        refreshMs: REFRESH_MS
      };
      await this.ctx.storage.put('meta', meta);
      await this.ctx.storage.put('state', {
        lastAttemptAt: attemptAt,
        lastSuccessAt: meta.fetchedAt,
        lastError: null
      });
      if (previousMeta?.snapshotId && previousMeta.snapshotId !== snapshotId) {
        for (let i = 0; i < Number(previousMeta.chunkCount || 0); i += 1) {
          await this.ctx.storage.delete(`snapshot:${previousMeta.snapshotId}:${i}`);
        }
      }
      return meta;
    } catch (error) {
      await this.ctx.storage.put('state', {
        ...previousState,
        lastAttemptAt: attemptAt,
        lastError: String(error?.message || error)
      });
      if (previousMeta) return previousMeta;
      throw error;
    }
  }

  async readSnapshot() {
    let meta = await this.meta();
    if (!meta || !meta.fetchedAt || now() - meta.fetchedAt >= REFRESH_MS) {
      try { meta = await this.refreshIfDue(false); } catch {}
    }
    meta = await this.meta();
    const state = await this.state();
    if (!meta) return { ok: false, version: VERSION, provider: PROVIDER, error: state.lastError || 'NO_SNAPSHOT' };
    const fixtures = [];
    for (let i = 0; i < Number(meta.chunkCount || 0); i += 1) {
      const raw = await this.ctx.storage.get(`snapshot:${meta.snapshotId}:${i}`);
      if (!raw) continue;
      try {
        const rows = JSON.parse(raw);
        if (Array.isArray(rows)) fixtures.push(...rows);
      } catch {}
    }
    const ageMs = Math.max(0, now() - meta.fetchedAt);
    return {
      ok: true,
      version: VERSION,
      provider: PROVIDER,
      fetchedAt: meta.fetchedAt,
      ageMs,
      stale: ageMs > STALE_AFTER_MS,
      fixtureCount: fixtures.length,
      providerRequestCount: meta.providerRequestCount,
      hasMoreAfterGuard: meta.hasMoreAfterGuard,
      include: meta.include,
      pageSize: meta.pageSize,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
      fixtures
    };
  }

  async health() {
    const meta = await this.meta();
    const state = await this.state();
    const ageMs = meta?.fetchedAt ? Math.max(0, now() - meta.fetchedAt) : null;
    return {
      ok: Boolean(meta),
      component: '5USD_HUB',
      version: VERSION,
      provider: PROVIDER,
      fixtureCount: meta?.fixtureCount ?? 0,
      fetchedAt: meta?.fetchedAt ?? null,
      ageMs,
      stale: ageMs === null ? true : ageMs > STALE_AFTER_MS,
      refreshMs: REFRESH_MS,
      pageSize: PAGE_SIZE,
      include: 'events,stats',
      providerRequestCount: meta?.providerRequestCount ?? 0,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/_internal/refresh' && request.method === 'POST') {
      try {
        await this.refreshIfDue(false);
        return new Response(JSON.stringify(await this.health()), { headers: { 'content-type': 'application/json' } });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), { status: 502, headers: { 'content-type': 'application/json' } });
      }
    }
    if (url.pathname === '/snapshot') return new Response(JSON.stringify(await this.readSnapshot()), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/health') return new Response(JSON.stringify(await this.health()), { headers: { 'content-type': 'application/json' } });
    return new Response('Not found', { status: 404 });
  }
}

function hubStub(env) {
  const id = env.HUB.idFromName('global');
  return env.HUB.get(id);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json(request, null, 204);
    const url = new URL(request.url);
    const stub = hubStub(env);
    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const response = await stub.fetch('https://hub.internal/snapshot');
      return json(request, await response.json(), response.status);
    }
    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/status')) {
      const response = await stub.fetch('https://hub.internal/health');
      return json(request, await response.json(), response.status);
    }
    return json(request, { ok: false, version: VERSION, error: 'NOT_FOUND' }, 404);
  },

  async scheduled(_event, env, ctx) {
    const stub = hubStub(env);
    ctx.waitUntil(stub.fetch('https://hub.internal/_internal/refresh', { method: 'POST' }));
  }
};
