const previewName = 'ball46-codex-pc-stats-market-icons-preview';
const previewPath = '/_codex-pc-market-icons/';
const stylesheet = previewPath + 'market-art.css';
const origin = 'https://ball46.com';
const pages = new Set(['/', '/index', '/index.html', '/statistics', '/statistics.html', '/statistics-next.html']);
const publicData = new Set([
  '/api/engine/statistics',
  '/api/engine/board',
  '/api/engine/signals',
  '/api/engine/health',
  '/api/hub/snapshot',
  '/api/hub/health',
  '/b46-receiver-v1/graph',
]);
const publicAsset = /^\/[\w.-]+(?:\/[\w.-]+)*\.(?:js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|txt|map|avif)$/i;
const protectedPath = /^\/(?:api|admin|internal)(?:\/|$)/;

function previewResponse(response, method, replaceHtml = false) {
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('x-ball46-preview', previewName);
  if (replaceHtml) {
    for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified']) {
      headers.delete(name);
    }
    headers.set('cache-control', 'no-store');
  }
  return new Response(method === 'HEAD' ? null : response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Read-only preview', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    if (pathname === previewPath + 'health') {
      return previewResponse(Response.json({ name: previewName, scope: 'test', feature: 'statistics-market-icons' }), method);
    }
    if (pathname.startsWith(previewPath)) {
      return previewResponse(await env.ASSETS.fetch(request), method);
    }

    const isPage = pages.has(pathname);
    if (!isPage && !publicData.has(pathname) && (!publicAsset.test(pathname) || protectedPath.test(pathname))) {
      return new Response('Not found', { status: 404 });
    }

    const upstream = new URL(origin);
    upstream.pathname = pathname;
    upstream.search = url.search;
    const headers = new Headers();
    for (const name of ['accept', 'accept-language', 'user-agent', 'sec-ch-ua-mobile']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value.slice(0, 512));
    }
    const upstreamRequest = new Request(upstream, { method, headers, redirect: 'manual' });
    const original = await env.B46_PRODUCTION_READ.fetch(upstreamRequest);
    const inject = method === 'GET' && isPage && original.ok && original.headers.get('content-type')?.includes('text/html');
    const response = previewResponse(original, method, inject);

    const location = response.headers.get('location');
    if (location) {
      const destination = new URL(location, origin);
      if (['ball46.com', 'www.ball46.com'].includes(destination.hostname)) {
        response.headers.set('location', new URL(destination.pathname + destination.search + destination.hash, url).href);
      }
    }
    if (!inject) return response;

    return new HTMLRewriter().on('head', {
      element(head) {
        head.append(`<link id="codex-pc-market-icons-preview" rel="stylesheet" href="${stylesheet}">`, { html: true });
      },
    }).transform(response);
  },
};
