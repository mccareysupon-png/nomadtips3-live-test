import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { ORIGIN } from '../seo.mjs';
import { eventually, get, hash } from '../../default-odds-crossdevice-20261123/release/cloudflare.mjs';

const protectedAssets = [
  '/dashboard-v2-stage3-featured-facts-20261013a.js',
  '/singlepage-workspace-343.js', '/full-market-bookmaker-343.js',
  '/expanded-match-343.js', '/__ball46_performance/card.js',
  '/b46-sidebar-monitor-client-colors-20261119-v1.js',
];
const scriptId = /<script id="(?:b46-odds-flash-runtime-production|b46-sidebar-winrate-production)">[\s\S]*?<\/script>/g;
const scriptSet = /<script\b(?![^>]*type="application\/(?:ld\+json|json)")[^>]*>[\s\S]*?<\/script>/gi;
const userAgent = 'Mozilla/5.0 BALL46 SEO Release';
const device = devices['Pixel 7'];
const sourcePage = '/?view=signal';

const read = (host, path, agent = userAgent) =>
  eventually(() => get(host + path, { headers: { 'user-agent': agent } }), 4, 900);

export async function protectedSurface(host) {
  const [assets, routes, source] = await Promise.all([
    Promise.all(protectedAssets.map(async path => hash(await (await read(host, path)).text()))),
    Promise.all([
      '/api/engine/health', '/api/full-market/health',
      '/api/engine/statistics?paged=1', '/__ball46_performance/summary',
    ].map(async path => {
      const r = await read(host, path);
      const data = await r.json();
      if (path.startsWith('/__')) {
        assert(['current', 'saved'].includes(data.state));
        assert(/^\d+$/.test(data.fields?.['stat:today-win']));
        return { performance: true };
      }
      assert(data.ok, path + ' contract failed');
      if (path.includes('statistics?')) assert(Array.isArray(data.rows) && data.statisticsSource === 'LEDGER_V2_ONLY');
      return { version: data.version, statisticsSource: data.statisticsSource };
    })),
    Promise.all([userAgent, device.userAgent].map(async agent => {
      const r = await read(host, sourcePage, agent);
      assert.equal(r.headers.get('x-b46-default-odds-movement'), 'single-controller-v4');
      assert.equal(r.headers.get('x-b46-daily-performance'), 'daily-performance-summary-v1');
      const html = await r.text();
      const scripts = html.match(scriptId);
      assert.equal(scripts?.length, 2, 'Protected runtime scripts missing');
      assert(html.includes('id="ball46-daily-performance"'));
      const application = (html.match(scriptSet) ?? []).filter(
        tag => !/cdn-cgi|cloudflareinsights/i.test(tag.slice(0, tag.indexOf('>') + 1)),
      );
      return {
        protectedScripts: scripts.map(code => hash(code)).sort(),
        applicationScripts: application.map(code => hash(code)).sort(),
      };
    })),
  ]);
  return { assets, routes, source };
}

function alternateTags(html) {
  return [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
    .map(([, locale, href]) => [locale, href]);
}

export async function seoSmoke(host, { preview = false, sample, allLocales = false }) {
  async function page(path) {
    const response = await read(host, path);
    assert.equal(response.headers.get('x-b46-frontend-seo'), 'frontend-seo-i18n-v1', path);
    const indexing = response.headers.get('x-robots-tag') ?? '';
    if (preview) assert.match(indexing, /noindex/i, path);
    else assert(!/noindex/i.test(indexing), 'Public indexing disabled on ' + path);
    return { html: await response.text(), headers: response.headers };
  }
  const core = [
    ['/', 'Live Football Predictions', '/'],
    ['/index.html?view=statistics', 'Football Signal Statistics', '/index.html?view=statistics'],
    ['/methodology.html', 'Football Signal Methodology', '/methodology.html'],
  ];
  for (const [path, title, canonical] of core) {
    const { html } = await page(path);
    assert(html.includes('<title>' + title));
    assert.equal(html.match(/<link rel="canonical"/g)?.length, 1);
    assert(html.includes('<link rel="canonical" href="' + ORIGIN + canonical + '">'));
    for (const item of ['name="description"', 'name="twitter:card"', 'property="og:title"']) {
      assert(html.includes(item));
    }
    assert(!/<meta name="robots" content="[^"]*noindex/i.test(html));
    const alternates = alternateTags(html);
    assert.equal(alternates.length, 14);
    assert(alternates.some(([locale, href]) => locale === 'x-default' && href === ORIGIN + canonical));
    if (allLocales) {
      const translated = alternates.filter(([locale]) => locale !== 'en' && locale !== 'x-default');
      // Limit concurrent edge requests while checking the full set of translations.
      for (let i = 0; i < translated.length; i += 4) {
        await Promise.all(translated.slice(i, i + 4).map(async ([locale, href]) => {
          const u = new URL(href);
          const { html: localeHtml } = await page(u.pathname);
          assert(localeHtml.includes('<html lang="' + locale + '">'));
          assert(localeHtml.includes('<link rel="canonical" href="' + href + '">'));
          assert.deepEqual(alternateTags(localeHtml), alternates);
        }));
      }
    }
  }
  const [{ html: robots }, { html: sitemap }, { html: staticSitemap }, { html: matchSitemap, headers }, { html: sampleHtml }] =
    await Promise.all([
      page('/robots.txt'), page('/sitemap.xml'), page('/sitemap-pages.xml'),
      page('/sitemap-matches-1.xml'), page('/match/' + sample.id + '/'),
    ]);
  assert(robots.includes('Disallow: /api/') && robots.includes('Sitemap: ' + ORIGIN + '/sitemap.xml'));
  assert(sitemap.includes(ORIGIN + '/sitemap-matches-1.xml') && sitemap.includes(ORIGIN + '/sitemap-pages.xml'));
  assert.equal(staticSitemap.match(/<loc>/g)?.length, 41);
  assert(matchSitemap.includes(ORIGIN + '/match/' + sample.id + '/'));
  const count = matchSitemap.match(/<loc>/g)?.length;
  assert(count > 0, 'Empty match sitemap');
  const event = JSON.parse(sampleHtml.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(event['@type'], 'SportsEvent');
  assert.equal(event.homeTeam.name, sample.home);
  assert.equal(event.awayTeam.name, sample.away);
  const missing = await fetch(host + '/match/99999999999999999999/', { signal: AbortSignal.timeout(10_000) });
  assert.equal(missing.status, 404);
  const report = { host, localeVariants: 13, staticSitemapUrls: 41,
    matchSitemapUrls: count, samplePath: '/match/' + sample.id + '/',
    fixtureSnapshot: headers.get('x-b46-seo-fixtures-at'), preview };
  console.log('BALL46_SEO_HTTP_QA', JSON.stringify(report));
  return report;
}

export async function browserSmoke(host) {
  const browser = await chromium.launch(process.env.B46_CHROMIUM ? { executablePath: process.env.B46_CHROMIUM } : {});
  const cases = [];
  try {
    for (const [mobile, theme] of [[false, 'dark'], [false, 'light'], [true, 'dark'], [true, 'light']]) {
      const context = await browser.newContext(mobile ? device : { viewport: { width: 1440, height: 900 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(active => localStorage.setItem('nomad343_dashboard_theme_v1', active), theme);
        await page.route('**/*', route => {
          const request = route.request();
          if (!['GET', 'HEAD'].includes(request.method()) || new URL(request.url()).pathname === '/api/engine/statistics') {
            return route.abort();
          }
          return route.continue();
        });
        const response = await page.goto(host + sourcePage, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        assert.equal(response.status(), 200);
        await page.waitForFunction(active => window.__b46OddsCrossDeviceStats?.ready &&
          document.documentElement.dataset.theme === active, theme, { timeout: 20_000 });
        assert.equal(await page.locator('#b46-sidebar-winrate-production').count(), 1);
        assert.equal(await page.locator('#ball46-daily-performance').count(), 1);
        assert(!errors.some(error => /Odds|Sidebar|Performance|ReferenceError/i.test(error)), errors.join('\n'));
        const checked = { mobile, theme };
        cases.push(checked);
        console.log('BALL46_SEO_BROWSER_QA', JSON.stringify({ host, ...checked }));
      } finally {
        await context.close();
      }
    }
    const context = await browser.newContext({ ...device, javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      const response = await page.goto(host + '/th/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('html').getAttribute('lang'), 'th');
      assert(await page.getByRole('heading', { level: 1 }).isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      cases.push({ mobile: true, path: '/th/', avoidJavaScript: true });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return cases;
}
