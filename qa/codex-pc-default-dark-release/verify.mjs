import assert from 'node:assert/strict';

const key = 'nomad343_dashboard_theme_v1';

export async function verifyTheme({ chromium, devices }, origin, intercept) {
  const desktop = { viewport: { width: 1440, height: 950 } };
  const cases = [
    { name: 'PC, light system', device: desktop, system: 'light', path: '/', toggle: true },
    { name: 'PC, dark system', device: desktop, system: 'dark', path: '/index.html?view=statistics' },
    { name: 'iPhone, light system', device: devices['iPhone 13'], system: 'light', path: '/' },
    { name: 'Android, dark system', device: devices['Pixel 7'], system: 'dark', path: '/index.html?view=statistics' },
    { name: 'iPad, light system', device: devices['iPad (gen 7)'], system: 'light', path: '/index.html?view=signal' },
    { name: 'Android, saved Light', device: devices['Pixel 7'], system: 'dark', saved: 'light', path: '/' },
    { name: 'PC, storage blocked', device: desktop, system: 'light', blocked: true, path: '/' },
  ];
  const browser = await chromium.launch({ headless: true, ...(intercept ? { executablePath: '/usr/bin/chromium' } : {}) });

  async function state(page) {
    return page.evaluate(key => {
      let saved = null;
      try { saved = localStorage.getItem(key); } catch {}
      return {
        theme: document.documentElement.dataset.theme,
        color: document.querySelector('meta[name="theme-color"]')?.content,
        saved,
        history: window.__codexThemeHistory,
      };
    }, key);
  }

  try {
    return await Promise.all(cases.map(async ({ name, device, system, path, saved, blocked, toggle }) => {
      const page = await browser.newPage({
        ...device, colorScheme: system, serviceWorkers: 'block', ignoreHTTPSErrors: Boolean(intercept),
      });
      try {
        await page.addInitScript(({ key, saved, blocked }) => {
          if (saved) localStorage.setItem(key, saved);
          if (blocked) {
            for (const method of ['getItem', 'setItem']) {
              const original = Storage.prototype[method];
              Storage.prototype[method] = function (name, ...args) {
                if (name === key) throw new DOMException('Blocked theme storage', 'SecurityError');
                return original.call(this, name, ...args);
              };
            }
          }
          window.__codexThemeHistory = [];
          function observe() {
            const root = document.documentElement;
            if (!root) return;
            first.disconnect();
            function record() {
              const theme = root.dataset.theme;
              if (theme && window.__codexThemeHistory.at(-1) !== theme) window.__codexThemeHistory.push(theme);
            }
            record();
            new MutationObserver(record).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
          }
          const first = new MutationObserver(observe);
          first.observe(document, { childList: true });
          observe();
        }, { key, saved, blocked });

        await page.route('**/*', async route => {
          const request = route.request();
          if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
          return intercept ? intercept(route) : route.continue();
        });

        const response = await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 40000 });
        assert(response?.ok() && new URL(page.url()).origin === origin, name + ': wrong response origin');
        const expected = saved ?? 'dark';
        await page.waitForFunction(theme => (
          document.documentElement.dataset.theme === theme &&
          document.querySelector('meta[name="theme-color"]')?.content === (theme === 'dark' ? '#050807' : '#f4f8f5') &&
          Boolean(document.querySelector('[data-theme-toggle]'))
        ), expected, { timeout: 15000 });
        const appearance = await state(page);
        assert.equal(appearance.theme, expected, name);
        assert.equal(appearance.saved, saved ?? null, name + ': startup stored a preference');
        if (!saved) assert(!appearance.history.includes('light'), name + ': briefly switched to Light');

        if (toggle) {
          await page.locator('[data-theme-toggle]:visible').first().click();
          await page.waitForFunction(key =>
            localStorage.getItem(key) === 'light' && document.documentElement.dataset.theme === 'light', key);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 40000 });
          const reopened = await state(page);
          assert.equal(reopened.theme, 'light');
          assert.equal(reopened.saved, 'light');
        }
        const result = { name, theme: appearance.theme, saved: appearance.saved, lightToggleSurvivesReload: Boolean(toggle) };
        console.log('Theme verified', JSON.stringify(result));
        return result;
      } finally {
        await page.close();
      }
    }));
  } finally {
    await browser.close();
  }
}
