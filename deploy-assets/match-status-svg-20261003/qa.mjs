import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { origin, publicFile, canonical } from './production.mjs';
import { icons, iconUri } from './icons.mjs';
import { control, mobileSignal, route as cssRoute } from './patch.mjs';

const keys = Object.keys(icons);
const snapshots = () => ({
  view: document.body.dataset.workspaceView,
  route: location.pathname + location.search,
  counts: [...document.querySelectorAll('[data-filter-count],[data-workspace-signal-count]')].map(node => [node.dataset.filterCount || 'signal', node.textContent]),
  active: [...document.querySelectorAll('[data-status-filter].active,[data-workspace-view="signal"].active')].map(node => node.dataset.statusFilter || 'signal'),
  rows: [...document.querySelectorAll('.match-row')].filter(node => node.getBoundingClientRect().width > 0).map(node => node.dataset.matchId),
  groups: [...document.querySelectorAll('[data-status-section]')].map(node => node.dataset.statusSection),
});
const selector = (key, width) => key === 'signal' ? width <= 760 ? mobileSignal : `${control}[data-workspace-view="signal"]` : `${control}[data-status-filter="${key}"]`;

export async function uiCheck({ beforeCss, afterCss, phase }) {
  mkdirSync('audit/screenshots', { recursive: true });
  const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
  const evidence = [];
  try {
    for (const [name, width, height, scale] of [['desktop',1440,1000,1],['laptop',1280,900,1],['tablet',820,1100,1],['mobile',390,844,1],['small-mobile',320,740,1],['hidpi',390,844,2],['zoom-125',1024,720,1.25]]) {
      for (const theme of ['light','dark']) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: width <= 820, colorScheme: theme, timezoneId: 'Asia/Bangkok' });
        await context.addInitScript(theme => {
          localStorage.setItem('nomad343_dashboard_theme_v1', theme);
          window.__statusQaSignals = false;
          window.__statusQaShifts = [];
          window.addEventListener('ball46:signals-snapshot', () => { window.__statusQaSignals = true; });
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput && entry.sources?.some(source => source.node?.closest?.('.b46-mobile-status-menu'))) window.__statusQaShifts.push(entry.value);
          }).observe({ type: 'layout-shift', buffered: true });
        }, theme);
        const page = await context.newPage();
        const errors = [], failed = [], iconRequests = [];
        let currentPass = 'baseline';
        page.on('pageerror', error => errors.push(error.message));
        page.on('requestfailed', request => { if (!request.url().includes('cloudflareinsights.com')) failed.push({ pass: currentPass, url: request.url(), failure: request.failure()?.errorText }); });
        page.on('request', request => { if (/match-status|status-icon/.test(request.url()) && new URL(request.url()).pathname !== cssRoute) iconRequests.push(request.url()); });
        // Replay the same real API snapshots on both passes; never fabricate counts or write data.
        const apiCache = new Map();
        for (const path of ['/api/engine/board','/api/engine/signals','/api/engine/statistics']) apiCache.set(path, { status: 200, contentType: 'application/json', body: await publicFile(path, 'json') });
        await page.route('**/api/**', async intercepted => {
          if (!['GET','HEAD'].includes(intercepted.request().method())) return intercepted.abort('blockedbyclient');
          const url = new URL(intercepted.request().url());
          if (apiCache.has(url.pathname)) return intercepted.fulfill(apiCache.get(url.pathname));
          return intercepted.continue();
        });
        let patched = false;
        await page.route(`**${cssRoute}*`, intercepted => patched && phase === 'production' ? intercepted.continue() : intercepted.fulfill({ status: 200, contentType: 'text/css', body: patched ? afterCss : beforeCss }));
        const reference = new Map(), metrics = new Map(), passEvidence = [];
        for (const pass of ['baseline','icons']) {
          currentPass = pass;
          patched = pass === 'icons';
          await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForFunction(() => Number(document.querySelector('[data-filter-count="all"]')?.textContent) > 0 && window.__statusQaSignals, null, { timeout: 30000 });
          await page.evaluate(() => window.NOMAD343_DASHBOARD_V2.reload());
          await page.evaluate(() => document.fonts.ready);
          const actualTheme = await page.evaluate(() => document.documentElement.dataset.theme);
          if (actualTheme !== theme) await page.locator('[data-theme-toggle]').click();
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
          const counts = await page.evaluate(snapshots);
          const countMap = Object.fromEntries(counts.counts);
          assert.equal(Number(countMap.all), ['live','scheduled','unknown','finished'].reduce((sum, key) => sum + Number(countMap[key]), 0), 'NATIVE_COUNT_TOTAL_INCONSISTENT');
          assert.equal(Number(countMap.signal), await page.evaluate(() => window.NOMAD343_DASHBOARD_V2.getSignals().length), 'NATIVE_SIGNAL_COUNT_INCONSISTENT');
          if (pass === 'icons') {
            const vectorPixels = await page.evaluate(async sources => {
              const results = [];
              for (const [key, source] of sources) {
                const image = new Image();
                await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = source; });
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 48;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, 48, 48);
                const pixels = ctx.getImageData(0, 0, 48, 48).data;
                let visible = 0, translucent = 0;
                for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 0) visible++; if (pixels[i] > 0 && pixels[i] < 240) translucent++; }
                results.push({ key, visible, translucent });
              }
              return results;
            }, keys.map(key => [key, iconUri(key)]));
            assert(vectorPixels.every(icon => icon.visible > 250 && icon.translucent > 50), 'BLANK_OR_NON_DUOTONE_SVG');
            passEvidence.push({ vectorPixels });
          }
          for (const key of keys) {
            if (width <= 760 && key !== 'signal' && await page.evaluate(() => document.body.dataset.workspaceView) !== 'live') await page.locator('[data-b46-mobile-view="live"]').tap();
            const target = page.locator(selector(key, width));
            const beforeGeometry = await target.evaluate(node => ({ height: node.getBoundingClientRect().height, font: [getComputedStyle(node).fontFamily,getComputedStyle(node).fontSize], count: node.querySelector('b')?.textContent }));
            if (width <= 820) await target.tap(); else await target.click();
            await page.waitForFunction(view => document.body.dataset.workspaceView === view, key === 'signal' ? 'signal' : 'live');
            await page.mouse.move(width - 1, height - 1);
            const snapshot = await page.evaluate(snapshots);
            const tag = `${phase}-${name}-${theme}-${key}`;
            if (pass === 'baseline') { reference.set(key, snapshot); metrics.set(key, beforeGeometry); }
            else {
              assert.equal(canonical(snapshot), canonical(reference.get(key)), `COUNT_FILTER_OR_ROUTE_CHANGED:${tag}`);
              assert.equal(canonical(beforeGeometry), canonical(metrics.get(key)), `FONT_HEIGHT_OR_COUNT_CHANGED:${tag}`);
              const bottom = key === 'signal' && width <= 760;
              await page.waitForFunction(({ selector, bottom }) => {
                const node = document.querySelector(selector), style = getComputedStyle(bottom ? node.querySelector('.b46-mobile-nav-icon') : node.querySelector('span'), bottom ? null : '::before');
                return Number(style.opacity) > .999;
              }, { selector: selector(key, width), bottom });
              const icon = await target.evaluate((node, bottom) => {
                const style = getComputedStyle(bottom ? node.querySelector('.b46-mobile-nav-icon') : node.querySelector('span'), bottom ? null : '::before');
                const rect = node.getBoundingClientRect();
                return { mask: style.maskImage, width: style.width, height: style.height, opacity: style.opacity, color: style.backgroundColor, active: node.classList.contains('active'), itemHeight: rect.height };
              }, bottom);
              assert(icon.active, `ACTIVE_STATE_MISSING:${tag}`);
              assert.equal(icon.width, '16px', `ICON_WIDTH_CHANGED:${tag}`);
              assert.equal(icon.height, '16px', `ICON_HEIGHT_CHANGED:${tag}`);
              assert(icon.mask.includes(iconUri(key)), `SVG_SET_DIFFERENT:${tag}`);
              assert.notEqual(icon.color, 'rgba(0, 0, 0, 0)', `INVISIBLE_ICON_COLOR:${tag}`);
              if (key === 'all') {
                await page.waitForFunction(selector => [...document.querySelectorAll(selector)].every(node => Math.abs(Number(getComputedStyle(node.querySelector('span'), '::before').opacity) - .82) < .001), `${control}:not(.active)`, { timeout: 2000 });
                const defaults = await page.locator(`${control}:not(.active)`).evaluateAll(nodes => nodes.map(node => ({ key: node.dataset.statusFilter || 'signal', opacity: getComputedStyle(node.querySelector('span'), '::before').opacity, width: getComputedStyle(node.querySelector('span'), '::before').width })));
                assert(defaults.every(icon => Math.abs(Number(icon.opacity) - .82) < .001 && icon.width === '16px'), `DEFAULT_ICON_STATE_WRONG:${tag}`);
                passEvidence.push({ defaults });
              }
              if (name === 'desktop') {
                const box = await target.boundingBox();
                await target.hover();
                await page.waitForTimeout(150);
                assert.equal(canonical(await target.boundingBox()), canonical(box), `HOVER_LAYOUT_SHIFT:${tag}`);
                const transform = await target.evaluate(node => getComputedStyle(node.querySelector('span'), '::before').transform);
                assert(transform.includes('1.04'), `HOVER_FEEDBACK_MISSING:${tag}`);
                await page.screenshot({ path: `audit/screenshots/${tag}-hover.png` });
              }
              await page.mouse.move(width - 1, height - 1);
              await page.screenshot({ path: `audit/screenshots/${tag}-active.png` });
              passEvidence.push({ key, icon, filterAndCountsUnchanged: true, snapshot });
            }
          }
          if (pass === 'icons') {
            if (width <= 760) await page.locator('[data-b46-mobile-view="live"]').tap();
            await page.locator('[data-status-filter="all"]').click();
            const all = page.locator('[data-status-filter="all"]');
            const pressBox = await all.boundingBox();
            await page.mouse.move(pressBox.x + pressBox.width / 2, pressBox.y + pressBox.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(160);
            const press = await all.evaluate(node => getComputedStyle(node.querySelector('span'), '::before').transform);
            await page.mouse.up();
            assert(press.includes('0.94'), `TAP_FEEDBACK_MISSING:${phase}:${name}:${theme}`);
            await page.mouse.move(width - 1, height - 1);
            await page.waitForTimeout(160);
            const stableBefore = await page.locator(control).evaluateAll(nodes => nodes.map(node => ({ height: node.getBoundingClientRect().height, mask: getComputedStyle(node.querySelector('span'), '::before').maskImage })));
            await page.evaluate(() => { window.__statusQaShifts = []; });
            await page.evaluate(() => window.NOMAD343_DASHBOARD_V2.reload());
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const stableAfter = await page.locator(control).evaluateAll(nodes => nodes.map(node => ({ height: node.getBoundingClientRect().height, mask: getComputedStyle(node.querySelector('span'), '::before').maskImage })));
            assert.equal(canonical(stableAfter), canonical(stableBefore), 'ICONS_JUMP_DURING_NATIVE_REFRESH');
            assert.equal(await page.evaluate(() => window.__statusQaShifts.reduce((sum, value) => sum + value, 0)), 0, 'MATCH_STATUS_LAYOUT_SHIFT_DURING_REFRESH');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.__statusQaSignals && Number(document.querySelector('[data-filter-count="all"]')?.textContent) > 0);
            await page.evaluate(() => window.NOMAD343_DASHBOARD_V2.reload());
            await page.locator('[data-status-filter="live"]').click();
            assert.equal(canonical(await page.evaluate(snapshots)), canonical(reference.get('live')), 'REFRESH_FILTER_OR_COUNTS_CHANGED');
            assert((await page.locator('[data-status-filter="live"] > span').evaluate(node => getComputedStyle(node, '::before').maskImage)).includes(iconUri('live')), 'SVG_MISSING_AFTER_REFRESH');
            await page.screenshot({ path: `audit/screenshots/${phase}-${name}-${theme}-final.png` });
          }
        }
        assert.equal(errors.length, 0, `NEW_CONSOLE_ERROR:${name}:${theme}:${errors.join(';')}`);
        assert.equal(iconRequests.length, 0, 'EXTERNAL_ICON_REQUEST');
        const existingCancellations = new Set(failed.filter(request => request.pass === 'baseline' && request.failure === 'net::ERR_ABORTED').map(request => new URL(request.url).pathname));
        const unexpectedFailures = failed.filter(request => !(request.failure === 'net::ERR_ABORTED' && existingCancellations.has(new URL(request.url).pathname)));
        assert.equal(unexpectedFailures.length, 0, `NEW_FAILED_UI_REQUEST:${JSON.stringify(unexpectedFailures)}`);
        evidence.push({ name, width, height, deviceScaleFactor: scale, theme, defaultHoverActive: true, tapFeedback: true, refreshPassed: true, nativeCountsAndFilterUnchanged: true, evidence: passEvidence, errors, failed, iconRequests });
        writeFileSync(`audit/ui-${phase}.json`, JSON.stringify(evidence, null, 2));
        console.log(`STATUS_UI_CASE_PASS ${phase} ${name} ${theme}`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
  assert.equal(evidence.length, 14, 'INCOMPLETE_STATUS_UI_MATRIX');
  console.log(`MATCH_STATUS_${phase.toUpperCase()}_PASS cases=${evidence.length} states=6`);
  return evidence;
}
