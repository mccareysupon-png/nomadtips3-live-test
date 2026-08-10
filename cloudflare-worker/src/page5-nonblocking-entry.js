import baseEntry from './car3-audit-entry.js';
import { getLatestAutoPayload, handleAutoRequest } from './auto-scan.js';

const PAGE5_ORIGIN = 'https://mccareysupon-png.github.io';
const ALLOWED_ORIGINS = new Set([
  PAGE5_ORIGIN,
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);
const MAX_LAST_GOOD_MS = 15 * 60_000;
const FRESH_MS = 2 * 60_000;
const THAI_OFFSET_MS = 7 * 60 * 60_000;
const DAILY_RESET_MS = 12 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : PAGE5_ORIGIN;
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

function generatedAtMs(payload) {
  const value = Date.parse(payload?.generatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function startOfThaiCycle(now) {
  return Math.floor((now + THAI_OFFSET_MS - DAILY_RESET_MS) / DAY_MS) * DAY_MS
    - THAI_OFFSET_MS
    + DAILY_RESET_MS;
}

function parseJson(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function signalCandidate(row, config = {}) {
  const side = String(row.selected_side || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
  const selectedTeam = String(row.selected_team || 'Selected');
  const opponent = String(row.opponent || 'Opponent');
  const selectedScore = Number(row.selected_score || 0);
  const opponentScore = Number(row.opponent_score || 0);
  const payload = parseJson(row.payload_json);
  const actualHome = side === 'AWAY' ? opponent : selectedTeam;
  const actualAway = side === 'AWAY' ? selectedTeam : opponent;
  const actualHomeScore = side === 'AWAY' ? opponentScore : selectedScore;
  const actualAwayScore = side === 'AWAY' ? selectedScore : opponentScore;
  const difference = selectedScore - opponentScore;
  const scoreState = difference > 0 ? 'HOME_LEADING' : difference < 0 ? 'HOME_TRAILING' : 'TIED';
  const momentum = Number.isFinite(Number(row.momentum)) ? Number(row.momentum) : null;
  const selectedMarket = String(payload.selectedMarket || config.market || 'WIN').toUpperCase() === 'AH' ? 'AH' : 'WIN';

  return {
    fixtureId: Number(row.fixture_id),
    selectedSide: side,
    home: selectedTeam,
    away: opponent,
    actualHome,
    actualAway,
    league: String(payload.league || ''),
    country: String(payload.country || ''),
    minute: Number(row.minute || 0),
    score: { home: selectedScore, away: opponentScore },
    actualScore: { home: actualHomeScore, away: actualAwayScore },
    scoreState,
    goalDifference: difference,
    stats: {},
    redCards: { home: 0, away: 0 },
    selectedMarket,
    markets: {
      selectedOdds: row.selected_odds ?? payload.selectedOdds ?? null,
      homeAh: row.ah_line ?? payload.ahLine ?? null,
      homeAhOdds: row.ah_odds ?? payload.ahOdds ?? null
    },
    serverMomentum: {
      home: momentum,
      away: momentum === null ? null : 100 - momentum,
      evidence: null
    },
    serverStreak: Number(config.confirmationRounds || 1),
    serverTriggered: true,
    serverHistory: true,
    signalCreatedAt: Number(row.created_at || payload.createdAt || 0)
  };
}

async function currentCycleSignalCandidates(env, config, now) {
  if (!env.DB) return [];
  const cycleStart = startOfThaiCycle(now);
  try {
    const result = await env.DB.prepare(`
      SELECT signal_key, fixture_id, selected_side, selected_team, opponent, minute,
             selected_score, opponent_score, momentum, selected_odds, ah_line, ah_odds,
             payload_json, created_at
      FROM condition_signals
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(cycleStart).all();
    return (result.results || []).map(row => signalCandidate(row, config));
  } catch {
    return [];
  }
}

async function withCurrentSignalHistory(env, payload, now) {
  const history = await currentCycleSignalCandidates(env, payload?.config || {}, now);
  if (!history.length) return payload;
  const current = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const seen = new Set(current.map(candidate => `${Number(candidate.fixtureId)}:${candidate.selectedSide || 'HOME'}`));
  const missing = history.filter(candidate => !seen.has(`${Number(candidate.fixtureId)}:${candidate.selectedSide || 'HOME'}`));
  return {
    ...payload,
    candidates: [...current, ...missing],
    signalHistorySynced: true,
    signalHistoryCount: history.length,
    dailyCycle: {
      resetHour: 12,
      timezone: 'Asia/Bangkok',
      cycleStartAt: new Date(startOfThaiCycle(now)).toISOString(),
      nextResetAt: new Date(startOfThaiCycle(now) + DAY_MS).toISOString()
    }
  };
}

async function storedPage5Payload(request, env) {
  const now = Date.now();
  const latest = await getLatestAutoPayload(env, MAX_LAST_GOOD_MS).catch(() => null);
  if (latest) {
    const generated = generatedAtMs(latest);
    const ageMs = generated ? Math.max(0, now - generated) : MAX_LAST_GOOD_MS;
    const payload = {
      ...latest,
      ok: true,
      page5ReadMode: 'STORED_ONLY',
      page5TriggeredScan: false,
      stale: ageMs > FRESH_MS,
      staleAgeSeconds: Math.round(ageMs / 1000),
      source: latest.source || 'cloudflare-worker · stored auto scan'
    };
    return withCurrentSignalHistory(env, payload, now);
  }

  const statusUrl = new URL('https://internal.nomadtips3/auto-scan-status');
  const result = await handleAutoRequest(request, env, statusUrl);
  const status = result?.data || {};
  const payload = {
    ok: true,
    generatedAt: status.generatedAt || new Date(now).toISOString(),
    source: 'cloudflare-worker · stored status only',
    mode: 'PAGE-5-STORED-ONLY',
    page5ReadMode: 'STORED_ONLY',
    page5TriggeredScan: false,
    stale: true,
    staleAgeSeconds: status.generatedAt
      ? Math.max(0, Math.round((now - Date.parse(status.generatedAt)) / 1000))
      : null,
    serverOnline: Boolean(status.online),
    scannerError: status.error || 'Waiting for background scanner',
    config: status.config || {},
    counts: status.counts || {},
    candidates: [],
    warnings: [
      ...(Array.isArray(status.warnings) ? status.warnings : []),
      'Page 5 is display-only and will not trigger a full live scan.'
    ].slice(-20)
  };
  return withCurrentSignalHistory(env, payload, now);
}

function isPage5ReadRequest(request, url) {
  if (url.pathname === '/page5-latest') return true;
  return url.pathname === '/live-condition-scan' && request.headers.get('Origin') === PAGE5_ORIGIN;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isPage5ReadRequest(request, url)) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method !== 'GET') {
        return json(request, { ok: false, error: 'Method not allowed' }, 405);
      }
      try {
        return json(request, await storedPage5Payload(request, env), 200);
      } catch (error) {
        return json(request, {
          ok: false,
          page5ReadMode: 'STORED_ONLY',
          page5TriggeredScan: false,
          error: error?.message || 'Stored Page 5 payload failed'
        }, 500);
      }
    }
    return baseEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return baseEntry.scheduled(controller, env, ctx);
  }
};