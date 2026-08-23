const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const LIVE_CACHE_MS = 60_000;
const QUOTE_CACHE_MS = 65_000;
const BATCH_CACHE_MS = 65_000;
const PROBE_CACHE_MS = 70_000;
const FETCH_TIMEOUT_MS = 4_500;
const BATCH_MAX_MATCHES = 2;

let liveCache = { at: 0, fixtures: [] };
const quoteCache = new Map();
const batchCache = new Map();
let probeCache = { at: 0, value: null };

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
  });
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|ac|club)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function teamName(team) {
  return team?.name || team?.team_name || team?.title || '';
}

function fixtureTeams(fixture) {
  return {
    home: teamName(fixture?.teams?.home) || fixture?.home_team || fixture?.home || '',
    away: teamName(fixture?.teams?.away) || fixture?.away_team || fixture?.away || '',
  };
}

function scoreMatch(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (x.includes(y) || y.includes(x)) return 80;
  const xs = new Set(x.split(' '));
  const ys = new Set(y.split(' '));
  const intersection = [...xs].filter(v => ys.has(v)).length;
  const union = new Set([...xs, ...ys]).size || 1;
  return Math.round((intersection / union) * 70);
}

function findFixture(fixtures, home, away) {
  let best = null;
  for (const fixture of fixtures) {
    const teams = fixtureTeams(fixture);
    const h = scoreMatch(home, teams.home);
    const a = scoreMatch(away, teams.away);
    const total = h + a;
    if (!best || total > best.total) best = { fixture, teams, total, h, a };
  }
  return best && best.h >= 50 && best.a >= 50 ? best : null;
}

async function apiFetch(path, env) {
  if (!env.FIVEDOLLAR_API_KEY) {
    const error = new Error('fivedollar_api_key_missing');
    error.code = 'fivedollar_api_key_missing';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${env.FIVEDOLLAR_API_KEY}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`source_http_${response.status}`);
      error.code = response.status === 429 ? 'source_rate_limited' : `source_http_${response.status}`;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('source_timeout');
      timeout.code = 'source_timeout';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function liveFixtures(env) {
  const now = Date.now();
  // Cache empty responses too. Otherwise a temporary zero-fixture window can burn the vendor rate limit.
  if (now - liveCache.at < LIVE_CACHE_MS) return liveCache.fixtures;
  const payload = await apiFetch('/fixtures?status=live&per_page=500', env);
  const fixtures = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.data?.fixtures) ? payload.data.fixtures : [];
  liveCache = { at: now, fixtures };
  return fixtures;
}

function extractBet365Asian(payload) {
  const data = payload?.data || {};
  const books = Array.isArray(data.bookmakers) ? data.bookmakers : [];
  const bet365 = books.find(b => String(b?.slug || '').toLowerCase() === 'bet365' || /bet\s*365/i.test(String(b?.name || '')));
  const market = bet365?.asian_handicap || bet365?.odds?.asian_handicap || data?.odds?.asian_handicap || data?.asian_handicap || null;
  const inplay = market?.inplay || market?.in_play || null;
  if (!inplay || typeof inplay !== 'object') return null;
  const line = Number(inplay.line);
  const home = Number(inplay.home);
  const away = Number(inplay.away);
  if (!Number.isFinite(line) || !Number.isFinite(home)) return null;
  return { line, home, away: Number.isFinite(away) ? away : null };
}

function unavailableMarket(reason, extra = {}) {
  return {
    status: 'AH UNAVAILABLE',
    reason,
    source: '5DollarFootballAPI',
    bookmaker: 'Bet365',
    bookmakerVerified: true,
    market: 'FULL MATCH LIVE AH',
    ...extra,
  };
}

async function directMarket(fixtureId, env) {
  const payload = await apiFetch(`/fixtures/${encodeURIComponent(fixtureId)}/odds?market=asian&bookmakers=bet365`, env);
  const ah = extractBet365Asian(payload);
  if (!ah) return unavailableMarket('no_matching_live_ah', { fixtureId });
  return {
    status: 'AH READY',
    reason: null,
    source: '5DollarFootballAPI',
    bookmaker: 'Bet365',
    bookmakerVerified: true,
    market: 'FULL MATCH LIVE AH',
    line: ah.line,
    homeOdds: ah.home,
    awayOdds: ah.away,
    fixtureId,
  };
}

async function quote(home, away, env) {
  const cacheKey = `${normalize(home)}|${normalize(away)}`;
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) return { ...cached.value, cached: true };

  try {
    const fixtures = await liveFixtures(env);
    const matched = findFixture(fixtures, home, away);
    if (!matched) {
      return {
        source: '5DollarFootballAPI', sourceId: 'source8', bookmaker: 'Bet365',
        status: 'UNAVAILABLE', reason: 'no_matching_live_match', home, away,
      };
    }

    const fixtureId = matched.fixture?.id;
    if (!fixtureId) {
      return { source: '5DollarFootballAPI', sourceId: 'source8', bookmaker: 'Bet365', status: 'UNAVAILABLE', reason: 'fixture_id_missing', home, away };
    }

    const market = await directMarket(fixtureId, env);
    if (market.status !== 'AH READY') {
      const value = {
        source: '5DollarFootballAPI', sourceId: 'source8', bookmaker: 'Bet365',
        status: 'UNAVAILABLE', reason: market.reason || 'no_matching_live_ah', fixtureId,
        matchedHome: matched.teams.home, matchedAway: matched.teams.away,
      };
      quoteCache.set(cacheKey, { at: Date.now(), value });
      return value;
    }

    const value = {
      source: '5DollarFootballAPI',
      sourceId: 'source8',
      position: 8,
      bookmaker: 'Bet365',
      market: 'FULL MATCH LIVE AH',
      side: 'HOME',
      status: 'PASS',
      line: market.line,
      odds: market.homeOdds,
      awayOdds: market.awayOdds,
      fixtureId,
      matchedHome: matched.teams.home,
      matchedAway: matched.teams.away,
      fetchedAt: new Date().toISOString(),
      upstreamTimestamp: null,
      freshnessComparable: false,
    };
    quoteCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error) {
    return {
      source: '5DollarFootballAPI', sourceId: 'source8', bookmaker: 'Bet365',
      status: 'UNAVAILABLE', reason: error?.code || error?.message || 'source_error', home, away,
    };
  }
}

async function batchQuotes(inputMatches, env) {
  const input = Array.isArray(inputMatches) ? inputMatches : [];
  const batch = input.slice(0, BATCH_MAX_MATCHES);
  const cacheKey = batch.map(m => `${String(m?.clientId ?? '')}:${normalize(m?.home)}|${normalize(m?.away)}`).join('||');
  const cached = batchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BATCH_CACHE_MS) return { ...cached.value, cached: true };

  if (!batch.length) {
    return { ok: true, sourceId: 'source8', source: '5DollarFootballAPI', checked: 0, mapped: 0, ready: 0, results: [], live: 0, maxBatch: BATCH_MAX_MATCHES };
  }

  try {
    const fixtures = await liveFixtures(env);
    const results = [];
    for (const item of batch) {
      const clientId = item?.clientId ?? null;
      const home = String(item?.home || '');
      const away = String(item?.away || '');
      const matched = findFixture(fixtures, home, away);
      if (!matched) {
        results.push({ clientId, matched: false, market: unavailableMarket('no_matching_live_match') });
        continue;
      }
      const fixtureId = matched.fixture?.id;
      if (!fixtureId) {
        results.push({ clientId, matched: true, fixtureId: null, market: unavailableMarket('fixture_id_missing') });
        continue;
      }
      try {
        const market = await directMarket(fixtureId, env);
        results.push({
          clientId,
          matched: true,
          fixtureId,
          mapping: { homeScore: matched.h, awayScore: matched.a, totalScore: matched.total },
          matchedHome: matched.teams.home,
          matchedAway: matched.teams.away,
          market,
        });
      } catch (error) {
        results.push({
          clientId,
          matched: true,
          fixtureId,
          market: unavailableMarket(error?.code || error?.message || 'source_error', { fixtureId }),
        });
      }
    }

    const value = {
      ok: true,
      sourceId: 'source8',
      source: '5DollarFootballAPI',
      bookmaker: 'Bet365',
      market: 'FULL MATCH LIVE AH',
      isolated: true,
      touchesLegacySources: false,
      checked: batch.length,
      mapped: results.filter(r => r.matched).length,
      ready: results.filter(r => r.market?.status === 'AH READY').length,
      live: fixtures.length,
      maxBatch: BATCH_MAX_MATCHES,
      maxVendorRequestsPerBatchWindow: BATCH_MAX_MATCHES + 1,
      results,
    };
    batchCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error) {
    const value = {
      ok: false,
      sourceId: 'source8',
      source: '5DollarFootballAPI',
      bookmaker: 'Bet365',
      isolated: true,
      touchesLegacySources: false,
      checked: batch.length,
      mapped: 0,
      ready: 0,
      live: null,
      maxBatch: BATCH_MAX_MATCHES,
      error: error?.code || error?.message || 'source_error',
      results: batch.map(item => ({ clientId: item?.clientId ?? null, matched: false, market: unavailableMarket(error?.code || error?.message || 'source_error') })),
    };
    batchCache.set(cacheKey, { at: Date.now(), value });
    return value;
  }
}

async function probe(env) {
  const now = Date.now();
  if (probeCache.value && now - probeCache.at < PROBE_CACHE_MS) {
    return { ...probeCache.value, cached: true };
  }

  const startedAt = new Date().toISOString();
  try {
    const fixtures = await liveFixtures(env);
    const samples = [];
    const candidates = fixtures.slice(0, 1);

    for (const fixture of candidates) {
      const teams = fixtureTeams(fixture);
      const fixtureId = fixture?.id;
      if (!fixtureId) {
        samples.push({ home: teams.home, away: teams.away, status: 'UNAVAILABLE', reason: 'fixture_id_missing' });
        continue;
      }

      try {
        const market = await directMarket(fixtureId, env);
        samples.push({
          fixtureId,
          home: teams.home,
          away: teams.away,
          status: market.status === 'AH READY' ? 'PASS' : 'UNAVAILABLE',
          reason: market.status === 'AH READY' ? null : market.reason,
          line: market.line ?? null,
          homeOdds: market.homeOdds ?? null,
          awayOdds: market.awayOdds ?? null,
        });
      } catch (error) {
        samples.push({
          fixtureId,
          home: teams.home,
          away: teams.away,
          status: 'UNAVAILABLE',
          reason: error?.code || error?.message || 'source_error',
        });
      }
    }

    const value = {
      ok: true,
      sourceId: 'source8',
      source: '5DollarFootballAPI',
      bookmaker: 'Bet365',
      market: 'FULL MATCH LIVE AH',
      isolated: true,
      touchesLegacySources: false,
      liveFixtureCount: fixtures.length,
      testedFixtureCount: samples.length,
      passCount: samples.filter(item => item.status === 'PASS').length,
      maxVendorRequestsPerProbeWindow: 2,
      probeCacheSeconds: PROBE_CACHE_MS / 1000,
      startedAt,
      testedAt: new Date().toISOString(),
      samples,
    };
    probeCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    const value = {
      ok: false,
      sourceId: 'source8',
      source: '5DollarFootballAPI',
      bookmaker: 'Bet365',
      isolated: true,
      touchesLegacySources: false,
      status: 'UNAVAILABLE',
      reason: error?.code || error?.message || 'source_error',
      startedAt,
      testedAt: new Date().toISOString(),
    };
    probeCache = { at: Date.now(), value };
    return value;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);

    if (url.pathname === '/quotes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
      if (!Array.isArray(body?.matches)) return json({ ok: false, error: 'matches_array_required' }, 400);
      return json(await batchQuotes(body.matches, env));
    }

    if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        service: 'nomadtips3-s8-sidecar',
        sourceId: 'source8',
        source: '5DollarFootballAPI',
        bookmaker: 'Bet365',
        market: 'FULL MATCH LIVE AH',
        isolated: true,
        touchesLegacySources: false,
        keyConfigured: Boolean(env.FIVEDOLLAR_API_KEY),
        liveCacheSeconds: LIVE_CACHE_MS / 1000,
        quoteCacheSeconds: QUOTE_CACHE_MS / 1000,
        batchCacheSeconds: BATCH_CACHE_MS / 1000,
        batchMaxMatches: BATCH_MAX_MATCHES,
        maxVendorRequestsPerBatchWindow: BATCH_MAX_MATCHES + 1,
        probeCacheSeconds: PROBE_CACHE_MS / 1000,
      });
    }

    if (url.pathname === '/probe') {
      return json(await probe(env));
    }

    if (url.pathname === '/quote') {
      const home = url.searchParams.get('home') || '';
      const away = url.searchParams.get('away') || '';
      if (!home || !away) return json({ ok: false, error: 'home_and_away_required' }, 400);
      return json({ ok: true, quote: await quote(home, away, env) });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },
};
