import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { parse as parseHtml } from 'parse5';
import { chromium } from 'playwright';
import { patch, constants, targets, sha, borderChecks, logoSelector, themeSelector, oddsButtonSelector, marker, themeMarker, themeScriptRoute } from './logo-size.mjs';

const env = process.env;
const origin = env.BALL46_URL || 'https://ball46.com';
const script = env.SCRIPT_NAME || 'ball46-production';
const account = env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_API_TOKEN;
assert(account && token, 'CLOUDFLARE_AUTH_MISSING');
assert.equal(script, 'ball46-production');
const root = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const runTag = `${env.GITHUB_RUN_ID || 'local'}-${env.GITHUB_SHA || 'local'}`;
const audit = 'audit';
mkdirSync(`${audit}/screenshots`, { recursive: true });
mkdirSync(`${audit}/css`, { recursive: true });
const report = { runTag, startedAt: new Date().toISOString(), publish: env.DEPLOY_ENABLED === 'true', scope: 'ODDS and plain-text Light/Dark aligned below the logo; transparent controls with matching typography; existing handlers and main renderer protected' };
const save = () => writeFileSync(`${audit}/report.json`, JSON.stringify(report, null, 2));
const delay = ms => new Promise(r => setTimeout(r, ms));
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

async function api(path, options = {}) {
  const response = await fetch(root + path, { ...options, signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  const j = await response.json();
  assert(response.ok && j.success === true, `CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(j.errors || [])}`);
  return j.result;
}

async function active() {
  const r = await api(`/scripts/${script}/deployments?per_page=3`);
  const d = r.deployments?.[0];
  assert(d?.versions?.length === 1 && Number(d.versions[0].percentage) === 100, 'ACTIVE_NOT_SINGLE_100_PERCENT');
  assert(d.versions[0].version_id, 'ACTIVE_VERSION_MISSING');
  return d.versions[0].version_id;
}

async function version(id) {
  const r = await api(`/workers/${script}/versions/${id}?include=modules`);
  assert(r?.main_module && r.modules?.length, 'ACTIVE_MODULES_MISSING');
  return r;
}

async function publicFile(path, type) {
  const url = new URL(path, origin);
  assert.equal(url.origin, new URL(origin).origin, 'CROSS_ORIGIN_ASSET');
  url.searchParams.set('borderAudit', `${runTag}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  assert(response.ok, `PUBLIC_HTTP:${path}:${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (type) assert(contentType.includes(type), `CONTENT_TYPE:${path}:${contentType}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length, `EMPTY_PUBLIC_ASSET:${path}`);
  return bytes;
}

async function backend() {
  const [e, f, s] = await Promise.all([
    publicFile('/api/engine/health', 'json'),
    publicFile('/api/full-market/health', 'json'),
    publicFile('/api/engine/statistics', 'json'),
  ].map(p => p.then(b => JSON.parse(b))));
  assert(e.ok === true && f.ok === true && s.ok === true, 'BACKEND_NOT_OK');
  assert(e.version && f.version && s.settlementRevision !== undefined, 'BACKEND_REVISION_MISSING');
  return { engine: e.version, fullMarket: f.version, settlementRevision: s.settlementRevision };
}

function references(html) {
  const urls = new Set();
  const walk = n => {
    const attrs = Object.fromEntries((n.attrs || []).map(a => [a.name, a.value]));
    const value = n.tagName === 'script' ? attrs.src : n.tagName === 'link' && attrs.rel === 'stylesheet' ? attrs.href : n.tagName === 'img' ? attrs.src : null;
    if (value) {
      const u = new URL(value, origin);
      if (u.origin === new URL(origin).origin) urls.add(u.pathname + u.search);
    }
    (n.childNodes || []).forEach(walk);
  };
  walk(parseHtml(html));
  return urls;
}

const pages = [
  ['live', '/index.html'],
  ['signal', '/index.html?view=signal'],
  ['statistics', '/index.html?view=statistics'],
  ['settings', '/settings.html'],
  ['about', '/about.html'],
];
const auditPages = env.HEADER_ONLY_QA === 'true' ? pages.filter(([name]) => name === 'live') : pages;
const geometrySelectors = '.workspace-scorebar-slot,.workspace-scorebar-grid,.workspace-scorebar-cell,.event-flow,.event-flow-line,.b46-signal-flow-line,.b46-signal-flow-line-chart,.b46-signal-flow-live-copy,.pitch,.timeline,.match-row.active,svg,path,line,canvas,input,select,button:not([data-theme-toggle]):not([data-odds-format-button])';

async function uiCheck(changes, phase) {
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const [size, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1100], ['mobile', 390, 844], ['small-mobile', 320, 740]]) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, timezoneId: 'Asia/Bangkok' });
        await context.addInitScript(theme => { localStorage.setItem('nomad343_dashboard_theme_v1', theme); }, theme);
        const page = await context.newPage();
        if (phase === 'preview') {
          for (const scriptChange of changes.filter(c => c.type === 'javascript')) {
            await page.route(`**${scriptChange.route}*`, route => route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: scriptChange.after }));
          }
        }
        // Owner Settings is observed only: never allow a write request during QA.
        await page.route('**/api/**', async route => {
          if (!['GET', 'HEAD'].includes(route.request().method())) return route.abort('blockedbyclient');
          return route.continue();
        });
        for (const [name, path] of auditPages) {
          const errors = [];
          const listener = e => errors.push(e.message);
          page.on('pageerror', listener);
          const response = await page.goto(new URL(path, origin).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
          assert(response?.ok(), `UI_HTTP:${name}`);
          if (['live', 'signal', 'statistics'].includes(name)) {
            await page.waitForSelector('.workspace-stable-head', { timeout: 20000 });
            await page.waitForFunction(() => document.querySelectorAll('.match-row').length > 0, null, { timeout: 30000 });
            await page.waitForFunction(() => [...document.querySelectorAll('.workspace-scorebar-cell')].some(e => getComputedStyle(e).backgroundImage.includes('scorebar-')), null, { timeout: 30000 });
            const currentTheme = await page.evaluate(() => document.documentElement.dataset.theme);
            if (currentTheme !== theme) {
              await page.locator('[data-theme-toggle]').click();
              assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, 'THEME_SWITCH_FAILED');
            }
            const mobileNav = page.locator(`[data-b46-mobile-view="${name}"]`);
            if (await mobileNav.isVisible()) await mobileNav.click();
            else if (name === 'signal') await page.locator('button[data-workspace-view="signal"]').click();
            else if (name === 'statistics') await page.locator('[data-stat-market="all"]').click();
            else await page.locator('[data-status-filter="live"]').click();
            await page.waitForFunction(view => document.body.dataset.workspaceView === view, name, { timeout: 15000 });
            if (name === 'signal') {
              await page.waitForFunction(() => {
                const visibleRows = [...document.querySelectorAll('.match-row')].filter(e => e.getBoundingClientRect().width > 0);
                const count = Number(document.querySelector('button[data-workspace-view="signal"] b')?.textContent || 0);
                return visibleRows.length > 0 || count === 0 && [...document.querySelectorAll('.board-empty')].some(e => e.getBoundingClientRect().width > 0);
              }, null, { timeout: 30000 });
            }
            if (name === 'statistics') {
              await page.locator('.sp-stat-hero').waitFor({ state: 'visible' });
              await page.waitForFunction(() => [...document.querySelectorAll('.sp-kpi strong')].some(e => /\d/.test(e.textContent)), null, { timeout: 30000 });
            }
          } else if (name === 'settings') {
            await page.waitForSelector('.settings-card', { timeout: 25000 });
          }
          await page.evaluate(() => document.fonts.ready);
          const backgrounds = await page.evaluate(async () => {
            const urls = [...new Set([...document.querySelectorAll('.workspace-scorebar-cell')].flatMap(e => [...getComputedStyle(e).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m => m[1])))];
            return Promise.all(urls.map(src => new Promise(resolve => {
              const image = new Image();
              image.onload = () => resolve({ src, loaded: image.naturalWidth > 0 });
              image.onerror = () => resolve({ src, loaded: false });
              image.src = src;
            })));
          });
          assert(backgrounds.every(b => b.loaded), `SCOREBAR_BACKGROUND_NOT_LOADED:${name}:${size}:${theme}`);
          const routes = await page.locator('link[rel="stylesheet"]').evaluateAll(es => es.map(e => new URL(e.href).pathname));
          const applicable = changes.filter(c => c.type === 'css' && routes.includes(c.route));
          const changesLogo = applicable.some(c => c.css.includes(marker));
          const changesTheme = applicable.some(c => c.css.includes(themeMarker));
          const decorativeChecks = applicable.flatMap(c => borderChecks(c.css));
          const mutableLeftBorders = decorativeChecks.filter(c => c.properties.includes('borderLeftColor')).map(c => c.selector);
          const sample = () => page.evaluate(({ selector, mutableLeftBorders }) => ({
            domRevision: window.__borderQaRevision || 0,
            text: document.querySelector('.workspace-scorebar-slot')?.textContent || '',
            geometry: [...document.querySelectorAll(selector)].map(e => {
              const r = e.getBoundingClientRect(), c = getComputedStyle(e);
              return { cls: e.className, width: r.width, height: r.height, image: c.backgroundImage, surface: c.backgroundColor, color: c.color, shadow: c.boxShadow, outline: c.outline, outlineOffset: c.outlineOffset, stroke: c.stroke, strokeWidth: c.strokeWidth, fill: c.fill, leftBorder: mutableLeftBorders.some(s => e.matches(s)) ? 'approved-decoration' : c.borderLeftColor, borderWidths: [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth] };
            }),
            scrollWidth: document.documentElement.scrollWidth,
          }), { selector: geometrySelectors, mutableLeftBorders });
          const key = `${phase}-${name}-${size}-${theme}`;
          const sampleLogo = () => page.evaluate(selector => {
            const e = document.querySelector(selector);
            if (!e) return null;
            const rect = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
            return { text: e.textContent, rect: rect(e), zoom: getComputedStyle(e).zoom, card: rect(e.closest('.workspace-brand-card')), controls: [...e.closest('.workspace-brand-card').querySelectorAll('button:not([hidden])')].filter(n => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0).map(n => ({ label: n.getAttribute('aria-label') || n.textContent, rect: rect(n) })) };
          }, logoSelector);
          const logoBefore = await sampleLogo();
          await page.screenshot({ path: `${audit}/screenshots/${key}-before.png` });
          await page.evaluate(() => {
            window.__borderQaRevision = 0;
            window.__borderQaObserver = new MutationObserver(() => { window.__borderQaRevision++; });
            window.__borderQaObserver.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
          });
          let before, after, previewStyle;
          const css = applicable.map(c => c.css).join('\n');
          // Retry only a witnessed live DOM refresh, never a static CSS mismatch.
          for (let attempt = 0; attempt < 3; attempt++) {
            before = await sample();
            if (phase === 'preview' && css) {
              if (!previewStyle) {
                previewStyle = await page.addStyleTag({ content: css });
                await previewStyle.evaluate(e => { e.dataset.borderPreview = 'true'; });
              } else await previewStyle.evaluate(e => { e.disabled = false; });
            }
            after = await sample();
            if (canonical(after.geometry) === canonical(before.geometry) || after.domRevision === before.domRevision || attempt === 2) break;
            console.log(`LIVE_DOM_REFRESH_RETRY:${key}:attempt=${attempt + 1}`);
            if (previewStyle) await previewStyle.evaluate(e => { e.disabled = true; });
          }
          await page.evaluate(() => window.__borderQaObserver.disconnect());
          if (canonical(after.geometry) !== canonical(before.geometry)) {
            writeFileSync(`${audit}/${key}-geometry-failure.json`, JSON.stringify({ before, after }, null, 2));
          }
          assert.equal(canonical(after.geometry), canonical(before.geometry), `PROTECTED_GEOMETRY_CHANGED:${key}`);
          assert(after.scrollWidth <= before.scrollWidth + 1, `NEW_HORIZONTAL_OVERFLOW:${key}`);
          const logoAfter = await sampleLogo();
          await page.screenshot({ path: `${audit}/screenshots/${key}-after.png` });
          if (['live', 'signal', 'statistics'].includes(name)) {
            assert(logoBefore && logoAfter, `HEADER_LOGO_MISSING:${key}`);
            assert.equal(logoAfter.text, 'ball46', `HEADER_LOGO_TEXT_CHANGED:${key}`);
            assert.equal(Number(logoAfter.zoom), 1.3, `HEADER_LOGO_NOT_130_PERCENT:${key}`);
            if (phase === 'preview' && changesLogo) {
              assert(Math.abs(logoAfter.rect.width - logoBefore.rect.width * 1.3) < 0.6, `LOGO_WIDTH_NOT_PLUS_30_PERCENT:${key}`);
              assert(Math.abs(logoAfter.rect.height - logoBefore.rect.height * 1.3) < 0.6, `LOGO_HEIGHT_NOT_PLUS_30_PERCENT:${key}`);
            } else {
              assert(Math.abs(logoAfter.rect.width - logoBefore.rect.width) < 0.6, `LOGO_WIDTH_CHANGED:${key}`);
              assert(Math.abs(logoAfter.rect.height - logoBefore.rect.height) < 0.6, `LOGO_HEIGHT_CHANGED:${key}`);
            }
            const r = logoAfter.rect, c = logoAfter.card;
            assert(r.left >= c.left && r.top >= c.top && r.right <= c.right && r.bottom <= c.bottom, `LOGO_CLIPPED:${key}`);
            for (const control of logoAfter.controls) {
              const b = control.rect;
              assert(r.right <= b.left || b.right <= r.left || r.bottom <= b.top || b.bottom <= r.top, `LOGO_OVERLAPS_CONTROL:${key}:${control.label}`);
            }
          }
          if (['live', 'signal', 'statistics'].includes(name)) {
            const themeButton = await page.evaluate(selector => {
              const e = document.querySelector(selector);
              if (!e) return null;
              const r = e.getBoundingClientRect(), c = getComputedStyle(e);
              return { text: e.textContent, aria: e.getAttribute('aria-label'), width: r.width, height: r.height, x: r.x, y: r.y, typography: { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight, style: c.fontStyle, lineHeight: c.lineHeight }, letterSpacing: c.letterSpacing, color: c.color, borderRadius: c.borderRadius, background: c.backgroundColor, shadow: c.boxShadow, outline: c.outline, cursor: c.cursor };
            }, themeSelector);
            assert(themeButton, `THEME_BUTTON_MISSING:${key}`);
            assert(Math.abs(themeButton.width - 48) < 1 && Math.abs(themeButton.height - 28) < 1, `THEME_BUTTON_NOT_COMPACT_SIZE:${key}`);
            assert.equal(themeButton.borderRadius, '5px', `THEME_BUTTON_NOT_COMPACT:${key}`);
            assert.equal(themeButton.aria, 'Switch theme', `THEME_BUTTON_ARIA_CHANGED:${key}`);
            assert.equal(themeButton.text, theme === 'dark' ? 'Light' : 'Dark', `THEME_BUTTON_ICON_OR_WRONG_LABEL:${key}`);
            assert.equal(themeButton.background, 'rgba(0, 0, 0, 0)', `THEME_BUTTON_NOT_TRANSPARENT:${key}`);
            assert.equal(themeButton.shadow, 'none', `THEME_BUTTON_SHADOW_REMAINS:${key}`);
            const oddsButton = await page.evaluate(selector => {
              const e = document.querySelector(selector);
              if (!e) return null;
              const r = e.getBoundingClientRect(), c = getComputedStyle(e);
              return { text: e.textContent, x: r.x, y: r.y, width: r.width, height: r.height, typography: { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight, style: c.fontStyle, lineHeight: c.lineHeight }, letterSpacing: c.letterSpacing, color: c.color, background: c.backgroundColor };
            }, oddsButtonSelector);
            assert(oddsButton, `ODDS_BUTTON_MISSING:${key}`);
            assert(Math.abs(oddsButton.y - themeButton.y) < 1 && Math.abs(oddsButton.height - themeButton.height) < 1, `TOOLBAR_NOT_ALIGNED:${key}`);
            assert.equal(canonical(oddsButton.typography), canonical(themeButton.typography), `TOOLBAR_FONT_MISMATCH:${key}`);
            assert.equal(oddsButton.typography.size, width <= 760 ? '6.5px' : '7px', `ODDS_ORIGINAL_FONT_SIZE_CHANGED:${key}`);
            assert(['normal', '0px'].includes(oddsButton.letterSpacing), `ODDS_LETTER_SPACING_NOT_ZERO:${key}`);
            assert.equal(oddsButton.letterSpacing, themeButton.letterSpacing, `TOOLBAR_LETTER_SPACING_MISMATCH:${key}`);
            assert.equal(oddsButton.background, 'rgba(0, 0, 0, 0)', `ODDS_BUTTON_NOT_TRANSPARENT:${key}`);
            assert(oddsButton.y >= logoAfter.rect.bottom, `TOOLBAR_NOT_BELOW_LOGO:${key}`);
            assert(oddsButton.x + oddsButton.width <= themeButton.x, `TOOLBAR_CONTROLS_OVERLAP:${key}`);
            assert(themeButton.x + themeButton.width <= logoAfter.card.right, `TOOLBAR_CLIPPED:${key}`);
            report.themeControlChecks ||= [];
            report.themeControlChecks.push({ key, ...themeButton, odds: oddsButton });
            assert.equal(await page.locator('[data-theme-toggle]').count(), 1, `DUPLICATE_THEME_BUTTON:${key}`);
            assert.equal(await page.locator('[data-odds-format-button]').count(), 1, `DUPLICATE_ODDS_BUTTON:${key}`);
            await page.locator('[data-odds-format-button]').click();
            assert.equal(await page.locator('[data-odds-format-button]').getAttribute('aria-expanded'), 'true', `ODDS_MENU_NOT_OPEN:${key}`);
            assert.equal(await page.locator('[data-odds-format-option]:visible').count(), 3, `ODDS_MENU_OPTIONS_MISSING:${key}`);
            await page.locator('[data-odds-format-option="fractional"]').click();
            assert.equal(await page.locator('[data-odds-format-button]').textContent(), 'ODDS \u00b7 FRA \u25be', `ODDS_FORMAT_SWITCH_FAILED:${key}`);
            await page.locator('[data-odds-format-button]').click();
            await page.locator('[data-odds-format-option="decimal"]').click();
            assert.equal(await page.locator('[data-odds-format-button]').textContent(), 'ODDS \u00b7 DEC \u25be', `ODDS_FORMAT_RESTORE_FAILED:${key}`);
            await page.locator('[data-theme-toggle]').hover();
            assert.equal(await page.locator('[data-theme-toggle]').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)', `THEME_HOVER_NOT_TRANSPARENT:${key}`);
            for (const nextTheme of [theme === 'dark' ? 'light' : 'dark', theme]) {
              await page.locator('[data-theme-toggle]').click();
              await page.waitForFunction(({ nextTheme, selector }) => document.documentElement.dataset.theme === nextTheme && document.querySelector(selector)?.textContent === (nextTheme === 'dark' ? 'Light' : 'Dark'), { nextTheme, selector: themeSelector });
            }
            await page.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); });
            let keyboardFocused = false;
            for (let n = 0; n < 80; n++) {
              await page.keyboard.press('Tab');
              if (await page.evaluate(selector => document.activeElement?.matches(selector), themeSelector)) {
                keyboardFocused = true;
                break;
              }
            }
            assert(keyboardFocused, `THEME_BUTTON_NOT_TAB_REACHABLE:${key}`);
            const focus = await page.evaluate(selector => { const e = document.querySelector(selector), c = getComputedStyle(e); return { outline: c.outline, offset: c.outlineOffset }; }, themeSelector);
            assert(!focus.outline.includes('none') && !focus.outline.includes('0px'), `THEME_BUTTON_FOCUS_MISSING:${key}`);
          }
          let clocks = [];
          if (['live', 'signal'].includes(name)) {
            await page.waitForFunction(() => [...document.querySelectorAll('.match-row .score-cell>small:not(.half-score),.match-row .mobile-clock,.match-row .mobile-signal')].filter(e => /^LIVE\s*\u00b7/.test(e.textContent)).every(e => e.querySelector('.b46-clock-live-label')), null, { timeout: 10000 });
            clocks = await page.locator('.match-row .b46-clock-live-label,.match-row .b46-clock-minute').evaluateAll(es => es.map(e => ({ text: e.textContent, cls: e.className, color: getComputedStyle(e).color, visible: e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 })));
            const labelColor = theme === 'dark' ? 'rgb(255, 99, 116)' : 'rgb(204, 32, 53)';
            const minuteColor = theme === 'dark' ? 'rgb(67, 199, 125)' : 'rgb(8, 125, 66)';
            for (const clock of clocks) assert.equal(clock.color, clock.cls === 'b46-clock-live-label' ? labelColor : minuteColor, `CLOCK_COLOR_WRONG:${key}:${clock.text}`);
            if (name === 'live') assert(clocks.some(c => c.visible && c.text === 'LIVE'), `VISIBLE_LIVE_LABEL_MISSING:${key}`);
            if (name === 'live') assert(clocks.some(c => c.visible && c.cls === 'b46-clock-minute'), `VISIBLE_MATCH_MINUTE_MISSING:${key}`);
          }
          const frames = await page.locator('.rail-card:not(.workspace-scorebar-slot),.side-card:not(.workspace-scorebar-slot),.status-section,.workspace-stable-head,.sp-stat-hero,.sp-kpis,.sp-trend,.sp-filters,.sp-results,.hero-card,.article,.card').evaluateAll(es => es.filter(e => e.getBoundingClientRect().width > 0).map(e => ({ cls: e.className, border: getComputedStyle(e).borderTopColor })));
          if (name !== 'settings') {
            for (const frame of frames) assert.equal(frame.border, 'rgba(0, 0, 0, 0)', `FRAME_NOT_TRANSPARENT:${key}:${frame.cls}`);
          }
          const decoration = [];
          for (const check of decorativeChecks) {
            const items = await page.locator(check.selector).evaluateAll((es, properties) => es.filter(e => e.getBoundingClientRect().width > 0).map(e => ({ cls: e.className, colors: Object.fromEntries(properties.map(p => [p, getComputedStyle(e)[p]])) })), check.properties);
            for (const item of items) for (const color of Object.values(item.colors)) assert.equal(color, 'rgba(0, 0, 0, 0)', `DECORATIVE_LINE_REMAINS:${key}:${item.cls}`);
            decoration.push({ selector: check.selector, count: items.length });
          }
          if (['live', 'signal', 'statistics'].includes(name)) {
            const pseudoLines = await page.locator('.match-row .market-cell,.match-row .signal-cell').evaluateAll(es => es.filter(e => e.getBoundingClientRect().width > 0).map(e => getComputedStyle(e, e.matches('.market-cell') ? '::before' : '::after').backgroundColor));
            assert(pseudoLines.every(c => c === 'rgba(0, 0, 0, 0)'), `ORNAMENTAL_COLUMN_DIVIDER_REMAINS:${key}`);
            // Query and sample in one DOM turn: live refreshes can detach locator handles.
            const signalDividers = await page.evaluate(() => [...document.querySelectorAll('.feature-signal-divider')].map(e => ({ color: getComputedStyle(e).backgroundColor, connected: e.isConnected, scoped: Boolean(e.closest('.workspace.singlepage')), html: e.outerHTML, parentClass: e.parentElement?.className })));
            if (!signalDividers.every(e => e.color === 'rgba(0, 0, 0, 0)')) writeFileSync(`${audit}/${key}-signal-divider-failure.json`, JSON.stringify(signalDividers, null, 2));
            assert(signalDividers.every(e => e.color === 'rgba(0, 0, 0, 0)'), `ORNAMENTAL_SIGNAL_DIVIDER_REMAINS:${key}`);
            const surface = await page.locator('.workspace-stable-head').evaluate(e => getComputedStyle(e).backgroundImage);
            assert(surface.includes('linear-gradient'), `HEADER_SURFACE_MISSING:${key}`);
            // Compare keyboard focus with and without the preview stylesheet in one page state.
            const focusTarget = page.locator('[data-theme-toggle]');
            await page.keyboard.press('Tab');
            await focusTarget.focus();
            const focused = () => focusTarget.evaluate(e => ({ outline: getComputedStyle(e).outline, offset: getComputedStyle(e).outlineOffset, shadow: getComputedStyle(e).boxShadow }));
            const focusAfter = await focused();
            if (phase === 'preview' && !changesTheme) {
              const previewStyle = page.locator('style[data-border-preview]');
              await previewStyle.evaluate(e => { e.disabled = true; });
              assert.equal(canonical(await focused()), canonical(focusAfter), `FOCUS_STYLE_CHANGED:${key}`);
              await previewStyle.evaluate(e => { e.disabled = false; });
            }
            assert(!focusAfter.outline.includes('0px') && !focusAfter.outline.includes('none'), `KEYBOARD_FOCUS_NOT_VISIBLE:${key}`);
          }
          const images = await page.locator('img').evaluateAll(es => es.filter(e => e.getBoundingClientRect().width > 0).map(e => ({ src: e.src, loaded: e.complete && e.naturalWidth > 0 })));
          await page.evaluate(() => document.activeElement?.blur());
          await page.mouse.move(width - 5, height - 5);
          await page.screenshot({ path: `${audit}/screenshots/${key}-after.png` });
          const footer = page.locator('#b46-site-footer-v1,.site-footer').first();
          if (await footer.count()) {
            await footer.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${audit}/screenshots/${key}-footer.png` });
          }
          assert.equal(errors.length, 0, `UI_PAGE_ERRORS:${key}:${errors.join(';')}`);
          rows.push({ name, size, theme, actualView: await page.evaluate(() => document.body.dataset.workspaceView || document.body.dataset.page || 'information'), effectiveTheme: await page.evaluate(() => document.documentElement.dataset.theme || 'fixed-theme'), geometryUnchanged: true, decorativeLinesRemoved: true, logoBefore, logoAfter, clocks, matchRows: await page.locator('.match-row').count(), frames, decoration, images, backgrounds, pageErrors: errors });
          page.off('pageerror', listener);
        }
        await context.close();
      }
    }
  } finally { await browser.close(); }
  writeFileSync(`${audit}/ui-${phase}.json`, JSON.stringify(rows, null, 2));
  assert.equal(rows.length, 8 * auditPages.length, 'UI_MATRIX_INCOMPLETE');
  console.log(`UI_${phase.toUpperCase()}_PASS cases=${rows.length}`);
  return rows;
}

let base, expectedModules, ourCandidate;
async function isOurVersion(id) {
  const candidate = await version(id);
  const list = candidate.modules.map(m => ({ name: m.name, type: m.content_type, sha: sha(Buffer.from(m.content_base64, 'base64')) })).sort((a, b) => a.name.localeCompare(b.name));
  return candidate.main_module === expectedModules.main && canonical(list) === canonical(expectedModules.list);
}

async function rollback() {
  const now = await active();
  if (now === base) { report.rollback = { status: 'base-still-active', version: base }; return; }
  // Ownership requires all uploaded module hashes, never just the newest version.
  if (!expectedModules || !await isOurVersion(now)) { report.rollback = { status: 'skipped-foreign-deployment', version: now }; return; }
  await api(`/scripts/${script}/deployments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: base, percentage: 100 }], annotations: { 'workers/message': `Rollback decorative border verification ${runTag}` } }) });
  assert.equal(await active(), base, 'ROLLBACK_NOT_CONFIRMED');
  report.rollback = { status: 'confirmed', version: base };
  console.log(`ROLLBACK_CONFIRMED=${base}`);
}

try {
  base = await active();
  report.baseVersion = base;
  if (report.publish) {
    assert(env.EXPECTED_BASE_VERSION, 'REVIEWED_BASE_VERSION_REQUIRED');
    assert.equal(base, env.EXPECTED_BASE_VERSION, 'PRODUCTION_CHANGED_SINCE_PREVIEW');
  }
  const original = await version(base);
  const settingsBefore = await api(`/scripts/${script}/settings`);
  report.configBeforeSha = sha(canonical(settingsBefore));
  report.backendBefore = await backend();
  const main = original.modules.find(m => m.name === original.main_module);
  assert(main, 'MAIN_MODULE_NOT_FOUND');
  const source = Buffer.from(main.content_base64, 'base64').toString('utf8');
  const themeScript = (await publicFile(themeScriptRoute, 'javascript')).toString('utf8');
  const result = patch(source, { themeScript });
  const bg = constants(source).get('__B46_SCOREBAR_BG_B64__')?.value;
  assert(bg && Object.keys(bg).length, 'SCOREBAR_IMAGES_MISSING');
  const states = ['win', 'loss', 'draw', 'pending'];
  for (const state of states) assert(Object.keys(bg).some(k => new RegExp(`^/scorebar-${state}-.*\\.webp$`).test(k)), `IMAGE_STATE_MISSING:${state}`);
  const protectedFiles = new Map();
  for (const path of ['/index.html', '/settings.html', '/about.html', '/signal.html', '/statistics.html', ...'information user-guide methodology privacy terms disclaimer affiliate-disclosure responsible-gambling cookies contact'.split(' ').map(n => `/${n}.html`)]) {
    const bytes = await publicFile(path, 'html');
    protectedFiles.set(path, sha(bytes));
    for (const ref of references(bytes.toString())) {
      if (targets.some(t => t.route === new URL(ref, origin).pathname) || protectedFiles.has(ref)) continue;
      protectedFiles.set(ref, sha(await publicFile(ref)));
    }
  }
  for (const [path, b64] of Object.entries(bg)) {
    const want = sha(Buffer.from(b64, 'base64'));
    assert.equal(sha(await publicFile(path, 'image/')), want, `CURRENT_IMAGE_MISMATCH:${path}`);
    protectedFiles.set(path, want);
  }
  for (const change of result.changes) {
    assert.equal(sha(await publicFile(change.route, change.type)), change.beforeSha, `SOURCE_NOT_PUBLIC:${change.route}`);
    const stem = change.route.slice(1);
    writeFileSync(`${audit}/css/before-${stem}`, change.before);
    writeFileSync(`${audit}/css/after-${stem}`, change.after);
  }
  report.presentation = result.changes.map(({ route, beforeSha, afterSha }) => ({ route, beforeSha, afterSha }));
  report.nonCssCodeSha = result.codeSha;
  report.protectedFiles = Object.fromEntries(protectedFiles);
  expectedModules = {
    main: original.main_module,
    list: original.modules.map(m => ({ name: m.name, type: m.content_type, sha: m.name === original.main_module ? sha(result.after) : sha(Buffer.from(m.content_base64, 'base64')) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
  report.moduleManifest = expectedModules.list;
  save();
  await uiCheck(result.changes, 'preview');
  assert.equal(await active(), base, 'ABORT_CONCURRENT_DEPLOY_AFTER_PREVIEW');
  if (!report.publish) {
    report.result = 'PREVIEW_SUCCESS_NO_DEPLOY';
    report.finalVersion = base;
  } else {
    assert.equal(canonical(await api(`/scripts/${script}/settings`)), canonical(settingsBefore), 'CONFIG_CHANGED_BEFORE_DEPLOY');
    assert.equal(await active(), base, 'ABORT_CONCURRENT_DEPLOY');
    const form = new FormData();
    form.set('metadata', new Blob([JSON.stringify({ main_module: original.main_module })], { type: 'application/json' }));
    for (const module of original.modules) {
      const bytes = module.name === original.main_module ? Buffer.from(result.after) : Buffer.from(module.content_base64, 'base64');
      form.set(module.name, new Blob([bytes], { type: module.content_type }), module.name);
    }
    // The content-only API keeps bindings/settings/assets. Guard errors from upload onward.
    try {
      await api(`/scripts/${script}/content`, { method: 'PUT', body: form });
      for (let n = 0; n < 25; n++) {
        const id = await active();
        if (id !== base) { assert(await isOurVersion(id), 'FOREIGN_CANDIDATE'); ourCandidate = id; break; }
        await delay(2000);
      }
      assert(ourCandidate, 'NO_OWNED_CANDIDATE');
      report.candidateVersion = ourCandidate;
      save();
      for (const change of result.changes) {
        let ok = false;
        for (let n = 0; n < 20; n++) {
          if (sha(await publicFile(change.route, change.type)) === change.afterSha) { ok = true; break; }
          await delay(2000);
        }
        assert(ok, `PUBLIC_PRESENTATION_MISMATCH:${change.route}`);
      }
      for (const [path, want] of protectedFiles) assert.equal(sha(await publicFile(path)), want, `PROTECTED_ASSET_CHANGED:${path}`);
      report.backendAfter = await backend();
      assert.equal(canonical(report.backendAfter), canonical(report.backendBefore), 'BACKEND_REVISION_CHANGED');
      report.configAfterSha = sha(canonical(await api(`/scripts/${script}/settings`)));
      assert.equal(report.configAfterSha, report.configBeforeSha, 'WORKER_CONFIG_CHANGED');
      assert(await isOurVersion(ourCandidate), 'CANDIDATE_MODULES_CHANGED');
      await uiCheck(result.changes, 'production');
      assert.equal(await active(), ourCandidate, 'FINAL_PRODUCTION_CHANGED');
      report.finalVersion = ourCandidate;
      report.result = 'SUCCESS';
      report.fourImagesUnchanged = true;
      report.apiSignalOddsStatisticsUnchanged = true;
      console.log(`FINAL_PRODUCTION=${ourCandidate}`);
    } catch (error) {
      try { await rollback(); } catch (rb) { report.rollbackError = rb.message; console.error('ROLLBACK_FAILED:' + rb.message); }
      throw error;
    }
  }
  report.completedAt = new Date().toISOString();
  save();
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## Ball46 compact transparent theme control\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nScope: ${report.scope}.\n`);
  console.log(report.result);
} catch (error) {
  report.result = 'FAIL';
  report.error = error.message;
  save();
  console.error(error.stack);
  process.exitCode = 1;
}
