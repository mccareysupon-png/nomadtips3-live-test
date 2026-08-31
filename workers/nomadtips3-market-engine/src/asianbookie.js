const DEFAULT_BASE = 'https://beta.asianbookie.org';
const MATCH_PATH = '/api/poll/tipster';
const ODDS_PATH = '/api/poll/tipsterMatchOdds';

let matchCache = { at: 0, payload: null };
let oddsCache = { at: 0, payload: null };

const ID_KEYS = ['matchId','match_id','eventId','event_id','fixtureId','fixture_id','gameId','game_id','mid','id'];
const HOME_KEYS = ['homeTeam','home_team','homeName','home_name','teamHome','team_home','hteam','home'];
const AWAY_KEYS = ['awayTeam','away_team','awayName','away_name','teamAway','team_away','ateam','away'];

function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function keyMap(row = {}) {
  const out = new Map();
  for (const [key, value] of Object.entries(row || {})) out.set(normalizeKey(key), value);
  return out;
}

function pick(row, names) {
  const map = keyMap(row);
  for (const name of names) {
    const key = normalizeKey(name);
    if (map.has(key)) return map.get(key);
  }
  return null;
}

function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (isObject(value)) return text(value.name ?? value.teamName ?? value.title ?? value.label ?? value.value);
  return '';
}

function decimal(value) {
  const n = finite(value);
  return n !== null && n > 1 && n < 100 ? n : null;
}

function lineValue(value) {
  if (typeof value === 'string' && value.includes('/')) {
    const parts = value.replace(/[−–—]/g, '-').split('/').slice(0, 2).map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) return Number(((parts[0] + parts[1]) / 2).toFixed(4));
  }
  return finite(value);
}

function toTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n < 10_000_000_000 ? n * 1000 : n;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractId(row) {
  const value = pick(row, ID_KEYS);
  return value === null || value === undefined || value === '' ? '' : String(value).trim();
}

function extractHome(row) { return text(pick(row, HOME_KEYS)); }
function extractAway(row) { return text(pick(row, AWAY_KEYS)); }

function collectArrays(root, maxDepth = 5) {
  const found = [];
  const seen = new Set();
  function walk(value, path, depth) {
    if (depth > maxDepth || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      const rows = value.filter(isObject);
      if (rows.length) found.push({ path, rows });
      for (let i = 0; i < Math.min(value.length, 3); i += 1) walk(value[i], `${path}[${i}]`, depth + 1);
      return;
    }
    if (!isObject(value) || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, depth + 1);
  }
  walk(root, '$', 0);
  return found;
}

function rowKeys(row) {
  return Object.keys(row || {}).map(normalizeKey);
}

function matchScore(row) {
  let score = extractId(row) ? 12 : 0;
  if (extractHome(row)) score += 6;
  if (extractAway(row)) score += 6;
  const keys = rowKeys(row);
  if (keys.some(k => k.includes('league') || k.includes('competition'))) score += 1;
  if (keys.some(k => k.includes('minute') || k.includes('status'))) score += 1;
  return score;
}

function oddsScore(row) {
  let score = extractId(row) ? 20 : 0;
  const keys = rowKeys(row);
  for (const probe of ['odds','price','handicap','hdp','asian','over','under','draw','1x2','bookmaker','bookie','company']) {
    if (keys.some(k => k.includes(probe))) score += 1;
  }
  if (Object.values(row || {}).some(Array.isArray)) score += 3;
  return score;
}

function chooseArray(payload, scorer) {
  const ranked = collectArrays(payload)
    .map(entry => ({
      ...entry,
      score: entry.rows.reduce((sum, row) => sum + scorer(row), 0) / Math.max(1, entry.rows.length),
      idCoverage: entry.rows.filter(row => extractId(row)).length / Math.max(1, entry.rows.length),
    }))
    .sort((a, b) => b.idCoverage - a.idCoverage || b.score - a.score || b.rows.length - a.rows.length);
  return ranked[0] || { path: null, rows: [], score: 0, idCoverage: 0 };
}

function bookmakerName(row, fallback = '') {
  return text(pick(row, ['bookmakerName','bookmaker','bookieName','bookie','companyName','company','operator','sportsbook','sourceName','source'])) || fallback;
}

function observedAt(row, fallback) {
  return toTimestamp(pick(row, ['observedAt','updatedAt','updateTime','timestamp','time','lastUpdate','last_updated']), fallback);
}

function ahMarket(row) {
  const nested = pick(row, ['asianHandicap','asian_handicap','ah']);
  if (isObject(nested)) return ahMarket(nested);
  const line = lineValue(pick(row, ['handicap','hdp','ahLine','asianLine','line']));
  const homeOdds = decimal(pick(row, ['homeOdds','homePrice','home_odds','homeRate','home_rate','hOdds','hPrice']));
  const awayOdds = decimal(pick(row, ['awayOdds','awayPrice','away_odds','awayRate','away_rate','aOdds','aPrice']));
  return line !== null && homeOdds !== null && awayOdds !== null ? [{ line, homeOdds, awayOdds }] : [];
}

function oneXtwoMarket(row) {
  const nested = pick(row, ['oneXtwo','one_x_two','1x2','moneyline']);
  if (isObject(nested)) return oneXtwoMarket(nested);
  const home = decimal(pick(row, ['home1x2','homeWin','home_win','one','1','homeMl','home_ml']));
  const draw = decimal(pick(row, ['draw1x2','drawOdds','draw_odds','draw','x']));
  const away = decimal(pick(row, ['away1x2','awayWin','away_win','two','2','awayMl','away_ml']));
  return home !== null && draw !== null && away !== null ? { home, draw, away } : null;
}

function totalsMarket(row) {
  const nested = pick(row, ['overUnder','over_under','totals','ou']);
  if (isObject(nested)) return totalsMarket(nested);
  const line = lineValue(pick(row, ['total','totalLine','ouLine','goals','line']));
  const overOdds = decimal(pick(row, ['overOdds','overPrice','over_odds','overRate','over_rate','oOdds','oPrice']));
  const underOdds = decimal(pick(row, ['underOdds','underPrice','under_odds','underRate','under_rate','uOdds','uPrice']));
  return line !== null && overOdds !== null && underOdds !== null ? [{ line, overOdds, underOdds }] : [];
}

function quoteFromRow(row, fallbackBookmaker, fallbackObservedAt) {
  const ah = ahMarket(row);
  const oneXtwo = oneXtwoMarket(row);
  const totals = totalsMarket(row);
  if (!ah.length && !oneXtwo && !totals.length) return null;
  return {
    name: bookmakerName(row, fallbackBookmaker) || 'AsianBookie Reference',
    observedAt: observedAt(row, fallbackObservedAt),
    markets: { ah, oneXtwo, totals },
  };
}

function quotesForOddsRow(row, fallbackObservedAt) {
  const quotes = [];
  const direct = quoteFromRow(row, bookmakerName(row), fallbackObservedAt);
  if (direct) quotes.push(direct);

  for (const [key, value] of Object.entries(row || {})) {
    if (!Array.isArray(value)) continue;
    for (const child of value.filter(isObject)) {
      const quote = quoteFromRow(child, bookmakerName(child, text(key)), fallbackObservedAt);
      if (quote) quotes.push(quote);
    }
  }

  const dedupe = new Map();
  for (const quote of quotes) {
    const signature = JSON.stringify([quote.name, quote.markets]);
    if (!dedupe.has(signature)) dedupe.set(signature, quote);
  }
  return [...dedupe.values()];
}

function scoreValue(row) {
  const home = finite(pick(row, ['homeScore','home_score','scoreHome','score_home']));
  const away = finite(pick(row, ['awayScore','away_score','scoreAway','score_away']));
  return home !== null && away !== null ? [home, away] : null;
}

function summarizePayload(payload) {
  return {
    topLevelType: Array.isArray(payload) ? 'array' : typeof payload,
    topLevelKeys: isObject(payload) ? Object.keys(payload).slice(0, 40) : [],
    arrays: collectArrays(payload).slice(0, 12).map(entry => ({
      path: entry.path,
      rows: entry.rows.length,
      sampleKeys: Object.keys(entry.rows[0] || {}).slice(0, 40),
    })),
  };
}

class AsianBookieError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

async function fetchJson(base, path, timeoutMs) {
  const url = new URL(path, base);
  url.searchParams.set('t', String(Date.now()));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('asianbookie_timeout'), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
        referer: 'https://beta.asianbookie.org/en/tipster',
        'user-agent': 'NOMADTIPS3/3.42 market-adapter',
      },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) throw new AsianBookieError(`asianbookie_http_${response.status}`, { path, status: response.status, contentType });
    if (!contentType.toLowerCase().includes('json')) {
      const preview = (await response.text()).slice(0, 120).replace(/\s+/g, ' ');
      throw new AsianBookieError('asianbookie_non_json', { path, contentType, preview });
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new AsianBookieError('asianbookie_timeout', { path });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function cachedFetch(cache, ttlMs, base, path, timeoutMs) {
  const now = Date.now();
  if (cache.payload && now - cache.at < ttlMs) return { payload: cache.payload, cache: 'memory' };
  const payload = await fetchJson(base, path, timeoutMs);
  cache.at = Date.now();
  cache.payload = payload;
  return { payload, cache: 'fresh' };
}

export function asianBookieConfig(env = {}) {
  return {
    base: String(env.ASIANBOOKIE_BASE_URL || DEFAULT_BASE).trim(),
    matchCacheMs: Math.max(15_000, Math.min(300_000, Number(env.ASIANBOOKIE_MATCH_CACHE_MS) || 60_000)),
    oddsCacheMs: Math.max(5_000, Math.min(30_000, Number(env.ASIANBOOKIE_ODDS_CACHE_MS) || 7_500)),
    timeoutMs: Math.max(1_000, Math.min(12_000, Number(env.MARKET_PROVIDER_TIMEOUT_MS) || 6_000)),
  };
}

export async function fetchAsianBookiePayload(env = {}) {
  const config = asianBookieConfig(env);
  const fetchedAt = Date.now();
  const [matchResult, oddsResult] = await Promise.all([
    cachedFetch(matchCache, config.matchCacheMs, config.base, MATCH_PATH, config.timeoutMs),
    cachedFetch(oddsCache, config.oddsCacheMs, config.base, ODDS_PATH, config.timeoutMs),
  ]);

  const matchChoice = chooseArray(matchResult.payload, matchScore);
  const oddsChoice = chooseArray(oddsResult.payload, oddsScore);

  if (!matchChoice.rows.length || matchChoice.idCoverage === 0) {
    throw new AsianBookieError('asianbookie_match_schema_unrecognized', {
      matches: summarizePayload(matchResult.payload),
      odds: summarizePayload(oddsResult.payload),
    });
  }
  if (!oddsChoice.rows.length || oddsChoice.idCoverage === 0) {
    throw new AsianBookieError('asianbookie_odds_schema_unrecognized', {
      matches: summarizePayload(matchResult.payload),
      odds: summarizePayload(oddsResult.payload),
    });
  }

  const matchById = new Map();
  for (const row of matchChoice.rows) {
    const id = extractId(row);
    if (id) matchById.set(id, row);
  }

  const oddsById = new Map();
  for (const row of oddsChoice.rows) {
    const id = extractId(row);
    if (!id) continue;
    const quotes = quotesForOddsRow(row, fetchedAt);
    if (!quotes.length) continue;
    if (!oddsById.has(id)) oddsById.set(id, []);
    oddsById.get(id).push(...quotes);
  }

  const matches = [];
  const bookmakerNames = new Set();
  for (const [id, quotes] of oddsById.entries()) {
    const match = matchById.get(id);
    if (!match) continue;
    const home = extractHome(match);
    const away = extractAway(match);
    if (!home || !away) continue;
    for (const quote of quotes) bookmakerNames.add(quote.name);
    matches.push({
      matchKey: id,
      home,
      away,
      league: text(pick(match, ['leagueName','league','competitionName','competition','tournament'])),
      minute: finite(pick(match, ['minute','matchMinute','liveMinute','mins'])),
      score: scoreValue(match),
      observedAt: fetchedAt,
      bookmakers: quotes,
    });
  }

  if (!matches.length) {
    throw new AsianBookieError('asianbookie_no_joined_market_matches', {
      matchArrayPath: matchChoice.path,
      oddsArrayPath: oddsChoice.path,
      matchRows: matchChoice.rows.length,
      oddsRows: oddsChoice.rows.length,
      matchIds: matchById.size,
      oddsIds: oddsById.size,
      matches: summarizePayload(matchResult.payload),
      odds: summarizePayload(oddsResult.payload),
    });
  }

  return {
    provider: 'AsianBookie Tipster',
    observedAt: fetchedAt,
    matches,
    sourceDiagnostics: {
      source: 'asianbookie-tipster-xhr',
      matchPath: MATCH_PATH,
      oddsPath: ODDS_PATH,
      matchArrayPath: matchChoice.path,
      oddsArrayPath: oddsChoice.path,
      matchRows: matchChoice.rows.length,
      oddsRows: oddsChoice.rows.length,
      joinedMatches: matches.length,
      bookmakers: [...bookmakerNames].sort(),
      matchCache: matchResult.cache,
      oddsCache: oddsResult.cache,
    },
  };
}

export const ASIANBOOKIE_SOURCE = Object.freeze({
  base: DEFAULT_BASE,
  matchPath: MATCH_PATH,
  oddsPath: ODDS_PATH,
  matchCacheMs: 60_000,
  oddsCacheMs: 7_500,
});
