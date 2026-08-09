import baseWorker from './index.js';
import { getActiveConditionConfig } from './condition-config.js';
import { sharedApiFetch } from './shared-api-football.js';

const API_BASE = 'https://v3.football.api-sports.io';
const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const REQUIRED_STATS = [
  'attacks',
  'dangerous_attacks',
  'shots',
  'shots_on_target',
  'corners',
  'possession'
];
const LIVE_CACHE_SECONDS = 15;
const STATS_CACHE_SECONDS = 60;
const ODDS_CACHE_SECONDS = 5;
// API-Football live-bet IDs are a separate namespace from pre-match bet IDs.
// 33 = Asian Handicap, 59 = Fulltime Result (1X2) in /odds/live/bets.
const LIVE_MARKET_BET_IDS = Object.freeze({ AH: 33, WIN: 59 });
const DEFAULT_CACHE_SECONDS = 60;
const CAR3_MIN_GAP_MS = 7000;
const CAR3_MAX_SLOT_WAIT_MS = 12_000;
const CAR3_COOLDOWN_MS = 90_000;
const CAR3_MAX_COOLDOWN_MS = 5 * 60_000;
const CAR3_STALE_CACHE_SECONDS = 30 * 60;
let car3GuardReady = false;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://mccareysupon-png.github.io';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

function numeric(value) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(max = 250) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % Math.max(1, max);
}

function apiErrorDetail(payload) {
  const errors = payload?.errors;
  if (!errors) return '';
  if (typeof errors === 'string') return errors.trim();
  if (Array.isArray(errors)) {
    if (errors.length === 0) return '';
    try { return JSON.stringify(errors); } catch { return String(errors); }
  }
  if (typeof errors === 'object') {
    if (Object.keys(errors).length === 0) return '';
    try { return JSON.stringify(errors); } catch { return String(errors); }
  }
  return String(errors);
}

function isRateLimit(response, payload) {
  const detail = `${response?.status || ''} ${payload?.message || ''} ${apiErrorDetail(payload)}`;
  return response?.status === 429 || /too many requests|rate.?limit|requests per minute/i.test(detail);
}

function cacheSecondsForPath(path) {
  if (path.startsWith('/odds/live')) return ODDS_CACHE_SECONDS;
  if (path.startsWith('/fixtures?live=')) return LIVE_CACHE_SECONDS;
  if (path.startsWith('/fixtures?ids=')) return STATS_CACHE_SECONDS;
  if (path.startsWith('/fixtures/statistics')) return STATS_CACHE_SECONDS;
  return DEFAULT_CACHE_SECONDS;
}

function retryAfterMs(response) {
  const raw = response?.headers?.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

async function ensureCar3Guard(env) {
  if (!env.DB) return false;
  if (car3GuardReady) return true;
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS car3_api_rate_guard (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_started_at INTEGER NOT NULL DEFAULT 0,
        cooldown_until INTEGER NOT NULL DEFAULT 0,
        consecutive_429 INTEGER NOT NULL DEFAULT 0,
        last_429_at INTEGER,
        updated_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`
      INSERT OR IGNORE INTO car3_api_rate_guard (
        id, last_started_at, cooldown_until, consecutive_429, updated_at
      ) VALUES (1, 0, 0, 0, ?)
    `).bind(Date.now())
  ]);
  car3GuardReady = true;
  return true;
}

async function car3GuardState(env) {
  if (!env.DB) return null;
  return env.DB.prepare(`
    SELECT last_started_at, cooldown_until, consecutive_429
    FROM car3_api_rate_guard WHERE id = 1
  `).first();
}

async function acquireCar3Slot(env) {
  if (!(await ensureCar3Guard(env))) {
    await sleep(jitter(250));
    return { protected: false, blocked: false };
  }

  const started = Date.now();
  while (Date.now() - started < CAR3_MAX_SLOT_WAIT_MS) {
    const now = Date.now();
    const state = await car3GuardState(env);
    const cooldownUntil = Number(state?.cooldown_until || 0);
    if (cooldownUntil > now) {
      return { protected: true, blocked: true, cooldownUntil };
    }

    const lastStarted = Number(state?.last_started_at || 0);
    const eligibleAt = lastStarted + CAR3_MIN_GAP_MS;
    if (eligibleAt > now) {
      await sleep(Math.min(eligibleAt - now + jitter(180), 1600));
      continue;
    }

    const claim = await env.DB.prepare(`
      UPDATE car3_api_rate_guard
      SET last_started_at = ?, updated_at = ?
      WHERE id = 1 AND last_started_at = ? AND cooldown_until <= ?
    `).bind(now, now, lastStarted, now).run();
    if (Number(claim?.meta?.changes || 0) === 1) {
      return { protected: true, blocked: false };
    }
    await sleep(100 + jitter(150));
  }

  return {
    protected: true,
    blocked: true,
    cooldownUntil: Date.now() + 5000
  };
}

async function recordCar3Success(env) {
  if (!env.DB) return;
  await env.DB.prepare(`
    UPDATE car3_api_rate_guard
    SET cooldown_until = 0, consecutive_429 = 0, updated_at = ?
    WHERE id = 1
  `).bind(Date.now()).run();
}

async function recordCar3RateLimit(env, response) {
  const now = Date.now();
  let strikes = 1;
  if (env.DB) {
    const state = await car3GuardState(env).catch(() => null);
    strikes = Math.min(3, Number(state?.consecutive_429 || 0) + 1);
  }
  const providerWait = retryAfterMs(response);
  const exponential = CAR3_COOLDOWN_MS * (2 ** (strikes - 1));
  const waitMs = Math.min(
    CAR3_MAX_COOLDOWN_MS,
    Math.max(CAR3_COOLDOWN_MS, providerWait || exponential)
  ) + jitter(1200);
  const cooldownUntil = now + waitMs;

  if (env.DB) {
    await env.DB.prepare(`
      UPDATE car3_api_rate_guard
      SET cooldown_until = ?, consecutive_429 = ?, last_429_at = ?, updated_at = ?
      WHERE id = 1
    `).bind(cooldownUntil, strikes, now, now).run();
  }
  console.warn(JSON.stringify({ event: 'car3_api_football_429', cooldownUntil, strikes }));
  return cooldownUntil;
}

function car3CacheKeys(apiUrl) {
  const token = encodeURIComponent(apiUrl);
  return {
    fresh: new Request(`https://car3-cache.nomadtips3.internal/fresh?u=${token}`),
    stale: new Request(`https://car3-cache.nomadtips3.internal/stale?u=${token}`)
  };
}

async function cachedJson(cache, key) {
  if (!cache) return null;
  const response = await cache.match(key);
  return response ? response.json() : null;
}

async function storeCar3Payload(cache, keys, payload, ttlSeconds) {
  if (!cache) return;
  const body = JSON.stringify(payload);
  await Promise.all([
    cache.put(keys.fresh, new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttlSeconds}`
      }
    })),
    cache.put(keys.stale, new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CAR3_STALE_CACHE_SECONDS}`
      }
    }))
  ]);
}

async function apiFetch(path, env, cacheSeconds = cacheSecondsForPath(path)) {
  const result = await sharedApiFetch(path, env, cacheSeconds);
  return result.payload;
}

function normalizeStatKey(type) {
  const key = String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return ({
    attacks: 'attacks',
    dangerousattacks: 'dangerous_attacks',
    ballpossession: 'possession',
    totalshots: 'shots',
    shotsongoal: 'shots_on_target',
    shotsontarget: 'shots_on_target',
    cornerkicks: 'corners',
    redcards: 'red_cards'
  })[key] || null;
}

function normalizeStatistics(raw) {
  const output = {};
  const teams = Array.isArray(raw) ? raw : [];
  teams.slice(0, 2).forEach((team, index) => {
    const side = index === 0 ? 'home' : 'away';
    for (const row of team?.statistics || team?.stats || []) {
      const key = normalizeStatKey(row?.type || row?.name);
      if (!key) continue;
      if (!output[key]) output[key] = { home: null, away: null };
      output[key][side] = row?.value ?? null;
    }
  });
  return output;
}

function swapStatistics(stats) {
  const output = {};
  for (const [key, value] of Object.entries(stats || {})) {
    output[key] = { home: value?.away ?? null, away: value?.home ?? null };
  }
  return output;
}

function fixtureSummary(item) {
  const fixture = item?.fixture || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};
  return {
    id: Number(fixture.id) || null,
    status: String(fixture?.status?.short || '').toUpperCase(),
    minute: numeric(fixture?.status?.elapsed),
    kickoffUtc: fixture.date ?? null,
    league: item?.league?.name ?? 'Live Football',
    country: item?.league?.country ?? 'World',
    home: teams?.home?.name ?? 'Home',
    away: teams?.away?.name ?? 'Away',
    homeScore: numeric(goals?.home),
    awayScore: numeric(goals?.away)
  };
}

function scoreContext(selectedScore, opponentScore) {
  const difference = selectedScore - opponentScore;
  if (difference > 0) return { state: 'HOME_LEADING', goalDifference: difference };
  if (difference < 0) return { state: 'HOME_TRAILING', goalDifference: difference };
  return { state: 'TIED', goalDifference: 0 };
}

function completeStatistics(stats) {
  const missing = REQUIRED_STATS.filter(key =>
    numeric(stats[key]?.home) === null || numeric(stats[key]?.away) === null
  );
  return { ok: missing.length === 0, missing };
}

function isSideValue(value, teamName, side) {
  const text = String(value ?? '').trim().toLowerCase();
  const team = String(teamName ?? '').trim().toLowerCase();
  if (team && text.includes(team)) return true;
  if (side === 'HOME') return text === 'home' || text === '1';
  return text === 'away' || text === '2';
}

function handicapNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/([+-]?(?:\d+(?:\.\d+)?|\.\d+))/);
  return match ? numeric(match[1]) : null;
}

function flattenBetContainers(root) {
  const results = [];
  const seen = new Set();
  function walk(value, context = '') {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((child, index) => walk(child, `${context} ${index}`));
      return;
    }
    const name = value.name || value.bet?.name || value.label || '';
    const values = value.values || value.outcomes || value.selections;
    if (Array.isArray(values)) results.push({ name: String(name), values, context });
    Object.entries(value).slice(0, 500).forEach(([key, child]) => walk(child, `${context} ${key} ${name}`));
  }
  walk(root);
  return results;
}

function sideMarkets(oddsItem, teamName, side) {
  let win = null;
  let ah = null;
  let ahOdd = null;
  const containers = flattenBetContainers(oddsItem?.odds || oddsItem);

  for (const container of containers) {
    const betName = `${container.name} ${container.context}`.toLowerCase();
    const isWinner = /(match winner|1x2|fulltime result|moneyline|winner)/.test(betName);
    const isAh = /(asian handicap|asian line|\bah\b)/.test(betName);
    if (!isWinner && !isAh) continue;

    const ordered = [...container.values]
      .sort((a, b) => Number(Boolean(b?.main)) - Number(Boolean(a?.main)));
    for (const value of ordered) {
      if (value?.suspended === true) continue;
      const sideValue = value?.value ?? value?.name ?? value?.label ?? value?.team;
      if (!isSideValue(sideValue, teamName, side)) continue;
      const odd = numeric(value?.odd ?? value?.odds ?? value?.price ?? value?.decimal);
      if (isWinner && win === null && odd !== null) win = odd;
      if (isAh && ah === null) {
        ah = handicapNumber(value?.handicap ?? value?.line ?? value?.hdp ?? sideValue);
        if (ah !== null) ahOdd = odd;
      }
    }
  }
  return { win, ah, ahOdd };
}

function inOptionalRange(value, min, max) {
  if (value === null) return false;
  if (value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

function selectedSides(config) {
  return config.side === 'BOTH' ? ['HOME', 'AWAY'] : [config.side];
}

function selectedCandidate(source, markets, config, selectedSide) {
  const awaySelected = selectedSide === 'AWAY';
  const stats = awaySelected ? swapStatistics(source.stats) : source.stats;
  const selectedName = awaySelected ? source.match.away : source.match.home;
  const opponentName = awaySelected ? source.match.home : source.match.away;
  const selectedScore = awaySelected ? source.match.awayScore : source.match.homeScore;
  const opponentScore = awaySelected ? source.match.homeScore : source.match.awayScore;
  const selectedRed = numeric(stats.red_cards?.home) || 0;
  const opponentRed = numeric(stats.red_cards?.away) || 0;
  const score = scoreContext(selectedScore, opponentScore);
  const selectedOdds = config.market === 'AH' ? markets.ahOdd : markets.win;

  return {
    fixtureId: source.match.id,
    kickoffUtc: source.match.kickoffUtc,
    status: source.match.status,
    minute: source.match.minute,
    league: source.match.league,
    country: source.match.country,
    home: selectedName,
    away: opponentName,
    actualHome: source.match.home,
    actualAway: source.match.away,
    selectedSide,
    selectedMarket: config.market,
    selectedOdds,
    score: { home: selectedScore, away: opponentScore },
    actualScore: { home: source.match.homeScore, away: source.match.awayScore },
    scoreState: score.state,
    goalDifference: score.goalDifference,
    stats,
    markets: {
      homeWin: markets.win,
      homeAh: markets.ah,
      homeAhOdds: markets.ahOdd,
      selectedOdds
    },
    redCards: { home: selectedRed, away: opponentRed },
    completeData: true
  };
}

async function batchedFixtureStatistics(preliminary, env, warnings) {
  const map = new Map();
  const ids = preliminary.map(({ match }) => Number(match.id)).filter(Number.isInteger);

  for (let index = 0; index < ids.length; index += 20) {
    const group = ids.slice(index, index + 20);
    if (!group.length) continue;
    try {
      const payload = await apiFetch(`/fixtures?ids=${group.join('-')}`, env, STATS_CACHE_SECONDS);
      for (const item of Array.isArray(payload?.response) ? payload.response : []) {
        const fixtureId = Number(item?.fixture?.id);
        if (!Number.isInteger(fixtureId)) continue;
        map.set(fixtureId, normalizeStatistics(item?.statistics));
      }
    } catch (error) {
      warnings.push(`fixture batch ${group[0]}-${group.at(-1)}: ${error?.message || 'request failed'}`);
    }
    if (index + 20 < ids.length) await sleep(300);
  }

  return map;
}

function liveOddsRows(payload) {
  return Array.isArray(payload?.response) ? payload.response : [];
}

function liveOddsFixtureId(item) {
  const fixtureId = Number(item?.fixture?.id ?? item?.fixture_id ?? item?.fixtureId ?? item?.id);
  return Number.isInteger(fixtureId) && fixtureId > 0 ? fixtureId : null;
}

function liveOddsByFixture(payload, fixtureIds) {
  const wanted = new Set(fixtureIds.map(Number));
  const map = new Map();

  // Keep every returned row for a fixture. Some provider responses can contain
  // more than one odds container for the same fixture; dropping all but the
  // last row can make a valid AH/1X2 market look absent.
  for (const item of liveOddsRows(payload)) {
    const fixtureId = liveOddsFixtureId(item);
    if (!fixtureId || !wanted.has(fixtureId)) continue;
    const rows = map.get(fixtureId) || [];
    rows.push(item);
    map.set(fixtureId, rows);
  }
  return map;
}

function marketOddsPath(config) {
  const betId = LIVE_MARKET_BET_IDS[String(config?.market || '').toUpperCase()];
  return betId ? `/odds/live?bet=${betId}` : '/odds/live';
}

function providerProtectionError(error) {
  return /(?:\b429\b|too many|rate.?limit|cooldown|circuit[_ ]?open|waiting[_ ]?api|slot[_ ]?timeout)/i
    .test(String(error?.message || error || ''));
}

function priceGateDiagnosis({
  completeStats,
  completeMarkets,
  oddsFixtureMatched,
  marketParseMisses,
  liveOddsRequestErrors,
  liveOddsRateLimited
}) {
  if (completeStats <= 0) return 'WAITING_FOR_COMPLETE_STATS';
  if (completeMarkets > 0) return 'MARKET_OK';
  if (liveOddsRateLimited > 0) return 'ODDS_PROVIDER_PROTECTION';
  if (liveOddsRequestErrors > 0 && oddsFixtureMatched <= 0) return 'ODDS_REQUEST_FAILED';
  if (oddsFixtureMatched <= 0) return 'NO_LIVE_ODDS_COVERAGE';
  if (marketParseMisses > 0) return 'TARGET_MARKET_NOT_FOUND';
  return 'NO_ELIGIBLE_LIVE_ODDS';
}

function adaptiveRefreshSeconds(liveItems, preliminary, completeStats, completeMarkets, config) {
  if (completeMarkets > 0) return 5;
  if (completeStats > 0) return 15;
  if (preliminary.length > 0) return 30;

  const approachStart = Math.max(0, Number(config.minuteMin || 1) - 10);
  const approaching = liveItems.some(item => {
    const minute = numeric(item?.fixture?.status?.elapsed);
    return minute !== null && minute >= approachStart && minute < Number(config.minuteMin || 1);
  });
  if (approaching) return 60;
  return 240;
}

async function liveConditionScan(request, env) {
  const warnings = [];
  const config = await getActiveConditionConfig(env);
  const livePayload = await apiFetch('/fixtures?live=all', env, LIVE_CACHE_SECONDS);
  const liveItems = (Array.isArray(livePayload?.response) ? livePayload.response : [])
    .filter(item => LIVE_STATUSES.has(String(item?.fixture?.status?.short || '').toUpperCase()));

  const preliminary = liveItems
    .map(item => ({ item, match: fixtureSummary(item) }))
    .filter(({ match }) => {
      if (!match.id || match.minute === null || match.homeScore === null || match.awayScore === null) return false;
      if (match.minute < config.minuteMin || match.minute > config.minuteMax) return false;
      if (config.goalGapLimited && Math.abs(match.homeScore - match.awayScore) > config.maxGoalGap) return false;
      return true;
    });

  const statsMap = await batchedFixtureStatistics(preliminary, env, warnings);
  const statEligible = [];
  let completeStats = 0;

  for (const source of preliminary) {
    const stats = statsMap.get(Number(source.match.id)) || {};
    if (!completeStatistics(stats).ok) continue;
    completeStats += 1;
    statEligible.push({ ...source, stats });
  }

  let oddsMap = new Map();
  let oddsEndpointRows = 0;
  let oddsFixtureMatched = 0;
  let noOddsCoverage = 0;
  let marketParseMisses = 0;
  let liveOddsRequestErrors = 0;
  let liveOddsRateLimited = 0;
  let liveOddsSource = 'not-requested';

  if (statEligible.length) {
    const fixtureIds = statEligible.map(({ match }) => match.id);
    const targetPath = marketOddsPath(config);

    try {
      // Ask API-Football only for the market that is active right now.
      // This avoids a large unfiltered live-odds payload and uses the provider's
      // dedicated in-play bet namespace (AH=33, Fulltime Result=59).
      const oddsPayload = await apiFetch(targetPath, env, ODDS_CACHE_SECONDS);
      oddsEndpointRows = liveOddsRows(oddsPayload).length;
      oddsMap = liveOddsByFixture(oddsPayload, fixtureIds);
      liveOddsSource = targetPath;
    } catch (error) {
      liveOddsRequestErrors += 1;
      if (providerProtectionError(error)) liveOddsRateLimited += 1;
      warnings.push(`live odds target ${targetPath}: ${error?.message || 'request failed'}`);

      // Only use the broad endpoint as a compatibility fallback for a genuine
      // target-endpoint failure. Never force a retry while the API guard is
      // protecting the provider.
      if (!providerProtectionError(error)) {
        try {
          const oddsPayload = await apiFetch('/odds/live', env, ODDS_CACHE_SECONDS);
          oddsEndpointRows = liveOddsRows(oddsPayload).length;
          oddsMap = liveOddsByFixture(oddsPayload, fixtureIds);
          liveOddsSource = '/odds/live:fallback';
        } catch (fallbackError) {
          liveOddsRequestErrors += 1;
          if (providerProtectionError(fallbackError)) liveOddsRateLimited += 1;
          warnings.push(`live odds fallback: ${fallbackError?.message || 'request failed'}`);
        }
      }
    }
  }

  const candidates = [];
  let completeMarkets = 0;
  let redSafe = 0;

  for (const source of statEligible) {
    const oddsItem = oddsMap.get(Number(source.match.id)) || null;
    if (!oddsItem) {
      noOddsCoverage += 1;
      continue;
    }
    oddsFixtureMatched += 1;
    let fixtureHasMarket = false;

    for (const selectedSide of selectedSides(config)) {
      const teamName = selectedSide === 'AWAY' ? source.match.away : source.match.home;
      const markets = sideMarkets(oddsItem, teamName, selectedSide);
      const targetMarketAvailable = config.market === 'AH'
        ? markets.ah !== null && markets.ahOdd !== null
        : markets.win !== null;
      if (!targetMarketAvailable) continue;
      fixtureHasMarket = true;

      const selectedOdds = config.market === 'AH' ? markets.ahOdd : markets.win;
      if (!inOptionalRange(selectedOdds, config.oddsMin, config.oddsMax)) continue;
      if (!inOptionalRange(markets.ah, config.ahMin, config.ahMax)) continue;

      const candidate = selectedCandidate(source, markets, config, selectedSide);
      if (candidate.redCards.home > candidate.redCards.away) continue;
      redSafe += 1;
      candidates.push(candidate);
    }

    if (fixtureHasMarket) completeMarkets += 1;
    else marketParseMisses += 1;
  }

  const priceGate = priceGateDiagnosis({
    completeStats,
    completeMarkets,
    oddsFixtureMatched,
    marketParseMisses,
    liveOddsRequestErrors,
    liveOddsRateLimited
  });
  if (completeStats > 0 && completeMarkets === 0) {
    warnings.unshift(
      `PRICE_GATE ${priceGate} · stats=${completeStats} · oddsMatched=${oddsFixtureMatched} · parseMiss=${marketParseMisses}`
    );
  }

  const refreshSeconds = adaptiveRefreshSeconds(
    liveItems,
    preliminary,
    completeStats,
    completeMarkets,
    config
  );

  return json(request, {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'cloudflare-worker · api-football · batched · car3-shared-guard',
    mode: 'PAGE-5-CONDITION-CONTROL-ADAPTIVE',
    refreshSeconds,
    polling: {
      sequenceSeconds: [240, 60, 30, 15, 5],
      liveScoreCacheSeconds: LIVE_CACHE_SECONDS,
      statisticsCacheSeconds: STATS_CACHE_SECONDS,
      liveOddsCacheSeconds: ODDS_CACHE_SECONDS,
      apiRateGuard: 'SHARED_API_FOOTBALL_GUARD'
    },
    config,
    counts: {
      allLive: liveItems.length,
      minuteWindow: preliminary.length,
      completeStats,
      completeMarkets,
      oddsEndpointRows,
      oddsFixtureMatched,
      noOddsCoverage,
      marketParseMisses,
      liveOddsRequestErrors,
      liveOddsRateLimited,
      liveOddsSource,
      priceGateDiagnosis: priceGate,
      redSafe,
      baseCandidates: candidates.length
    },
    candidates,
    warnings: warnings.slice(0, 20)
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/live') {
      if (request.method !== 'GET') return json(request, { ok: false, error: 'Method not allowed' }, 405);
      try {
        const payload = await apiFetch('/fixtures?live=all', env, LIVE_CACHE_SECONDS);
        const results = (Array.isArray(payload?.response) ? payload.response : []).map(fixtureSummary);
        return json(request, {
          ok: true,
          generatedAt: new Date().toISOString(),
          refreshSeconds: LIVE_CACHE_SECONDS,
          count: results.length,
          results
        });
      } catch (error) {
        return json(request, { ok: false, error: error?.message || 'Live fixture request failed' }, 502);
      }
    }

    if (url.pathname === '/live-condition-scan') {
      if (request.method !== 'GET') return json(request, { ok: false, error: 'Method not allowed' }, 405);
      try {
        return await liveConditionScan(request, env);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'Live condition scan failed',
          generatedAt: new Date().toISOString()
        }, 502);
      }
    }

    return baseWorker.fetch(request, env, ctx);
  }
};