import baseWorker from './index.js';

const API_BASE = 'https://v3.football.api-sports.io';
const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);

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

function normalizeLive(item) {
  const fixture = item?.fixture || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};
  return {
    fixtureId: fixture.id ?? null,
    kickoffUtc: fixture.date ?? null,
    status: fixture?.status?.short ?? null,
    statusLong: fixture?.status?.long ?? null,
    elapsed: fixture?.status?.elapsed ?? null,
    league: item?.league?.name ?? null,
    country: item?.league?.country ?? null,
    home: teams?.home?.name ?? null,
    away: teams?.away?.name ?? null,
    homeScore: goals?.home ?? null,
    awayScore: goals?.away ?? null
  };
}

async function liveFixtures(request, env) {
  if (!env.API_FOOTBALL_KEY) {
    return json(request, { ok: false, error: 'API_FOOTBALL_KEY is not configured' }, 500);
  }
  const response = await fetch(`${API_BASE}/fixtures?live=all`, {
    headers: {
      'x-apisports-key': env.API_FOOTBALL_KEY,
      'Accept': 'application/json'
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return json(request, { ok: false, error: payload?.message || `API HTTP ${response.status}` }, 502);
  }
  const errors = payload?.errors;
  if (errors && Object.keys(errors).length > 0) {
    return json(request, { ok: false, error: errors }, 502);
  }
  const results = Array.isArray(payload?.response) ? payload.response.map(normalizeLive) : [];
  return json(request, {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: results.length,
    results
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/live') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method !== 'GET') {
        return json(request, { ok: false, error: 'Method not allowed' }, 405);
      }
      try {
        return await liveFixtures(request, env);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'Live fixture request failed',
          generatedAt: new Date().toISOString()
        }, 502);
      }
    }
    return baseWorker.fetch(request, env, ctx);
  }
};
