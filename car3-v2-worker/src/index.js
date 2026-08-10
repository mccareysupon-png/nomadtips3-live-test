import { runCycle, status } from './engine.js';

function json(data, statusCode = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);

    try {
      if (url.pathname === '/' || url.pathname === '/v2/health' || url.pathname === '/v2/status') {
        return json(await status(env));
      }
      return json({ ok: false, error: 'Not found' }, 404);
    } catch (error) {
      return json({ ok: false, error: error?.message || String(error) }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCycle(env).catch(error => {
      console.error(JSON.stringify({ event: 'car3_v2_cycle_failed', error: error?.message || String(error) }));
    }));
  }
};
