import paperEntry from './paper-entry.js';
import car3Scanner from './entry-batched.js';
import { handleAutoRequest, runAutoMomentumScan } from './auto-scan.js';
import { getSharedApiGuardStatus } from './shared-api-football.js';

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

    // Dedicated Car 3 status route. The retired public live-analysis page
    // remains independent from this Worker-side detector.
    if (url.pathname === '/car3/auto-scan-status') {
      if (request.method !== 'GET') {
        return json({ ok: false, error: 'Method not allowed' }, 405);
      }
      try {
        const internalUrl = new URL(request.url);
        internalUrl.pathname = '/auto-scan-status';
        const [result, apiGuard] = await Promise.all([
          handleAutoRequest(request, env, internalUrl),
          getSharedApiGuardStatus(env)
        ]);
        return json({ ...result.data, apiGuard }, result.status);
      } catch (error) {
        return json({
          ok: false,
          error: error?.message || 'Car 3 status failed'
        }, 500);
      }
    }

    // Diagnostic route for Car 3 only. It uses entry-batched.js and does not
    // require the retired browser Live Analysis page.
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

    // Running a new condition config resets the Car 3 scan state. Prime the
    // first fresh sample immediately instead of leaving the page dependent on
    // the next cron tick. The normal one-minute scheduler remains the single
    // recurring owner; this is only a one-shot wake-up after an explicit run.
    if (url.pathname === '/condition-config' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => null);
      const response = await paperEntry.fetch(request, env, ctx);
      if (response.ok && String(body?.action || '').toLowerCase() === 'run') {
        ctx.waitUntil(
          runAutoMomentumScan(car3Scanner, env, ctx).catch(error => {
            console.error('Car 3 post-config wake-up failed', error);
          })
        );
      }
      return response;
    }

    return paperEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    // Single scheduler owner: paper-entry already runs the adaptive Car 3
    // scanner against entry-batched.js and then performs signal/trade side
    // effects. Running runAutoMomentumScan here as well would duplicate the
    // same API workload every minute and can push the shared API guard into
    // cooldown/429 protection.
    if (typeof paperEntry.scheduled === 'function') {
      return paperEntry.scheduled(controller, env, ctx);
    }

    // Defensive fallback only if paper-entry ever loses its scheduler.
    ctx.waitUntil(
      runAutoMomentumScan(car3Scanner, env, ctx).catch(error => {
        console.error('Car 3 scheduled scan failed', error);
      })
    );
  }
};
