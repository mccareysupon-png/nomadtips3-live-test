const API_BASE = 'https://v3.football.api-sports.io';
const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);
const FINISHED = new Set(['FT', 'AET', 'PEN', 'WO', 'AWD']);

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

function json(request, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
      ...extraHeaders
    }
  });
}

function normalizeFixture(item) {
  const fixture = item?.fixture || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};
  const score = item?.score || {};
  const status = String(fixture?.status?.short || 'NS').toUpperCase();

  return {
    fixtureId: fixture.id ?? null,
    providerFixtureId: fixture.id ?? null,
    kickoffUtc: fixture.date ?? null,
    timestamp: fixture.timestamp ?? null,
    timezone: fixture.timezone ?? 'UTC',
    status,
    statusLong: fixture?.status?.long ?? null,
    elapsed: fixture?.status?.elapsed ?? null,
    resultConfirmed: FINISHED.has(status),
    home: {
      id: teams?.home?.id ?? null,
      name: teams?.home?.name ?? null,
      winner: teams?.home?.winner ?? null
    },
    away: {
      id: teams?.away?.id ?? null,
      name: teams?.away?.name ?? null,
      winner: teams?.away?.winner ?? null
    },
    homeScore: goals?.home ?? null,
    awayScore: goals?.away ?? null,
    halftime: score?.halftime ?? null,
    fulltime: score?.fulltime ?? null,
    extratime: score?.extratime ?? null,
    penalty: score?.penalty ?? null,
    league: item?.league
      ? {
          id: item.league.id ?? null,
          name: item.league.name ?? null,
          country: item.league.country ?? null,
          round: item.league.round ?? null,
          season: item.league.season ?? null
        }
      : null,
    venue: fixture?.venue
      ? {
          id: fixture.venue.id ?? null,
          name: fixture.venue.name ?? null,
          city: fixture.venue.city ?? null
        }
      : null
  };
}

async function apiFetch(path, env, cacheSeconds = 30) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error('API_FOOTBALL_KEY is not configured');
  }

  const apiUrl = `${API_BASE}${path}`;
  const cache = caches.default;
  const cacheKey = new Request(apiUrl, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(apiUrl, {
    headers: {
      'x-apisports-key': env.API_FOOTBALL_KEY,
      'Accept': 'application/json'
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.message || payload?.errors || `API HTTP ${response.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  const apiErrors = payload?.errors;
  if (apiErrors && Object.keys(apiErrors).length > 0) {
    throw new Error(JSON.stringify(apiErrors));
  }

  const cachedResponse = new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}`
    }
  });
  await cache.put(cacheKey, cachedResponse);
  return payload;
}

async function handleFixture(request, url, env) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return json(request, { ok: false, error: 'A valid fixture id is required' }, 400);
  }

  const payload = await apiFetch(`/fixtures?id=${id}`, env, 30);
  const item = Array.isArray(payload?.response) ? payload.response[0] : null;
  if (!item) {
    return json(request, { ok: false, error: 'Fixture not found', fixtureId: id }, 404);
  }

  return json(request, {
    ok: true,
    generatedAt: new Date().toISOString(),
    result: normalizeFixture(item)
  });
}

async function handleFixtures(request, url, env) {
  const ids = [...new Set(
    String(url.searchParams.get('ids') || '')
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isInteger(value) && value > 0)
  )].slice(0, 10);

  if (ids.length === 0) {
    return json(request, {
      ok: false,
      error: 'Provide fixture ids, for example: /fixtures?ids=123,456'
    }, 400);
  }

  const settled = await Promise.allSettled(
    ids.map(async id => {
      const payload = await apiFetch(`/fixtures?id=${id}`, env, 30);
      const item = Array.isArray(payload?.response) ? payload.response[0] : null;
      if (!item) throw new Error('Fixture not found');
      return normalizeFixture(item);
    })
  );

  const results = [];
  const errors = [];
  settled.forEach((entry, index) => {
    if (entry.status === 'fulfilled') results.push(entry.value);
    else errors.push({ fixtureId: ids[index], error: entry.reason?.message || 'Unknown error' });
  });

  return json(request, {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    requested: ids.length,
    returned: results.length,
    results,
    errors
  }, errors.length === ids.length ? 502 : 200);
}

async function handleStatus(request, env) {
  const payload = await apiFetch('/status', env, 60);
  return json(request, {
    ok: true,
    generatedAt: new Date().toISOString(),
    status: payload?.response || null
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== 'GET') {
      return json(request, { ok: false, error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json(request, {
          ok: true,
          service: 'nomadtips3-test-api',
          environment: 'TEST',
          apiKeyConfigured: Boolean(env.API_FOOTBALL_KEY),
          generatedAt: new Date().toISOString(),
          endpoints: ['/health', '/status', '/fixture?id=FIXTURE_ID', '/fixtures?ids=ID1,ID2']
        });
      }

      if (url.pathname === '/status') return handleStatus(request, env);
      if (url.pathname === '/fixture') return handleFixture(request, url, env);
      if (url.pathname === '/fixtures') return handleFixtures(request, url, env);

      return json(request, { ok: false, error: 'Not found' }, 404);
    } catch (error) {
      return json(request, {
        ok: false,
        error: error?.message || 'Worker request failed',
        generatedAt: new Date().toISOString()
      }, 502);
    }
  }
};
