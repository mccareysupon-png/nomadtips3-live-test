import styles from './mobile-details.css';
import desktopStyles from './desktop-featured-details.css';
import { prepareMobileFlowAsset, FLOW_ASSET } from './mobile-flow-copy.mjs';
import { mobileMatchDrawerScript } from './mobile-match-drawer.mjs';

const SITE = 'https://ball46.com';
const ID = 'b46-mobile-expanded-theme-20261124';
const DESKTOP_ID = 'b46-desktop-featured-details-20261124';
const pages = new Set(['/', '/index', '/index.html', '/signal.html', '/statistics.html']);
const noIndex = 'noindex, nofollow';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Read-only preview', {
        status: 405, headers: { allow: 'GET, HEAD', 'x-robots-tag': noIndex },
      });
    }
    if (url.pathname === '/__mobile_expanded_theme_health') {
      return Response.json({ scope: 'ISOLATED_TEST_ONLY', style: ID, productionWrites: false }, {
        headers: { 'cache-control': 'no-store', 'x-robots-tag': noIndex },
      });
    }
    const target = new URL(SITE);
    target.pathname = url.pathname;
    target.search = url.search;
    const headers = new Headers();
    for (const name of ['accept', 'accept-language', 'user-agent', 'sec-ch-ua-mobile']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const source = await env.B46_PRODUCTION_READ.fetch(new Request(target, {
      method: request.method, headers, redirect: 'manual',
    }));
    const outgoing = new Headers(source.headers);
    outgoing.delete('set-cookie');
    outgoing.set('x-robots-tag', noIndex);
    const location = outgoing.get('location');
    if (location) {
      const redirect = new URL(location, SITE);
      if (redirect.hostname === 'ball46.com' || redirect.hostname === 'www.ball46.com') {
        url.pathname = redirect.pathname;
        url.search = redirect.search;
        url.hash = redirect.hash;
        outgoing.set('location', String(url));
      }
    }
    if (request.method === 'GET' && source.ok && url.pathname === FLOW_ASSET) {
      for (const name of ['content-encoding', 'content-length', 'etag', 'last-modified']) outgoing.delete(name);
      outgoing.set('cache-control', 'no-store');
      return new Response(prepareMobileFlowAsset(await source.text()), { status: source.status, headers: outgoing });
    }
    if (request.method === 'GET' && source.ok && pages.has(url.pathname) &&
        outgoing.get('content-type')?.includes('text/html')) {
      for (const name of ['content-encoding', 'content-length', 'etag', 'last-modified']) outgoing.delete(name);
      outgoing.set('cache-control', 'no-store');
      outgoing.set('x-b46-preview', ID);
      return new HTMLRewriter().on('style#' + ID + ', style#' + DESKTOP_ID + ', script#b46-mobile-match-drawer', {
        element(node) { node.remove(); },
      }).on('head', {
        element(head) {
          head.append('<style id="' + ID + '">' + styles + '</style>' +
            '<style id="' + DESKTOP_ID + '">' + desktopStyles + '</style>' +
            '<script id="b46-mobile-match-drawer">' + mobileMatchDrawerScript + '</script>', { html: true });
        },
      }).transform(new Response(source.body, { status: source.status, headers: outgoing }));
    }
    return new Response(request.method === 'HEAD' ? null : source.body, { status: source.status, headers: outgoing });
  },
};
