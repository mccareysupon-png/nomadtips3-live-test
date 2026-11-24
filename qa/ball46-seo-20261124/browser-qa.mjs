import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { chromium, devices } from 'playwright';
import { openPreview, PreviewRewriter } from './preview.mjs';
import { frontendSeo, indexFixtures, ORIGIN } from './seo.mjs';

const [indexPath, reportPath] = process.argv.slice(2);
if (!indexPath) throw new Error('Usage: node browser-qa.mjs INDEX.json [REPORT.json]');

const hash = value => createHash('sha256').update(value).digest('hex');
const status = ['/', '/index.html?view=statistics', '/methodology.html'];
const runtimeTags = (html, regex) => [...html.matchAll(regex)].map(match => match[0]);
const protectedIds = ['b46-odds-flash-runtime-production', 'b46-sidebar-winrate-production'];
const report = { checkedAt: new Date().toISOString(), pages: [], browser: [], sitemap: {} };

async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok, url + ' ' + response.status);
  return { headers: response.headers, html: await response.text() };
}

const server = await openPreview({ indexPath, port: 0 });
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  for (const path of status) {
    const { html: original } = await read(ORIGIN + path);
    const { html: previewHtml, headers } = await read(base + path);
    const rewritten = await frontendSeo(new Request(base + path), {
      upstream: () => new Response(original, { headers: { 'content-type': 'text/html' } }),
      Rewriter: PreviewRewriter,
    });
    const updated = await rewritten.text();
    const title = /<title>([^<]+)/;
    assert.equal(previewHtml.match(title)?.[1], updated.match(title)?.[1]);
    const javascript = /<script\b(?![^>]*type="application\/(?:ld\+json|json)")[^>]*>[\s\S]*?<\/script>/gi;
    const styles = /<style\b(?![^>]*id="b46-seo-guide-style")[^>]*>[\s\S]*?<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/gi;
    assert.equal(hash(JSON.stringify(runtimeTags(updated, javascript))),
      hash(JSON.stringify(runtimeTags(original, javascript))), path + ' executable JS changed');
    assert.equal(hash(JSON.stringify(runtimeTags(updated, styles))),
      hash(JSON.stringify(runtimeTags(original, styles))), path + ' original CSS changed');
    assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow');
    const unchanged = {};
    for (const id of protectedIds) {
      const pattern = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>');
      const code = original.match(pattern)?.[1];
      if (code) {
        assert.equal(updated.match(pattern)?.[1], code);
        unchanged[id] = hash(code);
      }
    }
    report.pages.push({ path, title: updated.match(/<title>([^<]+)/)?.[1],
      canonical: updated.match(/<link rel="canonical" href="([^"]+)/)?.[1],
      originalJavaScript: 'identical', originalStyles: 'identical', protectedScriptHashes: unchanged,
      addedHtmlBytes: Buffer.byteLength(updated) - Buffer.byteLength(original),
      addedGzipBytes: gzipSync(updated).length - gzipSync(original).length });
  }

  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const { html: maps } = await read(base + '/sitemap.xml');
  const { html: pages } = await read(base + '/sitemap-pages.xml');
  const { html: matches } = await read(base + '/sitemap-matches-1.xml');
  assert(maps.includes(ORIGIN + '/sitemap-matches-1.xml'));
  assert.equal([...pages.matchAll(/<loc>/g)].length, 41);
  assert.equal([...matches.matchAll(/<loc>/g)].length, index.entries.length);
  assert.equal((await fetch(base + '/match/99999999999999999999/')).status, 404);
  const fromDirectory = new Set();
  for (let page = 1; page <= Math.ceil(index.entries.length / 100); page++) {
    const { html } = await read(base + '/matches/' + (page > 1 ? '?page=' + page : ''));
    for (const [, id] of html.matchAll(/<a href="\/match\/(\d+)\/"/g)) fromDirectory.add(id);
  }
  assert(fromDirectory.size === index.entries.length && index.entries.every(match => fromDirectory.has(match.id)));
  const fixtures = indexFixtures(index);
  for (const entry of index.entries) {
    const path = '/match/' + entry.id + '/';
    const response = await frontendSeo(new Request(base + path), { fixtures });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
    assert.equal(schema['@type'], 'SportsEvent');
    assert.equal(schema.url, ORIGIN + path);
    assert.equal(schema.homeTeam.name, entry.home);
    assert.equal(schema.awayTeam.name, entry.away);
  }
  const sample = index.entries.find(match => match.status === 'finished');
  assert(sample);
  report.sitemap = { pages: 41, matches: index.entries.length, snapshot: new Date(index.observedAt).toISOString(),
    directoryLinks: fromDirectory.size, validMatchPages: index.entries.length, samplePath: '/match/' + sample.id + '/',
    sampleFixture: sample.home + ' vs ' + sample.away };

  browser = await chromium.launch(process.env.B46_CHROMIUM ? { executablePath: process.env.B46_CHROMIUM } : {});
  for (const [mode, options] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['Pixel 7']]]) {
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(active => localStorage.setItem('nomad343_dashboard_theme_v1', active), theme);
      await page.route('**/*', route => {
        const request = route.request();
        return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
      });
      const response = await page.goto(base + '/?view=signal', { waitUntil: 'domcontentloaded', timeout: 45_000 });
      assert.equal(response.status(), 200);
      await page.waitForFunction(active => window.__b46OddsCrossDeviceStats?.ready &&
        document.documentElement.dataset.theme === active, theme, { timeout: 20_000 });
      assert.equal(await page.locator('#ball46-daily-performance').count(), 1);
      assert.equal(await page.locator('#b46-sidebar-winrate-production').count(), 1);
      assert.equal(await page.locator('#b46-odds-flash-runtime-production').count(), 1);
      assert(!await page.evaluate(() => window.__b46OddsMovementV1));
      assert(!errors.some(message => /installOddsMovement|__name|sidebar|Statistics/i.test(message)), errors.join('\n'));
      report.browser.push({ mode, theme, oddsRuntimeReady: true, sidebarScriptPresent: true,
        performanceCardPresent: true, relevantJavaScriptErrors: 0, pageErrors: errors });
      await context.close();
    }
  }

  const dashboardContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dashboard = await dashboardContext.newPage();
  for (const [path, view] of [['/', 'live'], ['/index.html?view=statistics', 'statistics']]) {
    await dashboard.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await dashboard.waitForFunction(current => document.body.dataset.workspaceView === current, view);
    assert.match(await dashboard.title(), view === 'live' ? /Live Football Predictions/ : /Football Signal Statistics/);
    const guide = dashboard.locator('[data-b46-seo-guide="' + (view === 'live' ? 'home' : view) + '"]');
    await guide.locator('summary').waitFor({ state: 'visible', timeout: 10_000 });
    await guide.locator('details').evaluate(element => { element.open = true; });
    assert(await guide.getByRole('heading', { level: 2 }).isVisible());
    report.browser.push({ path, mode: 'desktop', guideExpandable: true });
  }
  await dashboardContext.close();

  const context = await browser.newContext({ ...devices['Pixel 7'], javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path, lang, type] of [
    ['/th/', 'th', null],
    ['/zh/statistics/', 'zh-CN', null],
    ['/pt-br/methodology/', 'pt-BR', null],
    [report.sitemap.samplePath, 'en', 'SportsEvent'],
  ]) {
    const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert(await page.getByRole('heading', { level: 1 }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (type) {
      const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
      assert.equal(schema['@type'], type);
      assert(await page.getByText(sample.result.join('–'), { exact: true }).isVisible());
    }
    report.browser.push({ path, mode: 'mobile', language: lang, javascriptDisabled: true,
      headingVisible: true, horizontalOverflow: false });
  }
  await context.close();

  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
