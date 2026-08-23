const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const SOURCE_ID = 'source8';
const SOURCE_NAME = '5DollarFootballAPI';
const BOOKMAKER = 'Bet365';
const MARKET_NAME = 'FULL MATCH LIVE AH';
const LIVE_CACHE_MS = 65_000;
const ODDS_CACHE_MS = 65_000;
const UPSTREAM_WINDOW_MS = 60_000;
const MAX_UPSTREAM_PER_WINDOW = 9; // keep one request below Pro 10/min ceiling
const MAX_QUOTES_PER_BATCH = 7;   // fresh batch = 1 live list + <=7 odds calls
const UPSTREAM_TIMEOUT_MS = 7_000;

let liveCache = { at: 0, fixtures: [], rawCount: 0 };
const oddsCache = new Map();
const upstreamCalls = [];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-s8-adapter-token',
  },
});

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;
const quarterGoal = value => finite(value) && Math.abs(Number(value) * 4 - Math.round(Number(value) * 4)) < 1e-9;
const now = () => Date.now();

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token && !new Set(['fc', 'cf', 'afc', 'sc', 'fk', 'club']).has(token))
    .map(token => ({ utd: 'united', ath: 'athletic', dep: 'deportivo' }[token] ?? token))
    .join(' ');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenJaccard(a, b) {
  const aa = new Set(a.split(' ').filter(Boolean));
  const bb = new Set(b.split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection++;
  return intersection / (aa.size + bb.size - intersection);
}

function tokenSimilarity(a, b) {
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b;
  const long = a.length > b.length ? a : b;
  if (short.length >= 3 && long.startsWith(short)) return Math.min(0.92, 0.76 + short.length / Math.max(20, long.length * 5));
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

function fuzzyTokenScore(a, b) {
  const aa = a.split(' ').filter(Boolean);
  const bb = b.split(' ').filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const directional = (from, to) => from.reduce((sum, token) => {
    let best = 0;
    for (const candidate of to) best = Math.max(best, tokenSimilarity(token, candidate));
    return sum + best;
  }, 0) / from.length;
  return Math.min(directional(aa, bb), directional(bb, aa));
}

function nameScore(left, right) {
  const a = normalizeName(left), b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.replace(/\s/g, '') === b.replace(/\s/g, '')) return 0.99;
  let score = Math.max(tokenJaccard(a, b), fuzzyTokenScore(a, b));
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 5 && (a.includes(b) || b.includes(a))) score = Math.max(score, 0.93);
  const distance = levenshtein(a, b);
  const lev = 1 - distance / Math.max(a.length, b.length);
  return Math.max(score, lev);
}

function fixtureTeams(fixture) {
  return {
    home: fixture?.teams?.home?.name ?? fixture?.home_team?.name ?? fixture?.home?.name ?? fixture?.home_name ?? '',
    away: fixture?.teams?.away?.name ?? fixture?.away_team?.name ?? fixture?.away?.name ?? fixture?.away_name ?? '',
  };
}

function fixtureLeague(fixture) {
  return fixture?.league?.name ?? fixture?.competition?.name ?? fixture?.league_name ?? '';
}

function fixtureId(fixture) {
  return fixture?.id ?? fixture?.fixture_id ?? fixture?.fixture?.id ?? null;
}

function fixtureGoals(fixture) {
  return fixture?.goals ?? fixture?.score ?? null;
}

function mappingScore(target, fixture) {
  const teams = fixtureTeams(fixture);
  const home = nameScore(target?.home, teams.home);
  const away = nameScore(target?.away, teams.away);
  if (home < 0.78 || away < 0.78) return null;
  let score = (home + away) / 2;
  const leagueTarget = normalizeName(target?.league);
  const leagueFixture = normalizeName(fixtureLeague(fixture));
  const league = leagueTarget && leagueFixture ? nameScore(leagueTarget, leagueFixture) : null;
  if (league !== null) score = Math.min(1, score * 0.92 + league * 0.08);

  const suppliedScore = target?.score;
  const goals = fixtureGoals(fixture);
  if (finite(suppliedScore?.home) && finite(suppliedScore?.away) && finite(goals?.home) && finite(goals?.away)) {
    const diff = Math.abs(Number(suppliedScore.home) - Number(goals.home)) + Math.abs(Number(suppliedScore.away) - Number(goals.away));
    if (diff === 0) score = Math.min(1, score + 0.015);
    else if (diff >= 3) score -= 0.04; // lag tolerant: score is a hint, not a hard gate
  }
  return { score, home, away, league };
}

function matchFixture(target, fixtures) {
  const candidates = [];
  for (const fixture of fixtures) {
    const scored = mappingScore(target, fixture);
    if (!scored) continue;
    candidates.push({ fixture, ...scored });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;
  if (!best || best.score < 0.84) return { fixture: null, reason: 'no_matching_live_match', candidates: candidates.length };
  const second = candidates[1] ?? null;
  if (second && best.score - second.score < 0.035) {
    return { fixture: null, reason: 'ambiguous_live_match', candidates: candidates.length, bestScore: best.score, secondScore: second.score };
  }
  return { fixture: best.fixture, reason: null, confidence: Number(best.score.toFixed(4)), homeScore: Number(best.home.toFixed(4)), awayScore: Number(best.away.toFixed(4)), leagueScore: best.league == null ? null : Number(best.league.toFixed(4)), candidates: candidates.length };
}

function pruneRequestWindow(timestamp = now()) {
  while (upstreamCalls.length && timestamp - upstreamCalls[0] >= UPSTREAM_WINDOW_MS) upstreamCalls.shift();
}

function reserveUpstreamRequest() {
  const timestamp = now();
  pruneRequestWindow(timestamp);
  if (upstreamCalls.length >= MAX_UPSTREAM_PER_WINDOW) {
    const error = new Error('S8_RATE_BUDGET_EXHAUSTED');
    error.code = 'S8_RATE_BUDGET_EXHAUSTED';
    throw error;
  }
  upstreamCalls.push(timestamp);
}

function upstreamStats() {
  pruneRequestWindow();
  return { usedLast60s: upstreamCalls.length, ceiling: 10, internalCeiling: MAX_UPSTREAM_PER_WINDOW };
}

async function fetchApi(path, env) {
  if (!env.FIVEDOLLAR_API_KEY) {
    const error = new Error('FIVEDOLLAR_API_KEY_MISSING');
    error.code = 'FIVEDOLLAR_API_KEY_MISSING';
    throw error;
  }
  reserveUpstreamRequest();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('FIVEDOLLAR_TIMEOUT'), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${env.FIVEDOLLAR_API_KEY}`,
        'user-agent': 'NOMADTIPS3-S8-EXTERNAL/1.0',
      },
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!response.ok) {
      const error = new Error(`FIVEDOLLAR_HTTP_${response.status}`);
      error.code = `FIVEDOLLAR_HTTP_${response.status}`;
      error.status = response.status;
      error.payload = data ?? text.slice(0, 240);
      throw error;
    }
    if (!data || typeof data !== 'object') {
      const error = new Error('FIVEDOLLAR_INVALID_JSON');
      error.code = 'FIVEDOLLAR_INVALID_JSON';
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function extractFixtures(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  return [];
}

async function liveFixtures(env) {
  const timestamp = now();
  if (liveCache.at && timestamp - liveCache.at < LIVE_CACHE_MS) return { ...liveCache, cacheHit: true };
  const payload = await fetchApi('/fixtures?status=live&per_page=500', env);
  const fixtures = extractFixtures(payload);
  liveCache = { at: now(), fixtures, rawCount: fixtures.length };
  return { ...liveCache, cacheHit: false };
}

function extractBet365Asian(payload) {
  const data = payload?.data ?? payload;
  let bookmaker = null;
  const bookmakers = Array.isArray(data?.bookmakers) ? data.bookmakers : Array.isArray(payload?.bookmakers) ? payload.bookmakers : [];
  bookmaker = bookmakers.find(item => String(item?.slug ?? '').toLowerCase() === 'bet365')
    ?? bookmakers.find(item => /bet\s*365/i.test(String(item?.name ?? '')))
    ?? bookmakers[0]
    ?? null;

  const oddsRoot = bookmaker?.odds ?? data?.odds ?? payload?.odds ?? data;
  const asian = oddsRoot?.asian_handicap ?? oddsRoot?.asian ?? data?.asian_handicap ?? payload?.asian_handicap ?? null;
  const inplay = asian?.inplay ?? asian?.live ?? null;
  if (!inplay || typeof inplay !== 'object') return null;
  const line = number(inplay.line ?? inplay.hdp ?? inplay.handicap);
  const home = number(inplay.home ?? inplay.home_odds ?? inplay.homeOdds);
  const away = number(inplay.away ?? inplay.away_odds ?? inplay.awayOdds);
  if (!quarterGoal(line) || home === null || away === null || home <= 1 || away <= 1) return null;
  return { line, home, away };
}

async function fixtureAsianOdds(id, env) {
  const key = String(id);
  const timestamp = now();
  const cached = oddsCache.get(key);
  if (cached && timestamp - cached.at < ODDS_CACHE_MS) return { ...cached, cacheHit: true };
  const payload = await fetchApi(`/fixtures/${encodeURIComponent(key)}/odds?bookmakers=bet365&market=asian`, env);
  const asian = extractBet365Asian(payload);
  const value = { at: now(), asian, payloadShape: Array.isArray(payload?.data?.bookmakers) ? 'bookmakers' : payload?.data?.odds ? 'odds' : 'other' };
  oddsCache.set(key, value);
  if (oddsCache.size > 100) {
    for (const [cacheKey, entry] of oddsCache) {
      if (timestamp - entry.at > ODDS_CACHE_MS * 3) oddsCache.delete(cacheKey);
    }
  }
  return { ...value, cacheHit: false };
}

function unavailable(reason, observedAt = now(), extra = {}) {
  return {
    status: 'AH UNAVAILABLE',
    reason,
    source: SOURCE_NAME,
    bookmaker: BOOKMAKER,
    bookmakerVerified: true,
    market: MARKET_NAME,
    sourceUpdatedAt: null,
    ...extra,
    observedAt,
  };
}

function readyMarket(asian, observedAt, extra = {}) {
  return {
    status: 'AH READY',
    reason: null,
    source: SOURCE_NAME,
    bookmaker: BOOKMAKER,
    bookmakerVerified: true,
    market: MARKET_NAME,
    line: asian.line,
    homeOdds: asian.home,
    awayOdds: asian.away,
    // 5Dollar does not expose an upstream update timestamp on the current odds snapshot.
    // We intentionally stamp adapter observation time and mark the semantics explicitly.
    sourceUpdatedAt: observedAt,
    sourceTimestampSemantics: 'adapter_observed_at',
    observedAt,
    ...extra,
  };
}

function classifyError(error) {
  const message = String(error?.code || error?.message || error || 'unknown_error');
  if (/429/.test(message)) return 'source_blocked:http_429';
  if (/TIMEOUT|AbortError|aborted/i.test(message)) return 'source_timeout';
  if (/KEY_MISSING/.test(message)) return 'api_key_missing';
  if (/RATE_BUDGET/.test(message)) return 'adapter_rate_budget';
  return `price_fetch_failed:${message}`;
}

function adapterAuthorized(request, env) {
  if (!env.S8_ADAPTER_TOKEN) return true; // optional hardening; can be enabled later without code changes
  return request.headers.get('x-s8-adapter-token') === env.S8_ADAPTER_TOKEN;
}

async function quoteOne(target, fixtures, env, liveMeta) {
  const observedAt = now();
  const mapped = matchFixture(target, fixtures);
  if (!mapped.fixture) {
    return {
      clientId: target?.clientId ?? target?.id ?? null,
      matched: false,
      mapping: { reason: mapped.reason, candidates: mapped.candidates ?? 0, bestScore: mapped.bestScore ?? null, secondScore: mapped.secondScore ?? null },
      market: unavailable(mapped.reason, observedAt),
    };
  }
  const id = fixtureId(mapped.fixture);
  if (id == null) {
    return { clientId: target?.clientId ?? target?.id ?? null, matched: false, mapping: { reason: 'fixture_id_missing' }, market: unavailable('fixture_id_missing', observedAt) };
  }
  try {
    const odds = await fixtureAsianOdds(id, env);
    if (!odds.asian) {
      return {
        clientId: target?.clientId ?? target?.id ?? null,
        matched: true,
        fixtureId: id,
        mapping: { confidence: mapped.confidence, home: mapped.homeScore, away: mapped.awayScore, league: mapped.leagueScore, candidates: mapped.candidates },
        market: unavailable('no_matching_live_ah', observedAt, { fixtureId: id }),
        cache: { live: liveMeta.cacheHit, odds: odds.cacheHit },
      };
    }
    return {
      clientId: target?.clientId ?? target?.id ?? null,
      matched: true,
      fixtureId: id,
      fixture: { home: fixtureTeams(mapped.fixture).home, away: fixtureTeams(mapped.fixture).away, league: fixtureLeague(mapped.fixture), goals: fixtureGoals(mapped.fixture) },
      mapping: { confidence: mapped.confidence, home: mapped.homeScore, away: mapped.awayScore, league: mapped.leagueScore, candidates: mapped.candidates },
      market: readyMarket(odds.asian, observedAt, { fixtureId: id }),
      cache: { live: liveMeta.cacheHit, odds: odds.cacheHit },
    };
  } catch (error) {
    return {
      clientId: target?.clientId ?? target?.id ?? null,
      matched: true,
      fixtureId: id,
      mapping: { confidence: mapped.confidence, home: mapped.homeScore, away: mapped.awayScore, league: mapped.leagueScore, candidates: mapped.candidates },
      market: unavailable(classifyError(error), observedAt, { fixtureId: id }),
    };
  }
}

async function quotes(request, env) {
  if (!adapterAuthorized(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'INVALID_JSON' }, 400); }
  const matches = Array.isArray(body?.matches) ? body.matches : [];
  if (!matches.length) return json({ ok: true, source: SOURCE_ID, results: [], upstream: upstreamStats() });
  if (matches.length > MAX_QUOTES_PER_BATCH) return json({ ok: false, error: 'BATCH_TOO_LARGE', maximum: MAX_QUOTES_PER_BATCH }, 400);
  if (matches.some(item => !String(item?.home ?? '').trim() || !String(item?.away ?? '').trim())) {
    return json({ ok: false, error: 'HOME_AWAY_REQUIRED' }, 400);
  }
  try {
    const live = await liveFixtures(env);
    const results = await Promise.all(matches.map(match => quoteOne(match, live.fixtures, env, live)));
    return json({
      ok: true,
      source: { id: SOURCE_ID, position: 8, source: SOURCE_NAME, bookmaker: BOOKMAKER, market: MARKET_NAME },
      checkedAt: new Date().toISOString(),
      live: { count: live.fixtures.length, cacheHit: live.cacheHit, cacheAgeSeconds: Math.max(0, (now() - live.at) / 1000) },
      results,
      upstream: upstreamStats(),
    });
  } catch (error) {
    const reason = classifyError(error);
    return json({
      ok: false,
      source: { id: SOURCE_ID, position: 8, source: SOURCE_NAME, bookmaker: BOOKMAKER, market: MARKET_NAME },
      error: reason,
      results: matches.map(match => ({ clientId: match?.clientId ?? match?.id ?? null, matched: false, market: unavailable(reason) })),
      upstream: upstreamStats(),
    }, 200); // fail closed for S8, never make caller treat adapter outage as engine outage
  }
}

async function probe(env) {
  try {
    const live = await liveFixtures(env);
    const sample = live.fixtures[0] ?? null;
    return json({
      ok: true,
      service: 'nomadtips3-s8-external',
      source: SOURCE_ID,
      bookmaker: BOOKMAKER,
      liveCount: live.fixtures.length,
      liveCacheHit: live.cacheHit,
      sample: sample ? { id: fixtureId(sample), ...fixtureTeams(sample), league: fixtureLeague(sample), goals: fixtureGoals(sample) } : null,
      upstream: upstreamStats(),
    });
  } catch (error) {
    return json({ ok: false, service: 'nomadtips3-s8-external', error: classifyError(error), upstream: upstreamStats() }, 200);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: json({}).headers });
    if (url.pathname === '/') {
      return json({
        service: 'nomadtips3-s8-external',
        status: 'running',
        role: 'external-price-adapter',
        source: { id: SOURCE_ID, position: 8, source: SOURCE_NAME, bookmaker: BOOKMAKER, market: MARKET_NAME },
        isolation: 'S1-S7 untouched',
        endpoints: ['/health', '/probe', 'POST /quotes'],
      });
    }
    if (url.pathname === '/health') {
      return json({
        ok: Boolean(env.FIVEDOLLAR_API_KEY),
        service: 'nomadtips3-s8-external',
        keyConfigured: Boolean(env.FIVEDOLLAR_API_KEY),
        optionalAdapterTokenConfigured: Boolean(env.S8_ADAPTER_TOKEN),
        liveCacheAgeSeconds: liveCache.at ? Math.max(0, (now() - liveCache.at) / 1000) : null,
        oddsCacheEntries: oddsCache.size,
        upstream: upstreamStats(),
        contract: { maxBatch: MAX_QUOTES_PER_BATCH, liveCacheSeconds: LIVE_CACHE_MS / 1000, oddsCacheSeconds: ODDS_CACHE_MS / 1000, failClosed: true },
      });
    }
    if (url.pathname === '/probe' && request.method === 'GET') return probe(env);
    if (url.pathname === '/quotes' && request.method === 'POST') return quotes(request, env);
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  },
};

export { normalizeName, nameScore, matchFixture, extractBet365Asian };
