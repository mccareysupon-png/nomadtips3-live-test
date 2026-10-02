import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { parse as parseHtml } from 'parse5';
import { chromium } from 'playwright';
import { patch, constants, targets, sha } from './patch.mjs';

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
const report = { runTag, startedAt: new Date().toISOString(), publish: env.DEPLOY_ENABLED === 'true', scope: 'Three existing CSS literals only; no routes, renderer, settings, assets binding or image changes' };
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
const geometrySelectors = '.workspace-scorebar-slot,.workspace-scorebar-grid,.workspace-scorebar-cell,.event-flow,.event-flow-line,.pitch,.timeline,.match-row.active,input,select,button';

async function uiCheck(changes, phase) {
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const [size, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1100], ['mobile', 390, 844]]) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
        await context.addInitScript(theme => { localStorage.setItem('nomad343_dashboard_theme_v1', theme); }, theme);
        const page = await context.newPage();
        // Owner Settings is observed only: never allow a write request during QA.
        await page.route('**/api/**', async route => {
          if (!['GET', 'HEAD'].includes(route.request().method())) return route.abort('blockedbyclient');
          return route.continue();
        });
        for (const [name, path] of pages) {
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
          const sample = () => page.evaluate(selector => ({
            text: document.querySelector('.workspace-scorebar-slot')?.textContent || '',
            geometry: [...document.querySelectorAll(selector)].slice(0, 100).map(e => {
              const r = e.getBoundingClientRect(), c = getComputedStyle(e);
              return { cls: e.className, width: r.width, height: r.height, image: c.backgroundImage, outline: c.outline, leftBorder: c.borderLeftColor, borderWidths: [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth] };
            }),
            scrollWidth: document.documentElement.scrollWidth,
          }), geometrySelectors);
          const before = await sample();
          const key = `${phase}-${name}-${size}-${theme}`;
          await page.screenshot({ path: `${audit}/screenshots/${key}-before.png` });
          if (phase === 'preview') {
            const routes = await page.locator('link[rel="stylesheet"]').evaluateAll(es => es.map(e => new URL(e.href).pathname));
            const css = changes.filter(c => routes.includes(c.route)).map(c => c.css).join('\n');
            if (css) await page.addStyleTag({ content: css });
          }
          const after = await sample();
          assert.equal(canonical(after.geometry), canonical(before.geometry), `PROTECTED_GEOMETRY_CHANGED:${key}`);
          assert(after.scrollWidth <= before.scrollWidth + 1, `NEW_HORIZONTAL_OVERFLOW:${key}`);
          await page.screenshot({ path: `${audit}/screenshots/${key}-after.png` });
          const frames = await page.locator('.rail-card:not(.workspace-scorebar-slot),.side-card:not(.workspace-scorebar-slot),.status-section,.workspace-stable-head').evaluateAll(es => es.filter(e => e.getBoundingClientRect().width > 0).map(e => ({ cls: e.className, border: getComputedStyle(e).borderTopColor })));
          if (name !== 'settings') {
            for (const frame of frames) assert.equal(frame.border, 'rgba(0, 0, 0, 0)', `FRAME_NOT_TRANSPARENT:${key}:${frame.cls}`);
          }
          const images = await page.locator('img').evaluateAll(es => es.filter(e => e.getBoundingClientRect().width > 0).map(e => ({ src: e.src, loaded: e.complete && e.naturalWidth > 0 })));
          const footer = page.locator('#b46-site-footer-v1,.site-footer').first();
          if (await footer.count()) {
            await footer.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${audit}/screenshots/${key}-footer.png` });
          }
          rows.push({ name, size, theme, effectiveTheme: await page.evaluate(() => document.documentElement.dataset.theme || 'fixed-theme'), geometryUnchanged: true, matchRows: await page.locator('.match-row').count(), frames, images, backgrounds, pageErrors: errors });
          page.off('pageerror', listener);
        }
        await context.close();
      }
    }
  } finally { await browser.close(); }
  writeFileSync(`${audit}/ui-${phase}.json`, JSON.stringify(rows, null, 2));
  assert.equal(rows.length, 30, 'UI_MATRIX_INCOMPLETE');
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
  const result = patch(source);
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
    assert.equal(sha(await publicFile(change.route, 'css')), change.beforeSha, `CSS_SOURCE_NOT_PUBLIC:${change.route}`);
    const stem = change.route.slice(1);
    writeFileSync(`${audit}/css/before-${stem}`, change.before);
    writeFileSync(`${audit}/css/after-${stem}`, change.after);
  }
  report.css = result.changes.map(({ route, beforeSha, afterSha }) => ({ route, beforeSha, afterSha }));
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
          if (sha(await publicFile(change.route, 'css')) === change.afterSha) { ok = true; break; }
          await delay(2000);
        }
        assert(ok, `PUBLIC_CSS_MISMATCH:${change.route}`);
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
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## Ball46 decorative CSS\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nScope: three existing CSS string literals; all other modules, routes, images, HTML and referenced assets protected.\n`);
  console.log(report.result);
} catch (error) {
  report.result = 'FAIL';
  report.error = error.message;
  save();
  console.error(error.stack);
  process.exitCode = 1;
}

