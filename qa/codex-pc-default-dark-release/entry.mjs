import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import { dashboardPath, patchDashboard, patchHtml } from './codex-pc-default-dark-patch-v1.mjs';

const pages = new Set(['/', '/index', '/index.html', '/statistics', '/statistics.html', '/statistics-next.html']);

export default {
  ...original,
  async fetch(request, env, context) {
    const response = await original.fetch(request, env, context);
    if (request.method !== 'GET' || !response.ok) return response;
    const path = new URL(request.url).pathname;
    const html = pages.has(path) && response.headers.get('content-type')?.includes('text/html');
    if (!html && path !== dashboardPath) return response;

    const source = await response.text();
    let output;
    try {
      output = html ? patchHtml(source) : patchDashboard(source);
    } catch (error) {
      console.error('Codex PC theme source changed:', error.message);
      output = source;
    }
    const headers = new Headers(response.headers);
    for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(name);
    headers.set('cache-control', 'no-store');
    return new Response(output, { headers, status: response.status, statusText: response.statusText });
  },
};
