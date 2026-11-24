import assert from 'node:assert/strict';
import { join } from 'node:path';
import { get, hash } from '../default-odds-crossdevice-20261123/release/cloudflare.mjs';
import { mobileDashboardHead } from '../ball46-seo-20261124/b46-mobile-footer-ui-20261124.mjs';
import { checkDesktopFeatured, desktopStyleId } from './desktop-featured-qa.mjs';

const tool = new URL('../ball46-seo-20261124/node_modules/playwright/index.mjs', import.meta.url);
const { chromium, devices } = await import(tool);
const home = '/?view=live';
const protectedAssets = [
  '/dashboard-v2-stage3-featured-facts-20261013a.js', '/singlepage-workspace-343.js',
  '/full-market-bookmaker-343.js', '/expanded-match-343.js', '/b46-mobile-event-flow-bars-20261102.js',
  '/__ball46_performance/card.js', '/b46-sidebar-monitor-client-colors-20261119-v1.js',
];
const seoPaths = [home, '/index.html?view=statistics', '/signal.html', '/methodology.html', '/th/', '/pt-br/'];
const scripts = /<script id="(?:b46-odds-flash-runtime-production|b46-sidebar-winrate-production)">[\s\S]*?<\/script>/g;
const managedSeo = /<title>[\s\S]*?<\/title>|<link[^>]*(?:rel="canonical"|hreflang=)[^>]*>|<meta[^>]*(?:name="description"|name="robots"|property="og:|name="twitter:)[^>]*>|<script type="application\/ld\+json">[\s\S]*?<\/script>/g;
const guide = (html, topic) =>
  html.match(new RegExp('<aside[^>]*data-b46-seo-guide="' + topic + '"[^>]*>[\\s\\S]*?<\\/aside>'))?.[0];
const text = async (host, path) => (await get(host + path)).text();

export async function surfaces(host, { candidate = false, preview = false } = {}) {
  const seo = await Promise.all(seoPaths.map(async path => {
    const response = await get(host + path);
    const html = await response.text();
    assert.equal(response.headers.get('x-b46-frontend-seo'), 'frontend-seo-i18n-v1', path);
    assert.equal(/noindex/i.test(response.headers.get('x-robots-tag') ?? ''), preview, path);
    assert.equal(html.match(/<link rel="canonical"/g)?.length, 1);
    if (path !== '/signal.html') assert(html.includes('<link rel="alternate" hreflang="x-default"'), path);
    const tags = html.match(managedSeo);
    assert(tags?.length >= (path === '/signal.html' ? 8 : 16), path);
    return tags;
  }));
  const html = await text(host, home);
  const stats = guide(html, 'statistics');
  const homeGuide = guide(html, 'home');
  assert(stats && homeGuide);
  assert.equal((html.match(/data-b46-seo-guide="home"/g) ?? []).length, 1);
  assert.equal((homeGuide.match(/hreflang=/g) ?? []).length, 13);
  assert.equal((homeGuide.match(/<a href=/g) ?? []).length, 3);
  const footer = html.match(/<footer id="b46-site-footer-v1"[^>]*>[\s\S]*?<\/footer>/)?.[0];
  assert(footer, 'Main footer absent in the rendered source');
  assert(footer.includes(homeGuide + '</div>') || footer.includes(homeGuide + '\n</div>'),
    'The SEO guide is not at the end of the server-rendered footer');
  const drawerScript = mobileDashboardHead.match(/<script id="b46-mobile-match-drawer">[\s\S]*?<\/script>/)[0];
  assert(html.includes(drawerScript), 'Missing exact drawer script');
  const footerStyle = html.match(/<style id="b46-footer-seo-bottom-release-style">[\s\S]*?<\/style>/)?.[0];
  assert(footerStyle, 'Missing footer stylesheet');
  assert.equal(html.includes('id="' + desktopStyleId + '"'), candidate);
  if (candidate) assert(html.includes(mobileDashboardHead), 'The released stylesheet differs from the sandbox');
  const runtime = html.match(scripts);
  assert.equal(runtime?.length, 2);
  const activeScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map(([, src]) => new URL(src, host));
  const [assets, api, robots, sitemap, staticMap, matches] = await Promise.all([
    Promise.all(protectedAssets.map(async path => {
      const script = activeScripts.find(item => item.pathname === path);
      return hash(await text(host, path + (script?.search ?? '')));
    })),
    Promise.all(['/api/engine/health', '/api/full-market/health', '/api/engine/statistics?paged=1'].map(async path => {
      const data = await (await get(host + path)).json();
      assert(data.ok, path);
      if (path.includes('statistics?')) {
        assert.equal(data.statisticsSource, 'LEDGER_V2_ONLY');
        assert(Array.isArray(data.rows));
      }
      return [data.version, data.statisticsSource];
    })),
    text(host, '/robots.txt'), text(host, '/sitemap.xml'), text(host, '/sitemap-pages.xml'),
    text(host, '/sitemap-matches-1.xml'),
  ]);
  assert.match(robots, /Sitemap: https:\/\/www\.ball46\.com\/sitemap\.xml/);
  assert.match(sitemap, /sitemap-matches-1\.xml/);
  assert.match(matches, /<loc>https:\/\/www\.ball46\.com\/match\//);
  const count = (matches.match(/<loc>/g) ?? []).length;
  assert(count > 0);
  return { invariant: { seo, stats, homeGuide, footerStyle, drawerScript,
    runtime: runtime.map(hash), assets, api, robots, staticMap }, matchSitemapUrls: count };
}

function readLogoDuringTransition() {
  const header = document.querySelector('#b46m-teal-shell');
  const node = header.querySelector('.b46m-brand');
  const dialog = document.querySelector('#b46gn-detail');
  const text = document.createRange();
  text.selectNodeContents(node);
  const samples = [];
  const measure = () => {
    const { x, y, width, height } = text.getBoundingClientRect();
    samples.push([x, y, width, height, header.clientWidth]);
  };
  let frame;
  const follow = () => { measure(); frame = requestAnimationFrame(follow); };
  follow();
  const changes = new MutationObserver(measure);
  changes.observe(dialog, { attributeFilter: ['aria-hidden'] });
  window.__b46FinishLogoCheck = () => {
    cancelAnimationFrame(frame);
    changes.disconnect();
    measure();
    return { samples: samples.length, steady: samples.every(sample => sample.every((value, i) => value === samples[0][i])) };
  };
}

async function drawerQA(page, classic, theme) {
  const matches = page.locator('#b46gn-cards .b46gn-card:visible');
  await matches.first().waitFor({ state: 'visible', timeout: 35_000 });
  const live = matches.filter({ has: page.locator('.b46gn-cardhead[data-kind="live"]') });
  const match = (await live.count() ? live : matches).first();
  await match.scrollIntoViewIfNeeded();
  const gutter = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
  if (classic) assert(gutter > 0, 'Classic scrollbar missing');
  await page.evaluate(readLogoDuringTransition);
  const initial = await page.locator('#b46gn-detail .b46gn-sheet').evaluate(node =>
    new DOMMatrix(getComputedStyle(node).transform).m41);
  assert(initial > 100, 'Drawer does not start to the right');
  await match.click();
  const dialog = page.locator('#b46gn-detail[aria-hidden="false"]');
  const sheet = dialog.locator('.b46gn-sheet');
  await dialog.locator('.b46gn-teams').waitFor({ state: 'visible' });
  await sheet.evaluate(async node => {
    await Promise.all(node.getAnimations().map(animation => animation.finished));
    node.scrollTop = 180;
  });
  const featured = await dialog.evaluate(node => {
    const panels = [...node.querySelectorAll('.b46gn-featured .featured-card[data-featured] ' +
      ':is(.feature-stats:has(> .stat-row), .feature-events:has(> .event-item))')];
    return panels.filter(panel => panel.clientWidth > 0 && panel.clientHeight > 0)
      .map(panel => [panel.className, getComputedStyle(panel).backgroundColor, panel.scrollWidth <= panel.clientWidth + 1]);
  });
  const well = theme === 'dark' ? 'rgb(27, 52, 54)' : 'rgb(234, 243, 237)';
  assert(featured.every(([, color, fits]) => color === well && fits), 'Mobile comparison/event panels do not match the phone palette');
  assert(await sheet.evaluate(node => node.scrollTop > 60));
  const distance = await dialog.evaluate(node => Math.abs(node.getBoundingClientRect().top -
    document.querySelector('#b46m-teal-shell').getBoundingClientRect().bottom));
  assert(distance < 1);
  const nav = dialog.locator('.b46-suite-nav');
  await nav.getByRole('button', { name: 'Event Flow', exact: true }).click();
  await dialog.locator('.b46gn-event-flow').waitFor({ state: 'visible' });
  await nav.getByRole('button', { name: 'Stats', exact: true }).click();
  await dialog.locator('.b46-suite-stats').waitFor({ state: 'visible' });
  await nav.getByRole('button', { name: 'Markets', exact: true }).click();
  const markets = dialog.locator('.b46gn-full-market');
  await markets.waitFor({ state: 'visible' });
  const bookmaker = markets.locator('.fmb-tab.has-data').first();
  let marketData = false;
  if (await bookmaker.count()) {
    await bookmaker.click();
    await markets.locator('.fmb-panel:not([hidden])').waitFor({ state: 'visible' });
    marketData = true;
  }
  await dialog.getByRole('button', { name: 'Close match details' }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#b46gn-detail')).visibility === 'hidden');
  const logo = await page.evaluate(() => window.__b46FinishLogoCheck());
  assert(logo.steady, 'Logo moved during drawer interaction');
  return { classicGutter: gutter, logo, slidesFromRight: true, eventFlow: true, matchStats: true,
    fullMarket: true, marketData, featured: featured.map(([name]) => name) };
}

async function checkSignalOdds(page, host) {
  await page.goto(host + '/?view=signal', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => document.body.dataset.workspaceView === 'signal');
  const all = page.locator('[data-workspace-view="signal"] .match-row[data-match-id]:visible');
  const live = all.filter({ has: page.locator('.market-cell[title$=" · LIVE" i], .market-cell[title$=" · NOW" i]') });
  await all.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  const visibleMatches = await all.count();
  if (!visibleMatches) return { routeReady: true, visibleMatches, uprightQuotes: 0 };
  const row = (await live.count() ? live : all).first();
  await row.click();
  await page.locator('.match-expanded[data-expanded-match]:visible').first().waitFor({ state: 'visible' });
  const sizes = await row.locator('.market-cell:visible').evaluateAll(nodes => nodes.map(node => node.clientWidth));
  if (sizes.length) assert(Math.max(...sizes) - Math.min(...sizes) <= 1, 'Mobile market columns are uneven');
  const quotes = await row.locator('.market-cell:visible :is(.market-quote, .market-price-row)').evaluateAll(nodes =>
    nodes.map(node => [...node.querySelectorAll(':scope > :is(i, em, strong)')].every(value =>
      getComputedStyle(value).fontStyle === 'normal')));
  assert(quotes.every(Boolean), 'Italic odds in the mobile Signal card');
  return { routeReady: true, visibleMatches, expanded: true, uprightQuotes: quotes.length };
}

export async function browserQA(host, name) {
  const browser = await chromium.launch({
    executablePath: process.env.B46_CHROMIUM,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--disable-features=OverlayScrollbar'],
  });
  const cases = [];
  const options = {
    desktop: { viewport: { width: 1440, height: 900 } },
    mobile: devices['Pixel 7'],
    classic: { viewport: { width: 430, height: 784 } },
  };
  try {
    for (const [mode, device] of Object.entries(options)) {
      for (const theme of ['dark', 'light']) {
        const viewport = mode === 'desktop' && theme === 'dark' ? { width: 1280, height: 900 } : device.viewport;
        const context = await browser.newContext({ ...device, viewport, serviceWorkers: 'block' });
        try {
          await context.addInitScript(value => localStorage.setItem('nomad343_dashboard_theme_v1', value), theme);
          await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          const response = await page.goto(host + home, { waitUntil: 'domcontentloaded', timeout: 50_000 });
          assert(response.ok());
          await page.waitForFunction(active => document.documentElement.dataset.theme === active &&
            window.__b46OddsCrossDeviceStats?.ready, theme, { timeout: 35_000 });
          const footer = page.locator('#b46-site-footer-v1 > .b46f-inner');
          const info = await footer.evaluate(node => {
            const guide = node.lastElementChild;
            return {
              final: guide?.matches('.b46-seo-guide[data-b46-seo-guide="home"]'),
              links: [...guide.querySelectorAll('a')].map(a => [a.getAttribute('href'), getComputedStyle(a).textDecorationLine]),
              insideViewport: guide.getBoundingClientRect().right <= document.documentElement.clientWidth + 1,
              noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
            };
          });
          assert(info.final && info.insideViewport && info.noHorizontalOverflow);
          assert(info.links.length === 16 && info.links.every(([href, line]) => href && line === 'none'));
          if (mode !== 'classic' && process.env.RUNNER_TEMP) {
            await footer.screenshot({ path: join(process.env.RUNNER_TEMP, 'ball46-mobile-footer-' + name + '-' + mode + '-' + theme + '.png') });
          }
          const checked = { mode, theme, footer: true, links: info.links.length, oddsReady: true };
          if (mode === 'desktop') checked.featured = await checkDesktopFeatured(page, theme);
          else checked.drawer = await drawerQA(page, mode === 'classic', theme);
          if (mode === 'mobile') {
            checked.livePredictions = await checkSignalOdds(page, host);
            if (theme === 'dark') {
              await page.goto(host + '/?view=statistics', { waitUntil: 'domcontentloaded', timeout: 45_000 });
              await page.locator('.b46m-detail-toggle:visible').first().waitFor({ state: 'visible', timeout: 30_000 });
              checked.statistics = true;
            }
          }
          assert.deepEqual(errors, []);
          cases.push(checked);
          console.log('BALL46_MOBILE_FOOTER_BROWSER', JSON.stringify({ name, ...checked }));
        } finally {
          await context.close();
        }
      }
    }
    return cases;
  } finally {
    await browser.close();
  }
}
