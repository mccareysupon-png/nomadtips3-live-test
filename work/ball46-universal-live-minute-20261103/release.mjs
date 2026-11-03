import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { parse } from 'acorn';

const ACCOUNT = '62cb0db544160e6591342abd6b4f35cc';
const WORKER = 'ball46-production';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const MARK = 'B46_WORLDWIDE_LIVE_CLOCK_RUNTIME_20261103';
const STYLE_ID = 'b46-worldwide-live-clock-runtime-20261103';
const request = JSON.parse(await readFile('release-request.json', 'utf8'));

assert.equal(request.approved, true, 'OWNER_APPROVAL_REQUIRED');
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, 'ACCOUNT_MISMATCH');
assert(process.env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_TOKEN_MISSING');

await mkdir('audit', { recursive: true });
const report = {
  worker: WORKER,
  marker: MARK,
  run: process.env.GITHUB_RUN_ID,
  commit: process.env.GITHUB_SHA,
  startedAt: new Date().toISOString(),
  trafficChanged: false,
};
const sha = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, (key, item) => {
  if (key === 'annotations') return undefined;
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  }
  return item;
});
const save = () => writeFile('audit/result.json', JSON.stringify(report, null, 2));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cf(path, body) {
  if (body) {
    assert(
      [`/workers/scripts/${WORKER}/versions`, `/workers/scripts/${WORKER}/deployments`].includes(path),
      `WRITE_TARGET_DENIED:${path}`,
    );
  }
  const response = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const json = await response.json();
  assert(response.ok && json.success, `CLOUDFLARE_API_${response.status}:${JSON.stringify(json.errors)}`);
  return json.result;
}

async function active() {
  const deployment = (await cf(`/workers/scripts/${WORKER}/deployments?per_page=1`)).deployments[0];
  assert.equal(deployment.versions.length, 1, 'MULTI_VERSION_TRAFFIC_STOP');
  assert.equal(deployment.versions[0].percentage, 100, 'PARTIAL_TRAFFIC_STOP');
  return { version: deployment.versions[0].version_id, deployment: deployment.id };
}

async function version(id) {
  return cf(`/workers/workers/${WORKER}/versions/${id}?include=modules`);
}

async function config() {
  const [settings, schedules, domains] = await Promise.all([
    cf(`/workers/scripts/${WORKER}/settings`),
    cf(`/workers/scripts/${WORKER}/schedules`),
    cf('/workers/domains'),
  ]);
  const ownedDomains = domains.filter((item) => item.service === WORKER).sort((a, b) => a.hostname.localeCompare(b.hostname));
  assert.deepEqual(ownedDomains.map((item) => item.hostname), ['ball46.com', 'www.ball46.com'], 'DOMAIN_SCOPE_CHANGED');
  return { settings, schedules, domains: ownedDomains };
}

async function get(host, path) {
  const url = new URL(path, host);
  url.searchParams.set('b46MinuteAudit', `${process.env.GITHUB_RUN_ID}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: Object.fromEntries(response.headers), body, sha: sha(body) };
}

async function health(host) {
  const checked = [];
  for (const path of ['/api/engine/health', '/api/full-market/health', '/api/engine/board', '/api/engine/statistics?paged=1']) {
    const response = await get(host, path);
    assert.equal(response.status, 200, `HEALTH_STATUS:${path}`);
    const json = JSON.parse(response.body);
    assert.equal(json.ok, true, `HEALTH_NOT_OK:${path}`);
    if (path.endsWith('/board')) assert.equal(json.stale, false, 'BOARD_STALE');
    checked.push({ path, ok: true });
  }
  return checked;
}

const payload = `<style id="${STYLE_ID}">
/* Runtime owns the apostrophe blink so OS motion preferences cannot stop it. */
.b46-live-minute-mark,.b46gn-minute-tick,.b46-sc-mark,[data-b46-world-minute-mark]{will-change:opacity}
</style>
<script id="b46-worldwide-live-clock-script-20261103">
(()=>{'use strict';
if(window.__b46WorldwideLiveClock20261103)return;
window.__b46WorldwideLiveClock20261103=true;
const clocks='#b46gn-cards .b46gn-cardhead[data-kind="live"] .b46gn-clock,.match-row .b46-live-status-clock,.b46-sc-minute';
const marks='.b46-live-minute-mark,.b46gn-minute-tick,.b46-sc-mark,[data-b46-world-minute-mark]';
let phase=true,queued=false;
function splitClock(clock){
 if(clock.querySelector(marks))return;
 const value=String(clock.textContent||'').trim();
 if(!/\\d(?:\\+\\d{1,2})?['’′]$/.test(value))return;
 const walker=document.createTreeWalker(clock,NodeFilter.SHOW_TEXT);let node,last=null;
 while((node=walker.nextNode()))if(String(node.nodeValue||'').trim())last=node;
 if(!last)return;
 const match=String(last.nodeValue||'').match(/(['’′])(\\s*)$/);if(!match)return;
 const cut=last.nodeValue.lastIndexOf(match[1]),mark=document.createElement('span');
 last.nodeValue=last.nodeValue.slice(0,cut);mark.textContent=match[1];mark.dataset.b46WorldMinuteMark='1';last.after(mark);
}
function apply(mark){
 mark.dataset.b46WorldMinuteMark='1';
 mark.style.setProperty('animation','none','important');
 mark.style.setProperty('transition','none','important');
 mark.style.setProperty('opacity',phase?'1':'0','important');
}
function normalize(){queued=false;document.querySelectorAll(clocks).forEach(splitClock);document.querySelectorAll(marks).forEach(apply)}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(normalize)}
function paint(){phase=!phase;document.querySelectorAll(marks).forEach(apply)}
function boot(){normalize();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});setInterval(paint,500);document.addEventListener('visibilitychange',()=>{if(!document.hidden){phase=true;normalize()}})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
</script>`;

function patchHTML(html) {
  assert.equal(html.split(`id="${STYLE_ID}"`).length - 1, 0, 'STYLE_ALREADY_PRESENT');
  assert(html.includes('function b46gnLiveMinuteMarkup'), 'MOBILE_ALL_MATCHES_RENDERER_MISSING');
  assert(html.includes('b46-live-minute-mark'), 'DESKTOP_MARK_RENDERER_MISSING');
  assert(html.includes('/b46-statistics-columns-20261102.js'), 'STATISTICS_RENDERER_MISSING');
  assert.equal(html.split('</head>').length - 1, 1, 'HEAD_ANCHOR_DRIFT');
  return html.replace('</head>', `${payload}\n</head>`);
}

function patchMain(source) {
  assert(!source.includes(MARK), 'RUNTIME_ALREADY_PATCHED');
  const program = parse(source, { sourceType: 'module', ecmaVersion: 'latest' });
  const exports = program.body.filter((node) => node.type === 'ExportDefaultDeclaration');
  assert.equal(exports.length, 1, 'EXPORT_DEFAULT_COUNT');
  const node = exports[0];
  assert.equal(node.declaration.type, 'ObjectExpression', 'EXPORT_DEFAULT_NOT_OBJECT');
  const before = source.slice(0, node.start);
  const between = source.slice(node.start, node.declaration.start);
  const after = source.slice(node.declaration.start);
  assert.equal(between.trim(), 'export default', 'EXPORT_DEFAULT_DRIFT');
  const previous = `${before}const __b46WorldClockPrevious=${after}`;
  const patchFunction = patchHTML.toString()
    .replace('function patchHTML', 'function __b46WorldClockPatchHTML')
    .replaceAll('assert(', '__b46WorldClockAssert(')
    .replaceAll('assert.equal(', '__b46WorldClockAssertEqual(')
    .replaceAll('STYLE_ID', '__b46WorldClockStyleId')
    .replaceAll('payload', '__b46WorldClockPayload');
  return `${previous}\nconst __b46WorldClockMarker=${JSON.stringify(MARK)},__b46WorldClockStyleId=${JSON.stringify(STYLE_ID)},__b46WorldClockPayload=${JSON.stringify(payload)};\nconst __b46WorldClockAssert=(value,message)=>{if(!value)throw Error(message)},__b46WorldClockAssertEqual=(a,b,message)=>{if(a!==b)throw Error(message)};\n${patchFunction}\nexport default{...__b46WorldClockPrevious,async fetch(request,env,ctx){const response=await __b46WorldClockPrevious.fetch(request,env,ctx),url=new URL(request.url);if(request.method!==\"GET\"||![\"/\",\"/index.html\"].includes(url.pathname)||!response.ok||!(response.headers.get(\"content-type\")||\"\").includes(\"text/html\"))return response;const headers=new Headers(response.headers);headers.delete(\"etag\");headers.delete(\"content-length\");headers.set(\"x-b46-world-clock\",__b46WorldClockMarker);return new Response(__b46WorldClockPatchHTML(await response.text()),{status:response.status,statusText:response.statusText,headers})}};\n`;
}

async function publicInventory(host, html) {
  const paths = [...new Set([...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css|webp|svg|png)(?:\?[^"']*)?)["']/g)]
    .map((match) => new URL(match[1], host))
    .filter((url) => url.hostname === new URL(host).hostname && !url.pathname.startsWith('/cdn-cgi/'))
    .map((url) => url.pathname + url.search))];
  const rows = [];
  for (let i = 0; i < paths.length; i += 6) {
    rows.push(...await Promise.all(paths.slice(i, i + 6).map(async (path) => {
      const response = await get(host, path);
      assert.equal(response.status, 200, `PUBLIC_ASSET_MISSING:${path}`);
      return { path, status: response.status, sha: response.sha };
    })));
  }
  return rows;
}

async function assertInventory(host, expected) {
  for (let i = 0; i < expected.length; i += 6) {
    await Promise.all(expected.slice(i, i + 6).map(async (item) => {
      const response = await get(host, item.path);
      assert.equal(response.status, item.status, `PUBLIC_STATUS_CHANGED:${item.path}`);
      assert.equal(response.sha, item.sha, `UNRELATED_ASSET_CHANGED:${item.path}`);
    }));
  }
}

async function browserProof(host, candidate) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(host, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(() => {
      document.documentElement.dataset.b46gn = '1';
      const specimen = document.createElement('div');
      specimen.id = 'b46-minute-specimen';
      specimen.innerHTML = "<div id=\"b46gn-cards\"><div class=\"b46gn-cardhead\" data-kind=\"live\"><span class=\"b46gn-clock\">37'</span></div></div><span class=\"b46-live-minute-mark\">′</span><span class=\"b46-sc-mark\">′</span>";
      document.body.append(specimen);
    });
    const selectors = [
      '#b46-minute-specimen .b46gn-clock [data-b46-world-minute-mark]',
      '#b46-minute-specimen .b46-live-minute-mark',
      '#b46-minute-specimen .b46-sc-mark',
    ];
    const samples = Object.fromEntries(selectors.map((selector) => [selector, []]));
    for (let index = 0; index < 9; index++) {
      await page.waitForTimeout(180);
      const row = await page.evaluate((wanted) => Object.fromEntries(wanted.map((selector) => {
        const element = document.querySelector(selector);
        return [selector, element ? getComputedStyle(element).opacity : null];
      })), selectors);
      for (const selector of selectors) samples[selector].push(row[selector]);
    }
    for (const selector of selectors) {
      assert(!samples[selector].includes(null), `MINUTE_MARK_NOT_CREATED:${selector}`);
      assert.deepEqual([...new Set(samples[selector])].sort(), ['0', '1'], `MINUTE_MARK_NOT_BLINKING:${selector}`);
    }
    const result = await page.evaluate(() => {
      const clock = document.querySelector('#b46-minute-specimen .b46gn-clock');
      const mark = clock?.querySelector('[data-b46-world-minute-mark]');
      const actualClock = [...document.querySelectorAll('#b46gn-cards .b46gn-cardhead[data-kind="live"] .b46gn-clock')].find((item) => !item.closest('#b46-minute-specimen'));
      const actualMark = actualClock?.querySelector('.b46gn-minute-tick,[data-b46-world-minute-mark]');
      return {
        specimenText: clock?.textContent,
        specimenMark: mark?.textContent,
        specimenAnimation: mark?.style.getPropertyValue('animation'),
        actualLiveClockFound: Boolean(actualClock),
        actualLiveMarkFound: actualClock ? Boolean(actualMark) : null,
      };
    });
    assert.equal(result.specimenText, "37'", 'MOBILE_CLOCK_TEXT_CHANGED');
    assert.equal(result.specimenMark, "'", 'APOSTROPHE_SPLIT_FAILED');
    assert.equal(result.specimenAnimation, 'none', 'CSS_ANIMATION_NOT_NEUTRALIZED');
    if (result.actualLiveClockFound) assert.equal(result.actualLiveMarkFound, true, 'ACTUAL_MOBILE_LIVE_MARK_MISSING');
    assert.equal(errors.length, 0, `PAGE_ERRORS:${errors.join('|')}`);
    return { candidate, reducedMotion: 'reduce', viewport: '390x844', samples, result, pageErrors: errors };
  } finally {
    await browser.close();
  }
}

function moduleSummary(value) {
  return value.modules.map((item) => ({
    name: item.name,
    type: item.content_type,
    sha: sha(Buffer.from(item.content_base64, 'base64')),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

async function deployTraffic(to, from, message) {
  assert.equal((await active()).version, from, 'CONCURRENT_DEPLOY_STOP');
  const deployment = await cf(`/workers/scripts/${WORKER}/deployments`, {
    strategy: 'percentage',
    versions: [{ version_id: to, percentage: 100 }],
    annotations: { 'workers/message': message },
  });
  report.trafficChanged = true;
  report.trafficWrites ??= [];
  report.trafficWrites.push({ from, to, deployment: deployment.id, at: new Date().toISOString() });
}

let baseId;
let candidateId;
let switched = false;
try {
  report.before = await active();
  baseId = report.before.version;
  const base = await version(baseId);
  const configBefore = await config();
  report.configBeforeSha = sha(canonical(configBefore));
  report.baselineModules = moduleSummary(base);
  report.healthBefore = await health('https://ball46.com');

  const root = await get('https://ball46.com', '/');
  assert.equal(root.status, 200, 'BASELINE_ROOT_NOT_OK');
  const html = root.body.toString('utf8');
  assert(html.includes('id="b46-universal-live-minute-20261103"'), 'LIVE_MINUTE_FIX_NOT_PRESERVED');
  assert(html.includes('id="b46-universal-monitor-motion-20261103"'), 'MONITOR_MOTION_FIX_NOT_PRESERVED');
  assert(html.includes('function b46gnLiveMinuteMarkup'), 'MOBILE_ALL_MATCHES_RENDERER_MISSING');
  const statisticsRenderer = await get('https://ball46.com', '/b46-statistics-columns-20261102.js?v=1');
  assert.equal(statisticsRenderer.status, 200, 'STATISTICS_RENDERER_MISSING');
  assert(statisticsRenderer.body.toString('utf8').includes('b46-sc-mark'), 'STATISTICS_MARK_RENDERER_DRIFT');
  const patchedHTML = patchHTML(html);
  report.rootBeforeSha = root.sha;
  report.rootExpectedSha = sha(Buffer.from(patchedHTML));
  report.publicAssets = await publicInventory('https://ball46.com', html);

  const main = base.modules.find((item) => item.name === base.main_module);
  assert(main, 'MAIN_MODULE_MISSING');
  const originalSource = Buffer.from(main.content_base64, 'base64').toString('utf8');
  const changedSource = patchMain(originalSource);
  parse(changedSource, { sourceType: 'module', ecmaVersion: 'latest' });
  const candidateModules = base.modules.map((item) => item.name === base.main_module
    ? { ...item, content_base64: Buffer.from(changedSource).toString('base64') }
    : item);

  const metadata = {
    main_module: base.main_module,
    compatibility_date: base.compatibility_date,
    compatibility_flags: base.compatibility_flags || [],
    bindings: base.bindings.map((binding) => binding.type === 'secret_text'
      ? { name: binding.name, type: binding.type, version_id: 'latest' }
      : binding),
    keep_assets: true,
    assets: { config: base.assets.config },
    annotations: {
      'workers/tag': MARK,
      'workers/message': 'Worldwide live-minute apostrophe runtime for every renderer and device',
    },
  };
  for (const key of ['usage_model', 'logpush', 'limits', 'observability', 'placement']) {
    if (configBefore.settings[key] != null) metadata[key] = configBefore.settings[key];
  }
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  for (const item of candidateModules) {
    form.set(item.name, new Blob([Buffer.from(item.content_base64, 'base64')], { type: item.content_type }), item.name);
  }
  assert.equal((await active()).version, baseId, 'PRODUCTION_MOVED_BEFORE_UPLOAD');
  const uploaded = await cf(`/workers/scripts/${WORKER}/versions`, form);
  candidateId = uploaded.id;
  report.candidate = candidateId;
  const candidate = await version(candidateId);
  assert.equal(candidate.annotations?.['workers/tag'], MARK, 'CANDIDATE_NOT_OWNED');
  assert.deepEqual(moduleSummary(candidate), moduleSummary({ modules: candidateModules }), 'CANDIDATE_MODULES_DIFFER');
  assert.equal(canonical(candidate.bindings), canonical(base.bindings), 'BINDINGS_CHANGED');
  assert.equal((await active()).version, baseId, 'CANDIDATE_UPLOAD_CHANGED_TRAFFIC');
  const configAfterUpload = await config();
  if (sha(canonical(configAfterUpload)) !== report.configBeforeSha) {
    await writeFile('audit/config-before.json', JSON.stringify(configBefore, null, 2));
    await writeFile('audit/config-after-upload.json', JSON.stringify(configAfterUpload, null, 2));
  }
  assert.equal(sha(canonical(configAfterUpload)), report.configBeforeSha, 'CONFIG_CHANGED_AFTER_UPLOAD');

  const preview = `https://${candidateId.slice(0, 8)}-${WORKER}.mccarey-supon.workers.dev`;
  report.preview = preview;
  const previewRoot = await get(preview, '/');
  assert.equal(previewRoot.status, 200, 'PREVIEW_ROOT_NOT_OK');
  assert(previewRoot.body.toString('utf8').includes(`id="${STYLE_ID}"`), 'PREVIEW_RUNTIME_MISSING');
  assert.equal(previewRoot.sha, report.rootExpectedSha, 'PREVIEW_HTML_UNEXPECTED');
  await assertInventory(preview, report.publicAssets);
  report.previewHealth = await health(preview);
  report.browserProof = await browserProof(preview, candidateId);
  assert.equal((await active()).version, baseId, 'PRODUCTION_MOVED_DURING_PREVIEW');

  await deployTraffic(candidateId, baseId, 'Worldwide live-minute apostrophe runtime verified on mobile reduced-motion devices');
  switched = true;
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await active();
    if (current.version === candidateId) {
      const live = await get('https://ball46.com', '/');
      if (live.status === 200 && live.body.toString('utf8').includes(`id="${STYLE_ID}"`)) break;
    }
    assert(attempt < 39, 'PRODUCTION_DID_NOT_CONVERGE');
    await wait(3000);
  }
  const liveRoot = await get('https://ball46.com', '/');
  assert.equal(liveRoot.sha, report.rootExpectedSha, 'LIVE_HTML_UNEXPECTED');
  await assertInventory('https://ball46.com', report.publicAssets);
  report.healthAfter = await health('https://ball46.com');
  report.liveBrowserProof = await browserProof('https://ball46.com', candidateId);
  assert.equal(sha(canonical(await config())), report.configBeforeSha, 'CONFIG_CHANGED_AFTER_ACTIVATION');
  report.after = await active();
  assert.equal(report.after.version, candidateId, 'ACTIVE_VERSION_MISMATCH');
  report.ok = true;
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(`BALL46_WORLDWIDE_LIVE_CLOCK_PASS=${JSON.stringify({ base: baseId, candidate: candidateId, deployment: report.after.deployment })}`);
} catch (error) {
  report.ok = false;
  report.error = error.stack || error.message;
  if (switched && baseId && candidateId) {
    try {
      if ((await active()).version === candidateId) {
        await deployTraffic(baseId, candidateId, 'Automatic restore: worldwide live clock verification failed');
        report.automaticRestore = await active();
      }
    } catch (restoreError) {
      report.restoreError = restoreError.stack || restoreError.message;
    }
  }
  await save();
  console.error(report.error);
  process.exitCode = 1;
}

