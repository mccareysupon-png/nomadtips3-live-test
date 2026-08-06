import legacyWorker from './entry.js';

const API_BASE = 'https://v3.football.api-sports.io';
const REQUIRED_STATS = ['attacks', 'dangerous_attacks', 'shots', 'shots_on_target', 'corners', 'possession'];
const GAP_MS = 300;
const BATCH_SIZE = 20;
let nextStart = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const numeric = value => {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([
    'https://mccareysupon-png.github.io',
    'https://nomadtips3.com',
    'https://www.nomadtips3.com'
  ]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://mccareysupon-png.github.io',
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
      ...cors(request)
    }
  });
}

async function apiFetch(path, env, cacheSeconds) {
  if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not configured');
  const url = `${API_BASE}${path}`;
  const key = new Request(url, { method: 'GET' });
  const cached = await caches.default.match(key);
  if (cached) return cached.json();

  const wait = Math.max(0, nextStart - Date.now());
  if (wait) await sleep(wait);
  nextStart = Date.now() + GAP_MS;

  const response = await fetch(url, {
    headers: {
      'x-apisports-key': env.API_FOOTBALL_KEY,
      'Accept': 'application/json'
    }
  });
  const payload = await response.json().catch(() => null);
  const hasErrors = payload?.errors && Object.keys(payload.errors).length;
  if (!response.ok || hasErrors) {
    const detail = hasErrors
      ? (typeof payload.errors === 'string' ? payload.errors : JSON.stringify(payload.errors))
      : (payload?.message || `API HTTP ${response.status}`);
    throw new Error(detail);
  }

  await caches.default.put(key, new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}`
    }
  }));
  return payload;
}

function statKey(type) {
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

function normalizeStats(raw) {
  const output = {};
  for (const [index, team] of (Array.isArray(raw) ? raw : []).slice(0, 2).entries()) {
    const side = index === 0 ? 'home' : 'away';
    for (const row of team?.statistics || team?.stats || []) {
      const key = statKey(row?.type || row?.name);
      if (!key) continue;
      if (!output[key]) output[key] = { home: null, away: null };
      output[key][side] = row?.value ?? null;
    }
  }
  return output;
}

function completeStats(stats) {
  return REQUIRED_STATS.every(key =>
    numeric(stats[key]?.home) !== null && numeric(stats[key]?.away) !== null
  );
}

function flatten(root) {
  const result = [];
  const seen = new Set();
  const walk = (value, context = '') => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((child, index) => walk(child, `${context} ${index}`));
      return;
    }
    const name = value.name || value.bet?.name || value.label || '';
    const values = value.values || value.outcomes || value.selections;
    if (Array.isArray(values)) result.push({ name: String(name), values, context });
    Object.entries(value).slice(0, 500)
      .forEach(([key, child]) => walk(child, `${context} ${key} ${name}`));
  };
  walk(root);
  return result;
}

function isHome(value, homeName) {
  const text = String(value ?? '').trim().toLowerCase();
  const home = String(homeName ?? '').trim().toLowerCase();
  return text === 'home' || text === '1' || (home && text.includes(home));
}

function handicap(value) {
  const match = String(value ?? '').replace(',', '.').match(/([+-](?:\d+(?:\.\d+)?|\.\d+))/);
  return match ? numeric(match[1]) : null;
}

function homeMarkets(item, homeName) {
  let win = null;
  let ah = null;
  let ahOdds = null;
  for (const container of flatten(item?.odds || item)) {
    const name = `${container.name} ${container.context}`.toLowerCase();
    const winner = /(match winner|1x2|fulltime result|moneyline|winner)/.test(name);
    const asian = /(asian handicap|asian line|\bah\b)/.test(name);
    if (!winner && !asian) continue;
    const values = [...container.values]
      .sort((a, b) => Number(Boolean(b?.main)) - Number(Boolean(a?.main)));
    for (const value of values) {
      const side = value?.value ?? value?.name ?? value?.label ?? value?.team;
      if (!isHome(side, homeName)) continue;
      const odd = numeric(value?.odd ?? value?.odds ?? value?.price ?? value?.decimal);
      if (winner && win === null && odd !== null) win = odd;
      if (asian && ah === null) {
        ah = handicap(value?.handicap ?? value?.line ?? value?.hdp ?? side);
        if (ah !== null) ahOdds = odd;
      }
    }
  }
  return { win, ah, ahOdds, complete: win !== null && ah !== null && ahOdds !== null };
}

function batches(values) {
  const output = [];
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    output.push(values.slice(index, index + BATCH_SIZE));
  }
  return output;
}

async function safeScan(request, env, ctx) {
  const liveResponse = await legacyWorker.fetch(
    new Request('https://internal.nomadtips3/live', { method: 'GET' }),
    env,
    ctx
  );
  const livePayload = await liveResponse.json().catch(() => null);
  if (!liveResponse.ok || !livePayload?.ok) {
    throw new Error(livePayload?.error || `Live fixtures HTTP ${liveResponse.status}`);
  }

  const allLive = Array.isArray(livePayload.results) ? livePayload.results : [];
  const preliminary = allLive.filter(match =>
    match.id && match.minute !== null && match.minute >= 60 && match.minute <= 80 &&
    match.homeScore !== null && match.awayScore !== null
  );

  const counts = {
    allLive: allLive.length,
    minute60To80: preliminary.length,
    detailed: 0,
    completeStats: 0,
    completeMarkets: 0,
    redSafe: 0,
    baseCandidates: 0
  };
  if (!preliminary.length) {
    return json(request, {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: 'cloudflare-worker · api-football',
      mode: 'PAGE-5-BATCHED-RATE-SAFE',
      refreshSeconds: 60,
      counts,
      candidates: [],
      warnings: []
    });
  }

  const details = new Map();
  for (const group of batches(preliminary.map(match => Number(match.id)))) {
    const payload = await apiFetch(`/fixtures?ids=${group.join('-')}`, env, 145);
    for (const item of Array.isArray(payload?.response) ? payload.response : []) {
      const id = Number(item?.fixture?.id);
      if (id) details.set(id, item);
    }
  }

  const oddsPayload = await apiFetch('/odds/live', env, 45);
  const odds = new Map();
  for (const item of Array.isArray(oddsPayload?.response) ? oddsPayload.response : []) {
    const id = Number(item?.fixture?.id ?? item?.fixture_id ?? item?.fixture);
    if (id) odds.set(id, item);
  }

  const candidates = [];
  for (const match of preliminary) {
    const detail = details.get(Number(match.id));
    if (!detail) continue;
    counts.detailed += 1;
    const stats = normalizeStats(detail.statistics);
    if (!completeStats(stats)) continue;
    counts.completeStats += 1;

    const markets = homeMarkets(odds.get(Number(match.id)), match.home);
    if (!markets.complete) continue;
    counts.completeMarkets += 1;
    if (!(markets.win > 1.70 && markets.ah >= 0.25)) continue;

    const homeRed = numeric(stats.red_cards?.home) || 0;
    const awayRed = numeric(stats.red_cards?.away) || 0;
    if (homeRed > awayRed) continue;
    counts.redSafe += 1;

    const difference = Number(match.homeScore) - Number(match.awayScore);
    candidates.push({
      fixtureId: Number(match.id),
      kickoffUtc: match.kickoffUtc,
      status: match.status,
      minute: Number(match.minute),
      league: match.league,
      country: match.country,
      home: match.home,
      away: match.away,
      score: { home: Number(match.homeScore), away: Number(match.awayScore) },
      scoreState: difference > 0 ? 'HOME_LEADING' : difference < 0 ? 'HOME_TRAILING' : 'TIED',
      goalDifference: difference,
      stats,
      markets: {
        homeWin: markets.win,
        homeAh: markets.ah,
        homeAhOdds: markets.ahOdds
      },
      redCards: { home: homeRed, away: awayRed },
      homeOnly: true,
      scoreRestricted: false,
      completeData: true
    });
  }
  counts.baseCandidates = candidates.length;

  return json(request, {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'cloudflare-worker · api-football',
    mode: 'PAGE-5-BATCHED-RATE-SAFE',
    refreshSeconds: 60,
    counts,
    candidates,
    warnings: []
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/live-condition-scan') {
      return legacyWorker.fetch(request, env, ctx);
    }
    if (request.method !== 'GET') {
      return json(request, { ok: false, error: 'Method not allowed' }, 405);
    }
    try {
      return await safeScan(request, env, ctx);
    } catch (error) {
      return json(request, {
        ok: false,
        error: error?.message || 'Rate-safe live scan failed',
        generatedAt: new Date().toISOString()
      }, 502);
    }
  }
};
