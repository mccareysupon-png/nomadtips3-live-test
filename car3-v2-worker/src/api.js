const API_BASE = 'https://v3.football.api-sports.io';
const DAY_MS = 86_400_000;
const THAI_OFFSET_MS = 7 * 60 * 60_000;
const RESET_HOUR = 12;
const RESET_MS = RESET_HOUR * 60 * 60_000;

export function thaiCycleStart(now = Date.now()) {
  return Math.floor((now + THAI_OFFSET_MS - RESET_MS) / DAY_MS) * DAY_MS - THAI_OFFSET_MS + RESET_MS;
}

function apiErrorDetail(payload) {
  const errors = payload?.errors;
  if (!errors) return '';
  if (typeof errors === 'string') return errors.trim();
  if (Array.isArray(errors)) return errors.length ? JSON.stringify(errors) : '';
  if (typeof errors === 'object') return Object.keys(errors).length ? JSON.stringify(errors) : '';
  return String(errors);
}

function isRateLimit(response, payload) {
  const text = `${response?.status || ''} ${payload?.message || ''} ${apiErrorDetail(payload)}`;
  return response?.status === 429 || /too many requests|rate.?limit|requests per minute/i.test(text);
}

function cacheTtl(path) {
  if (path.startsWith('/fixtures?live=')) return 50;
  if (path.startsWith('/fixtures?ids=')) return 55;
  if (path.startsWith('/odds/live')) return 50;
  return 60;
}

async function bumpUsage(env, endpoint, count = 1) {
  if (!env.DB) return;
  const cycleStart = thaiCycleStart();
  await env.DB.prepare(`
    INSERT INTO car3_v2_api_usage (cycle_start, endpoint, upstream_calls, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cycle_start, endpoint) DO UPDATE SET
      upstream_calls = upstream_calls + excluded.upstream_calls,
      updated_at = excluded.updated_at
  `).bind(cycleStart, endpoint, count, Date.now()).run();
}

function endpointLabel(path) {
  if (path.startsWith('/fixtures?live=')) return 'fixtures_live';
  if (path.startsWith('/fixtures?ids=')) return 'fixtures_batch';
  if (path.startsWith('/odds/live')) return 'odds_live';
  return 'other';
}

export async function apiFetch(path, env, ttlSeconds = cacheTtl(path)) {
  if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not configured');

  const url = `${API_BASE}${path}`;
  const cache = globalThis.caches?.default || null;
  const key = new Request(url, { method: 'GET' });
  if (cache) {
    const cached = await cache.match(key);
    if (cached) {
      return { payload: await cached.json(), upstream: false };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'x-apisports-key': env.API_FOOTBALL_KEY,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  const detail = apiErrorDetail(payload);
  await bumpUsage(env, endpointLabel(path));

  if (isRateLimit(response, payload)) {
    throw new Error(detail || `API-Football rate limited: HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(detail || payload?.message || `API HTTP ${response.status}`);
  if (detail) throw new Error(detail);

  if (cache) {
    await cache.put(key, new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttlSeconds}`
      }
    }));
  }
  return { payload, upstream: true };
}

export async function apiUsage(env, now = Date.now()) {
  const cycleStart = thaiCycleStart(now);
  const rows = await env.DB.prepare(`
    SELECT endpoint, upstream_calls, updated_at
    FROM car3_v2_api_usage
    WHERE cycle_start = ?
    ORDER BY endpoint
  `).bind(cycleStart).all();
  const byEndpoint = {};
  let total = 0;
  for (const row of rows.results || []) {
    const value = Number(row.upstream_calls || 0);
    byEndpoint[row.endpoint] = value;
    total += value;
  }
  return {
    cycleStartAt: new Date(cycleStart).toISOString(),
    nextResetAt: new Date(cycleStart + DAY_MS).toISOString(),
    timezone: 'Asia/Bangkok',
    resetHour: RESET_HOUR,
    totalUpstreamCalls: total,
    byEndpoint
  };
}
