import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { canonical, publicFile, origin } from './production.mjs';
import { route, cell, states, frameCss } from './scorebar-frame-patch.mjs';
import { isTelemetryCancellation, isControlledCancellation, isSnapshotCancellation } from './qa.mjs';

const snapshot = selector => [...document.querySelectorAll(selector)].map(node => {
  const geometry = element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: box.x, y: box.y, width: box.width, height: box.height, display: style.display, font: [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight], color: style.color, background: [style.backgroundImage, style.backgroundColor, style.backgroundPosition, style.backgroundSize], radius: style.borderRadius, padding: style.padding, border: [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft], overflow: style.overflow };
  };
  return { html: node.outerHTML, card: geometry(node), content: [...node.querySelectorAll('*')].map(geometry) };
});

export async function frameUiCheck({ beforeCss, afterCss, phase }) {
  mkdirSync('audit/screenshots', { recursive: true });
  const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
  const evidence = [];
  const snapshots = new Map();
  for (const path of ['/api/engine/board', '/api/engine/signals', '/api/engine/statistics']) snapshots.set(path, { status: 200, contentType: 'application/json', body: await publicFile(path, 'json') });
  try {
    for (const [name, width, height] of [['desktop',1440,1000], ['tablet',820,1100], ['mobile',390,844]]) {
      for (const theme of ['light','dark']) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, timezoneId: 'Asia/Bangkok' });
        await context.addInitScript(theme => localStorage.setItem('nomad343_dashboard_theme_v1', theme), theme);
        const page = await context.newPage();
        const errors = [], failures = [], writes = [];
        const pending = new Set(), controlled = new WeakSet(), replayed = new WeakSet();
        let pass = 'baseline';
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => pending.add(request));
        page.on('requestfinished', request => pending.delete(request));
        page.on('requestfailed', request => {
          pending.delete(request);
          if (!request.url().includes('cloudflareinsights.com')) failures.push({ pass, url: request.url(), method: request.method(), failure: request.failure()?.errorText, controlledTransition: controlled.has(request), replayedSnapshot: replayed.has(request) });
        });
        await page.route('**/api/**', intercepted => {
          const request = intercepted.request();
          if (!['GET','HEAD'].includes(request.method())) { writes.push(request.url()); return intercepted.abort('blockedbyclient'); }
          const url = new URL(request.url());
          if (url.origin === origin && snapshots.has(url.pathname)) { replayed.add(request); return intercepted.fulfill(snapshots.get(url.pathname)); }
          return intercepted.continue();
        });
        await page.route(`**${route}*`, intercepted => pass === 'frames' && phase === 'production' ? intercepted.continue() : intercepted.fulfill({ status: 200, contentType: 'text/css', body: pass === 'frames' ? afterCss : beforeCss }));
        let baseline, baselineShadows, afterSnapshot, shadows;
        for (pass of ['baseline','frames']) {
          pending.forEach(request => controlled.add(request));
          await page.goto(`${origin}/?status=live`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForFunction(selector => document.querySelectorAll(selector + '.workspace-scorebar-signal-result').length > 0, cell, { timeout: 45000 });
          await page.waitForLoadState('networkidle', { timeout: 45000 });
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
          const current = await page.evaluate(snapshot, cell);
          const currentShadows = await page.locator(cell).evaluateAll(nodes => nodes.map(node => ({ className: node.className, shadow: getComputedStyle(node).boxShadow, rgb: getComputedStyle(node).getPropertyValue('--b46-scorebar-frame-rgb').trim() })));
          if (pass === 'baseline') { baseline = current; baselineShadows = currentShadows; }
          else {
            afterSnapshot = current; shadows = currentShadows;
            assert.equal(canonical(current), canonical(baseline), `CARD_CONTENT_FONTS_IMAGES_OR_GEOMETRY_CHANGED:${name}:${theme}`);
            for (let i = 0; i < shadows.length; i++) {
              const actual = shadows[i];
              if (actual.className.includes('placeholder')) assert.equal(actual.shadow, baselineShadows[i].shadow, 'PLACEHOLDER_FRAME_CHANGED');
              else {
                const entry = Object.entries(states).find(([key]) => actual.className.includes(key === 'pending' ? 'workspace-scorebar-pending' : `outcome-${key}`));
                assert(entry, 'UNKNOWN_REAL_CARD_STATE');
                assert.equal(actual.rgb, entry[1].rgb);
                assert(actual.shadow.includes('inset') && actual.shadow.includes('0px 0px 0px 1px'), 'REAL_CARD_FRAME_MISSING');
              }
            }
            if (width > 760) {
              const target = page.locator(cell + '.workspace-scorebar-signal-result').first();
              const box = await target.boundingBox();
              await target.hover();
              assert.equal(canonical(await target.boundingBox()), canonical(box), 'FRAME_HOVER_LAYOUT_SHIFT');
              await page.mouse.move(width - 1, height - 1);
            }
          }
          await page.screenshot({ path: `audit/screenshots/${phase}-${name}-${theme}-${pass}.png` });
        }
        pending.forEach(request => controlled.add(request));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(selector => document.querySelectorAll(selector + '.workspace-scorebar-signal-result').length > 0, cell, { timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 45000 });
        assert.equal(canonical(await page.evaluate(snapshot, cell)), canonical(afterSnapshot), 'CARD_REFRESH_CHANGED');
        assert.deepEqual(errors, [], `NEW_CONSOLE_ERROR:${name}:${theme}`);
        assert.deepEqual(writes, [], 'UNEXPECTED_API_WRITE');
        const baselineAborts = new Set(failures.filter(request => request.pass === 'baseline' && request.failure === 'net::ERR_ABORTED').map(request => new URL(request.url).pathname));
        const unexpected = failures.filter(request => !isTelemetryCancellation(request) && !isControlledCancellation(request) && !isSnapshotCancellation(request) && !(request.failure === 'net::ERR_ABORTED' && baselineAborts.has(new URL(request.url).pathname)));
        assert.deepEqual(unexpected, [], 'NEW_FAILED_CARD_REQUEST');
        evidence.push({ name, theme, width, height, shadows, cardContentFontsImagesGeometryUnchanged: true, refresh: true });
        writeFileSync(`audit/scorebar-frame-ui-${phase}.json`, JSON.stringify(evidence, null, 2));
        console.log(`SCOREBAR_FRAME_UI_PASS ${phase} ${name} ${theme}`);
        await context.close();
      }
    }
    // Draw and pending may not exist in live data; verify them in an isolated static fixture.
    const page = await browser.newPage({ viewport: { width: 760, height: 180 } });
    assert(afterCss.endsWith(frameCss), 'FIXTURE_DOES_NOT_MATCH_PACKAGED_FRAME_CSS');
    await page.setContent(`<style>body{margin:0;background:#101813}.workspace-scorebar-grid{display:flex;gap:8px;padding:12px}.workspace-scorebar-cell{width:170px;height:118px;background:#17221c;color:white;font:12px Arial;border-radius:0}</style><style>${frameCss}</style><div class="workspace singlepage"><div class="workspace-scorebar-slot"><div class="workspace-scorebar-grid">${Object.entries(states).map(([key, value]) => `<div class="workspace-scorebar-cell ${value.suffix.slice(1).replaceAll('.', ' ')}">${key.toUpperCase()}</div>`).join('')}<div class="workspace-scorebar-cell placeholder"></div></div></div></div>`);
    const fixture = await page.locator(cell).evaluateAll(nodes => nodes.map(node => ({ rgb: getComputedStyle(node).getPropertyValue('--b46-scorebar-frame-rgb').trim(), shadow: getComputedStyle(node).boxShadow })));
    Object.values(states).forEach((state, index) => { assert.equal(fixture[index].rgb, state.rgb); assert(fixture[index].shadow.includes('inset')); });
    assert.equal(fixture[4].shadow, 'none');
    await page.screenshot({ path: `audit/screenshots/${phase}-isolated-four-state-frame.png` });
    writeFileSync(`audit/scorebar-frame-fixture-${phase}.json`, JSON.stringify({ isolatedFixture: true, fixture }, null, 2));
    assert.equal(evidence.length, 6);
    return evidence;
  } finally { await browser.close(); }
}
