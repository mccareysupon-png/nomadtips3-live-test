const VERSION = 'shot-public-shield-v1';
const ALLOWED_PATHS = new Set(['/snapshot', '/status']);

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extra, 'content-type': 'application/json; charset=utf-8' },
  });
}

function clientKey(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  return `ip:${ip}`;
}

async function forwardSafe(request, env, pathname) {
  const source = new URL(request.url);
  const safe = new URL(`https://shot-sidecar.internal${pathname}`);
  for (const [key, value] of source.searchParams.entries()) {
    if (key.toLowerCase() === 'force') continue;
    safe.searchParams.append(key, value);
  }
  const upstream = new Request(safe.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const response = await env.SHOT_ORIGIN.fetch(upstream);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  headers.set('x-nomad-shield', VERSION);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, version: VERSION, mode: 'PUBLIC_SHIELD', protects: ['/snapshot', '/status'], blocks: ['/probe', 'force=1'], limit: '30 requests/minute/client' });
    }

    if (url.pathname === '/probe') {
      return json({ ok: false, error: 'private_endpoint' }, 404);
    }

    if (!ALLOWED_PATHS.has(url.pathname)) {
      return json({ ok: false, error: 'not_found' }, 404);
    }

    if (url.searchParams.has('force')) {
      return json({ ok: false, error: 'force_not_allowed_publicly' }, 403);
    }

    const { success } = await env.PUBLIC_RATE_LIMITER.limit({ key: clientKey(request) });
    if (!success) {
      return json({ ok: false, error: 'rate_limited', retryAfterSeconds: 60 }, 429, { 'retry-after': '60' });
    }

    try {
      return await forwardSafe(request, env, url.pathname);
    } catch (error) {
      return json({ ok: false, error: 'upstream_unavailable', detail: String(error?.message || error).slice(0, 160) }, 502);
    }
  },
};
