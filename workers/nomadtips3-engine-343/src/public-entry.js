import engineWorker, { Nomad343Engine } from './index.js';

export { Nomad343Engine };

function cors(request, response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', request.headers.get('origin') || '*');
  headers.set('access-control-allow-methods', 'GET,PUT,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

function engineStub(env) {
  return env.ENGINE.get(env.ENGINE.idFromName('global'));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // The Durable Object already implements /fixture-odds. Expose only that
    // existing read-only UI route here; all selection/filter logic stays in index.js.
    if (url.pathname === '/fixture-odds') {
      if (request.method === 'OPTIONS') return cors(request, new Response(null, { status: 204 }));
      if (request.method !== 'GET') return cors(request, new Response('Method not allowed', { status: 405 }));
      const upstream = new Request(`https://engine.internal/fixture-odds${url.search}`, request);
      return cors(request, await engineStub(env).fetch(upstream));
    }

    return engineWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    return engineWorker.scheduled(event, env, ctx);
  }
};
