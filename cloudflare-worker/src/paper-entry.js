import baseWorker from './entry.js';
import { handlePaperRequest, settlePendingTrades } from './paper-db.js';

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
    if (url.pathname.startsWith('/paper-')) {
      try {
        const result = await handlePaperRequest(request, env, url);
        return json(request, result.data, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'D1 paper request failed',
          generatedAt: new Date().toISOString()
        }, 500);
      }
    }
    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(settlePendingTrades(env));
  }
};
