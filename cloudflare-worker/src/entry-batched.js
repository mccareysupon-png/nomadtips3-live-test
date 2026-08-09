import baseWorker from './index.js';
import { getActiveConditionConfig } from './condition-config.js';
import { sharedApiFetch } from './shared-api-football.js';

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
const ODDS_CACHE_SECONDS = 15;
const DEFAULT_CACHE_SECONDS = 60;
const LIVE_MARKET_BET_IDS = Object.freeze({ AH: 33, WIN: 59 });

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

function cacheSecondsForPath(path) {
  if (path.startsWith('/odds/live')) return ODDS_CACHE_SECONDS;
  if (path.startsWith('/fixtures?live=')) return LIVE_CACHE_SECONDS;
  if (path.startsWith('/fixtures?ids=')) return STATS_CACHE_SECONDS;
  if (path.startsWith('/fixtures/statistics')) return STATS_CACHE_SECONDS;
  return DEFAULT_CACHE_SECONDS;
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
      value.slice(0, 600).forEach((child, index) => walk(child, `${context} ${index}`));
      return;
    }

    const name = value.name || value.bet?.name || value.label || '';
    const id = Number(value.id ?? value.bet?.id ?? value.betId ?? value.bet_id) || null;
    const values = value.values || value.outcomes || value.selections;
    if (Array.isArray(values)) {
      results.push({ name: String(name), id, values, context, blocked: Boolean(value.blocked) });
    }
    Object.entries(value).slice(0, 600).forEach(([key, child]) => {
      walk(child, `${context} ${key} ${name}`);
    });
  }

  walk(root);
  return results;
}

function blockedSelection(value) {
  const suspended = value?.suspended;
  const blocked = value?.blocked;
  return suspended === true || suspended === 1 || suspended === '1' || suspended === 'true' ||
    blocked === true || blocked === 1 || blocked === '1' || blocked === 'true';
}

function sideMarkets(oddsItem, teamName, side) {
  let win = null;
  let ah = null;
  let ahOdd = null;
  const containers = flattenBetContainers(oddsItem?.odds || oddsItem);

  for (const container of containers) {
    if (container.blocked) continue;
    const betName = `${container.name} ${container.context}`.toLowerCase();
    const isWinner = container.id === LIVE_MARKET_BET_IDS.WIN ||
      /(match winner|1x2|fulltime result|full time result|moneyline|winner)/.test(betName);
    const isAh = container.id === LIVE_MARKET_BET_IDS.AH ||
      /(asian handicap|asian line|\bah\b)/.test(betName);
    if (!isWinner && !isAh) continue;

    const ordered = [...container.values]
      .sort((a, b) => Number(Boolean(b?.main)) - Number(Boolean(a?.main)));

    for (const value of ordered) {
      if (blockedSelection(value)) continue;
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

async function batchedFixtureStatistics(sources, env, warnings) {
  const map = new Map();
  const ids = sources.map(({ match }) => Number(match.id)).filter(Number.isInteger);

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

  for (const item of liveOddsRows(payload)) {
    const fixtureId = liveOddsFixtureId(item);
    if (!fixtureId || !wanted.has(fixtureId)) continue;
    const rows = map.get(fixtureId) || [];
    rows.push(item);
    map.set(fixtureId, rows);
  }

  return map;
}

function providerProtectionError(error) {
  return /(?:\b429\b|too many|rate.?limit|cooldown|circuit[_ ]?open|waiting[_ ]?api|slot[_ ]?timeout)/i
    .test(String(error?.message || error || ''));
}

function priceGateDiagnosis({
  minuteWindow,
  completeStats,
  completeMarkets,
  priceEligibleFixtures,
  oddsFixtureMatched,
  marketParseMisses,
  liveOddsRequestErrors,
  liveOddsRateLimited
}) {
  if (minuteWindow <= 0) return 'WAITING_FOR_MINUTE_WINDOW';
  if (liveOddsRateLimited > 0) return 'ODDS_PROVIDER_PROTECTION';
  if (liveOddsRequestErrors > 0 && oddsFixtureMatched <= 0) return 'ODDS_REQUEST_FAILED';
  if (oddsFixtureMatched <= 0) return 'NO_LIVE_ODDS_COVERAGE';
  if (completeMarkets <= 0 && marketParseMisses > 0) return 'TARGET_MARKET_NOT_FOUND';
  if (priceEligibleFixtures <= 0) return 'NO_ELIGIBLE_LIVE_ODDS';
  if (completeStats <= 0) return 'WAITING_FOR_COMPLETE_STATS';
  return 'MARKET_OK';
}

function adaptiveRefreshSeconds(liveItems, preliminary, completeStats, completeMarkets, config) {
  if (completeMarkets > 0) return 15;
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

  let oddsMap = new Map();
  let oddsEndpointRows = 0;
  let oddsFixtureMatched = 0;
  let noOddsCoverage = 0;
  let marketParseMisses = 0;
  let liveOddsRequestErrors = 0;
  let liveOddsRateLimited = 0;
  let liveOddsSource = 'not-requested';
  let completeMarkets = 0;

  if (preliminary.length) {
    const fixtureIds = preliminary.map(({ match }) => match.id);
    try {
      const oddsPayload = await apiFetch('/odds/live', env, ODDS_CACHE_SECONDS);
      oddsEndpointRows = liveOddsRows(oddsPayload).length;
      oddsMap = liveOddsByFixture(oddsPayload, fixtureIds);
      liveOddsSource = '/odds/live:odds-first';
    } catch (error) {
      liveOddsRequestErrors += 1;
      if (providerProtectionError(error)) liveOddsRateLimited += 1;
      warnings.push(`live odds first: ${error?.message || 'request failed'}`);
    }
  }

  const priceEligible = [];
  for (const source of preliminary) {
    const oddsItem = oddsMap.get(Number(source.match.id)) || null;
    if (!oddsItem) {
      noOddsCoverage += 1;
      continue;
    }

    oddsFixtureMatched += 1;
    let fixtureHasMarket = false;
    const marketsBySide = {};

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
      marketsBySide[selectedSide] = markets;
    }

    if (fixtureHasMarket) completeMarkets += 1;
    else marketParseMisses += 1;

    if (Object.keys(marketsBySide).length) {
      priceEligible.push({ ...source, marketsBySide });
    }
  }

  const statsMap = priceEligible.length
    ? await batchedFixtureStatistics(priceEligible, env, warnings)
    : new Map();
  const statEligible = [];
  let completeStats = 0;

  for (const source of priceEligible) {
    const stats = statsMap.get(Number(source.match.id)) || {};
    if (!completeStatistics(stats).ok) continue;
    completeStats += 1;
    statEligible.push({ ...source, stats });
  }

  const candidates = [];
  let redSafe = 0;

  for (const source of statEligible) {
    for (const selectedSide of selectedSides(config)) {
      const markets = source.marketsBySide?.[selectedSide];
      if (!markets) continue;

      const candidate = selectedCandidate(source, markets, config, selectedSide);
      if (candidate.redCards.home > candidate.redCards.away) continue;
      redSafe += 1;
      candidates.push(candidate);
    }
  }

  const priceGate = priceGateDiagnosis({
    minuteWindow: preliminary.length,
    completeStats,
    completeMarkets,
    priceEligibleFixtures: priceEligible.length,
    oddsFixtureMatched,
    marketParseMisses,
    liveOddsRequestErrors,
    liveOddsRateLimited
  });

  if (preliminary.length > 0 && priceGate !== 'MARKET_OK') {
    warnings.unshift(
      `PRICE_GATE ${priceGate} · minute=${preliminary.length} · oddsMatched=${oddsFixtureMatched} · market=${completeMarkets} · priceEligible=${priceEligible.length} · stats=${completeStats}`
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
    source: 'cloudflare-worker · api-football · odds-first · car3-shared-guard',
    mode: 'PAGE-5-CONDITION-CONTROL-ADAPTIVE',
    refreshSeconds,
    polling: {
      sequenceSeconds: [240, 60, 30, 15],
      liveScoreCacheSeconds: LIVE_CACHE_SECONDS,
      statisticsCacheSeconds: STATS_CACHE_SECONDS,
      liveOddsCacheSeconds: ODDS_CACHE_SECONDS,
      apiRateGuard: 'SHARED_API_FOOTBALL_GUARD',
      pricePipeline: 'ODDS_FIRST_THEN_STATS'
    },
    config,
    counts: {
      allLive: liveItems.length,
      minuteWindow: preliminary.length,
      completeStats,
      completeMarkets,
      priceEligibleFixtures: priceEligible.length,
      statsRequestedFixtures: priceEligible.length,
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