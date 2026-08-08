import paperEntry from './paper-entry.js';
import car3Scanner from './entry-batched.js';
import { handleAutoRequest, runAutoMomentumScan } from './auto-scan.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Dedicated Car 3 status route. The retired public live-analysis routes
    // remain disabled inside paper-entry.js.
    if (url.pathname === '/car3/auto-scan-status') {
      if (request.method !== 'GET') {
        return json({ ok: false, error: 'Method not allowed' }, 405);
      }
      try {
        const internalUrl = new URL(request.url);
        internalUrl.pathname = '/auto-scan-status';
        const result = await handleAutoRequest(request, env, internalUrl);
        return json(result.data, result.status);
      } catch (error) {
        return json({
          ok: false,
          error: error?.message || 'Car 3 status failed'
        }, 500);
      }
    }

    // Diagnostic route for Car 3 only. It uses entry-batched.js, which is
    // intentionally independent from the retired public live-analysis route.
    if (url.pathname === '/car3/live-condition-scan') {
      if (request.method !== 'GET') {
        return json({ ok: false, error: 'Method not allowed' }, 405);
      }
      const internalRequest = new Request(
        'https://internal.nomadtips3/live-condition-scan?source=car3',
        { method: 'GET' }
      );
      return car3Scanner.fetch(internalRequest, env, ctx);
    }

    return paperEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    // Car 3 gets its own minute cron while the retired public scanner stays off.
    ctx.waitUntil(
      runAutoMomentumScan(car3Scanner, env, ctx).catch(error => {
        console.error('Car 3 scheduled scan failed', error);
      })
    );

    // Preserve all other scheduled jobs already owned by paper-entry.js.
    if (typeof paperEntry.scheduled === 'function') {
      return paperEntry.scheduled(controller, env, ctx);
    }
  }
};
