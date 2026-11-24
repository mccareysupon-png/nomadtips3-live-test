import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIndex } from './build-fixtures.mjs';
import { copy, locales } from './copy.mjs';
import { PreviewRewriter } from './preview.mjs';
import { frontendSeo, indexFixtures, ORIGIN } from './seo.mjs';

const now = Date.parse('2026-11-24T10:00:00Z');
const oldScript = '<script id="b46-odds-flash-runtime-production">window.odds = 1;</script>';
const oldSidebar = '<script id="b46-sidebar-winrate-production">window.sidebar = 1;</script>';
const oldCss = '<style>.original-class {color: red}</style>';
const dashboard = '<!doctype html><html lang="und" data-theme="dark"><head><title>Old</title>' +
  '<meta name="description" content="Old"><link rel="canonical" href="https://example.com/">' +
  '<meta name="twitter:title" content="Old"><script type="application/ld+json">{}</script>' + oldCss +
  oldScript + '</head><body><main><h1>Today\'s Matches</h1>' +
  '<div data-workspace-panel="live">Live</div><div data-workspace-panel="statistics" hidden>Stats</div>' +
  '</main>' + oldSidebar + '</body></html>';
const upstream = async () => new Response(dashboard, {
  headers: { 'content-type': 'text/html; charset=utf-8', etag: '"old"', 'content-length': '100' },
});
const fixture = (id, status, overrides = {}) => ({
  fixtureId: id, status, kickoffUtc: '2026-11-23T18:00:00Z',
  home: { name: 'Home & Club' }, away: { name: 'Away </script><script>alert(1)</script>' },
  league: { name: 'Example League' }, goals: { home: 2, away: 1 }, ...overrides,
});
const snapshot = (fixtures, observedAt = now) => ({ ok: true, stale: false, hubFetchedAt: observedAt, fixtures });
const index = buildIndex(snapshot([
  fixture('1234', 'finished'),
  fixture('2000', 'scheduled', { kickoffUtc: '2026-11-25T18:00:00Z' }),
  fixture('3456', 'unknown'),
]), null, now);
const fixtures = indexFixtures(index);

const route = (path, options = {}) => frontendSeo(new Request('https://preview.example' + path), {
  fixtures, now, upstream, Rewriter: PreviewRewriter, ...options,
});

const getAlt = html => Object.fromEntries([...html.matchAll(
  /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g,
)].map(([, locale, url]) => [locale, url]));

test('manifest validates match data, de-duplicates, retains results and handles corrections', () => {
  assert.equal(index.entries.length, 2);
  assert.equal(fixtures.byId.get('2000').result, null);
  assert.throws(() => buildIndex({ ...snapshot([]), stale: true }, index, now), /non-stale/);
  assert.throws(() => buildIndex(snapshot([fixture('invalid', 'finished')]), null, now), /no publishable/);
  assert.throws(() => buildIndex(snapshot([
    fixture('7', 'finished', { goals: { home: 2, away: null } }),
  ]), null, now), /no publishable/);
  assert.equal(buildIndex(snapshot([fixture('99', 'finished')], now - 1), index, now), index);

  const next = buildIndex(snapshot([
    fixture('1234', 'finished', { goals: { home: 1, away: 1 } }),
    fixture('1234', 'finished', { goals: { home: 2, away: 2 } }),
    fixture('5678', 'finished'),
  ], now + 1), index, now + 1);
  assert.equal(next.entries.length, 2);
  assert.deepEqual(next.entries.find(entry => entry.id === '1234').result, [2, 2]);

  const later = buildIndex(snapshot([fixture('5678', 'finished')], now + 2), index, now + 2);
  assert.equal(later.entries.length, 2);
  assert(later.entries.some(entry => entry.id === '1234'));
  const corrected = buildIndex(snapshot([fixture('5678', 'finished'), fixture('1234', 'unknown')], now + 3), later, now + 3);
  assert(!corrected.entries.some(entry => entry.id === '1234'));
});

test('rewrites homepage and Statistics SEO while preserving the application runtime', async () => {
  const pages = [
    ['/', 'home', ORIGIN + '/'],
    ['/index.html?view=statistics&market=total', 'statistics', ORIGIN + '/index.html?view=statistics'],
  ];
  for (const [path, key, canonical] of pages) {
    const result = await route(path);
    assert.equal(result.headers.get('etag'), null);
    assert.equal(result.headers.get('content-length'), null);
    const html = await result.text();
    assert(html.includes('<html lang="en" data-theme="dark">'));
    assert(html.includes('<title>' + copy.en[key].heading.replaceAll('&', '&amp;') + ' | BALL46</title>'));
    assert.equal([...html.matchAll(/<link rel="canonical"/g)].length, 1);
    assert.equal([...html.matchAll(/<meta name="description"/g)].length, 1);
    assert.equal([...html.matchAll(/<meta name="twitter:title"/g)].length, 1);
    assert(html.includes('href="' + canonical + '"'));
    assert(html.includes(oldScript) && html.includes(oldSidebar) && html.includes(oldCss));
    assert(html.includes('data-workspace-panel="statistics" hidden'));
    assert(html.includes('data-b46-seo-guide="statistics"') && html.includes('data-b46-seo-guide="home"'));
    assert(html.includes('<h3>Real-time odds movement &amp; match pressure</h3>'));
    assert.equal(getAlt(html)['x-default'], canonical);
  }
});

test('uses reciprocal, self-canonicalized language URLs for each translated topic', async () => {
  for (const [topic, englishPath] of Object.entries({
    home: '/', statistics: '/index.html?view=statistics', methodology: '/methodology.html',
  })) {
    const alternates = getAlt(await (await route(englishPath)).text());
    assert.equal(Object.keys(alternates).length, 14);
    assert.equal(alternates['x-default'], ORIGIN + englishPath);
    for (const locale of Object.keys(locales).filter(code => code !== 'en')) {
      const path = new URL(alternates[locale]).pathname;
      const html = await (await route(path)).text();
      assert(html.includes('<html lang="' + locale + '">'));
      assert(html.includes('<link rel="canonical" href="' + alternates[locale] + '">'));
      assert(html.includes('<h1>' + copy[locale][topic].heading.replaceAll('&', '&amp;') + '</h1>'));
      assert.deepEqual(getAlt(html), alternates);
    }
  }
  const redirect = await route('/zh/statistics');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/zh/statistics/');
});

test('publishes grounded SportsEvent data with safe names and truthful status', async () => {
  const finished = await route('/match/1234/');
  assert.equal(finished.status, 200);
  const html = await finished.text();
  const schemaText = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1];
  const schema = JSON.parse(schemaText);
  assert.equal(schema['@type'], 'SportsEvent');
  assert.equal(schema.startDate, '2026-11-23T18:00:00.000Z');
  assert.equal(schema.homeTeam.name, 'Home & Club');
  assert.match(schema.awayTeam.name, /<\/script>/);
  assert(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /<dt>Final score<\/dt><dd>2–1<\/dd>/);
  assert(!('location' in schema));
  const scheduled = await (await route('/match/2000/')).text();
  assert.match(scheduled, /schema.org\/EventScheduled/);
  assert(!scheduled.includes('Last reported score') && !scheduled.includes('2–1'));
  assert.equal((await route('/match/1234')).headers.get('location'), '/match/1234/');
  assert.equal((await route('/match/3456/')).status, 404);
  assert.equal((await route('/match/not-an-id/')).status, 404);
  assert.equal((await route('/match/1234/', { fixtures: null })).status, 503);
});

test('robots and sitemaps list only canonical public routes and validated match IDs', async () => {
  const robots = await (await route('/robots.txt')).text();
  assert.match(robots, /Disallow: \/api\//);
  assert(robots.includes('Sitemap: ' + ORIGIN + '/sitemap.xml'));
  const sitemap = await (await route('/sitemap.xml')).text();
  assert.match(sitemap, /<sitemapindex/);
  assert(sitemap.includes(ORIGIN + '/sitemap-matches-1.xml'));
  const pages = await (await route('/sitemap-pages.xml')).text();
  assert.equal([...pages.matchAll(/<loc>/g)].length, 41);
  assert(pages.includes(ORIGIN + '/index.html?view=statistics'));
  assert(!pages.includes('<loc>' + ORIGIN + '/statistics.html'));
  const matches = await (await route('/sitemap-matches-1.xml')).text();
  assert.equal([...matches.matchAll(/<loc>/g)].length, 2);
  assert(matches.includes(ORIGIN + '/match/1234/'));
  assert(!matches.includes('/match/3456/'));
});

test('passes API, asset and non-SEO requests through using the original request', async () => {
  for (const [path, method] of [
    ['/api/engine/board', 'GET'], ['/b46-sidebar.js', 'GET'], ['/contact.html', 'GET'], ['/', 'POST'],
  ]) {
    const req = new Request('https://preview.example' + path, { method, headers: { 'if-none-match': 'same' } });
    const original = new Response('original', { status: 202 });
    const actual = await frontendSeo(req, {
      upstream: passed => {
        assert.equal(passed, req);
        return original;
      },
      fixtures, Rewriter: PreviewRewriter, now,
    });
    assert.equal(actual, original);
  }
});
