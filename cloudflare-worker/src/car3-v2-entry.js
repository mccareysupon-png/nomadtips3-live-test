import baseEntry from './car3-audit-entry.js';
import { getLatestAutoPayload, handleAutoRequest } from './auto-scan.js';
import { getEngineControl } from './engine-control.js';

const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);
const LAST_GOOD_MS = 15 * 60_000;
const FRESH_MS = 2 * 60_000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://mccareysupon-png.github.io';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function ageMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : null;
}

async function storedV2Payload(request, env) {
  const [control, latest] = await Promise.all([
    getEngineControl(env).catch(() => ({ mode: 'RUNNING' })),
    getLatestAutoPayload(env, LAST_GOOD_MS).catch(() => null)
  ]);

  if (latest) {
    const age = ageMs(latest.generatedAt);
    return {
      ...latest,
      ok: true,
      mode: 'CAR3-PAGE5-V2',
      pageVersion: 2,
      readMode: 'D1_STORED_ONLY',
      triggeredScan: false,
      engine: control,
      stale: age === null ? true : age > FRESH_MS,
      staleAgeSeconds: age === null ? null : Math.round(age / 1000)
    };
  }

  const statusUrl = new URL('https://internal.nomadtips3/auto-scan-status');
  const result = await handleAutoRequest(request, env, statusUrl);
  const status = result?.data || {};
  const age = ageMs(status.generatedAt);
  return {
    ok: true,
    generatedAt: status.generatedAt || new Date().toISOString(),
    source: 'cloudflare-worker · D1 stored status',
    mode: 'CAR3-PAGE5-V2',
    pageVersion: 2,
    readMode: 'D1_STORED_ONLY',
    triggeredScan: false,
    engine: control,
    serverOnline: Boolean(status.online),
    stale: true,
    staleAgeSeconds: age === null ? null : Math.round(age / 1000),
    scannerError: status.error || 'Waiting for background scan',
    config: status.config || {},
    counts: status.counts || {},
    candidates: [],
    warnings: Array.isArray(status.warnings) ? status.warnings : []
  };
}

function parkedLegacyPayload(control) {
  return {
    ok: true,
    legacyParked: true,
    generatedAt: new Date().toISOString(),
    mode: 'PAGE5-LEGACY-PARKED',
    serverOnline: true,
    engine: control,
    refreshSeconds: 60,
    counts: {
      allLive: 0,
      minuteWindow: 0,
      completeStats: 0,
      completeMarkets: 0,
      baseCandidates: 0,
      triggered: 0
    },
    candidates: [],
    warnings: ['Legacy Page 5 is parked. Use Car 3 Page 5 V2.']
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (url.pathname === '/v2/live-status') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method !== 'GET') {
        return json(request, { ok: false, error: 'Method not allowed' }, 405);
      }
      try {
        return json(request, await storedV2Payload(request, env), 200);
      } catch (error) {
        return json(request, {
          ok: false,
          mode: 'CAR3-PAGE5-V2',
          readMode: 'D1_STORED_ONLY',
          triggeredScan: false,
          error: error?.message || 'V2 stored status failed'
        }, 500);
      }
    }

    if (
      origin === 'https://mccareysupon-png.github.io' &&
      request.method === 'GET' &&
      ['/live-condition-scan', '/page5-latest'].includes(url.pathname)
    ) {
      const control = await getEngineControl(env).catch(() => ({ mode: 'RUNNING' }));
      return json(request, parkedLegacyPayload(control), 200);
    }

    return baseEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return baseEntry.scheduled(controller, env, ctx);
  }
};
