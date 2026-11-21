import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import { markup, nativeAssets } from './codex-pc-fullmarket-v3-assets-20261121.mjs';

const applicationPages = new Set(['/', '/index', '/index.html']);

function changedHeaders(response) {
  const headers = new Headers(response.headers);
  for (const field of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(field);
  headers.set('cache-control', 'no-store');
  return headers;
}

async function matches(bytes, expected) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  return hex === expected;
}

export default {
  ...original,
  async fetch(request, env, context) {
    const response = await original.fetch(request, env, context);
    if (request.method !== 'GET' || !response.ok) return response;

    const { pathname, search } = new URL(request.url);
    const patch = nativeAssets[pathname + search];
    const type = response.headers.get('content-type') || '';
    if (patch && /javascript/.test(type) && response.status === 200) {
      const bytes = await response.clone().arrayBuffer();
      if (!await matches(bytes, patch.sha)) return response;
      return new Response(patch.code, {
        status: response.status, statusText: response.statusText, headers: changedHeaders(response),
      });
    }
    if (!applicationPages.has(pathname) || !type.includes('text/html')) return response;

    return new HTMLRewriter().on('head', {
      element(head) { head.append(markup, { html: true }); },
    }).transform(new Response(response.body, {
      status: response.status, statusText: response.statusText, headers: changedHeaders(response),
    }));
  },
};
