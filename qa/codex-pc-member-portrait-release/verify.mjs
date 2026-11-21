import assert from 'node:assert/strict';

export class ReleaseHtmlPending extends Error {}

const rail = '.workspace.singlepage .live-stage-grid > .right-rail';
const banner = rail + ' > .b46mp-card';

export async function verifyUi({ chromium, devices }, origin, releaseTags, launchOptions = {}) {
  const cases = [
    { viewport: { width: 1536, height: 900 }, theme: 'dark' },
    { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, theme: 'dark' },
    { viewport: { width: 1366, height: 900 }, theme: 'light' },
    { ...devices['iPhone 13'], theme: 'dark' },
  ];
  const browser = await chromium.launch({ headless: true, ...launchOptions });

  async function check({ theme, ...device }) {
    const page = await browser.newPage({
      ...device, serviceWorkers: 'block', ignoreHTTPSErrors: Boolean(launchOptions.executablePath),
    });
    try {
      await page.addInitScript(value => localStorage.setItem('nomad343_dashboard_theme_v1', value), theme);
      await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method())
        ? route.continue() : route.abort());
      const response = await page.goto(origin + '/index.html?status=live', {
        waitUntil: 'domcontentloaded', timeout: 40000,
      });
      assert(response?.ok() && new URL(page.url()).origin === origin);
      const html = await response.text();
      if (!releaseTags.every(tag => html.includes(tag))) {
        throw new ReleaseHtmlPending('Browser received the previous membership portrait style');
      }
      assert.equal(await page.locator('style#codex-pc-right-sidebar').count(), 1);
      assert.equal(await page.locator('script#codex-pc-right-sidebar-view').count(), 1);

      const result = { theme, width: device.viewport.width, scale: device.deviceScaleFactor ?? 1 };
      if (device.isMobile) {
        assert.equal(await page.locator(rail).isVisible(), false);
        return { ...result, desktopRailVisible: false };
      }

      await page.waitForFunction(selector => document.querySelector(selector + ' .b46mp-photo')?.naturalWidth > 0, banner);
      const actual = await page.locator(banner).evaluate(card => {
        const image = card.querySelector('.b46mp-photo');
        return {
          theme: card.dataset.b46mpTheme,
          source: image.getAttribute('src'),
          dimensions: [image.naturalWidth, image.naturalHeight],
          filter: getComputedStyle(image).filter,
          gradient: getComputedStyle(card, '::before').backgroundImage,
          vignette: getComputedStyle(card, '::after').backgroundImage,
          border: getComputedStyle(card).borderTopWidth,
          height: card.getBoundingClientRect().height,
          link: card.getAttribute('href'),
        };
      });
      assert.equal(actual.theme, theme);
      assert.equal(actual.source, '/b46-member-athlete-20261109.webp?v=1');
      assert.deepEqual(actual.dimensions, [1672, 941]);
      assert.equal(actual.link, 'https://member.ball46.com/pricing');
      assert.equal(actual.height, 156);
      assert.equal(actual.border, '0px');
      if (theme === 'dark') {
        assert.equal(actual.filter, 'brightness(0.99) contrast(1.09) saturate(0.96)');
        assert.match(actual.gradient, /rgb\(11, 25, 17\) 35%.*0\.08\) 73%/);
        assert.match(actual.vignette, /linear-gradient\(0deg,.*43%/);
      } else {
        assert.equal(actual.filter, 'none');
        assert.match(actual.gradient, /rgb\(247, 252, 243\)/);
      }
      return { ...result, filter: actual.filter, image: actual.dimensions };
    } finally {
      await page.close();
    }
  }

  try {
    const results = await Promise.all(cases.map(check));
    for (const result of results) console.log('Member portrait verified', JSON.stringify(result));
    return results;
  } finally {
    await browser.close();
  }
}
