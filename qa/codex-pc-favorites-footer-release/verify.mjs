import assert from 'node:assert/strict';

export class ReleaseHtmlPending extends Error {}

const markets = [
  ['ah', 'Asian Handicap'], ['1x2', '1X2'], ['ou', 'Over/Under'],
  ['corners', 'Corners'], ['cards', 'Cards'], ['other', 'Both teams to score'],
];
const footer = '#b46-site-footer-v1';
const favoriteSelector = '[data-b46-pin-v2]';
const palette = {
  dark: { outline: 'rgb(141, 215, 191)', filled: 'rgb(242, 201, 76)', footerAccent: 'rgb(32, 211, 155)' },
  light: { outline: 'rgb(23, 107, 88)', filled: 'rgb(148, 101, 0)', footerAccent: 'rgb(8, 124, 79)' },
};

export async function verifyUi({ chromium, devices }, origin, board, launchOptions = {}) {
  const cases = [
    { device: devices['iPhone 13'], theme: 'dark' },
    { device: devices['Pixel 7'], theme: 'light' },
    { device: { viewport: { width: 1440, height: 950 } }, theme: 'light' },
  ];
  // Signal data stays inside isolated browser contexts, including when the public feed has no entries.
  const live = board.fixtures.filter(fixture => fixture.boardState === 'live');
  const sample = (live.length >= markets.length ? live : board.fixtures).slice(0, markets.length)
    .map(fixture => ({ ...fixture, boardState: 'live', status: 'live', statusReason: '', statusCode: '2H', minute: 51 }));
  const ids = sample.map(fixture => String(fixture.fixtureId));
  assert.equal(new Set(ids).size, markets.length, 'QA requires distinct matches');
  const signals = markets.map(([, market], index) => ({
    id: 'codex-ui-qa-' + index, fixtureId: ids[index], market, selection: 'Home',
    odds: 1.95, entryMinute: 23, createdAt: Date.now(),
  }));
  const browser = await chromium.launch({ headless: true, ...launchOptions });

  try {
    return await Promise.all(cases.map(async ({ device, theme }) => {
      const mobile = Boolean(device.isMobile);
      const page = await browser.newPage({ ...device, serviceWorkers: 'block', ignoreHTTPSErrors: Boolean(launchOptions.executablePath) });
      try {
        await page.route('**/*', route => {
          const request = route.request();
          if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
          const url = new URL(request.url());
          if (url.origin !== origin) return route.continue();
          if (url.pathname === '/api/engine/board') return route.fulfill({ json: { ...board, fixtures: sample } });
          if (url.pathname === '/api/engine/signals') return route.fulfill({ json: { ok: true, signals, mirror: {} } });
          if (url.pathname === '/api/hub/snapshot') return route.fulfill({ json: {} });
          return route.continue();
        });
        if (theme === 'light') {
          await page.addInitScript(() => localStorage.setItem('nomad343_dashboard_theme_v1', 'light'));
        }

        async function open(query, view) {
          const response = await page.goto(origin + '/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 40000 });
          assert(response?.ok() && new URL(page.url()).origin === origin);
          const html = await response.text();
          if (!['codex-pc-favorite-stars', 'codex-pc-mobile-footer'].every(id => html.includes('id="' + id + '"'))) {
            throw new ReleaseHtmlPending('Browser received the previous Ball46 version');
          }
          await page.waitForFunction(value => document.body.dataset.workspaceView === value, view);
          assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        }

        async function checkFooter() {
          const appearance = await page.locator(footer).evaluate(el => {
            const css = getComputedStyle(el);
            return {
              background: css.backgroundColor, image: css.backgroundImage, color: css.color,
              accent: getComputedStyle(el.querySelector('.b46f-brand span')).color,
              pageColor: getComputedStyle(document.body).color,
            };
          });
          if (mobile) {
            assert.equal(appearance.background, 'rgba(0, 0, 0, 0)');
            assert.equal(appearance.image, 'none');
            assert.equal(appearance.color, appearance.pageColor);
            assert.equal(appearance.accent, palette[theme].footerAccent);
          } else {
            assert.equal(appearance.background, 'rgb(244, 248, 244)');
            assert.equal(appearance.accent, 'rgb(22, 131, 78)');
          }
        }

        async function checkStar(selector, on, signalView = false) {
          const handle = await page.waitForFunction(({ selector, text, color, signalView }) => {
            const el = document.querySelector(selector);
            if (!el?.getClientRects().length || el.textContent !== text) return false;
            const css = getComputedStyle(el);
            if (css.color !== color) return false;
            const bounds = el.getBoundingClientRect();
            const teams = signalView ? el.closest('.match-row').querySelector('.teams-cell').getBoundingClientRect() : bounds;
            return {
              background: css.backgroundColor, radius: css.borderRadius, border: css.borderTopWidth,
              shadow: css.boxShadow, fontSize: css.fontSize, width: bounds.width,
              offset: Math.abs(bounds.top + bounds.height / 2 - teams.top - teams.height / 2),
            };
          }, { selector, text: on ? '★' : '☆', color: palette[theme][on ? 'filled' : 'outline'], signalView }, { timeout: 15000 });
          const style = await handle.jsonValue();
          await handle.dispose();
          assert.equal(style.background, 'rgba(0, 0, 0, 0)');
          assert.equal(style.radius, '0px');
          assert.equal(style.border, '0px');
          assert.equal(style.shadow, 'none');
          assert.equal(style.fontSize, '20px');
          assert.equal(style.width, mobile ? 30 : 24);
          if (mobile && signalView) assert(style.offset <= 1, 'Star is offset from the teams by ' + style.offset);
        }

        await open('?status=live', 'live');
        await checkFooter();
        const liveStar = (mobile ? '[data-b46-pin-mobile="' : '[data-b46-pin-v2="') + ids[0] + '"]';
        await checkStar(liveStar, false);
        await page.locator(liveStar).click();
        await checkStar(liveStar, true);

        await open('?view=signal&signalMarket=ah', 'signal');
        await checkFooter();
        const firstSignalStar = '[data-b46-pin-v2="' + ids[0] + '"]';
        await checkStar(firstSignalStar, true, true);
        await page.locator(firstSignalStar).click();
        await checkStar(firstSignalStar, false, true);

        for (const [index, [market]] of markets.entries()) {
          await page.locator('button[data-signal-market="' + market + '"]').evaluate(el => el.click());
          await page.waitForFunction(market => document.body.dataset.signalMarket === market, market);
          await checkStar('[data-b46-pin-v2="' + ids[index] + '"]', false, true);
          assert.equal(await page.locator(favoriteSelector + ':visible').count(), 1, 'Wrong rows for market ' + market);
        }

        await open('?view=statistics', 'statistics');
        await checkFooter();
        const result = { width: device.viewport.width, theme, mobile, markets: markets.map(([key]) => key) };
        console.log('Favorites and footer verified', JSON.stringify(result));
        return result;
      } finally {
        await page.close();
      }
    }));
  } finally {
    await browser.close();
  }
}
