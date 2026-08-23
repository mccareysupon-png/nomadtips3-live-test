const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const LIVE_CACHE_MS = 60_000;
const QUOTE_CACHE_MS = 65_000;
const FETCH_TIMEOUT_MS = 4_500;

let liveCache = { at: 0, fixtures: [] };
const quoteCache = new Map();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
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
  if (now - liveCache.at < LIVE_CACHE_MS && liveCache.fixtures.length) return liveCache.fixtures;
  const payload = await apiFetch('/fixtures?status=live&per_page=500', env);
  const fixtures = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.data?.fixtures) ? payload.data.fixtures : [];
  liveCache = { at: now, fixtures };
  return fixtures;
}

function extractBet365Asian(payload) {
  const data = payload?.data || {};
  const books = Array.isArray(data.bookmakers) ? data.bookmakers : [];
  const bet365 = books.find(b => String(b?.slug || '').toLowerCase() === 'bet365' || /bet\s*365/i.test(String(b?.name || '')));
  const market = bet365?.odds?.asian_handicap || data?.odds?.asian_handicap || data?.asian_handicap || null;
  const inplay = market?.inplay || market?.in_play || null;
  if (!inplay) return null;
  if (typeof inplay === 'object') {
    const line = Number(inplay.line);
    const home = Number(inplay.home);
    const away = Number(inplay.away);
    if (Number.isFinite(line) && Number.isFinite(home)) return { line, home, away: Number.isFinite(away) ? away : null };
  }
  return null;
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

    const payload = await apiFetch(`/fixtures/${encodeURIComponent(fixtureId)}/odds?market=asian&bookmakers=bet365`, env);
    const ah = extractBet365Asian(payload);
    if (!ah) {
      const value = {
        source: '5DollarFootballAPI', sourceId: 'source8', bookmaker: 'Bet365',
        status: 'UNAVAILABLE', reason: 'no_matching_live_ah', fixtureId,
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
      line: ah.line,
      odds: ah.home,
      awayOdds: ah.away,
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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
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
      });
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
