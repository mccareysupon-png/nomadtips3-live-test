import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { clientCode } from './client.mjs';

const host = 'https://ball46-performance-summary-test-20261124.mccarey-supon.workers.dev';
const summaryURL = host + '/__performance_test/summary';
const pageURL = host + '/?view=signal';
const card = '#ball46-daily-performance';
const rate = card + ' [data-b46-rate="today"]';

async function warmSummary() {
  const response = await fetch(host + '/__performance_test/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {scope:'ISOLATED_TEST_ONLY', revision:'daily-performance-summary-v1'});
  for (let attempt = 0; attempt < 25; attempt++) {
    const r = await fetch(summaryURL, {signal:AbortSignal.timeout(12000)});
    assert(r.ok);
    const data = await r.text();
    assert(Buffer.byteLength(data) < 2000);
    const view = JSON.parse(data);
    if (view.state === 'current') return view;
    await new Promise(resolve => setTimeout(resolve, 6000));
  }
  throw new Error('The sandbox did not publish a verified summary');
}

const summary = await warmSummary();
const r = await fetch(pageURL, {signal:AbortSignal.timeout(15000)});
assert.equal(r.headers.get('x-b46-performance-preview'), 'daily-performance-summary-v1');
const html = await r.text();
assert.equal(html.split('id="ball46-daily-performance"').length - 1, 1);
assert(!html.includes('id="b46-daily-performance-runtime"'));
assert(!html.includes('id="b46-cross-device-odds-v3-test-js"'));
assert(html.includes('id="b46-performance-banner-js-20261023"'));
assert(html.includes('id="b46-odds-flash-runtime-production"'));
assert.equal(await (await fetch(host + '/__performance_test/card.js')).text(), clientCode);

const browser = await chromium.launch(process.env.B46_CHROMIUM ? {executablePath:process.env.B46_CHROMIUM} : {});
try {
  const staticContext = await browser.newContext({javaScriptEnabled:false, viewport:{width:1440,height:900}});
  const cold = await staticContext.newPage();
  await cold.goto(pageURL, {waitUntil:'commit'});
  await cold.locator(rate).waitFor({state:'visible',timeout:15000});
  const staticRate = await cold.locator(rate).textContent();
  assert.match(staticRate, /^\d+(\.\d+)?%$/);
  console.log('Cold desktop first render, with JavaScript disabled:', staticRate);
  await staticContext.close();

  for (const test of [
    {name:'desktop', options:{viewport:{width:1440,height:900}}},
    {name:'mobile', options:devices['Pixel 7']},
  ]) {
    const context = await browser.newContext(test.options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/engine/statistics*', route => route.abort());
    await page.goto(pageURL, {waitUntil:'domcontentloaded'});
    assert.equal(await page.locator(card).count(), 1);
    assert.match(await page.locator(rate).textContent(), /^\d+(\.\d+)?%$/);
    if (test.name === 'desktop') {
      assert(await page.locator(rate).isVisible());
      const original = await page.locator(card).getAttribute('data-b46-performance-state');
      assert.match(original, /^(current|saved)$/);
      await page.getByRole('button', {name:'Switch theme',exact:true}).click();
      assert(await page.locator(rate).isVisible());
      const box = await page.locator(card).boundingBox();
      assert(box.width > 100 && box.height > 0);
    } else {
      assert.equal(await page.locator(card).isVisible(), false);
    }
    assert(!errors.some(error => /Performance|__name/.test(error)), errors.join('\n'));
    console.log(test.name + ' validated with the full ledger unavailable in the browser');
    await context.close();
  }
} finally {
  await browser.close();
}
