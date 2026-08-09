import baseEntry from './car3-audit-entry.js';
import { getLatestAutoPayload, handleAutoRequest } from './auto-scan.js';

const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);
const MAX_LAST_GOOD_MS = 15 * 60_000;
const FRESH_MS = 2 * 60_000;

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

function generatedAtMs(payload) {
  const value = Date.parse(payload?.generatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

async function storedPage5Payload(request, env) {
  const now = Date.now();
  const latest = await getLatestAutoPayload(env, MAX_LAST_GOOD_MS).catch(() => null);
  if (latest) {
    const generated = generatedAtMs(latest);
    const ageMs = generated ? Math.max(0, now - generated) : MAX_LAST_GOOD_MS;
    return {
      ...latest,
      ok: true,
      page5ReadMode: 'STORED_ONLY',
      page5TriggeredScan: false,
      stale: ageMs > FRESH_MS,
      staleAgeSeconds: Math.round(ageMs / 1000),
      source: latest.source || 'cloudflare-worker · stored auto scan'
    };
  }

  const statusUrl = new URL('https://internal.nomadtips3/auto-scan-status');
  const result = await handleAutoRequest(request, env, statusUrl);
  const status = result?.data || {};
  return {
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
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/page5-latest') {
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
