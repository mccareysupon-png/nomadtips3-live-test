import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { parse } from 'acorn';

const ACCOUNT = '62cb0db544160e6591342abd6b4f35cc';
const WORKER = 'ball46-production';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const MARK = 'B46_UNIVERSAL_EVENT_WATCH_MOTION_20261103';
const STYLE_ID = 'b46-universal-event-watch-motion-20261103';
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
  url.searchParams.set('b46EventWatchMotionAudit', `${process.env.GITHUB_RUN_ID}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: Object.fromEntries(response.headers), body, sha: sha(body) };
}

async function health(host) {
  const checked = [];
  for (const path of ['/api/engine/health', '/api/full-market/health', '/api/engine/board', '/api/engine/statistics?paged=1']) {
    let response;
    for (let attempt = 1; attempt <= 4; attempt++) {
      response = await get(host, path);
      if (response.status === 200) break;
      assert(attempt < 4, `HEALTH_STATUS:${path}`);
      await wait(2000 * attempt);
    }
    assert.equal(response.status, 200, `HEALTH_STATUS:${path}`);
    const json = JSON.parse(response.body);
    assert.equal(json.ok, true, `HEALTH_NOT_OK:${path}`);
    if (path.endsWith('/board')) assert.equal(json.stale, false, 'BOARD_STALE');
    checked.push({ path, ok: true });
  }
  return checked;
}

const payload = `<style id="${STYLE_ID}">
/* Keep Event Watch moving on every browser and device, including reduced-motion OS settings. */
html body .b46-event-watch .ew-orbit{
 animation-name:ew-sweep!important;
 animation-duration:5s!important;
 animation-timing-function:linear!important;
 animation-iteration-count:infinite!important;
 animation-play-state:running!important;
}
html body .b46-event-watch .ew-dot{
 animation-name:ew-breathe!important;
 animation-duration:3s!important;
 animation-timing-function:ease-in-out!important;
 animation-iteration-count:infinite!important;
 animation-play-state:running!important;
}
html body .b46-event-watch .ew-track::after{
 animation-name:ew-line!important;
 animation-duration:4.5s!important;
 animation-timing-function:ease-in-out!important;
 animation-iteration-count:infinite!important;
 animation-play-state:running!important;
}
</style>`;

function patchHTML(html) {
  assert.equal(html.split(`id="${STYLE_ID}"`).length - 1, 0, 'STYLE_ALREADY_PRESENT');
  assert(html.includes('id="b46-universal-monitor-motion-20261103"'), 'PREVIOUS_MONITOR_MOTION_MISSING');
  assert(html.includes('/b46-radar-watch-20261030.css'), 'EVENT_WATCH_STYLE_MISSING');
  assert(html.includes('/b46-radar-watch-20261030.js'), 'EVENT_WATCH_RENDERER_MISSING');
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
  const previous = `${before}const __b46EventWatchPrevious=${after}`;
  const patchFunction = patchHTML.toString()
    .replace('function patchHTML', 'function __b46EventWatchPatchHTML')
    .replaceAll('assert(', '__b46EventWatchAssert(')
    .replaceAll('assert.equal(', '__b46EventWatchAssertEqual(')
    .replaceAll('STYLE_ID', '__b46EventWatchStyleId')
    .replaceAll('payload', '__b46EventWatchPayload');
  return `${previous}\nconst __b46EventWatchMarker=${JSON.stringify(MARK)},__b46EventWatchStyleId=${JSON.stringify(STYLE_ID)},__b46EventWatchPayload=${JSON.stringify(payload)};\nconst __b46EventWatchAssert=(value,message)=>{if(!value)throw Error(message)},__b46EventWatchAssertEqual=(a,b,message)=>{if(a!==b)throw Error(message)};\n${patchFunction}\nexport default{...__b46EventWatchPrevious,async fetch(request,env,ctx){const response=await __b46EventWatchPrevious.fetch(request,env,ctx),url=new URL(request.url);if(request.method!==\"GET\"||![\"/\",\"/index.html\"].includes(url.pathname)||!response.ok||!(response.headers.get(\"content-type\")||\"\").includes(\"text/html\"))return response;const headers=new Headers(response.headers);headers.delete(\"etag\");headers.delete(\"content-length\");headers.set(\"x-b46-event-watch-motion\",__b46EventWatchMarker);return new Response(__b46EventWatchPatchHTML(await response.text()),{status:response.status,statusText:response.statusText,headers})}};\n`;
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
      const specimen = document.createElement('div');
      specimen.id = 'b46-event-watch-motion-specimen';
      specimen.className = 'b46-event-watch';
      specimen.innerHTML = '<svg viewBox="0 0 40 40"><g class="ew-orbit"><path d="M20 3a17 17 0 0 1 17 17"/></g><circle class="ew-dot" cx="20" cy="20" r="2.5"/></svg><span class="ew-track"></span>';
      document.body.append(specimen);
    });
    const animations = await page.evaluate(() => {
      const root = document.querySelector('#b46-event-watch-motion-specimen');
      const orbit = root.querySelector('.ew-orbit');
      const dot = root.querySelector('.ew-dot');
      const track = root.querySelector('.ew-track');
      return {
        orbit: getComputedStyle(orbit).animationName,
        dot: getComputedStyle(dot).animationName,
        line: getComputedStyle(track, '::after').animationName,
        orbitPlayState: getComputedStyle(orbit).animationPlayState,
      };
    });
    assert.equal(animations.orbit, 'ew-sweep', 'EVENT_WATCH_ORBIT_ANIMATION_DISABLED');
    assert.equal(animations.dot, 'ew-breathe', 'EVENT_WATCH_DOT_ANIMATION_DISABLED');
    assert.equal(animations.line, 'ew-line', 'EVENT_WATCH_LINE_ANIMATION_DISABLED');
    assert.equal(animations.orbitPlayState, 'running', 'EVENT_WATCH_ORBIT_NOT_RUNNING');
    const samples = { orbit: [], dot: [], line: [] };
    for (let index = 0; index < 9; index++) {
      await page.waitForTimeout(180);
      const sample = await page.evaluate(() => {
        const root = document.querySelector('#b46-event-watch-motion-specimen');
        return {
          orbit: getComputedStyle(root.querySelector('.ew-orbit')).transform,
          dot: getComputedStyle(root.querySelector('.ew-dot')).opacity,
          line: getComputedStyle(root.querySelector('.ew-track'), '::after').left,
        };
      });
      for (const key of Object.keys(samples)) samples[key].push(sample[key]);
    }
    for (const [key, values] of Object.entries(samples)) {
      assert(new Set(values).size > 1, `EVENT_WATCH_${key.toUpperCase()}_STATIC_ON_REDUCED_MOTION`);
    }
    const actual = await page.evaluate(() => {
      const root = [...document.querySelectorAll('.b46-event-watch')].find((item) => item.id !== 'b46-event-watch-motion-specimen');
      if (!root) return { found: false };
      return {
        found: true,
        orbit: getComputedStyle(root.querySelector('.ew-orbit')).animationName,
        dot: getComputedStyle(root.querySelector('.ew-dot')).animationName,
        line: getComputedStyle(root.querySelector('.ew-track'), '::after').animationName,
      };
    });
    if (actual.found) assert.deepEqual({ orbit: actual.orbit, dot: actual.dot, line: actual.line }, { orbit: 'ew-sweep', dot: 'ew-breathe', line: 'ew-line' }, 'ACTUAL_EVENT_WATCH_ANIMATION_DRIFT');
    await page.evaluate(() => document.querySelector('#b46-event-watch-motion-specimen')?.remove());
    assert.equal(errors.length, 0, `PAGE_ERRORS:${errors.join('|')}`);
    return { candidate, viewport: '390x844', reducedMotion: 'reduce', animations, samples, actual, pageErrors: errors };
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
  assert(html.includes('id="b46-worldwide-live-clock-runtime-20261103"'), 'WORLDWIDE_CLOCK_FIX_NOT_PRESERVED');
  assert(html.includes('id="b46-statistics-live-score-runtime-20261103"'), 'STATISTICS_LIVE_SCORE_FIX_NOT_PRESERVED');
  assert(html.includes('function b46gnLiveMinuteMarkup'), 'MOBILE_ALL_MATCHES_RENDERER_MISSING');
  const [eventStyle, eventRenderer] = await Promise.all([
    get('https://ball46.com', '/b46-radar-watch-20261030.css'),
    get('https://ball46.com', '/b46-radar-watch-20261030.js'),
  ]);
  assert.equal(eventStyle.status, 200, 'EVENT_WATCH_STYLE_MISSING');
  assert.equal(eventRenderer.status, 200, 'EVENT_WATCH_RENDERER_MISSING');
  assert(eventStyle.body.toString('utf8').includes('@media(prefers-reduced-motion:reduce)'), 'EVENT_WATCH_REDUCED_MOTION_SOURCE_DRIFT');
  assert(eventRenderer.body.toString('utf8').includes('EVENT WATCH'), 'EVENT_WATCH_RENDERER_DRIFT');
  const statisticsRenderer = await get('https://ball46.com', '/b46-statistics-columns-20261102.js?v=1');
  assert.equal(statisticsRenderer.status, 200, 'STATISTICS_RENDERER_MISSING');
  const statisticsSource = statisticsRenderer.body.toString('utf8');
  assert(statisticsSource.includes('b46-sc-stack'), 'STATISTICS_SCORE_RENDERER_DRIFT');
  assert(statisticsSource.includes('data-b46-stat-display'), 'STATISTICS_ROW_DATA_DRIFT');
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
      'workers/message': 'Universal Event Watch motion on every device, including reduced-motion settings',
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

  await deployTraffic(candidateId, baseId, 'Universal Event Watch orbit, pulse and track motion verified on mobile reduced-motion devices');
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
  console.log(`BALL46_EVENT_WATCH_MOTION_PASS=${JSON.stringify({ base: baseId, candidate: candidateId, deployment: report.after.deployment })}`);
} catch (error) {
  report.ok = false;
  report.error = error.stack || error.message;
  if (switched && baseId && candidateId) {
    try {
      if ((await active()).version === candidateId) {
        await deployTraffic(baseId, candidateId, 'Automatic restore: Event Watch motion verification failed');
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

