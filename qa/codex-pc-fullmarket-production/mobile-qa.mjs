import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const origin = process.env.B46_RELEASE_ORIGIN;
const browser = await chromium.launch(process.env.B46_CHROMIUM_PATH
  ? { executablePath: process.env.B46_CHROMIUM_PATH, headless: true } : {});
try {
  const page = await browser.newPage({
    ...devices['iPhone 13'], serviceWorkers: 'block', ignoreHTTPSErrors: Boolean(process.env.B46_CHROMIUM_PATH),
  });
  await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('nomad343_dashboard_theme_v1', 'dark'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(origin + '/index.html?status=live', { waitUntil: 'domcontentloaded', timeout: 70000 });
  assert(response?.ok());
  const cards = page.locator('button[data-b46gn-fixture]:visible');
  await cards.first().waitFor({ timeout: 50000 });
  const dialog = page.locator('#b46gn-detail');
  const scroll = () => page.evaluate(() => document.scrollingElement.scrollTop);
  let result;
  for (let i = 0; i < Math.min(await cards.count(), 5); i++) {
    const card = cards.nth(i);
    await card.scrollIntoViewIfNeeded();
    const before = await scroll();
    await card.evaluate(el => { el.focus({ preventScroll: true }); el.click(); });
    await dialog.locator('[data-b46-section="flow"]').waitFor();
    await dialog.locator('[data-b46-section="flow"]').evaluate(el => el.click());
    const flow = await page.waitForFunction(() => {
      const chart = document.querySelector('#b46gn-detail .b46gn-event-flow b46-mobile-event-bars[data-flow]');
      if (!chart?.getClientRects().length || !chart.shadowRoot?.firstElementChild) return false;
      return JSON.parse(chart.dataset.flow).points?.length > 1;
    }, null, { timeout: 8000 }).then(() => true, () => false);
    await dialog.locator('[data-b46-section="markets"]').evaluate(el => el.click());
    const tab = dialog.locator('.b46gn-full-market .fmb-tab.has-data[data-fmb-book]').first();
    const markets = await tab.waitFor({ timeout: 8000 }).then(() => true, () => false);
    if (markets) await tab.evaluate(el => el.click());
    const opened = await scroll();
    await dialog.locator('[data-b46gn-dismiss]').evaluate(el => el.click());
    await dialog.waitFor({ state: 'hidden' });
    const closed = await scroll();
    if (flow && markets) {
      assert(Math.abs(opened - before) < 3 && Math.abs(closed - before) < 3, 'Mobile drawer displaced the page');
      result = { width: 390, flow, markets, before, opened, closed };
      break;
    }
  }
  assert(result, 'No mobile drawer with Event Flow and Full Market data');
  const scope = await page.evaluate(() => ({
    active: document.querySelectorAll('[data-b46-fmb-odds-move]').length,
    desktop: matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine)').matches,
    hasDefault: Boolean(document.getElementById('b46-odds-flash-production')),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  assert(!scope.active && !scope.desktop && scope.hasDefault && !scope.overflow);
  assert.deepEqual(errors, []);
  console.log('B46_MOBILE_DRAWER_QA_PASS ' + JSON.stringify({ ...result, scope }));
} finally {
  await browser.close();
}
