import assert from 'node:assert/strict';

export const marker = 'id="codex-pc-mobile-stats-cards"';
export class LayoutResponsePending extends Error {}

export async function verifyMobileStats({ chromium, devices }, origin, { intercept, screenshots } = {}) {
  const cases = [
    { name: 'iphone-dark', device: devices['iPhone 13'], theme: 'dark' },
    { name: 'iphone-light', device: devices['iPhone 13'], theme: 'light' },
    { name: 'android-ah', device: devices['Pixel 7'], theme: 'dark', market: 'ah' },
    { name: 'narrow-360', device: { ...devices['Pixel 7'], viewport: { width: 360, height: 860 } }, theme: 'dark' },
    { name: 'desktop', device: { viewport: { width: 1440, height: 950 } }, theme: 'dark' },
  ];
  const browser = await chromium.launch({ headless: true, ...(intercept ? { executablePath: '/usr/bin/chromium' } : {}) });

  try {
    return await Promise.all(cases.map(async ({ name, device, theme, market }) => {
      const page = await browser.newPage({ ...device, serviceWorkers: 'block', ignoreHTTPSErrors: Boolean(intercept) });
      try {
        await page.addInitScript(value => localStorage.setItem('nomad343_dashboard_theme_v1', value), theme);
        await page.route('**/*', route => {
          if (!['GET', 'HEAD'].includes(route.request().method())) return route.abort();
          return intercept ? intercept(route) : route.continue();
        });
        const response = await page.goto(origin + '/index.html?view=statistics' + (market ? '&market=' + market : ''), {
          waitUntil: 'domcontentloaded', timeout: 40000,
        });
        assert(response?.ok() && new URL(page.url()).origin === origin);
        if (!(await response.text()).includes(marker)) {
          throw new LayoutResponsePending(name + ': browser received the previous HTML version');
        }
        await page.locator('#b46-finance-chart-card .f46-overview:visible').first().waitFor({ timeout: 35000 });
        if (name !== 'desktop') {
          await page.locator('.b46-exact-mobile:visible').first().waitFor({ timeout: 15000 });
          await page.locator('.b46m14-strip:visible').first().waitFor({ timeout: 15000 });
        }
        if (name === 'iphone-dark') {
          await page.locator('.b46m-hcard:visible').first().waitFor({ timeout: 25000 });
        }

        const proof = await page.evaluate(() => {
          const panel = document.querySelector('.workspace-panel[data-workspace-panel="statistics"]');
          function box(selector) {
            const element = panel.querySelector(selector);
            if (!element) return null;
            const bounds = element.getBoundingClientRect();
            const css = getComputedStyle(element);
            if (!bounds.width || !bounds.height || css.visibility === 'hidden') return null;
            return {
              left: bounds.left, right: innerWidth - bounds.right, top: bounds.top, bottom: bounds.bottom,
              border: [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth],
              radius: css.borderRadius, shadow: css.boxShadow,
            };
          }
          return {
            theme: document.documentElement.dataset.theme,
            market: document.querySelector('.left-rail [data-stat-market].active')?.dataset.statMarket,
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            spacing: getComputedStyle(panel).getPropertyValue('--mobile-stats-spacing').trim(),
            outer: {
              banner: box('.b46-exact-mobile a'),
              heading: box('.workspace-view-head'),
              kpis: box('.b46m14-strip'),
              chart: box('#b46-finance-chart-card .f46-card'),
              history: box('.sp-results'),
            },
            inner: {
              outcomes: box('.b46-market-unified-outcomes, .b46-stage-outcomes'),
              plot: box('.f46-plot'),
              match: box('.b46m-hcard'),
            },
            kpiTile: box('.b46m14-card'),
          };
        });
        assert.equal(proof.theme, theme, name);
        assert.equal(proof.market, market ?? 'all', name);
        const near = (value, expected) => Math.abs(value - expected) < 0.75;
        const borderless = box => box.border.every(width => width === '0px') && box.shadow === 'none';
        if (name === 'desktop') {
          assert.equal(proof.spacing, '', 'Mobile spacing applied on desktop');
        } else {
          assert.equal(proof.spacing, '12px', name);
          assert.equal(proof.scrollWidth, proof.width, name + ': horizontal overflow');
          const outer = Object.entries(proof.outer);
          for (const [label, box] of outer) {
            assert(box && near(box.left, 12) && near(box.right, 12), name + ' ' + label + ': ' + JSON.stringify(box));
            if (label !== 'kpis') assert(borderless(box) && box.radius === '12px', name + ' ' + label + ': ' + JSON.stringify(box));
          }
          for (let i = 1; i < outer.length; i++) {
            const gap = outer[i][1].top - outer[i-1][1].bottom;
            assert(near(gap, 12), name + ': gap before ' + outer[i][0] + ' was ' + gap);
          }
          for (const [label, box] of Object.entries(proof.inner)) {
            if (box) {
              assert(near(box.left, 24) && near(box.right, 24), name + ' ' + label + ': ' + JSON.stringify(box));
              assert(borderless(box), name + ' ' + label + ': ' + JSON.stringify(box));
            }
          }
          assert(proof.kpiTile && borderless(proof.kpiTile), name + ': KPI tile border or shadow');
        }
        if (screenshots && (name === 'iphone-dark' || name === 'iphone-light')) {
          await page.screenshot({ path: `${screenshots}/${name}.png`, animations: 'disabled', timeout: 5000 })
            .catch(error => console.warn('Screenshot unavailable after layout check:', error.message));
        }
        const summary = {
          name, width: proof.width, theme, market: proof.market, gutter: proof.spacing || undefined,
          historyCardVisible: Boolean(proof.inner.match),
        };
        console.log('Statistics layout verified', JSON.stringify(summary));
        return summary;
      } finally {
        await page.close();
      }
    }));
  } finally {
    await browser.close();
  }
}
