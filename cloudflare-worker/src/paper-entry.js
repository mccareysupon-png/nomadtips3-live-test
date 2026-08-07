import baseWorker from './entry-batched.js';
import {
  handlePaperRequest,
  settlePendingTrades,
  syncSignalsToPaperTrades
} from './paper-db-side.js';
import {
  getLatestAutoPayload,
  handleAutoRequest,
  runAutoMomentumScan
} from './auto-scan.js';
import { runHotConditionScan } from './hot-scan.js';
import { handleConditionConfig } from './condition-config.js';
import { handleBallTengConfig } from './ball-teng-config.js';
import { handleMemberConfig } from './member-config.js';
import {
  handleLineWebhook,
  lineStatus,
  notifyPendingLineEvents
} from './line-side.js';

const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);
const HOT_BURST_LIMIT_MS = 52_000;
const HOT_BURST_MAX_RUNS = 10;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function adaptiveRefreshSeconds(payload) {
  const direct = Number(payload?.refreshSeconds);
  if (Number.isFinite(direct)) {
    if (direct <= 5) return 5;
    if (direct <= 15) return 15;
    if (direct <= 30) return 30;
    if (direct <= 60) return 60;
    return 240;
  }

  const counts = payload?.counts || {};
  if (Number(counts.completeMarkets || 0) > 0) return 5;
  if (Number(counts.completeStats || 0) > 0) return 15;
  if (Number(counts.minuteWindow || 0) > 0) return 30;
  if (Number(counts.allLive || 0) > 0) return 60;
  return 240;
}

function generatedAtMs(payload) {
  const value = Date.parse(payload?.generatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function fullScanIsDue(latest, now) {
  if (!latest) return true;
  const last = generatedAtMs(latest);
  if (!last) return true;
  const refresh = adaptiveRefreshSeconds(latest);
  const fullRefresh = Math.max(60, refresh);
  return now - last >= Math.max(55_000, fullRefresh * 1000 - 5_000);
}

async function scannerRecoveryPayload(request, env) {
  const statusUrl = new URL('https://internal.nomadtips3/auto-scan-status');
  const result = await handleAutoRequest(request, env, statusUrl);
  const status = result?.data || {};
  if (!status.generatedAt && !status.error) return null;
  return {
    ok: true,
    generatedAt: status.generatedAt || new Date().toISOString(),
    source: 'cloudflare-worker · stored auto-scan status',
    mode: 'PAGE-5-WORKER-RECOVERY',
    refreshSeconds: 60,
    serverOnline: false,
    scannerError: status.error || null,
    config: status.config || {},
    counts: status.counts || {},
    candidates: [],
    warnings: status.error ? [status.error] : (status.warnings || [])
  };
}

async function flushSignalSideEffects(env) {
  try {
    await syncSignalsToPaperTrades(env);
  } catch (error) {
    console.error(error);
  }
  try {
    await notifyPendingLineEvents(env);
  } catch (error) {
    console.error(error);
  }
}

async function runAdaptiveScanner(env, ctx) {
  const startedAt = Date.now();
  let latest = await getLatestAutoPayload(env, 10 * 60_000).catch(() => null);

  if (fullScanIsDue(latest, startedAt)) {
    try {
      const result = await runAutoMomentumScan(baseWorker, env, ctx);
      if (Number(result?.counts?.newSignals || 0) > 0) await flushSignalSideEffects(env);
    } catch (error) {
      console.error(error);
    }
    latest = await getLatestAutoPayload(env, 10 * 60_000).catch(() => latest);
  }

  let refreshSeconds = adaptiveRefreshSeconds(latest);
  let hotRuns = 0;

  while (refreshSeconds < 60 && hotRuns < HOT_BURST_MAX_RUNS) {
    const waitMs = refreshSeconds * 1000;
    if (Date.now() - startedAt + waitMs > HOT_BURST_LIMIT_MS) break;
    await sleep(waitMs);

    try {
      const result = await runHotConditionScan(baseWorker, env, ctx);
      hotRuns += 1;
      if (Number(result?.newSignals || 0) > 0) await flushSignalSideEffects(env);
      refreshSeconds = adaptiveRefreshSeconds(result);
    } catch (error) {
      console.error(error);
      break;
    }
  }

  return { refreshSeconds, hotRuns };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/condition-config') {
      try {
        const result = await handleConditionConfig(request, env);
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'Condition configuration failed'
        }, 500);
      }
    }

    if (url.pathname === '/ball-teng-config') {
      try {
        const result = await handleBallTengConfig(request, env);
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'Ball-teng configuration failed'
        }, 500);
      }
    }

    if (['/member-profile', '/member-live-config', '/member-ball-teng-config'].includes(url.pathname)) {
      try {
        const result = await handleMemberConfig(request, env, url);
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'Member configuration failed'
        }, 500);
      }
    }

    if (url.pathname === '/line-webhook' && request.method === 'POST') {
      try {
        const result = await handleLineWebhook(request, env);
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, { ok: false, error: error?.message || 'LINE webhook failed' }, 500);
      }
    }

    if (url.pathname === '/line-status' && request.method === 'GET') {
      try {
        return json(request, await lineStatus(env), 200);
      } catch (error) {
        return json(request, {
          ok: false,
          configured: false,
          error: error?.message || 'LINE status failed'
        }, 500);
      }
    }

    if (url.pathname === '/auto-scan-status') {
      try {
        const result = await handleAutoRequest(request, env, url);
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          online: false,
          error: error?.message || 'Automatic scanner status failed'
        }, 500);
      }
    }

    if (url.pathname.startsWith('/paper-')) {
      try {
        const result = await handlePaperRequest(request, env, url);
        if (request.method === 'POST') {
          ctx.waitUntil(notifyPendingLineEvents(env).catch(console.error));
        }
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'D1 paper request failed',
          generatedAt: new Date().toISOString()
        }, 500);
      }
    }

    if (url.pathname === '/live-condition-scan' && request.method === 'GET') {
      try {
        const latest = await getLatestAutoPayload(env);
        if (latest) return json(request, latest, 200);

        const recovery = await scannerRecoveryPayload(request, env);
        if (recovery) return json(request, recovery, 200);
      } catch {
        // First startup only: fall through to one direct scan if no stored state exists yet.
      }
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      await runAdaptiveScanner(env, ctx);

      try {
        await syncSignalsToPaperTrades(env);
      } catch (error) {
        console.error(error);
      }

      try {
        await settlePendingTrades(env);
      } catch (error) {
        console.error(error);
      }

      try {
        await notifyPendingLineEvents(env);
      } catch (error) {
        console.error(error);
      }
    })());
  }
};
