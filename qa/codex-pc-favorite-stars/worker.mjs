import styles from './favorite-stars.css';

const name = 'ball46-codex-pc-favorite-stars-preview';
const origin = 'https://ball46.com';
const pages = new Set(['/', '/index', '/index.html', '/signal.html', '/statistics', '/statistics.html', '/statistics-next.html']);
const dataPaths = new Set([
  '/api/engine/statistics', '/api/engine/board', '/api/engine/signals', '/api/engine/health',
  '/api/hub/snapshot', '/api/hub/health', '/b46-receiver-v1/graph',
]);
const publicAsset = /^\/[\w.-]+(?:\/[\w.-]+)*\.(?:js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|txt|map|avif)$/i;
const privatePath = /^\/(?:api|admin|internal)(?:\/|$)/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, search } = url;
    const { method } = request;
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Read-only preview', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    if (pathname === '/_codex-pc-favorite-stars/health') {
      return Response.json({ name, scope: 'test' }, { headers: { 'x-robots-tag': 'noindex, nofollow' } });
    }
    if (!pages.has(pathname) && !dataPaths.has(pathname) && (!publicAsset.test(pathname) || privatePath.test(pathname))) {
      return new Response('Not found', { status: 404 });
    }

    const forwarded = new Headers();
    for (const key of ['accept', 'accept-language', 'user-agent', 'sec-ch-ua-mobile']) {
      const value = request.headers.get(key);
      if (value) forwarded.set(key, value);
    }
    const upstream = await env.B46_PRODUCTION_READ.fetch(new Request(origin + pathname + search, {
      method, headers: forwarded, redirect: 'manual',
    }));
    const headers = new Headers(upstream.headers);
    headers.delete('set-cookie');
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('x-ball46-preview', name);
    const location = headers.get('location');
    if (location) {
      const destination = new URL(location, origin);
      if (['ball46.com', 'www.ball46.com'].includes(destination.hostname)) {
        headers.set('location', new URL(destination.pathname + destination.search + destination.hash, url).href);
      }
    }

    const inject = method === 'GET' && pages.has(pathname) && upstream.ok &&
      headers.get('content-type')?.includes('text/html');
    if (inject) {
      for (const key of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(key);
      headers.set('cache-control', 'no-store');
    }
    const response = new Response(method === 'HEAD' ? null : upstream.body, {
      status: upstream.status, statusText: upstream.statusText, headers,
    });
    if (!inject) return response;

    return new HTMLRewriter().on('head', {
      element(head) {
        head.append('<style id="codex-pc-favorite-stars">' + styles + '</style>', { html: true });
      },
    }).transform(response);
  },
};
