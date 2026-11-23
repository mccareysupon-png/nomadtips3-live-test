import assert from 'node:assert/strict';
import { chromium, devices, webkit } from 'playwright';
import { crossDeviceOddsScript, crossDeviceOddsStyles } from './crossdevice.mjs';

const PREVIEW = 'https://ball46-default-odds-crossdevice-test-20261123.mccarey-supon.workers.dev';
const SCRIPT_ID = 'b46-cross-device-odds-v3-test-js';
const ANIMATION = 'b46-odds-card-pulse-6x';
const options = process.env.B46_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.B46_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] }
  : {};

async function smoke() {
  const target = new URL(PREVIEW);
  const headers = { 'cache-control': 'no-cache' };
  const health = await fetch(new URL('/__crossdevice_health', target), { headers });
  assert(health.ok, `health HTTP ${health.status}`);
  const info = await health.json();
  assert.equal(info.scope, 'ISOLATED_TEST_ONLY');
  assert.equal(info.revision, 'single-controller-v2');
  assert.equal(info.noApiCallsAdded, true);
  assert.match(info.script, /__b46OddsCrossDeviceStats/);
  assert.equal(info.styles, crossDeviceOddsStyles);
  const page = await fetch(new URL('/?view=live', target), { headers });
  assert(page.ok, `page HTTP ${page.status}`);
  assert.equal(page.headers.get('x-b46-release-scope'), 'DEFAULT_ODDS_CROSS_DEVICE_TEST_ONLY');
  const body = await page.text();
  assert.equal(body.split(`id="${SCRIPT_ID}"`).length, 2);
  assert(body.includes(info.script), 'page should serve the bundled controller from its health response');
  assert(!body.includes('id="b46-odds-flash-runtime-production"'));
  assert(!body.includes('id="b46-odds-flash-production"'));
  console.log('Preview serves exactly one odds movement controller');
}

async function runCase(browser, name, settings) {
  const ctx = await browser.newContext(settings.device);
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: settings.reduce ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><html data-theme="${settings.theme}"><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${crossDeviceOddsStyles}
.market-price-row{display:inline-flex;align-items:center;gap:8px}</style>
      <script>${crossDeviceOddsScript}</script></head><body>
      <article class="match-row" data-match-id="QA" data-b46-kind="live">
        <div class="market-cell market-cell-ou" title="Bet365 · LIVE">
          <div class="market-price-row${settings.native ? '' : ' b46-v3-quote'}" data-side="O">
            <i>O</i><em>2.50</em><strong data-nomad-odds-raw="1.80">1.8</strong>
          </div>
        </div>
      </article></body></html>`);
    await page.waitForFunction(() => window.__b46OddsCrossDeviceStats?.ready);
    const quote = page.locator('.market-price-row');
    const marker = 'data-b46-odds-move';
    assert.equal(await quote.getAttribute(marker), null, name + ' initial quote');
    const setPrice = (raw, display) => page.locator('.market-price-row strong').evaluate((node, price) => {
      node.dataset.nomadOddsRaw = price.raw;
      node.textContent = price.display;
    }, { raw, display });
    await page.evaluate(animation => {
      window.qaPulseEvents = [];
      for (const event of ['animationstart', 'animationiteration', 'animationend']) {
        document.addEventListener(event, ({ type, elapsedTime, animationName }) => {
          if (animationName === animation) window.qaPulseEvents.push({ type, elapsedTime });
        });
      }
    }, ANIMATION);
    await setPrice('1.90', '1.9');
    await page.waitForFunction(() => document.querySelector('[data-b46-odds-move="up"]'));
    const up = await quote.evaluate(node => {
      const element = getComputedStyle(node);
      const arrow = getComputedStyle(node, '::after');
      return {
        animation: element.animationName, iterations: element.animationIterationCount,
        duration: element.animationDuration, width: arrow.width, height: arrow.height,
        clip: arrow.clipPath, fill: getComputedStyle(node, '::before').backgroundColor
      };
    });
    assert.equal(up.width, '5px', name);
    assert.equal(up.height, '5px', name);
    assert.match(up.clip, /polygon\(50%/, name);
    assert.equal(up.fill, 'rgba(42, 163, 103, 0.2)', name);

    if (settings.reduce) {
      assert.equal(up.animation, 'none', name);
    } else {
      assert.equal(up.animation, ANIMATION, name);
      assert.equal(up.iterations, '6', name);
      assert.equal(up.duration, '1s', name);
    }

    if (settings.replace) {
      await page.waitForFunction(() => window.qaPulseEvents.some(event => event.type === 'animationiteration'));
      await page.locator('.market-price-row').evaluate(node => {
        const fresh = node.cloneNode(true);
        fresh.removeAttribute('data-b46-odds-move');
        fresh.removeAttribute('style');
        node.replaceWith(fresh);
      });
      await page.waitForFunction(() =>
        window.qaPulseEvents.some(event => event.type === 'animationstart' && event.elapsedTime >= 1));
    }

    await page.waitForFunction(() => !document.querySelector('[data-b46-odds-move]'), null, { timeout: 11000 });
    const events = await page.evaluate(() => window.qaPulseEvents);
    if (settings.reduce) {
      assert.equal(events.length, 0, name);
    } else {
      const ends = events.filter(event => event.type === 'animationend');
      assert.deepEqual(ends.map(event => event.elapsedTime), [6], name);
      if (!settings.replace) {
        const cycles = events.filter(event => event.type === 'animationiteration');
        assert.deepEqual(cycles.map(event => event.elapsedTime), [1, 2, 3, 4, 5], name);
      }
    }

    await setPrice('1.75', '1.75');
    await page.waitForFunction(() => document.querySelector('[data-b46-odds-move="down"]'));
    const down = await quote.evaluate(node => ({
      clip: getComputedStyle(node, '::after').clipPath,
      fill: getComputedStyle(node, '::before').backgroundColor
    }));
    assert.match(down.clip, /polygon\(0px 0px/, name);
    assert.equal(down.fill, 'rgba(178, 65, 74, 0.19)', name);

    // New lines, unavailable quotes and close-to-live switches establish a baseline.
    await quote.evaluate(node => {
      node.querySelector('em').textContent = '2.75';
      const numeral = node.querySelector('strong');
      numeral.dataset.nomadOddsRaw = '1.92';
      numeral.textContent = '1.92';
    });
    await page.waitForFunction(() => !document.querySelector('[data-b46-odds-move]'));
    const before = await page.evaluate(() => window.__b46OddsCrossDeviceStats.flashes);
    await page.locator('.market-cell').evaluate(node => { node.title = 'Bet365 · CLOSE'; });
    await setPrice('1.86', '1.86');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await quote.getAttribute(marker), null, name);
    assert.equal(await page.evaluate(() => window.__b46OddsCrossDeviceStats.flashes), before, name);
    assert.deepEqual(errors, [], name);
    console.log(name + ' passed');
  } finally {
    await ctx.close();
  }
}

if (process.argv.includes('--smoke')) {
  await smoke();
} else {
  const chrome = await chromium.launch(options);
  const safari = process.argv.includes('--webkit') ? await webkit.launch() : null;
  try {
    if (!process.argv.includes('--offline')) await smoke();
    await runCase(chrome, 'Chromium desktop dark', { theme: 'dark' });
    await runCase(chrome, 'Chromium desktop light', { theme: 'light', replace: true });
    await runCase(chrome, 'Chromium Android dark', { theme: 'dark', native: true, device: devices['Pixel 7'] });
    await runCase(chrome, 'Chromium Android light', { theme: 'light', native: true, device: devices['Pixel 7'] });
    await runCase(chrome, 'Chromium Android reduced motion', {
      theme: 'light', native: true, reduce: true, device: devices['Pixel 7']
    });
    if (safari) {
      await runCase(safari, 'WebKit iPhone light', { theme: 'light', native: true, device: devices['iPhone 13'] });
      await runCase(safari, 'WebKit iPhone dark', { theme: 'dark', native: true, device: devices['iPhone 13'] });
    }
  } finally {
    await chrome.close();
    await safari?.close();
  }
}
