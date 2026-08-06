import baseWorker from './rate-safe-entry.js';
import { handlePaperRequest, settlePendingTrades } from './paper-db.js';
import {
  getLatestAutoPayload,
  handleAutoRequest,
  runAutoMomentumScan
} from './auto-scan.js';
import {
  handleLineWebhook,
  lineStatus,
  notifyPendingLineEvents
} from './line.js';

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/line-webhook' && request.method === 'POST') {
      try {
        const result = await handleLineWebhook(request, env);
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'LINE webhook failed'
        }, 500);
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
      } catch {
        // Fall back to a direct rate-safe scan until the first scheduled run is stored.
      }
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const results = await Promise.allSettled([
        runAutoMomentumScan(baseWorker, env, ctx),
        settlePendingTrades(env)
      ]);
      for (const result of results) {
        if (result.status === 'rejected') console.error(result.reason);
      }
      try {
        await notifyPendingLineEvents(env);
      } catch (error) {
        console.error(error);
      }
    })());
  }
};
