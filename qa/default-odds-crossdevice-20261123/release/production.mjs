import original from './__ACTIVE_ENTRY__';
export * from './__ACTIVE_ENTRY__';
import { crossDeviceOddsScript, crossDeviceOddsStyles } from './b46-crossdevice-odds-20261123.mjs';

// The existing preview filters these two IDs so it can still test one controller.
const tags = '<style id="b46-odds-flash-production">' + crossDeviceOddsStyles +
  '</style><script id="b46-odds-flash-runtime-production">' + crossDeviceOddsScript + '</script>';
const pages = new Set(['/', '/index', '/index.html']);

export default {
  ...original,
  async fetch(request, env, context) {
    const response = await original.fetch(request, env, context);
    if (request.method !== 'GET' || !pages.has(new URL(request.url).pathname) ||
        !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;

    const headers = new Headers(response.headers);
    for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(name);
    headers.set('x-b46-default-odds-movement', 'single-controller-v4');
    return new HTMLRewriter()
      .on('style#b46-odds-flash-production, script#b46-odds-flash-runtime-production', {
        element(element) { element.remove(); },
      })
      .on('head', { element(element) { element.append(tags, {html:true}); } })
      .transform(new Response(response.body, {status:response.status,statusText:response.statusText,headers}));
  },
};
