import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import styles from './codex-pc-favorites-footer-css-v1.mjs';

const pages = new Set(['/', '/index', '/index.html', '/signal.html', '/statistics', '/statistics.html', '/statistics-next.html']);

export default {
  ...original,
  async fetch(request, env, context) {
    const response = await original.fetch(request, env, context);
    if (request.method !== 'GET' || !pages.has(new URL(request.url).pathname) || !response.ok ||
        !response.headers.get('content-type')?.includes('text/html')) {
      return response;
    }

    const headers = new Headers(response.headers);
    for (const field of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(field);
    headers.set('cache-control', 'no-store');
    return new HTMLRewriter().on('head', {
      element(head) { head.append(styles, { html: true }); },
    }).transform(new Response(response.body, {
      status: response.status, statusText: response.statusText, headers,
    }));
  },
};
