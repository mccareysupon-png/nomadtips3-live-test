import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FLOW_ASSET, englishFlowCopy } from './mobile-flow-copy.mjs';

const { chromium, devices } = await import(process.env.B46_PLAYWRIGHT_MODULE ?? 'playwright');
const host = process.env.B46_PREVIEW ?? 'https://ball46-mobile-expanded-theme-test-20261124.mccarey-supon.workers.dev';
const styleId = 'b46-mobile-expanded-theme-20261124';
const artifacts = process.env.B46_QA_DIR;
const colors = {
  dark: { sheet: 'rgb(10, 26, 29)', well: 'rgb(27, 52, 54)', ink: 'rgb(239, 248, 243)', plot: '#0d2225' },
  light: { sheet: 'rgb(244, 248, 245)', well: 'rgb(234, 243, 237)', ink: 'rgb(21, 59, 41)', plot: '#f5faf7' },
};
if (artifacts) await mkdir(artifacts, { recursive: true });

async function proofOfScope() {
  const [health, page, production, rejected] = await Promise.all([
    fetch(host + '/__mobile_expanded_theme_health'),
    fetch(host + '/?view=live'),
    fetch('https://ball46.com/?view=live', { headers: { 'accept-language': 'th-TH,th;q=0.9,en;q=0.5' } }),
    fetch(host + '/__mobile_expanded_theme_health', { method: 'POST' }),
  ]);
  assert.equal(rejected.status, 405);
  assert.equal((await health.json()).scope, 'ISOLATED_TEST_ONLY');
  assert.equal(page.headers.get('x-b46-preview'), styleId);
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  assert.equal(production.headers.get('x-b46-preview'), null);
  const [testHtml, liveHtml, expectedStyle] = await Promise.all([page.text(), production.text(),
    readFile(new URL('./mobile-details.css', import.meta.url), 'utf8')]);
  assert.match(liveHtml, /<html[^>]*\blang="en"/);
  assert(liveHtml.includes('hreflang="x-default" href="https://www.ball46.com/"'));
  assert.equal(testHtml.split('id="' + styleId + '"').length, 2);
  assert(testHtml.includes('<style id="' + styleId + '">' + expectedStyle + '</style>'));
  const liveFlowScript = [...liveHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map(([, src]) => new URL(src, 'https://ball46.com/'))
    .find(src => src.pathname === FLOW_ASSET);
  assert(liveFlowScript, 'Mobile Event Flow script missing from Production HTML');
  const assetPath = liveFlowScript.pathname + liveFlowScript.search;
  const [testFlow, liveFlow] = await Promise.all([host, 'https://ball46.com'].map(async origin => {
    const asset = await fetch(origin + assetPath);
    assert(asset.ok, 'Mobile Event Flow asset HTTP ' + asset.status);
    return asset.text();
  }));
  assert.equal(testFlow, englishFlowCopy(liveFlow));
  assert(!/[\u0e00-\u0e7f]/.test(testFlow), 'Mobile Event Flow still has Thai labels');
  assert(testFlow.includes('Tap a bar for its value or a signal for details'));
  for (const id of ['b46-sidebar-winrate-production', 'b46-odds-flash-runtime-production']) {
    const pattern = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>');
    assert(liveHtml.match(pattern)?.[1], id + ' missing in Production');
    assert.equal(testHtml.match(pattern)?.[1], liveHtml.match(pattern)?.[1]);
  }
}

const palette = (loc) => loc.evaluate(node => {
  const { backgroundColor, backgroundImage, color, borderTopWidth, boxShadow } = getComputedStyle(node);
  return { backgroundColor, backgroundImage, color, borderTopWidth, boxShadow };
});

function contrast(foreground, background) {
  function luminance(rgb) {
    const linear = rgb.match(/\d+/g).slice(0, 3).map(channel => {
      const value = Number(channel) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }
  const [dark, light] = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

async function screenshot(page, file) {
  if (artifacts) await page.screenshot({ path: join(artifacts, file + '.png'), animations: 'disabled' });
}

async function assertFits(loc) {
  const size = await loc.evaluate(node => {
    const range = node.getBoundingClientRect();
    return { x: range.x, right: range.right, viewport: window.innerWidth };
  });
  assert(size.x >= -1 && size.right <= size.viewport + 1, JSON.stringify(size));
}

async function visibleEventPlot(flow) {
  return flow.locator('b46-mobile-event-bars').evaluateAll(elements =>
    elements.map(el => getComputedStyle(el).getPropertyValue('--plot').trim()));
}

async function testMobile(browser, theme, device) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(t => localStorage.setItem('nomad343_dashboard_theme_v1', t), theme);
  await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());

  try {
    const response = await page.goto(host + '/?view=live', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert.equal(response.status(), 200);
    const matches = page.locator('#b46gn-cards .b46gn-card:visible');
    await matches.first().waitFor({ state: 'visible', timeout: 30_000 });
    const live = matches.filter({ has: page.locator('.b46gn-cardhead[data-kind="live"]') });
    const match = (await live.count() ? live : matches).first();
    const before = await palette(match);
    await match.click();
    const dialog = page.locator('#b46gn-detail[aria-hidden="false"]');
    const sheet = dialog.locator('.b46gn-sheet');
    const nav = dialog.locator('.b46-suite-nav');
    const score = dialog.locator('.b46gn-teams');
    await score.waitFor({ state: 'visible' });
    await nav.waitFor({ state: 'visible' });
    assert.equal((await palette(sheet)).backgroundColor, colors[theme].sheet);
    assert.equal((await palette(sheet)).borderTopWidth, '0px');
    assert.match((await palette(score)).backgroundImage, /linear-gradient/);
    assert.equal((await palette(score)).color, colors[theme].ink);
    assert.equal((await palette(nav.locator('button').first())).backgroundColor, colors[theme].well);
    assert.equal((await palette(nav.locator('button').first())).color, colors[theme].ink);
    assert(await nav.locator('button').evaluateAll(nodes => nodes.every(node =>
      node.getBoundingClientRect().height >= 44 && node.scrollWidth <= node.clientWidth + 1)));
    assert.deepEqual(await palette(match), before, 'Collapsed match card changed');
    await assertFits(sheet);
    await screenshot(page, theme + '-match-details');

    const flow = dialog.locator('.b46gn-event-flow');
    await nav.getByRole('button', { name: 'Event Flow', exact: true }).click();
    await flow.waitFor({ state: 'visible' });
    const plot = await visibleEventPlot(flow);
    assert(plot.every(color => color === colors[theme].plot), theme + ' Event Flow plot ' + plot.join(','));
    await assertFits(flow);
    if (plot.length) assert(await flow.getByText('Tap a bar for its value or a signal for details').isVisible());
    await screenshot(page, theme + '-event-flow');

    await nav.getByRole('button', { name: 'Stats', exact: true }).click();
    await dialog.locator('.b46-suite-stats').waitFor({ state: 'visible' });
    await assertFits(dialog.locator('.b46-suite-stats'));

    await nav.getByRole('button', { name: 'Markets', exact: true }).click();
    const markets = dialog.locator('.b46gn-full-market');
    await markets.waitFor({ state: 'visible' });
    const bookmaker = markets.locator('.fmb-tab.has-data').first();
    let marketOpened = false;
    if (await bookmaker.count()) {
      await bookmaker.click();
      const marketData = markets.locator('.fmb-panel:not([hidden])');
      await marketData.waitFor({ state: 'visible', timeout: 10_000 });
      assert.equal(await bookmaker.getAttribute('aria-pressed'), 'true');
      await assertFits(markets);
      marketOpened = true;
      await screenshot(page, theme + '-full-market');
      await bookmaker.click();
      await marketData.waitFor({ state: 'hidden', timeout: 8_000 });
    }

    // The sheet mirrors the native inline expander. Check the shared styles even
    // when the Live Predictions feed currently has no rows to open.
    const native = page.locator('.match-expanded[data-expanded-match] .expand-card').first();
    assert(await native.count(), 'Native match expander missing');
    assert.equal((await palette(native)).color, colors[theme].ink);
    await dialog.getByRole('button', { name: 'Close match details' }).click();
    await dialog.waitFor({ state: 'hidden' });

    await page.goto(host + '/?view=statistics', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const detailsButton = page.locator('.b46m-detail-toggle:visible').first();
    await detailsButton.waitFor({ state: 'visible', timeout: 35_000 });
    const history = detailsButton.locator('xpath=ancestor::article');
    await detailsButton.click();
    const extra = history.locator('.b46m-extra');
    await extra.waitFor({ state: 'visible' });
    const item = extra.locator('.b46m-extra-item').first();
    const extraSurface = (await palette(item)).backgroundColor;
    assert.equal(extraSurface, colors[theme].well);
    const detailsContrast = contrast((await palette(item.locator('span'))).color, extraSurface);
    assert(detailsContrast >= 4.5, theme + ' history detail text contrast ' + detailsContrast);
    assert(contrast((await palette(item.locator('label'))).color, extraSurface) >= 4.5);
    assert.equal((await palette(extra)).borderTopWidth, '0px');
    await assertFits(extra);
    if (artifacts) await history.screenshot({ path: join(artifacts, theme + '-statistics-details.png'), animations: 'disabled' });
    await detailsButton.click();
    await extra.waitFor({ state: 'hidden' });

    await page.goto(host + '/?view=signal&signalMarket=ou', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.body.dataset.workspaceView === 'signal');
    const signalRow = page.locator('[data-workspace-view="signal"] .match-row[data-match-id]:visible').first();
    let signalExpanded = false;
    await signalRow.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    if (await signalRow.count()) {
      await signalRow.click();
      const detail = page.locator('.match-expanded[data-expanded-match]:visible').first();
      await detail.waitFor({ state: 'visible', timeout: 10_000 });
      assert.equal((await palette(detail.locator('.expand-card').first())).color, colors[theme].ink);
      signalExpanded = true;
    }
    assert.deepEqual(errors, []);
    return { viewport: device.viewport.width, theme, matchDetails: true, eventFlow: true,
      eventPlotData: plot.length > 0, matchStats: true, marketOpened, historyDetails: true,
      sharedNativeExpansion: true, signalExpanded, historyContrast: Number(detailsContrast.toFixed(2)),
      language: 'en', javascriptErrors: errors };
  } finally {
    await context.close();
  }
}

async function testDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(host + '/?view=live', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => window.__b46OddsCrossDeviceStats?.ready);
    assert.equal(await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--b46-detail-sheet').trim()), '');
    return { viewport: 1440, mobileStylesInactive: true, oddsRuntimeReady: true };
  } finally {
    await page.close();
  }
}

await proofOfScope();
const browser = await chromium.launch(process.env.B46_CHROMIUM ? { executablePath: process.env.B46_CHROMIUM } : {});
try {
  const report = { preview: host, pc: await testDesktop(browser), mobile: [] };
  for (const theme of ['dark', 'light']) report.mobile.push(await testMobile(browser, theme, devices['Pixel 7']));
  if (artifacts) await writeFile(join(artifacts, 'qa.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('BALL46_MOBILE_THEME_QA', JSON.stringify(report));
} finally {
  await browser.close();
}
