import baseWorker from './index.js';

const API_BASE = 'https://v3.football.api-sports.io';
const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const REQUIRED_STATS = ['attacks', 'dangerous_attacks', 'shots', 'shots_on_target', 'corners', 'possession'];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://mccareysupon-png.github.io';
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
  const out = {};
  (Array.isArray(raw) ? raw : []).slice(0, 2).forEach((team, index) => {
    const side = index === 0 ? 'home' : 'away';
    for (const row of team?.statistics || team?.stats || []) {
      const key = normalizeStatKey(row?.type || row?.name);
      if (!key) continue;
      if (!out[key]) out[key] = { home: null, away: null };
      out[key][side] = row?.value ?? null;
    }
  });
  return out;
}

function normalizeEvents(raw) {
  return (Array.isArray(raw) ? raw : []).map(event => ({
    minute: event?.time?.elapsed ?? null,
    extra: event?.time?.extra ?? null,
    team: event?.team?.name ?? null,
    type: event?.type ?? null,
    detail: event?.detail ?? null,
    player: event?.player?.name ?? null,
    comments: event?.comments ?? null
  }));
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

function completeStatistics(stats) {
  const missing = REQUIRED_STATS.filter(key =>
    numeric(stats[key]?.home) === null || numeric(stats[key]?.away) === null
  );
  return { ok: missing.length === 0, missing };
}

function isHomeValue(value, homeName) {
  const text = String(value ?? '').trim().toLowerCase();
  const home = String(homeName ?? '').trim().toLowerCase();
  return text === 'home' || text === '1' || (home && text.includes(home));
}

function handicapNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/([+-](?:\d+(?:\.\d+)?|\.\d+))/);
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

function homeMarkets(oddsItem, homeName) {
  let win = null;
  let ah = null;
  let ahOdd = null;
  const containers = flattenBetContainers(oddsItem?.odds || oddsItem);

  for (const container of containers) {
    const betName = `${container.name} ${container.context}`.toLowerCase();
    const isWinner = /(match winner|1x2|fulltime result|moneyline|winner)/.test(betName);
    const isAh = /(asian handicap|asian line|\bah\b)/.test(betName);
    if (!isWinner && !isAh) continue;

    const ordered = [...container.values].sort((a, b) => Number(Boolean(b?.main)) - Number(Boolean(a?.main)));
    for (const value of ordered) {
      const sideValue = value?.value ?? value?.name ?? value?.label ?? value?.team;
      if (!isHomeValue(sideValue, homeName)) continue;
      const odd = numeric(value?.odd ?? value?.odds ?? value?.price ?? value?.decimal);
      if (isWinner && win === null && odd !== null) win = odd;
      if (isAh && ah === null) {
        ah = handicapNumber(value?.handicap ?? value?.line ?? value?.hdp ?? sideValue);
        if (ah !== null) ahOdd = odd;
      }
    }
  }
  return { win, ah, ahOdd, complete: win !== null && ah !== null };
}

async function liveConditionScan(request, env) {
  const warnings = [];
  const livePayload = await apiFetch('/fixtures?live=all', env, 55);
  const liveItems = (Array.isArray(livePayload?.response) ? livePayload.response : [])
    .filter(item => LIVE_STATUSES.has(String(item?.fixture?.status?.short || '').toUpperCase()));

  const preliminary = liveItems.filter(item => {
    const match = fixtureSummary(item);
    return match.id && match.minute !== null && match.minute >= 60 && match.minute <= 80 &&
      match.homeScore !== null && match.awayScore !== null && match.homeScore === match.awayScore;
  });

  const ids = preliminary.map(item => Number(item.fixture.id)).filter(Number.isInteger);
  const chunks = [];
  for (let index = 0; index < ids.length; index += 20) chunks.push(ids.slice(index, index + 20));

  const detailSettled = await Promise.allSettled(
    chunks.map(chunk => apiFetch(`/fixtures?ids=${chunk.join('-')}`, env, 55))
  );
  const detailedItems = [];
  for (const entry of detailSettled) {
    if (entry.status === 'fulfilled') {
      detailedItems.push(...(Array.isArray(entry.value?.response) ? entry.value.response : []));
    } else {
      warnings.push(`fixture details: ${entry.reason?.message || 'request failed'}`);
    }
  }

  let completeStats = 0;
  let completeMarkets = 0;
  let redSafe = 0;
  const statEligible = [];

  for (const item of detailedItems) {
    const match = fixtureSummary(item);
    const stats = normalizeStatistics(item?.statistics);
    const quality = completeStatistics(stats);
    if (!quality.ok) continue;
    completeStats += 1;
    statEligible.push({ item, match, stats });
  }

  const oddsSettled = await Promise.allSettled(
    statEligible.map(entry => apiFetch(`/odds/live?fixture=${entry.match.id}`, env, 55))
  );

  const candidates = [];
  oddsSettled.forEach((entry, index) => {
    const source = statEligible[index];
    if (!source) return;
    if (entry.status !== 'fulfilled') {
      warnings.push(`live odds ${source.match.id}: ${entry.reason?.message || 'request failed'}`);
      return;
    }

    const oddsItem = Array.isArray(entry.value?.response) ? entry.value.response[0] : null;
    const markets = homeMarkets(oddsItem, source.match.home);
    if (!markets.complete) return;
    completeMarkets += 1;
    if (!(markets.win > 1.70 && markets.ah >= 0.25)) return;

    const homeRed = numeric(source.stats.red_cards?.home) || 0;
    const awayRed = numeric(source.stats.red_cards?.away) || 0;
    if (homeRed > awayRed) return;
    redSafe += 1;

    candidates.push({
      fixtureId: source.match.id,
      kickoffUtc: source.match.kickoffUtc,
      status: source.match.status,
      minute: source.match.minute,
      league: source.match.league,
      country: source.match.country,
      home: source.match.home,
      away: source.match.away,
      score: { home: source.match.homeScore, away: source.match.awayScore },
      stats: source.stats,
      events: normalizeEvents(source.item?.events),
      markets: {
        homeWin: markets.win,
        homeAh: markets.ah,
        homeAhOdds: markets.ahOdd
      },
      redCards: { home: homeRed, away: awayRed },
      homeOnly: true,
      completeData: true
    });
  });

  return json(request, {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'cloudflare-worker · api-football',
    mode: 'PAGE-5-ALL-LIVE-HOME-ONLY',
    refreshSeconds: 60,
    counts: {
      allLive: liveItems.length,
      tiedMinute60To80: preliminary.length,
      detailed: detailedItems.length,
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
