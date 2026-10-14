import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, origin } from '../daily-performance-20261005/production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler } from '../daily-performance-20261005/rail.mjs';

const INDEX = 'index.html';
const MARK = 'B46_PERFORMANCE_CONCEPT_B_20261014';
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

mkdirSync('audit', { recursive: true });
const report = {
  run: process.env.GITHUB_RUN_ID,
  scope: 'Daily Performance card presentation only: Concept B graph/statistics/ball background, Inter + Manrope typography, light/dark readability. No API, Engine, settlement, database, Member, binding, cron, formula, route, or data changes.'
};
const save = () => writeFileSync('audit/report.json', JSON.stringify(report, null, 2));

const conceptStyle = `
<!-- B46_PERFORMANCE_CONCEPT_B_20261014 START -->
<style id="b46-performance-concept-b-20261014">
/* B46_PERFORMANCE_CONCEPT_B_20261014
   Concept B: Graph + Statistics + Ball.
   CSS-only Daily Performance card presentation. Runtime numbers and statistics API stay untouched. */
@media(min-width:761px){
  #ball46-daily-performance,
  #ball46-daily-performance *{
    font-family:Inter,Manrope,"Segoe UI Variable","Segoe UI",Arial,sans-serif!important;
    letter-spacing:0!important;
  }
  #ball46-daily-performance{
    border-color:rgba(126,214,235,.24)!important;
    background-color:#06121a!important;
    background-image:
      radial-gradient(430px 150px at 10% -18%,rgba(103,238,168,.16),transparent 70%),
      radial-gradient(360px 150px at 92% -12%,rgba(255,214,104,.10),transparent 72%),
      radial-gradient(740px 210px at 50% 134%,rgba(34,141,104,.13),transparent 72%),
      linear-gradient(180deg,#0b1b25 0%,#06121a 52%,#040b11 100%)!important;
    box-shadow:0 12px 32px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.055)!important;
  }
  #ball46-daily-performance::before{
    background:
      linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/44px 100%,
      linear-gradient(180deg,rgba(255,255,255,.028) 1px,transparent 1px) 0 0/100% 24px,
      linear-gradient(90deg,rgba(6,18,26,.70),rgba(6,18,26,.28) 38%,rgba(6,18,26,.56))!important;
    opacity:.72!important;
  }
  #ball46-daily-performance::after{
    background:linear-gradient(90deg,transparent,rgba(103,238,168,.62),rgba(126,214,235,.34),rgba(255,214,104,.24),transparent)!important;
  }
  #ball46-daily-performance .b46-perf-side{
    position:relative!important;
    overflow:hidden!important;
  }
  #ball46-daily-performance .b46-perf-side > *{
    position:relative!important;
    z-index:1!important;
  }
  #ball46-daily-performance .b46-perf-side.today::after{
    content:""!important;
    position:absolute!important;
    inset:18px 18px 6px 18px!important;
    z-index:0!important;
    pointer-events:none!important;
    opacity:.62!important;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 620 112' preserveAspectRatio='none'%3E%3Cg fill='none'%3E%3Cpath d='M0 78 C70 57 112 86 178 54 S298 35 362 64 486 84 620 38' stroke='%2367eea8' stroke-width='2.25' stroke-linecap='round' opacity='.36'/%3E%3Cpath d='M0 94 C74 77 112 104 176 75 S300 58 362 82 486 101 620 62' stroke='%237ed6eb' stroke-width='1.35' stroke-linecap='round' opacity='.22'/%3E%3Cpath d='M0 78 C70 57 112 86 178 54 S298 35 362 64 486 84 620 38 L620 112 L0 112 Z' fill='%2367eea8' opacity='.055'/%3E%3Ccircle cx='178' cy='54' r='4' fill='%23ffd668' opacity='.34'/%3E%3Ccircle cx='362' cy='64' r='3.5' fill='%2367eea8' opacity='.30'/%3E%3Ccircle cx='620' cy='38' r='4' fill='%237ed6eb' opacity='.32'/%3E%3C/g%3E%3C/svg%3E")!important;
    background-repeat:no-repeat!important;
    background-size:100% 100%!important;
    background-position:center!important;
    -webkit-mask-image:linear-gradient(90deg,transparent,black 14%,black 86%,transparent)!important;
    mask-image:linear-gradient(90deg,transparent,black 14%,black 86%,transparent)!important;
  }
  #ball46-daily-performance .b46-perf-side.yesterday::after{
    content:""!important;
    position:absolute!important;
    width:118px!important;
    height:118px!important;
    right:-28px!important;
    top:50%!important;
    z-index:0!important;
    transform:translateY(-50%) rotate(-11deg)!important;
    pointer-events:none!important;
    opacity:.15!important;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Ccircle cx='60' cy='60' r='54' fill='none' stroke='%23ffffff' stroke-width='5' opacity='.82'/%3E%3Cpath d='M60 24 80 39 72 64 48 64 40 39Z' fill='none' stroke='%23ffffff' stroke-width='5' stroke-linejoin='round'/%3E%3Cpath d='M40 39 20 45M80 39 100 45M48 64 35 88M72 64 85 88M60 24 60 6' fill='none' stroke='%23ffffff' stroke-width='5' stroke-linecap='round' opacity='.82'/%3E%3Cpath d='M20 45 22 76 35 88M100 45 98 76 85 88M35 88 60 108 85 88' fill='none' stroke='%23ffffff' stroke-width='5' stroke-linejoin='round' opacity='.72'/%3E%3C/svg%3E")!important;
    background-repeat:no-repeat!important;
    background-size:contain!important;
    filter:drop-shadow(0 0 18px rgba(126,214,235,.22))!important;
  }
  #ball46-daily-performance .b46-perf-grid::before{
    color:#eef8f7!important;
    background:linear-gradient(90deg,rgba(103,238,168,.052),rgba(126,214,235,.024) 58%,rgba(255,214,104,.032))!important;
    font-family:Manrope,Inter,"Segoe UI",Arial,sans-serif!important;
    font-weight:850!important;
  }
  #ball46-daily-performance .b46-perf-grid::after{
    color:#93a9b7!important;
    font-family:Inter,Manrope,"Segoe UI",Arial,sans-serif!important;
  }
  #ball46-daily-performance .b46-perf-kicker{
    font-family:Manrope,Inter,"Segoe UI",Arial,sans-serif!important;
    font-weight:850!important;
    color:#f6fbff!important;
  }
  #ball46-daily-performance .b46-perf-side.today .b46-perf-kicker{
    color:#69efa9!important;
  }
  #ball46-daily-performance .b46-perf-sub{
    color:#d9e7ef!important;
    font-weight:720!important;
  }
  #ball46-daily-performance .b46-perf-rate span,
  #ball46-daily-performance .b46-perf-stat span{
    color:#9bb0bf!important;
    font-weight:820!important;
  }
  #ball46-daily-performance .b46-perf-rate strong,
  #ball46-daily-performance .b46-perf-stat strong{
    font-family:Manrope,Inter,"Segoe UI",Arial,sans-serif!important;
    text-shadow:0 1px 12px rgba(0,0,0,.24)!important;
  }
  #ball46-daily-performance .b46-perf-rate strong{
    color:#ffd668!important;
  }
  #ball46-daily-performance .b46-perf-stat{
    background:linear-gradient(180deg,rgba(255,255,255,.060),rgba(255,255,255,.018))!important;
    border-color:rgba(255,255,255,.075)!important;
  }
  #ball46-daily-performance .b46-perf-stat.win strong{color:#69efa9!important}
  #ball46-daily-performance .b46-perf-stat.loss strong{color:#ff7083!important}
  #ball46-daily-performance .b46-perf-stat.push strong{color:#f6fbff!important}
  #ball46-daily-performance .b46-perf-stat.pending strong{color:#cfdae1!important}
  #ball46-daily-performance .b46-perf-stat.avg-odds strong{color:#ffd668!important}

  html[data-theme="light"] #ball46-daily-performance{
    border-color:rgba(34,118,145,.18)!important;
    color:#142330!important;
    background-color:#f7fbff!important;
    background-image:
      radial-gradient(420px 150px at 10% -18%,rgba(38,168,112,.18),transparent 70%),
      radial-gradient(360px 150px at 92% -12%,rgba(226,165,35,.14),transparent 72%),
      radial-gradient(740px 210px at 50% 134%,rgba(42,151,120,.10),transparent 72%),
      linear-gradient(180deg,#ffffff 0%,#f4f9fc 55%,#eef5f8 100%)!important;
    box-shadow:0 11px 30px rgba(19,44,62,.13),inset 0 1px 0 rgba(255,255,255,.78)!important;
  }
  html[data-theme="light"] #ball46-daily-performance::before{
    background:
      linear-gradient(90deg,rgba(31,65,87,.060) 1px,transparent 1px) 0 0/44px 100%,
      linear-gradient(180deg,rgba(31,65,87,.050) 1px,transparent 1px) 0 0/100% 24px,
      linear-gradient(90deg,rgba(255,255,255,.70),rgba(255,255,255,.28) 38%,rgba(255,255,255,.55))!important;
    opacity:.78!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-side.yesterday::after{
    opacity:.18!important;
    filter:drop-shadow(0 0 18px rgba(32,96,120,.14)) invert(1)!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-grid::before{
    color:#173043!important;
    background:linear-gradient(90deg,rgba(39,174,116,.10),rgba(30,112,150,.045) 58%,rgba(221,158,33,.075))!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-grid::after,
  html[data-theme="light"] #ball46-daily-performance .b46-perf-rate span,
  html[data-theme="light"] #ball46-daily-performance .b46-perf-stat span{
    color:#607586!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-kicker,
  html[data-theme="light"] #ball46-daily-performance .b46-perf-side.yesterday .b46-perf-kicker{
    color:#172b3a!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-side.today .b46-perf-kicker{
    color:#118854!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-sub{
    color:#263c4d!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-rate strong{
    color:#ac7600!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-stat{
    background:linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,255,255,.36))!important;
    border-color:rgba(26,78,102,.12)!important;
  }
  html[data-theme="light"] #ball46-daily-performance .b46-perf-stat.win strong{color:#087d49!important}
  html[data-theme="light"] #ball46-daily-performance .b46-perf-stat.loss strong{color:#c7334c!important}
  html[data-theme="light"] #ball46-daily-performance .b46-perf-stat.push strong{color:#20384a!important}
  html[data-theme="light"] #ball46-daily-performance .b46-perf-stat.pending strong{color:#5f7281!important}
  html[data-theme="light"] #ball46-daily-performance .b46-perf-stat.avg-odds strong{color:#a66d00!important}
}
</style>
<!-- B46_PERFORMANCE_CONCEPT_B_20261014 END -->`;

function patchIndex(src) {
  assert(src.includes('B46_DAILY_PERFORMANCE_20261005 SCRIPT START'), 'DAILY_PERFORMANCE_RUNTIME_MISSING');
  assert(src.includes('B46_PERFORMANCE_PREMIUM_COMPACT_20261009 END'), 'PREMIUM_COMPACT_MARKER_MISSING');
  assert(!src.includes(MARK), 'CONCEPT_B_ALREADY_PATCHED');
  const anchor = '<!-- B46_PERFORMANCE_PREMIUM_COMPACT_20261009 END -->';
  return src.replace(anchor, `${anchor}\n${conceptStyle}`);
}

function contentType(path) {
  const ext = extname(path).toLowerCase();
  return ext === '.html' ? 'text/html; charset=utf-8'
    : ext === '.js' ? 'text/javascript; charset=utf-8'
    : ext === '.css' ? 'text/css; charset=utf-8'
    : ext === '.svg' ? 'image/svg+xml'
    : ext === '.json' ? 'application/json; charset=utf-8'
    : 'application/octet-stream';
}

async function startPreviewServer(staged, patchedIndex) {
  const assetsRoot = resolve(staged.runtime, 'assets');
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        const upstream = await fetch(new URL(url.pathname + url.search, origin), { signal: AbortSignal.timeout(45000) });
        const body = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
        res.end(body);
        return;
      }
      const rel = url.pathname === '/' ? INDEX : decodeURIComponent(url.pathname.slice(1));
      if (rel === INDEX) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(patchedIndex);
        return;
      }
      const target = normalize(resolve(assetsRoot, rel));
      assert(target.startsWith(assetsRoot), 'PREVIEW_PATH_ESCAPE');
      if (!existsSync(target)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'content-type': contentType(target), 'cache-control': 'no-store' });
      res.end(readFileSync(target));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(error?.stack || String(error));
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  return { server, url: `http://127.0.0.1:${port}/` };
}

function chromeExecutable() {
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].find(existsSync);
}

async function readCard(page, theme) {
  await page.evaluate(nextTheme => {
    document.documentElement.setAttribute('data-theme', nextTheme);
    try { localStorage.setItem('b46-theme', nextTheme); } catch {}
  }, theme);
  await delay(500);
  return page.evaluate(() => {
    const q = selector => document.querySelector(selector);
    const qa = selector => [...document.querySelectorAll(selector)];
    const card = q('#ball46-daily-performance');
    const cs = (element, pseudo) => element ? getComputedStyle(element, pseudo) : null;
    const rect = card?.getBoundingClientRect();
    const text = selector => q(selector)?.textContent?.trim() || '';
    const statValues = qa('#ball46-daily-performance .b46-perf-stat strong').map(node => node.textContent.trim());
    return {
      exists: Boolean(card),
      display: cs(card)?.display,
      rect: rect ? { width: rect.width, height: rect.height } : null,
      sides: qa('#ball46-daily-performance .b46-perf-side').length,
      todayStats: qa('#ball46-daily-performance .b46-perf-side.today .b46-perf-stat').length,
      yesterdayStats: qa('#ball46-daily-performance .b46-perf-side.yesterday .b46-perf-stat').length,
      rate: text('#ball46-daily-performance [data-b46-rate="today"]'),
      statValues,
      font: cs(card)?.fontFamily || '',
      beforeBg: cs(card, '::before')?.backgroundImage || '',
      todayGraph: cs(q('#ball46-daily-performance .b46-perf-side.today'), '::after')?.backgroundImage || '',
      ballBg: cs(q('#ball46-daily-performance .b46-perf-side.yesterday'), '::after')?.backgroundImage || '',
      ballOpacity: cs(q('#ball46-daily-performance .b46-perf-side.yesterday'), '::after')?.opacity || '',
      winColor: cs(q('#ball46-daily-performance .b46-perf-stat.win strong'))?.color || '',
      lossColor: cs(q('#ball46-daily-performance .b46-perf-stat.loss strong'))?.color || '',
      rateColor: cs(q('#ball46-daily-performance .b46-perf-rate strong'))?.color || ''
    };
  });
}

function assertCard(snapshot, label) {
  assert(snapshot.exists, `${label}:CARD_MISSING`);
  assert.notEqual(snapshot.display, 'none', `${label}:CARD_HIDDEN`);
  assert(snapshot.rect?.width > 900, `${label}:CARD_WIDTH_CHANGED`);
  assert(snapshot.rect?.height >= 60 && snapshot.rect?.height <= 145, `${label}:CARD_HEIGHT_CHANGED:${snapshot.rect?.height}`);
  assert.equal(snapshot.sides, 2, `${label}:SIDE_COUNT_CHANGED`);
  assert.equal(snapshot.todayStats, 5, `${label}:TODAY_STAT_STRUCTURE_CHANGED`);
  assert.equal(snapshot.yesterdayStats, 4, `${label}:YESTERDAY_STAT_STRUCTURE_CHANGED`);
  assert(/Inter/i.test(snapshot.font) && /Manrope/i.test(snapshot.font), `${label}:FONT_STACK_MISSING`);
  assert(/linear-gradient/i.test(snapshot.beforeBg), `${label}:GRAPH_GRID_BACKGROUND_MISSING`);
  assert(/svg/i.test(snapshot.todayGraph), `${label}:GRAPH_BACKGROUND_MISSING`);
  assert(/svg/i.test(snapshot.ballBg), `${label}:BALL_BACKGROUND_MISSING`);
  assert(Number(snapshot.ballOpacity) > 0, `${label}:BALL_NOT_VISIBLE`);
  assert(snapshot.statValues.some(value => value && value !== '—'), `${label}:LIVE_STAT_VALUES_NOT_RENDERED`);
  assert.notEqual(snapshot.winColor, snapshot.lossColor, `${label}:WIN_LOSS_COLORS_COLLAPSED`);
  assert(snapshot.rateColor, `${label}:RATE_COLOR_MISSING`);
}

async function previewBothThemes(staged, patchedIndex) {
  const exe = chromeExecutable();
  assert(exe, 'NO_CHROME');
  const { server, url } = await startPreviewServer(staged, patchedIndex);
  const browser = await puppeteer.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.goto(`${url}?conceptBPreview=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForSelector('#ball46-daily-performance .b46-perf-stat strong', { timeout: 30000 });
    await delay(3500);
    const previews = {};
    for (const theme of ['dark', 'light']) {
      const snapshot = await readCard(page, theme);
      assertCard(snapshot, `PREVIEW_${theme.toUpperCase()}`);
      await page.screenshot({ path: join('audit', `preview-${theme}.png`), clip: { x: 0, y: 0, width: 1440, height: 260 } });
      previews[theme] = snapshot;
    }
    report.preview = previews;
    save();
  } finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

async function runtimeCheck() {
  const exe = chromeExecutable();
  assert(exe, 'NO_CHROME');
  const browser = await puppeteer.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.goto(`${origin}/?conceptB=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForSelector('#ball46-daily-performance .b46-perf-stat strong', { timeout: 30000 });
    await delay(4500);
    const live = {};
    for (const theme of ['dark', 'light']) {
      const snapshot = await readCard(page, theme);
      assertCard(snapshot, `LIVE_${theme.toUpperCase()}`);
      await page.screenshot({ path: join('audit', `production-${theme}.png`), clip: { x: 0, y: 0, width: 1440, height: 260 } });
      live[theme] = snapshot;
    }
    const stats = await fetch(new URL('/api/engine/statistics?paged=1&conceptBVerify=' + Date.now(), origin), { signal: AbortSignal.timeout(45000) }).then(r => r.json());
    assert.equal(stats?.ok, true, 'LIVE_STATISTICS_NOT_OK');
    assert(Array.isArray(stats?.rows), 'LIVE_STATISTICS_ROWS_MISSING');
    report.live = {
      card: live,
      statistics: {
        ledgerTotal: stats.ledgerTotal,
        total: stats.total,
        win: stats.win,
        loss: stats.loss,
        push: stats.push,
        pending: stats.pending,
        ledgerUpdatedAt: stats.ledgerUpdatedAt
      }
    };
    save();
  } finally {
    await browser.close();
  }
}

let current = null;
let candidate = null;

async function rollback() {
  if (!current) return;
  const restoreVersion = current.restore.version;
  const active = await activeVersion();
  if (active === restoreVersion) return;
  if (candidate && active !== candidate) return;
  await api('/scripts/' + script + '/deployments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: 'percentage',
      versions: [{ version_id: restoreVersion, percentage: 100 }],
      annotations: { 'workers/message': 'Rollback Ball46 Performance Concept B card presentation' }
    })
  });
  assert.equal(await activeVersion(), restoreVersion, 'ROLLBACK_NOT_CONFIRMED');
  report.rollback = { restoredVersion: restoreVersion, completedAt: new Date().toISOString() };
  save();
}

try {
  current = await inspect();
  const base = current.restore.version;
  report.worker = script;
  report.baseVersion = base;
  report.restorePoint = current.restore;
  save();

  const workerSha = sha(Buffer.from(current.source));
  const settingsBefore = await api('/scripts/' + script + '/settings');
  const settingsSha = sha(canonical(settingsBefore));
  const cronsBefore = await schedules();

  const indexBytes = await publicFile('/' + INDEX);
  const index0 = indexBytes.toString('utf8');
  const index1 = patchIndex(index0);
  const patchedBytes = Buffer.from(index1);
  writeFileSync('audit/index-before.html', indexBytes);
  writeFileSync('audit/index-after.html', patchedBytes);

  const staged = await stageCurrentRail(current.version, settingsBefore, cronsBefore, current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[INDEX], sha(indexBytes), 'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets = { ...staged.hashes };
  delete protectedAssets[INDEX];
  writeFileSync(resolve(staged.runtime, 'assets', INDEX), patchedBytes);

  await previewBothThemes(staged, index1);
  wrangler(staged, true);
  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_AFTER_DRY_RUN');
  await verifyRailBase(staged);

  try {
    wrangler(staged, false);
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const active = await activeVersion();
      if (active !== base) {
        candidate = active;
        break;
      }
      await delay(1200);
    }
    assert(candidate, 'NO_NEW_VERSION');
    report.candidateVersion = candidate;
    save();

    let live = false;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      assert.equal(await activeVersion(), candidate, 'PRODUCTION_MOVED_DURING_VERIFY');
      try {
        const html = (await publicFile('/' + INDEX)).toString('utf8');
        if (html.includes(MARK)) {
          live = true;
          break;
        }
      } catch {}
      await delay(1000);
    }
    assert(live, 'CONCEPT_B_MARKER_NOT_LIVE');

    for (const [path, expected] of Object.entries(protectedAssets)) {
      assert.equal(sha(await publicFile('/' + path)), expected, 'UNRELATED_ASSET_CHANGED:' + path);
    }

    await runtimeCheck();

    const candidateVersion = await getVersion(candidate);
    const main = candidateVersion.modules.find(module => module.name === candidateVersion.main_module);
    assert(main, 'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(main.content_base64, 'base64')), workerSha, 'WORKER_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/' + script + '/settings'))), settingsSha, 'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()), canonical(cronsBefore), 'CRONS_CHANGED');

    report.finalVersion = candidate;
    report.changedAssets = [INDEX];
    report.unchangedAssetCount = Object.keys(protectedAssets).length;
    report.result = 'SUCCESS';
    report.completedAt = new Date().toISOString();
    save();
    console.log('BALL46_PERFORMANCE_CONCEPT_B_SUCCESS ' + JSON.stringify({
      worker: script,
      baseVersion: base,
      finalVersion: candidate,
      changedAssets: report.changedAssets,
      unchangedAssetCount: report.unchangedAssetCount,
      liveStatistics: report.live?.statistics
    }));
  } catch (error) {
    report.result = 'FAIL_ROLLBACK_ATTEMPTED';
    report.error = error?.message || String(error);
    try {
      await rollback();
    } catch (rollbackError) {
      report.rollbackError = rollbackError?.message || String(rollbackError);
      save();
    }
    throw error;
  }
} catch (error) {
  if (!report.result) report.result = 'FAIL_STOPPED';
  report.error = error?.message || String(error);
  save();
  console.error(error?.stack || error);
  process.exitCode = 1;
}
