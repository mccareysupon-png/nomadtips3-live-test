import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import assets from './codex-pc-market-icons-assets-v1.mjs';

const prefix = '/_codex-pc-market-icons/';
const stylesheet = '<link id="codex-pc-market-icons-production" rel="stylesheet" href="' + prefix + 'market-art.css">';
const pages = new Set(['/', '/index', '/index.html', '/statistics', '/statistics.html', '/statistics-next.html']);

export default {
  ...original,
  async fetch(request, env, context) {
    const path = new URL(request.url).pathname;
    const asset = assets[path];
    if (asset && (request.method === 'GET' || request.method === 'HEAD')) {
      const headers = {
        'content-type': asset.type,
        'cache-control': 'public, max-age=0, must-revalidate',
        etag: asset.etag,
      };
      if (request.headers.get('if-none-match') === asset.etag) {
        return new Response(null, { status: 304, headers });
      }
      const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.data), byte => byte.charCodeAt(0));
      return new Response(body, { headers });
    }

    const response = await original.fetch(request, env, context);
    if (request.method !== 'GET' || !pages.has(path) || !response.ok ||
        !response.headers.get('content-type')?.includes('text/html')) {
      return response;
    }

    const headers = new Headers(response.headers);
    for (const field of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(field);
    headers.set('cache-control', 'no-store');
    return new HTMLRewriter().on('head', {
      element(head) {
        head.append(stylesheet, { html: true });
      },
    }).transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
  },
};
