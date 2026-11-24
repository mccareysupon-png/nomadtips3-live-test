import original from './__ACTIVE_ENTRY__';
export * from './__ACTIVE_ENTRY__';
import seed from './b46-seo-fixture-seed-20261124.mjs';
import { createFixtureCache } from './fixture-cache.mjs';
import { frontendSeo, isSeoPath, usesFixtureIndex } from './seo.mjs';

const fixtureIndex = createFixtureCache(seed);
const publicHosts = new Set(['ball46.com', 'www.ball46.com']);
const label = 'frontend-seo-i18n-v1';

export default {
  ...original,
  async fetch(request, env, context) {
    const { pathname, hostname, origin } = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method) || !isSeoPath(pathname)) {
      return original.fetch(request, env, context);
    }

    const data = usesFixtureIndex(pathname) ? fixtureIndex({
      cache: caches.default,
      key: new Request(origin + '/__ball46_seo_fixture_cache_v1'),
      waitUntil: promise => context.waitUntil(promise),
      async getSnapshot() {
        const response = await original.fetch(new Request(origin + '/api/hub/snapshot'), env, context);
        if (!response.ok) throw new Error('Cached fixture snapshot unavailable');
        return response.json();
      },
    }) : null;
    const response = await frontendSeo(request, {
      upstream: next => original.fetch(next, env, context),
      fixtures: data?.fixtures,
      Rewriter: HTMLRewriter,
    });
    const headers = new Headers(response.headers);
    headers.set('x-b46-frontend-seo', label);
    if (data) headers.set('x-b46-seo-fixtures-at', new Date(data.observedAt).toISOString());
    if (!publicHosts.has(hostname)) headers.set('x-robots-tag', 'noindex, nofollow');
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status, statusText: response.statusText, headers,
    });
  },
};
