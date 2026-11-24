import { PerformanceSummary as TestedSummary, summaryFor } from '../worker.mjs';

// Read the same Ledger projection that the public Statistics route proxies.
// Limit the binding adapter to the Statistics read used by the tested alarm.
export class PerformanceSummary extends TestedSummary {
  constructor(state, env) {
    super(state, {
      ...env,
      B46_PRODUCTION_READ: {
        fetch(url, options) {
          const source = new URL(url);
          if (source.pathname !== '/api/engine/statistics') throw new Error('Statistics read scope');
          source.pathname = '/statistics';
          return env.B46_STATISTICS_READ.fetch(new Request(source, {...options, redirect:'error'}));
        },
      },
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/summary') {
      return new Response('Not found', {status:404});
    }
    return Response.json(await summaryFor(request, env, ctx), {
      headers: {'cache-control':'no-store'},
    });
  },
};
