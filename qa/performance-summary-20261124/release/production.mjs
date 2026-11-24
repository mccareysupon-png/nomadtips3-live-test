import original from './__ACTIVE_ENTRY__';
export * from './__ACTIVE_ENTRY__';
import { patchCard } from './b46-performance-summary-20261124/worker.mjs';
import { clientCode } from './b46-performance-summary-20261124/client.mjs';
import { valuesFor } from './b46-performance-summary-20261124/summary.mjs';

const SUMMARY = '/__ball46_performance/summary';
const CLIENT = '/__ball46_performance/card.js';
const PAGES = new Set(['/', '/index', '/index.html']);
const runtime = clientCode.replace('/__performance_test/summary', SUMMARY);
const header = 'x-b46-daily-performance';

async function getSummary(env) {
  try {
    const response = await env.B46_DAILY_PERFORMANCE.fetch('https://performance.internal/summary', {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) return await response.json();
  } catch {}
  return null;
}

export default {
  ...original,
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === CLIENT) {
      return new Response(runtime, {
        headers: {'content-type':'application/javascript; charset=utf-8', 'cache-control':'no-store'},
      });
    }
    if (request.method === 'GET' && path === SUMMARY) {
      return Response.json(valuesFor(await getSummary(env)), {headers:{'cache-control':'no-store'}});
    }
    if (request.method !== 'GET' || !PAGES.has(path)) return original.fetch(request,env,ctx);

    const [response, snapshot] = await Promise.all([original.fetch(request,env,ctx), getSummary(env)]);
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
    return patchCard(response, valuesFor(snapshot), {clientPath:CLIENT, headerName:header});
  },
};
