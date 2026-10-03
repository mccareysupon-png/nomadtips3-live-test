import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { canonical, publicFile, origin } from './production.mjs';
import { icons, iconUri } from './statistics-icons.mjs';
import { marketIcons, control, route } from './statistics-patch.mjs';
import { iconUri as matchIconUri } from './icons.mjs';
import { isTelemetryCancellation, isControlledCancellation, isSnapshotCancellation } from './qa.mjs';

const snapshot = () => ({
  view: document.body.dataset.workspaceView,
  route: location.pathname + location.search,
  counts: [...document.querySelectorAll('[data-stat-market]')].map(node => [node.dataset.statMarket, node.querySelector('span').textContent, node.querySelector('b').textContent]),
  active: [...document.querySelectorAll('[data-stat-market].active')].map(node => node.dataset.statMarket),
  title: document.querySelector('[data-sp-market-title]').textContent,
  kpis: [...document.querySelectorAll('[data-sp-kpi]')].map(node => [node.dataset.spKpi, node.textContent]),
  filters: document.querySelector('.sp-filters')?.textContent,
  history: document.querySelector('.sp-results')?.textContent,
  graph: document.querySelector('[data-sp-spark-line]')?.getAttribute('d'),
});
const metrics = node => ({
  height: node.getBoundingClientRect().height,
  label: [getComputedStyle(node).fontFamily, getComputedStyle(node).fontSize, getComputedStyle(node).fontWeight],
  counter: [getComputedStyle(node.querySelector('b')).fontFamily, getComputedStyle(node.querySelector('b')).fontSize],
});

export async function statisticsUiCheck({ beforeCss, afterCss, phase }) {
  mkdirSync('audit/screenshots', { recursive: true });
  const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
  const evidence = [];
  try {
    for (const [name, width, height, scale] of [['desktop',1440,1000,1],['laptop',1280,900,1],['tablet',820,1100,1],['mobile',390,844,1],['small-mobile',320,740,1],['hidpi',390,844,2],['zoom-125',1024,720,1.25]]) {
      for (const theme of ['light','dark']) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: width <= 820, colorScheme: theme, timezoneId: 'Asia/Bangkok' });
        await context.addInitScript(theme => {
          localStorage.setItem('nomad343_dashboard_theme_v1', theme);
          window.__statisticsQaSignalsReady = false;
          window.addEventListener('ball46:signals-snapshot', () => { window.__statisticsQaSignalsReady = true; });
        }, theme);
        const page = await context.newPage();
        const errors = [], failures = [], writes = [];
        const pending = new Set(), controlled = new WeakSet(), replayed = new WeakSet();
        let pass = 'baseline';
        page.on('pageerror', error => errors.push({ pass, message: error.message }));
        page.on('request', request => pending.add(request));
        page.on('requestfinished', request => pending.delete(request));
        page.on('requestfailed', request => {
          pending.delete(request);
          if (!request.url().includes('cloudflareinsights.com')) failures.push({ pass, url: request.url(), method: request.method(), failure: request.failure()?.errorText, controlledTransition: controlled.has(request), replayedSnapshot: replayed.has(request) });
        });
        const prepareTransition = async () => {
          await page.waitForLoadState('networkidle', { timeout: 45000 });
          pending.forEach(request => controlled.add(request));
        };
        const apiSnapshots = new Map();
        for (const path of ['/api/engine/statistics','/api/engine/board','/api/engine/signals']) apiSnapshots.set(path, { status: 200, contentType: 'application/json', body: await publicFile(path, 'json') });
        const statistics = JSON.parse(apiSnapshots.get('/api/engine/statistics').body);
        assert(statistics.ok && Array.isArray(statistics.rows), 'REAL_STATISTICS_SNAPSHOT_UNAVAILABLE');
        const enterStatistics = async () => {
          await page.waitForFunction(() => Number(document.querySelector('[data-filter-count="all"]')?.textContent) > 0 && window.__statisticsQaSignalsReady, null, { timeout: 30000 });
          await prepareTransition();
          if (width <= 760) await page.locator('[data-b46-mobile-view="statistics"]').tap();
          else await page.locator(`${control}[data-stat-market="all"]`).click();
          await page.waitForFunction(total => document.body.dataset.workspaceView === 'statistics' && Number(document.querySelector('[data-stat-market="all"] b')?.textContent) === total && document.querySelector('[data-sp-feed-state]')?.textContent.includes('Updated'), statistics.rows.length, { timeout: 30000 });
        };
        await page.route('**/api/**', intercepted => {
          const request = intercepted.request();
          if (!['GET','HEAD'].includes(request.method())) { writes.push({ method: request.method(), url: request.url() }); return intercepted.abort('blockedbyclient'); }
          const url = new URL(request.url());
          if (url.origin === origin && apiSnapshots.has(url.pathname)) { replayed.add(request); return intercepted.fulfill(apiSnapshots.get(url.pathname)); }
          return intercepted.continue();
        });
        await page.route(`**${route}*`, intercepted => pass === 'icons' && phase === 'production' ? intercepted.continue() : intercepted.fulfill({ status: 200, contentType: 'text/css', body: pass === 'icons' ? afterCss : beforeCss }));
        const baseline = new Map(), baselineMetrics = new Map(), cases = [];
        for (pass of ['baseline','icons']) {
          await prepareTransition();
          await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await enterStatistics();
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
          const allCounts = await page.locator('[data-stat-market] b').allTextContents();
          assert.equal(Number(allCounts[0]), allCounts.slice(1).reduce((sum, count) => sum + Number(count), 0), 'NATIVE_STATISTICS_TOTAL_CHANGED');
          for (const [market, key] of Object.entries(marketIcons)) {
            const target = page.locator(`${control}[data-stat-market="${market}"]`);
            await target.scrollIntoViewIfNeeded();
            const geometry = await target.evaluate(metrics);
            if (width <= 820) await target.tap(); else await target.click();
            await page.waitForFunction(market => document.querySelector(`[data-stat-market="${market}"]`)?.classList.contains('active'), market);
            await page.mouse.move(width - 1, height - 1);
            const actual = await page.evaluate(snapshot);
            if (pass === 'baseline') { baseline.set(market, actual); baselineMetrics.set(market, geometry); continue; }
            assert.equal(canonical(actual), canonical(baseline.get(market)), `STATISTICS_COUNTS_KPIS_FILTER_HISTORY_ROUTE_CHANGED:${name}:${theme}:${market}`);
            assert.equal(canonical(geometry), canonical(baselineMetrics.get(market)), `STATISTICS_FONT_OR_ROW_HEIGHT_CHANGED:${name}:${theme}:${market}`);
            await page.waitForFunction(selector => Number(getComputedStyle(document.querySelector(selector).querySelector('span'), '::before').opacity) > .999, `${control}[data-stat-market="${market}"]`);
            const icon = await target.evaluate(node => {
              const style = getComputedStyle(node.querySelector('span'), '::before');
              const label = node.querySelector('span');
              return { width: style.width, height: style.height, mask: style.maskImage, opacity: style.opacity, color: style.backgroundColor, labelFits: label.scrollWidth <= label.clientWidth };
            });
            assert.equal(icon.width, '16px');
            assert.equal(icon.height, '16px');
            assert(icon.mask.includes(iconUri(key)), `APPROVED_STATISTICS_SVG_DIFFERS:${market}`);
            assert.notEqual(icon.color, 'rgba(0, 0, 0, 0)');
            assert(icon.labelFits, `STATISTICS_LABEL_OVERFLOW:${name}:${market}`);
            if (name === 'desktop') {
              const box = await target.boundingBox();
              await target.hover();
              await page.waitForTimeout(150);
              assert.equal(canonical(await target.boundingBox()), canonical(box), 'STATISTICS_HOVER_LAYOUT_SHIFT');
              assert((await target.evaluate(node => getComputedStyle(node.querySelector('span'), '::before').transform)).includes('1.04'));
            }
            if (['desktop','mobile'].includes(name)) await page.screenshot({ path: `audit/screenshots/${phase}-${name}-${theme}-${key}.png` });
            cases.push({ market, icon, nativeStatisticsUnchanged: true });
          }
          if (pass === 'icons') {
            const first = page.locator(`${control}[data-stat-market="all"]`);
            await first.click();
            await page.mouse.move(width - 1, height - 1);
            await page.waitForTimeout(150);
            const defaults = await page.locator(`${control}:not(.active)`).evaluateAll(nodes => nodes.map(node => Number(getComputedStyle(node.querySelector('span'), '::before').opacity)));
            assert(defaults.every(opacity => Math.abs(opacity - .82) < .001), 'STATISTICS_DEFAULT_OPACITY_CHANGED');
            const pressBox = await first.boundingBox();
            await page.mouse.move(pressBox.x + pressBox.width / 2, pressBox.y + pressBox.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(150);
            assert((await first.evaluate(node => getComputedStyle(node.querySelector('span'), '::before').transform)).includes('0.94'));
            await page.mouse.up();
            await page.mouse.move(width - 1, height - 1);
            const pixels = await page.evaluate(async entries => {
              const results = [];
              for (const [key, source] of entries) {
                const image = new Image(); image.src = source; await image.decode();
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
                const ctx = canvas.getContext('2d'); ctx.drawImage(image,0,0,16,16);
                const data = ctx.getImageData(0,0,16,16).data;
                let visible = 0, translucent = 0;
                for (let i = 3; i < data.length; i += 4) { if (data[i]) visible++; if (data[i] && data[i] < 220) translucent++; }
                results.push({ key, visible, translucent });
              }
              return results;
            }, Object.keys(icons).map(key => [key, iconUri(key)]));
            assert(pixels.every(icon => icon.visible > 35 && icon.translucent > 8), 'BLANK_STATISTICS_SVG_AT_16PX');
            const previousMask = await page.locator('[data-status-filter="live"] > span').evaluate(node => getComputedStyle(node, '::before').maskImage);
            assert(previousMask.includes(matchIconUri('live')), 'PREVIOUS_MATCH_STATUS_ICON_CHANGED');
            await prepareTransition();
            await page.reload({ waitUntil: 'domcontentloaded' });
            await enterStatistics();
            await page.locator(`${control}[data-stat-market="ou"]`).click();
            assert.equal(canonical(await page.evaluate(snapshot)), canonical(baseline.get('ou')), 'STATISTICS_REFRESH_STATE_CHANGED');
            assert((await page.locator('[data-stat-market="ou"] > span').evaluate(node => getComputedStyle(node, '::before').maskImage)).includes(iconUri('ou')), 'STATISTICS_ICON_MISSING_AFTER_REFRESH');
            await page.locator(`${control}[data-stat-market="all"]`).click();
            await page.mouse.move(width - 1, height - 1);
            await page.screenshot({ path: `audit/screenshots/${phase}-${name}-${theme}-final.png` });
            cases.push({ pixels, defaultHoverActive: true, tap: true, refresh: true, previousIconsUnchanged: true });
          }
        }
        assert.deepEqual(errors, [], `CONSOLE_ERROR:${name}:${theme}`);
        assert.deepEqual(writes, [], 'UNEXPECTED_API_WRITE');
        const baselineAborts = new Set(failures.filter(request => request.pass === 'baseline' && request.failure === 'net::ERR_ABORTED').map(request => new URL(request.url).pathname));
        const unexpected = failures.filter(request => !isTelemetryCancellation(request) && !isControlledCancellation(request) && !isSnapshotCancellation(request) && !(request.failure === 'net::ERR_ABORTED' && baselineAborts.has(new URL(request.url).pathname)));
        assert.deepEqual(unexpected, [], 'NEW_FAILED_STATISTICS_REQUEST');
        evidence.push({ name, theme, width, height, scale, cases, nativeCountsFontsAndFilteringUnchanged: true });
        writeFileSync(`audit/statistics-ui-${phase}.json`, JSON.stringify(evidence, null, 2));
        console.log(`STATISTICS_UI_CASE_PASS ${phase} ${name} ${theme}`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
  assert.equal(evidence.length, 14);
  console.log(`STATISTICS_${phase.toUpperCase()}_PASS cases=14 icons=8`);
  return evidence;
}
