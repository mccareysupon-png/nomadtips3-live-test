import baseWorker, { Nomad343Engine as BaseEngine } from './index.js';

const FLOW_HISTORY_MS = 180 * 60_000;
const FLOW_MAX_ROWS = 180;
const PRESSURE_WINDOW_MINUTES = 10;
const WEIGHTS = {
  attacks: 20,
  dangerousAttacks: 30,
  shotsOnTarget: 20,
  shotsOffTarget: 10,
  corners: 10,
  possession: 10
};

const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const pair = value => value && typeof value === 'object' ? { home: num(value.home), away: num(value.away) } : { home: null, away: null };
const now = () => Date.now();

function fixtureStatus(f) {
  return String(f?.boardState ?? f?.status ?? f?.statusCode ?? '').toLowerCase();
}
function isLive(f) {
  const s = fixtureStatus(f);
  return f?.boardState === 'live' || /live|in_play|in play|playing|first|second|\b1h\b|\b2h\b/.test(s);
}
function cardSide(v) {
  return (num(v?.yellow) ?? 0) + (num(v?.red) ?? 0);
}
function cardPair(cards) {
  return { home: cardSide(cards?.home), away: cardSide(cards?.away) };
}
function flowSnapshot(f, at) {
  return {
    at,
    minute: num(f?.minute),
    shotsOnTarget: pair(f?.statistics?.shotsOnTarget),
    shotsOffTarget: pair(f?.statistics?.shotsOffTarget),
    corners: pair(f?.corners),
    attacks: pair(f?.statistics?.attacks),
    dangerousAttacks: pair(f?.statistics?.dangerousAttacks),
    possession: pair(f?.statistics?.possession),
    goals: pair(f?.goals),
    cards: cardPair(f?.cards)
  };
}
function deltaValue(current, previous) {
  const c = num(current), p = num(previous);
  return c === null || p === null ? null : Math.max(0, c - p);
}
function deltaPair(current, previous) {
  return {
    home: deltaValue(current?.home, previous?.home),
    away: deltaValue(current?.away, previous?.away)
  };
}
function sideShare(value) {
  const h = num(value?.home), a = num(value?.away);
  if (h === null || a === null || h + a <= 0) return null;
  return { home: h / (h + a), away: a / (h + a) };
}
function pressurePoint(rows, index, windowMinutes = PRESSURE_WINDOW_MINUTES) {
  const current = rows[index];
  if (!current) return null;
  const target = Number(current.at || 0) - Number(windowMinutes || PRESSURE_WINDOW_MINUTES) * 60_000;
  let previous = null;
  for (let i = index - 1; i >= 0; i--) {
    if (Number(rows[i]?.at || 0) <= target) {
      previous = rows[i];
      break;
    }
  }
  if (!previous && index > 0) previous = rows[0];

  const weighted = [];
  const add = (key, values) => {
    const share = sideShare(values);
    if (!share) return;
    weighted.push({ weight: WEIGHTS[key], home: share.home, away: share.away });
  };

  if (previous) {
    add('attacks', deltaPair(current.attacks, previous.attacks));
    add('dangerousAttacks', deltaPair(current.dangerousAttacks, previous.dangerousAttacks));
    add('shotsOnTarget', deltaPair(current.shotsOnTarget, previous.shotsOnTarget));
    add('shotsOffTarget', deltaPair(current.shotsOffTarget, previous.shotsOffTarget));
    add('corners', deltaPair(current.corners, previous.corners));
  }
  add('possession', current.possession);

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let home = 50, away = 50;
  if (totalWeight > 0) {
    home = weighted.reduce((sum, item) => sum + item.home * item.weight, 0) / totalWeight * 100;
    away = 100 - home;
  }
  return {
    at: num(current.at),
    minute: num(current.minute),
    home: Math.round(home * 10) / 10,
    away: Math.round(away * 10) / 10,
    windowMinutes: previous ? Math.max(1, Math.round((Number(current.at || 0) - Number(previous.at || 0)) / 60_000)) : 0
  };
}
function pressureSeries(rows, windowMinutes = PRESSURE_WINDOW_MINUTES) {
  return rows.map((_, index) => pressurePoint(rows, index, windowMinutes)).filter(Boolean);
}
function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = Number(row?.at || 0);
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
}

export class Nomad343Engine extends BaseEngine {
  async captureFlowHistory() {
    const board = await this.ctx.storage.get('board');
    if (board?.ok !== true || !Array.isArray(board.fixtures)) return;

    const existing = await this.ctx.storage.get('flowHistories') || {};
    const legacy = await this.ctx.storage.get('histories') || {};
    const next = {};
    const at = Number(board.hubFetchedAt || now());
    const cutoff = at - FLOW_HISTORY_MS;
    const seen = new Set();

    for (const fixture of board.fixtures) {
      const id = String(fixture?.fixtureId ?? '');
      if (!id) continue;
      seen.add(id);
      let rows = Array.isArray(existing[id]) ? existing[id].slice() : [];
      if (!rows.length && Array.isArray(legacy[id])) rows.push(...clone(legacy[id]));
      if (isLive(fixture)) rows.push(flowSnapshot(fixture, at));
      rows = dedupeRows(rows).filter(row => Number(row.at || 0) >= cutoff).slice(-FLOW_MAX_ROWS);
      if (rows.length) next[id] = rows;
    }

    for (const [id, oldRows] of Object.entries(existing)) {
      if (seen.has(id)) continue;
      const rows = dedupeRows(oldRows).filter(row => Number(row.at || 0) >= cutoff).slice(-FLOW_MAX_ROWS);
      if (rows.length) next[id] = rows;
    }
    await this.ctx.storage.put('flowHistories', next);
  }

  async scan() {
    const meta = await super.scan();
    if (meta?.ok) {
      try { await this.captureFlowHistory(); } catch (_) {}
    }
    return meta;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/history' && request.method === 'GET') {
      await this.scanIfDue();
      const fixtureId = String(url.searchParams.get('fixtureId') || '').trim();
      if (!fixtureId) return Response.json({ ok: false, error: 'FIXTURE_ID_REQUIRED' }, { status: 400 });
      const windowMinutes = Math.max(2, Math.min(30, Math.round(num(url.searchParams.get('window')) ?? PRESSURE_WINDOW_MINUTES)));
      const histories = await this.ctx.storage.get('flowHistories') || {};
      const legacy = await this.ctx.storage.get('histories') || {};
      const rows = dedupeRows(Array.isArray(histories[fixtureId]) && histories[fixtureId].length ? histories[fixtureId] : (legacy[fixtureId] || []));
      return Response.json({
        ok: true,
        version: 'nomad343-flow-history-v1',
        fixtureId,
        retainedMinutes: 180,
        maxRows: FLOW_MAX_ROWS,
        pressureWindowMinutes: windowMinutes,
        weights: WEIGHTS,
        firstAt: rows[0]?.at ?? null,
        lastAt: rows[rows.length - 1]?.at ?? null,
        rows,
        pressure: pressureSeries(rows, windowMinutes)
      }, { headers: { 'cache-control': 'no-store' } });
    }
    return super.fetch(request);
  }
}

function stub(env) {
  return env.ENGINE.get(env.ENGINE.idFromName('global'));
}
function cors(request, response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', request.headers.get('origin') || '*');
  headers.set('access-control-allow-methods', 'GET,PUT,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(request, new Response(null, { status: 204 }));
    const url = new URL(request.url);
    if (url.pathname === '/history') {
      return cors(request, await stub(env).fetch(new Request(`https://engine.internal${url.pathname}${url.search}`, request)));
    }
    return baseWorker.fetch(request, env);
  },
  async scheduled(event, env, ctx) {
    return baseWorker.scheduled(event, env, ctx);
  }
};
