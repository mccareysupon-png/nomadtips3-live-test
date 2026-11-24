import { summaryFor } from '../worker.mjs';
export { PerformanceSummary } from '../worker.mjs';

// The binding is private and refresh runs from the Durable Object alarm.
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
