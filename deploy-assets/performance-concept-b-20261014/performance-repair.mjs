import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from 'acorn';
import puppeteer from 'puppeteer-core';
import { activeVersion, getVersion, api, script, sha, canonical, publicFile, origin, backend } from '../daily-performance-20261005/production.mjs';
import { schedules } from '../daily-performance-20261005/rail.mjs';

const MARK = 'B46_DAILY_PERFORMANCE_READ_FIX_20261014';
const report = { run: process.env.GITHUB_RUN_ID, worker: script, scope: 'Repair Daily Performance pagination timestamp comparison only. Reuse all existing static assets. No Engine, API, database, calculation, Member, route, binding or schedule change.' };
mkdirSync('audit', { recursive: true });
const save = () => writeFileSync('audit/performance-repair.json', JSON.stringify(report, null, 2));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let base;
let candidate;
let activated = false;

const shim = String.raw`
/* B46_DAILY_PERFORMANCE_READ_FIX_20261014: retain the current asset namespace and repair only the card's page signature. */
const __B46_PERF_READ_ORIGINAL_NOSTORE_20261014__ = noStoreUiAsset;
noStoreUiAsset = async function(request, env) {
  const response = await __B46_PERF_READ_ORIGINAL_NOSTORE_20261014__(request, env);
  if (new URL(request.url).pathname !== '/index.html' || !response.ok) return response;
  const html = await response.text();
  const startMarker = '<script id="b46-daily-performance-runtime">';
  const start = html.indexOf(startMarker);
  const end = start < 0 ? -1 : html.indexOf('</script>', start);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  if (start < 0 || end < 0) {
    headers.set('x-ball46-performance-read-fix', 'source-mismatch');
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }
  const runtime = html.slice(start + startMarker.length, end);
  const tokens = [',st.ledgerUpdatedAt', ',page.ledgerUpdatedAt'];
  if (!tokens.every(token => runtime.split(token).length - 1 === 1)) {
    headers.set('x-ball46-performance-read-fix', 'source-mismatch');
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }
  const fixed = runtime.replace(tokens[0], '').replace(tokens[1], '');
  const body = html.slice(0, start + startMarker.length) + fixed + html.slice(end);
  headers.set('x-ball46-performance-read-fix', 'B46_DAILY_PERFORMANCE_READ_FIX_20261014');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
};
`;

function patchHtml(html) {
  const startMarker = '<script id="b46-daily-performance-runtime">';
  const start = html.indexOf(startMarker);
  const end = html.indexOf('</script>', start);
  assert(start >= 0 && end > start, 'CARD_RUNTIME_MISSING');
  const runtime = html.slice(start + startMarker.length, end);
  for (const token of [',st.ledgerUpdatedAt', ',page.ledgerUpdatedAt']) assert.equal(runtime.split(token).length - 1, 1, 'TIMESTAMP_GUARD_ANCHOR:' + token);
  const fixed = runtime.replace(',st.ledgerUpdatedAt', '').replace(',page.ledgerUpdatedAt', '');
  const beforeRefresh = runtime.split('\n').find(line => line.startsWith('async function refresh()'));
  const afterRefresh = fixed.split('\n').find(line => line.startsWith('async function refresh()'));
  assert.equal(runtime.replace(beforeRefresh, afterRefresh), fixed, 'NON_LOADER_LOGIC_CHANGED');
  const pure = runtime.slice(runtime.indexOf('function parts(ms)'), runtime.indexOf('function text(r,s,v)'));
  assert(pure.includes('function aggregate(rows)') && pure.includes('function avgOdds(b)'), 'CALCULATION_ANCHOR_MISSING');
  return { html: html.slice(0, start + startMarker.length) + fixed + html.slice(end), runtime, fixed, pure };
}

async function readLedger(baseOrigin = origin) {
  const load = async cursor => {
    const path = '/api/engine/statistics?paged=1' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '') + '&repairVerify=' + Date.now();
    const response = await fetch(new URL(path, baseOrigin), { signal: AbortSignal.timeout(45000) });
    assert(response.ok, 'STATISTICS_HTTP:' + response.status);
    const page = await response.json();
    assert(page.ok === true && Array.isArray(page.rows), 'STATISTICS_PAGE_SHAPE');
    return page;
  };
  const first = await load();
  const fields = ['ledgerTotal', 'total', 'pending', 'unresolved', 'win', 'loss', 'push', 'halfWin', 'halfLoss'];
  const sig = page => JSON.stringify(fields.map(key => page[key]));
  const rows = [...first.rows];
  const cursors = new Set();
  const stamps = [first.ledgerUpdatedAt];
  let cursor = first.nextCursor;
  while (cursor) {
    assert(!cursors.has(cursor), 'STATISTICS_CURSOR_CYCLE');
    cursors.add(cursor);
    const page = await load(cursor);
    assert.equal(sig(page), sig(first), 'REAL_STATISTICS_COUNTS_CHANGED');
    rows.push(...page.rows);
    stamps.push(page.ledgerUpdatedAt);
    cursor = page.nextCursor;
  }
  assert.equal(rows.length, first.ledgerTotal, 'STATISTICS_LEDGER_INCOMPLETE');
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'STATISTICS_DUPLICATE_IDS');
  return { rows, stamps, meta: Object.fromEntries(fields.map(key => [key, first[key]])) };
}

function expectedCard(pure, rows) {
  return runInNewContext(pure + '\n(()=>{const d=aggregate(rows);return {today:{date:d.tk,win:String(d.today.win),loss:String(d.today.loss),push:String(d.today.push),pending:String(d.today.pending),rate:rate(d.today),avg:avgOdds(d.today)},yesterday:{date:d.yk,win:String(d.yesterday.win),loss:String(d.yesterday.loss),push:String(d.yesterday.push),rate:rate(d.yesterday),avg:avgOdds(d.yesterday)}}})()', { Intl, Date, Set, Number, String, JSON, TZ: 'Europe/London', CUT: 6, rows }, { timeout: 10000 });
}

async function bytesAt(baseOrigin, path) {
  const url = new URL('/' + path, baseOrigin);
  url.searchParams.set('repairBytes', process.env.GITHUB_RUN_ID + '-' + Date.now());
  const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { 'Cache-Control': 'no-cache' } });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, sha: sha(bytes), size: bytes.length };
}

async function protectAssets(html) {
  // The older path list extends comparison coverage only. It never defines an upload.
  const paths = new Set(readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt', 'utf8').trim().split(/\r?\n/));
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const url = new URL(match[1], origin);
    if (url.origin === origin && /\.(js|css)$/.test(url.pathname)) paths.add(url.pathname.slice(1));
  }
  paths.delete('index.html');
  const records = {};
  const queue = [...paths];
  for (let i = 0; i < queue.length; i += 6) {
    const batch = queue.slice(i, i + 6);
    const results = await Promise.allSettled(batch.map(path => bytesAt(origin, path)));
    results.forEach((result, offset) => {
      assert.equal(result.status, 'fulfilled', 'BASELINE_ASSET_READ_FAILED:' + batch[offset]);
      records[batch[offset]] = result.value;
    });
  }
  assert.equal(records['dashboard-v2-stage3-featured-facts-20261013a.js']?.status, 200, 'PRIMARY_MATCH_RENDERER_NOT_PRESENT');
  assert.equal(records['featured-facts-premium-20261013a.css']?.status, 200, 'CURRENT_MATCH_STYLE_NOT_PRESENT');
  return records;
}

async function verifyAssets(baseOrigin, records) {
  const entries = Object.entries(records);
  for (let i = 0; i < entries.length; i += 6) {
    const batch = entries.slice(i, i + 6);
    const results = await Promise.allSettled(batch.map(([path]) => bytesAt(baseOrigin, path)));
    results.forEach((result, offset) => {
      const [path, expected] = batch[offset];
      assert.equal(result.status, 'fulfilled', 'ASSET_READ_FAILED:' + path);
      assert.equal(canonical(result.value), canonical(expected), 'ASSET_CHANGED:' + path);
    });
  }
}

async function verifyBrowser(baseOrigin, label, expected, fullChecks) {
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  assert(executablePath, 'CHROME_MISSING');
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setCacheEnabled(false);
    await page.goto(baseOrigin + '/?performanceRepair=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => document.querySelectorAll('.match-row[data-match-id]').length > 0, { timeout: 60000 });
    await page.waitForFunction(exp => {
      const text = selector => document.querySelector(selector)?.textContent?.trim();
      return text('[data-b46-stat="yesterday-win"]') === exp.win && text('[data-b46-stat="yesterday-loss"]') === exp.loss && text('[data-b46-stat="yesterday-push"]') === exp.push;
    }, { timeout: 90000 }, expected.yesterday);
    const themes = {};
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await delay(300);
      const snapshot = await page.evaluate(() => {
        const card = document.querySelector('#ball46-daily-performance');
        const text = selector => document.querySelector(selector)?.textContent?.trim();
        return { cardDisplay: card ? getComputedStyle(card).display : null, matchRows: document.querySelectorAll('.match-row[data-match-id]').length, headings: [...document.querySelectorAll('.status-section h2, .match-group h2, h2')].map(node => node.textContent.trim()).slice(0,8), today: { win: text('[data-b46-stat="today-win"]'), loss: text('[data-b46-stat="today-loss"]'), push: text('[data-b46-stat="today-push"]'), pending: text('[data-b46-stat="today-pending"]'), rate: text('[data-b46-rate="today"]'), avg: text('[data-b46-avg-odds="today"]') }, yesterday: { win: text('[data-b46-stat="yesterday-win"]'), loss: text('[data-b46-stat="yesterday-loss"]'), push: text('[data-b46-stat="yesterday-push"]'), rate: text('[data-b46-rate="yesterday"]'), avg: text('[data-b46-avg-odds="yesterday"]') } };
      });
      assert(snapshot.matchRows > 0, label + ':MATCH_BOARD_BLANK');
      assert.equal(snapshot.cardDisplay, 'block', label + ':CARD_HIDDEN');
      for (const key of ['win', 'loss', 'push', 'rate', 'avg']) assert.equal(snapshot.yesterday[key], expected.yesterday[key], label + ':YESTERDAY_' + key);
      await page.screenshot({ path: 'audit/' + label + '-' + theme + '.png', fullPage: false });
      themes[theme] = snapshot;
    }
    const extra = {};
    if (fullChecks) {
      const firstMatch = await page.$('.match-row[data-match-id]');
      await firstMatch.click();
      await page.waitForSelector('.match-expanded, .expanded-match, .full-market, .full-market-panel', { timeout: 15000 }).catch(() => {});
      extra.expandedContent = await page.evaluate(() => document.body.textContent.includes('EVENT FLOW') && document.body.textContent.includes('FULL MARKET'));
      assert(extra.expandedContent, 'LIVE_MATCH_DETAILS_MISSING');
      await page.goto(baseOrigin + '/?view=statistics&performanceRepair=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => document.querySelectorAll('[data-sp-table-body] tr').length > 0 || [...document.querySelectorAll('table tbody tr')].some(row => /WIN|LOSS|PUSH|PENDING/.test(row.textContent)), { timeout: 90000 });
      extra.statisticsRowsVisible = await page.evaluate(() => [...document.querySelectorAll('tr')].filter(row => /WIN|LOSS|PUSH|PENDING/.test(row.textContent)).length);
      assert(extra.statisticsRowsVisible > 0, 'LIVE_STATISTICS_HISTORY_BLANK');
      await page.setViewport({ width: 390, height: 844 });
      await page.goto(baseOrigin + '/?performanceRepairMobile=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => document.querySelectorAll('.match-row[data-match-id]').length > 0, { timeout: 60000 });
      extra.mobileMatchRows = await page.evaluate(() => document.querySelectorAll('.match-row[data-match-id]').length);
      await page.screenshot({ path: 'audit/' + label + '-mobile.png', fullPage: false });
    }
    assert.equal(errors.length, 0, label + ':BROWSER_SCRIPT_ERROR:' + errors.join('|'));
    return { themes, extra, pageErrors: errors };
  } finally { await browser.close(); }
}

async function rollback() {
  if (!activated) return;
  assert.equal(await activeVersion(), candidate, 'PRODUCTION_MOVED_DO_NOT_ROLLBACK_OTHER_CHANGE');
  await api('/scripts/' + script + '/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: base, percentage: 100 }], annotations: { 'workers/message': 'Rollback unsuccessful Daily Performance loader repair' } }) });
  assert.equal(await activeVersion(), base, 'ROLLBACK_NOT_CONFIRMED');
  report.rollback = { version: base, at: new Date().toISOString() };
  save();
}

try {
  base = await activeVersion();
  report.beforeVersion = base;
  assert.equal(base, '7d65162c-b693-4d01-9860-c7973c76b2af', 'ACTIVE_VERSION_MOVED_SINCE_SCOUT');
  const current = await getVersion(base);
  const main = current.modules.find(module => module.name === current.main_module);
  const source = Buffer.from(main.content_base64, 'base64').toString('utf8');
  assert(!source.includes(MARK), 'READ_FIX_ALREADY_PRESENT');
  assert.equal(sha(source), 'ddfc09cc46e8963a21d9e76e146b936f5243e50860693545d9569104c2a099cc', 'ACTIVE_MAIN_CHANGED_SINCE_SCOUT');
  const patchedSource = source + '\n' + shim;
  parse(patchedSource, { ecmaVersion: 'latest', sourceType: 'module' });
  const htmlBefore = (await publicFile('/index.html')).toString('utf8');
  const patch = patchHtml(htmlBefore);
  report.build = { parsed: true, originalSourceSha: sha(source), patchedSourceSha: sha(patchedSource), originalHtmlSha: sha(htmlBefore), patchedHtmlSha: sha(patch.html), calculationSha: sha(patch.pure) };
  const settingsBefore = canonical(await api('/scripts/' + script + '/settings'));
  const cronsBefore = await schedules();
  report.backendBefore = await backend();
  const ledgerBefore = await readLedger();
  report.ledgerBefore = { ...ledgerBefore.meta, rows: ledgerBefore.rows.length, pages: ledgerBefore.stamps.length, timestampOnlyDrift: new Set(ledgerBefore.stamps).size > 1 };
  const expected = expectedCard(patch.pure, ledgerBefore.rows);
  report.expectedCard = expected;
  const protectedAssets = await protectAssets(htmlBefore);
  report.protectedAssets = protectedAssets;
  save();

  const sandbox = { Request, Response, Headers, URL, atob, console };
  runInNewContext(patchedSource.replace('export default ', 'globalThis.worker = '), sandbox, { timeout: 10000 });
  const simulated = await sandbox.worker.fetch(new Request(origin + '/'), { ASSETS: { fetch: async () => new Response(htmlBefore, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } }, {});
  assert.equal(sha(await simulated.text()), sha(patch.html), 'WORKER_SHIM_CHANGED_MORE_THAN_CARD_LOADER');
  report.build.exactResponsePatchVerified = true;
  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_BEFORE_UPLOAD');

  assert(current.bindings.every(binding => ['assets', 'service'].includes(binding.type)), 'UNEXPECTED_BINDING_TYPE');
  // The Workers API accepts an exact version for inherited bindings. The legacy
  // Scripts API keep_assets flag would reuse the most recently uploaded assets.
  const metadata = {
    main_module: current.main_module,
    compatibility_date: current.compatibility_date,
    compatibility_flags: current.compatibility_flags || [],
    bindings: current.bindings.map(binding => binding.type === 'assets'
      ? { name: binding.name, type: 'inherit', version_id: base } : binding),
    assets: { config: current.assets.config },
    annotations: { 'workers/message': 'Repair Daily Performance loader; inherit assets from exact active version', 'workers/tag': MARK },
    modules: current.modules.map(module => ({
      name: module.name, content_type: module.content_type,
      content_base64: module.name === current.main_module ? Buffer.from(patchedSource).toString('base64') : module.content_base64
    }))
  };
  const uploaded = await api('/workers/' + script + '/versions?deploy=false', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata)
  });
  candidate = uploaded.id;
  assert(candidate && candidate !== base, 'CANDIDATE_VERSION_MISSING');
  report.candidateVersion = candidate;
  save();
  const previewVersion = await getVersion(candidate);
  assert.equal(canonical(previewVersion.bindings), canonical(current.bindings), 'CANDIDATE_BINDINGS_CHANGED');
  assert.equal(canonical(previewVersion.assets?.config), canonical(current.assets.config), 'CANDIDATE_ASSET_CONFIG_CHANGED');
  assert.equal(previewVersion.compatibility_date, current.compatibility_date, 'CANDIDATE_COMPATIBILITY_CHANGED');
  for (const module of current.modules.filter(module => module.name !== current.main_module)) {
    const next = previewVersion.modules.find(value => value.name === module.name);
    assert(next && next.content_base64 === module.content_base64, 'NON_MAIN_MODULE_CHANGED:' + module.name);
  }
  const previewOrigin = previewVersion.urls?.[0];
  assert(previewOrigin?.startsWith('https://' + candidate.slice(0,8) + '-' + script + '.'), 'VERSION_PREVIEW_URL_MISSING');
  const previewHtml = await fetch(previewOrigin + '/?repairPreview=' + Date.now(), { signal: AbortSignal.timeout(45000) }).then(response => response.text());
  assert.equal(sha(previewHtml), sha(patch.html), 'CANDIDATE_DID_NOT_RETAIN_ACTIVE_ASSET_NAMESPACE');
  await verifyAssets(previewOrigin, protectedAssets);
  report.preview = await verifyBrowser(previewOrigin, 'preview', expected, false);
  save();

  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_BEFORE_ACTIVATION');
  assert.equal(canonical(await api('/scripts/' + script + '/settings')), settingsBefore, 'SETTINGS_MOVED_BEFORE_ACTIVATION');
  await api('/scripts/' + script + '/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: candidate, percentage: 100 }], annotations: { 'workers/message': 'Verified Daily Performance loader repair only' } }) });
  activated = true;
  assert.equal(await activeVersion(), candidate, 'CANDIDATE_NOT_ACTIVE');
  report.afterVersion = candidate;
  save();
  for (let attempt = 0; attempt < 20; attempt++) {
    if (sha(await publicFile('/index.html')) === sha(patch.html)) break;
    if (attempt === 19) throw new Error('PUBLIC_HTML_DID_NOT_PROPAGATE');
    await delay(1000);
  }
  await verifyAssets(origin, protectedAssets);
  report.production = await verifyBrowser(origin, 'production', expected, true);
  assert.equal(canonical(await api('/scripts/' + script + '/settings')), settingsBefore, 'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()), canonical(cronsBefore), 'SCHEDULES_CHANGED');
  report.backendAfter = await backend();
  assert.equal(canonical(report.backendAfter), canonical(report.backendBefore), 'BACKEND_REVISION_CHANGED');
  const ledgerAfter = await readLedger();
  const immutable = row => canonical([row.id, row.result, row.status, row.createdAt, row.fixtureId, row.market, row.selection, row.line, row.odds]);
  const afterMap = new Map(ledgerAfter.rows.map(row => [row.id, row]));
  const settled = ledgerBefore.rows.filter(row => String(row.status).toUpperCase() === 'SETTLED');
  for (const row of settled) assert.equal(immutable(afterMap.get(row.id)), immutable(row), 'SETTLED_RECORD_CHANGED:' + row.id);
  report.settledRecordsPreserved = settled.length;
  report.ledgerAfter = { ...ledgerAfter.meta, rows: ledgerAfter.rows.length };
  assert.equal(await activeVersion(), candidate, 'PRODUCTION_MOVED_DURING_VERIFICATION');
  report.result = 'SUCCESS';
  report.completedAt = new Date().toISOString();
  save();
  console.log('PERFORMANCE_REPAIR_SUCCESS ' + JSON.stringify({ run: report.run, beforeVersion: base, afterVersion: candidate, yesterday: expected.yesterday, protectedAssets: Object.keys(protectedAssets).length, settledRecordsPreserved: report.settledRecordsPreserved }));
} catch (error) {
  report.error = error.message;
  report.result = activated ? 'FAILED_ROLLBACK_REQUIRED' : 'FAILED_BEFORE_ACTIVATION';
  save();
  try { await rollback(); } catch (rollbackError) { report.rollbackError = rollbackError.message; save(); }
  console.error(error.stack);
  process.exitCode = 1;
}

