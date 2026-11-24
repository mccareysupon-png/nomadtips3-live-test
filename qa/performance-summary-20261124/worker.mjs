import { bootData, cardHTML } from './card.mjs';
import { clientCode } from './client.mjs';
import { summaryIsUsable, valuesFor, verifyAndSummarize } from './summary.mjs';

const PRODUCTION = 'https://ball46.com';
const SUMMARY_PATH = '/__performance_test/summary';
const CLIENT_PATH = '/__performance_test/card.js';
const HEALTH_PATH = '/__performance_test/health';
const PAGE_PATHS = new Set(['/', '/index', '/index.html']);
const REFRESH_MS = 45000;
const RETRY_MS = 20000;
const CACHE_SECONDS = 15;
const REVISION = 'daily-performance-summary-v1';

function json(body, extraHeaders = {}) {
  return Response.json(body, { headers: {
    'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', ...extraHeaders,
  } });
}

export class PerformanceSummary {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.refreshing = false;
  }

  async fetch() {
    const storage = this.state.storage;
    const data = await storage.get(['summary', 'retryAt']);
    const summary = data.get('summary');
    const now = Date.now();
    const usable = summaryIsUsable(summary, now);
    const due = !usable || summary.verifiedAt + REFRESH_MS <= now;
    if (due && !this.refreshing && (data.get('retryAt') ?? 0) <= now && await storage.getAlarm() === null) {
      await storage.setAlarm(now + 100);
    }
    return json(usable ? summary : null);
  }

  async alarm() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const summary = await verifyAndSummarize(async cursor => {
        const url = new URL('/api/engine/statistics', PRODUCTION);
        url.searchParams.set('paged', '1');
        url.searchParams.set('_', String(Date.now()));
        if (cursor) url.searchParams.set('cursor', cursor);
        const response = await this.env.B46_PRODUCTION_READ.fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('Statistics HTTP ' + response.status);
        return response.json();
      });
      await this.state.storage.put({summary, retryAt: 0});
    } catch (error) {
      console.warn('Performance summary refresh skipped:', error.message);
      await this.state.storage.put('retryAt', Date.now() + RETRY_MS);
    } finally {
      this.refreshing = false;
    }
  }
}

export async function summaryFor(request, env, ctx) {
  const now = Date.now();
  const key = new Request(new URL(SUMMARY_PATH, request.url));
  const cache = caches.default;
  try {
    const hit = await cache.match(key);
    if (hit) {
      const stored = await hit.json();
      if (summaryIsUsable(stored, now)) return stored;
    }
  } catch {}
  try {
    const namespace = env.PERFORMANCE_SUMMARY;
    const store = namespace.get(namespace.idFromName('daily-performance'));
    const payload = await store.fetch('https://performance.internal/summary', {
      signal: AbortSignal.timeout(900),
    });
    const summary = payload.ok ? await payload.json() : null;
    if (summaryIsUsable(summary, now)) {
      const cacheResponse = json(summary, { 'cache-control': 'public, max-age=' + CACHE_SECONDS });
      ctx.waitUntil(cache.put(key, cacheResponse).catch(() => {}));
      return summary;
    }
  } catch {}
  return null;
}

export function patchCard(response, view, {clientPath = CLIENT_PATH, headerName = 'x-b46-performance-preview'} = {}) {
  const headers = new Headers(response.headers);
  for (const field of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(field);
  headers.set('cache-control', 'no-store');
  headers.set(headerName, REVISION);

  return new HTMLRewriter()
    .on('head', { element(element) {
      element.append(bootData(view) + '<script defer src="' + clientPath + '"></script>', {html: true});
    } })
    .on('script#b46-daily-performance-runtime', { element(element) { element.remove(); } })
    .on('.main-board > .board-toolbar', { element(element) {
      element.after(cardHTML(view), {html: true});
    } })
    .transform(new Response(response.body, {status: response.status, statusText: response.statusText, headers}));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('READ_ONLY_TEST', {status: 405});
    if (url.pathname === HEALTH_PATH) return json({ scope: 'ISOLATED_TEST_ONLY', revision: REVISION });
    if (url.pathname === CLIENT_PATH) return new Response(clientCode, { headers: {
      'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    } });
    if (url.pathname === SUMMARY_PATH) return json(valuesFor(await summaryFor(request, env, ctx)));

    const target = new URL(PRODUCTION);
    target.pathname = url.pathname;
    target.search = url.search;
    const headers = new Headers();
    for (const field of ['accept', 'accept-language', 'user-agent', 'sec-ch-ua-mobile']) {
      const value = request.headers.get(field);
      if (value) headers.set(field, value);
    }

    const isPage = request.method === 'GET' && PAGE_PATHS.has(url.pathname);
    const [upstream, summary] = await Promise.all([
      env.B46_PRODUCTION_READ.fetch(new Request(target, {method: request.method, headers, redirect: 'manual'})),
      isPage ? summaryFor(request, env, ctx) : null,
    ]);
    const proxied = new Headers(upstream.headers);
    proxied.delete('set-cookie');
    proxied.set('x-robots-tag', 'noindex, nofollow');
    const location = proxied.get('location');
    if (location) {
      const next = new URL(location, PRODUCTION);
      if (['ball46.com', 'www.ball46.com'].includes(next.hostname)) {
        proxied.set('location', new URL(next.pathname + next.search + next.hash, url).href);
      }
    }
    const response = new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status, statusText: upstream.statusText, headers: proxied,
    });
    if (isPage && response.ok && proxied.get('content-type')?.includes('text/html')) {
      return patchCard(response, valuesFor(summary));
    }
    return response;
  },
};
