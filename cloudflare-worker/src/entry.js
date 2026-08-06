import baseWorker from './index.js';
import { getActiveConditionConfig } from './condition-config.js';

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

async function apiFetch(path, env, cacheSeconds = 55) {
  if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not configured');
  const apiUrl = `${API_BASE}${path}`;
  const cache = caches.default;
  const key = new Request(apiUrl, { method: 'GET' });
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const response = await fetch(apiUrl, {
    headers: {
      'x-apisports-key': env.API_FOOTBALL_KEY,
      'Accept': 'application/json'
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `API HTTP ${response.status}`);
  if (payload?.errors && Object.keys(payload.errors).length) {
    const detail = typeof payload.errors === 'string' ? payload.errors : JSON.stringify(payload.errors);
    throw new Error(detail);
  }

  await cache.put(key, new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}`
    }
  }));
  return payload;
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

function selectedCandidate(source, markets, config) {
  const awaySelected = config.side === 'AWAY';
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
    selectedSide: config.side,
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

async function liveConditionScan(request, env) {
  const warnings = [];
  const config = await getActiveConditionConfig(env);
  const livePayload = await apiFetch('/fixtures?live=all', env, 55);
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

  const statisticsSettled = await Promise.allSettled(
    preliminary.map(({ match }) => apiFetch(`/fixtures/statistics?fixture=${match.id}`, env, 55))
  );
  const statEligible = [];
  let completeStats = 0;

  statisticsSettled.forEach((entry, index) => {
    const source = preliminary[index];
    if (!source) return;
    if (entry.status !== 'fulfilled') {
      warnings.push(`statistics ${source.match.id}: ${entry.reason?.message || 'request failed'}`);
      return;
    }
    const stats = normalizeStatistics(entry.value?.response);
    if (!completeStatistics(stats).ok) return;
    completeStats += 1;
    statEligible.push({ ...source, stats });
  });

  const oddsSettled = await Promise.allSettled(
    statEligible.map(({ match }) => apiFetch(`/odds/live?fixture=${match.id}`, env, 55))
  );
  const candidates = [];
  let completeMarkets = 0;
  let redSafe = 0;

  oddsSettled.forEach((entry, index) => {
    const source = statEligible[index];
    if (!source) return;
    if (entry.status !== 'fulfilled') {
      warnings.push(`live odds ${source.match.id}: ${entry.reason?.message || 'request failed'}`);
      return;
    }
    const oddsItem = Array.isArray(entry.value?.response) ? entry.value.response[0] : null;
    const teamName = config.side === 'AWAY' ? source.match.away : source.match.home;
    const markets = sideMarkets(oddsItem, teamName, config.side);
    if (markets.win === null && markets.ah === null && markets.ahOdd === null) return;
    completeMarkets += 1;

    const selectedOdds = config.market === 'AH' ? markets.ahOdd : markets.win;
    if (!inOptionalRange(selectedOdds, config.oddsMin, config.oddsMax)) return;
    if (!inOptionalRange(markets.ah, config.ahMin, config.ahMax)) return;

    const candidate = selectedCandidate(source, markets, config);
    if (candidate.redCards.home > candidate.redCards.away) return;
    redSafe += 1;
    candidates.push(candidate);
  });

  return json(request, {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'cloudflare-worker · api-football',
    mode: 'PAGE-5-CONDITION-CONTROL',
    refreshSeconds: 60,
    config,
    counts: {
      allLive: liveItems.length,
      minuteWindow: preliminary.length,
      completeStats,
      completeMarkets,
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
        const payload = await apiFetch('/fixtures?live=all', env, 55);
        const results = (Array.isArray(payload?.response) ? payload.response : []).map(fixtureSummary);
        return json(request, { ok: true, generatedAt: new Date().toISOString(), count: results.length, results });
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
