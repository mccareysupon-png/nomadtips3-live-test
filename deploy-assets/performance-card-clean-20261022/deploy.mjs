import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';
import puppeteer from 'puppeteer-core';

const MARK = 'B46_PERFORMANCE_CARD_CLEAN_20261022';
const CSS_PATH = 'ball46-performance-clean-20261022a.css';
const IMAGE_PATH = 'ball46-performance-football-20261022a.webp';
const ORIGIN = 'https://ball46.com';
const DIRECT_ORIGIN = 'https://ball46-production.mccarey-supon.workers.dev';
const SCRIPT = 'ball46-production';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (key, entry) => key === 'annotations' ? undefined : (entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry));
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const report = {
  run: process.env.GITHUB_RUN_ID,
  worker: SCRIPT,
  marker: MARK,
  scope: 'Desktop presentation of the existing Daily Performance card only. Existing DOM, API, London-day calculation, refresh loop, data, Engine, Signal, settlement, bindings and schedules remain unchanged.'
};
mkdirSync('audit', { recursive: true });
const save = () => writeFileSync('audit/performance-card-clean.json', JSON.stringify(report, null, 2));
let base;
let candidate;
let activated = false;

async function api(path, options = {}) {
  assert(account && token, 'CLOUDFLARE_AUTH_MISSING');
  const response = await fetch(apiRoot + path, {
    ...options,
    signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${token}`, ...options.headers }
  });
  const json = await response.json();
  assert(response.ok && json.success === true, `CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors || [])}`);
  return json.result;
}

async function activeVersion() {
  const result = await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
  const versions = result.deployments?.[0]?.versions;
  assert(versions?.length === 1 && Number(versions[0].percentage) === 100, 'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  assert(versions[0].version_id, 'ACTIVE_VERSION_MISSING');
  return versions[0].version_id;
}

async function getVersion(id) {
  const version = await api(`/workers/${SCRIPT}/versions/${id}?include=modules`);
  assert(version.main_module && version.modules?.length, 'ACTIVE_MODULES_MISSING');
  return version;
}

async function schedules() {
  const result = await api(`/scripts/${SCRIPT}/schedules`);
  const entries = Array.isArray(result) ? result : result.schedules;
  assert(Array.isArray(entries), 'CURRENT_SCHEDULES_MISSING');
  return entries.map(entry => entry.cron).sort();
}

async function publicFile(path, baseOrigin = ORIGIN) {
  const url = new URL(path, baseOrigin);
  url.searchParams.set('performanceCardAudit', `${process.env.GITHUB_RUN_ID || 'local'}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  assert(response.ok, `PUBLIC_HTTP:${url.pathname}:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length, `EMPTY_ASSET:${url.pathname}`);
  return bytes;
}

async function probePublic(path, baseOrigin) {
  const url = new URL(path, baseOrigin);
  url.searchParams.set('performanceCardProbe', `${process.env.GITHUB_RUN_ID || 'local'}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function backend() {
  const records = {};
  for (const [name, path] of [['engine', '/api/engine/health'], ['market', '/api/full-market/health'], ['statistics', '/api/engine/statistics']]) {
    const json = JSON.parse(await publicFile(path));
    assert(json.ok === true, `BACKEND_NOT_OK:${name}`);
    records[name] = name === 'statistics' ? json.settlementRevision : json.version;
    assert(records[name] !== undefined, `BACKEND_REVISION_MISSING:${name}`);
  }
  return records;
}

function cardRuntime(html) {
  const marker = '<script id="b46-daily-performance-runtime">';
  const start = html.indexOf(marker);
  const end = html.indexOf('</script>', start);
  assert(start >= 0 && end > start, 'DAILY_PERFORMANCE_RUNTIME_MISSING');
  return html.slice(start + marker.length, end);
}

function patchHtml(html) {
  assert(html.includes('id="ball46-daily-performance"') || html.includes('B46_DAILY_PERFORMANCE_20261005'), 'DAILY_PERFORMANCE_COMPONENT_MISSING');
  assert(!html.includes(MARK), 'PRESENTATION_PATCH_ALREADY_PRESENT');
  const anchor = '</body>';
  assert.equal(html.split(anchor).length - 1, 1, 'BODY_ANCHOR_CHANGED');
  const tag = `\n  <!-- ${MARK} -->\n  <link rel="stylesheet" href="/${CSS_PATH}?v=1">\n`;
  return { html: html.replace(anchor, tag + anchor), tag };
}

function safeAssetPath(moduleName) {
  assert(moduleName.startsWith('assets/'), `NON_ASSET_MODULE:${moduleName}`);
  const path = moduleName.slice('assets/'.length);
  assert(path && /^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/.test(path) && !path.split('/').includes('..'), `UNSAFE_ASSET_PATH:${path}`);
  return path;
}

function configFromCurrent(version, settings, crons, assetsDirectory) {
  assert.equal(version.main_module, 'index.js', 'CURRENT_MAIN_MODULE_CHANGED');
  assert(version.compatibility_date, 'CURRENT_COMPATIBILITY_DATE_MISSING');
  assert(Array.isArray(version.bindings), 'CURRENT_BINDINGS_MISSING');
  assert(version.bindings.every(binding => ['assets', 'service'].includes(binding.type)), 'UNSUPPORTED_CURRENT_BINDING_STOP');
  const assetBindings = version.bindings.filter(binding => binding.type === 'assets');
  assert.equal(assetBindings.length, 1, 'CURRENT_ASSET_BINDING_SHAPE_CHANGED');
  const assetConfig = version.assets?.config;
  assert(assetConfig && assetConfig.base_path === '/', 'CURRENT_ASSET_CONFIG_MISSING');
  const config = {
    name: SCRIPT,
    main: './index.js',
    compatibility_date: version.compatibility_date,
    compatibility_flags: version.compatibility_flags || [],
    no_bundle: true,
    services: version.bindings.filter(binding => binding.type === 'service').map(binding => ({ binding: binding.name, service: binding.service, ...(binding.environment ? { environment: binding.environment } : {}) })),
    assets: {
      directory: assetsDirectory,
      binding: assetBindings[0].name,
      html_handling: assetConfig.html_handling,
      not_found_handling: assetConfig.not_found_handling,
      run_worker_first: assetConfig.run_worker_first
    },
    triggers: { crons }
  };
  for (const key of ['logpush', 'limits', 'observability']) if (settings[key] !== undefined && settings[key] !== null) config[key] = settings[key];
  if (settings.placement?.mode === 'smart') config.placement = settings.placement;
  return config;
}

async function stageCurrent(version, settings, crons, source, htmlBefore, patchedHtml) {
  const runtime = resolve('runtime');
  const assets = resolve(runtime, 'assets');
  const originalHashes = {};
  const requiredPaths = new Set(readFileSync(resolve('assets', 'production-paths-20260928.txt'), 'utf8').split(/\r?\n/).filter(Boolean));
  for (const module of version.modules.filter(module => module.name !== version.main_module)) requiredPaths.add(safeAssetPath(module.name));
  const paths = new Set(requiredPaths);
  for (const match of htmlBefore.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const url = new URL(match[1], ORIGIN);
    if (url.origin === ORIGIN && /\.(?:html|js|css|png|jpe?g|webp|svg|ico|txt|xml)$/i.test(url.pathname) && !url.pathname.startsWith('/cdn-cgi/')) paths.add(url.pathname.slice(1));
  }
  assert(paths.size >= 80, `ACTIVE_ASSET_SET_INCOMPLETE:${paths.size}`);
  const queue = [...paths].sort();
  for (let i = 0; i < queue.length; i += 6) {
    const batch = queue.slice(i, i + 6);
    const results = await Promise.all(batch.map(async path => {
      const [direct, custom] = await Promise.all([probePublic('/' + path, DIRECT_ORIGIN), probePublic('/' + path, ORIGIN)]);
      if (direct.status === 404 && custom.status === 404 && !requiredPaths.has(path)) return null;
      assert.equal(direct.status, 200, `DIRECT_ORIGIN_ASSET_HTTP:${path}:${direct.status}`);
      assert.equal(custom.status, 200, `CUSTOM_DOMAIN_ASSET_HTTP:${path}:${custom.status}`);
      assert.equal(sha(custom.bytes), sha(direct.bytes), `PRODUCTION_ORIGINS_DISAGREE:${path}`);
      return direct.bytes;
    }));
    results.forEach((bytes, offset) => {
      const path = batch[offset];
      if (!bytes) return;
      originalHashes[path] = sha(bytes);
      const target = resolve(assets, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, path === 'index.html' ? patchedHtml : bytes);
    });
  }
  assert(originalHashes['index.html'], 'ACTIVE_INDEX_MODULE_MISSING');
  const css = readFileSync(resolve('assets', CSS_PATH));
  const image = readFileSync(resolve('assets', IMAGE_PATH));
  assert(css.includes(Buffer.from(MARK)), 'CSS_MARKER_MISSING');
  assert(image.length > 10000 && image.length < 150000, `IMAGE_SIZE_OUT_OF_RANGE:${image.length}`);
  writeFileSync(resolve(assets, CSS_PATH), css);
  writeFileSync(resolve(assets, IMAGE_PATH), image);
  writeFileSync(resolve(runtime, 'index.js'), source);
  writeFileSync(resolve(runtime, 'wrangler.jsonc'), JSON.stringify(configFromCurrent(version, settings, crons, assets), null, 2));
  return { runtime, assets, originalHashes, pathCount: Object.keys(originalHashes).length, cssSha: sha(css), imageSha: sha(image) };
}

function runWrangler(staged, args, logName) {
  const result = spawnSync('npx', ['--yes', 'wrangler@4.92.0', ...args, '--config', 'wrangler.jsonc'], {
    cwd: staged.runtime,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024
  });
  writeFileSync(`audit/${logName}.log`, (result.stdout || '') + (result.stderr || ''));
  console.log(result.stdout || '');
  console.error(result.stderr || '');
  assert(!result.error && result.status === 0, `WRANGLER_FAILED:${logName}:${result.error?.message || result.status}`);
  return (result.stdout || '') + (result.stderr || '');
}

function moduleMap(version) {
  return new Map(version.modules.map(module => [module.name, module]));
}

async function verifyCandidate(candidateVersion, current, staged, source, patchedHtml) {
  const after = moduleMap(candidateVersion);
  const main = after.get(candidateVersion.main_module);
  assert(main, 'CANDIDATE_MAIN_MISSING');
  assert.equal(sha(Buffer.from(main.content_base64, 'base64')), sha(source), 'WORKER_SOURCE_CHANGED');
  assert.equal(canonical(candidateVersion.bindings), canonical(current.bindings), 'BINDINGS_CHANGED');
  assert.equal(canonical(candidateVersion.assets?.config), canonical(current.assets?.config), 'ASSET_CONFIG_CHANGED');
  assert.equal(candidateVersion.compatibility_date, current.compatibility_date, 'COMPATIBILITY_DATE_CHANGED');
  assert.equal(canonical(candidateVersion.compatibility_flags || []), canonical(current.compatibility_flags || []), 'COMPATIBILITY_FLAGS_CHANGED');
  const index = after.get('assets/index.html');
  if (index) assert.equal(sha(Buffer.from(index.content_base64, 'base64')), sha(patchedHtml), 'INDEX_MODULE_MISMATCH');
}

async function verifyAssets(baseOrigin, staged) {
  const entries = Object.entries(staged.originalHashes);
  for (let i = 0; i < entries.length; i += 6) {
    const batch = entries.slice(i, i + 6);
    const results = await Promise.all(batch.map(([path]) => publicFile('/' + path, baseOrigin)));
    results.forEach((bytes, offset) => {
      const [path, expected] = batch[offset];
      const wanted = path === 'index.html' ? null : expected;
      if (wanted) assert.equal(sha(bytes), wanted, `EXISTING_ASSET_CHANGED:${path}`);
    });
  }
}

async function verifyStagedBrowser(staged) {
  const mime = path => path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : path.endsWith('.xml') ? 'application/xml' : 'application/octet-stream';
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        const upstream = await fetch(new URL(url.pathname + url.search, ORIGIN), { signal: AbortSignal.timeout(45000) });
        response.statusCode = upstream.status;
        response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
        response.end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
      assert(!relative.split('/').includes('..'), 'LOCAL_PREVIEW_UNSAFE_PATH');
      const target = resolve(staged.assets, relative);
      assert(target.startsWith(resolve(staged.assets)), 'LOCAL_PREVIEW_PATH_ESCAPE');
      if (!existsSync(target) || !statSync(target).isFile()) {
        response.statusCode = 404;
        response.end('Not found');
        return;
      }
      response.statusCode = 200;
      response.setHeader('content-type', mime(relative));
      response.end(readFileSync(target));
    } catch (error) {
      response.statusCode = 500;
      response.end(error.message);
    }
  });
  await new Promise((resolveListen, rejectListen) => server.listen(0, '127.0.0.1', error => error ? rejectListen(error) : resolveListen()));
  const address = server.address();
  assert(address && typeof address === 'object', 'LOCAL_PREVIEW_ADDRESS_MISSING');
  try {
    return await inspectBrowser(`http://127.0.0.1:${address.port}`, 'staged', false);
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

async function inspectBrowser(baseOrigin, label, fullChecks) {
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  assert(executablePath, 'CHROME_MISSING');
  let browser;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      browser = await puppeteer.launch({ executablePath, headless: true, timeout: 60000, protocolTimeout: 60000, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(1000);
    }
  }
  assert(browser, 'CHROME_LAUNCH_FAILED');
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setCacheEnabled(false);
    await page.goto(baseOrigin + '/?performanceCard=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(path => [...document.styleSheets].some(sheet => (sheet.href || '').includes(path)), { timeout: 60000 }, CSS_PATH);
    await page.waitForFunction(path => fetch('/' + path, { cache: 'no-store' }).then(response => response.ok), { timeout: 60000 }, IMAGE_PATH);
    await page.waitForFunction(() => document.querySelectorAll('.match-row[data-match-id]').length > 0, { timeout: 60000 });
    await page.waitForFunction(() => {
      const keys = ['today-win', 'today-loss', 'today-push', 'today-pending', 'yesterday-win', 'yesterday-loss', 'yesterday-push'];
      return keys.every(key => document.querySelector(`[data-b46-stat="${key}"]`)?.textContent?.trim() !== '');
    }, { timeout: 90000 });
    const themes = {};
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await delay(250);
      const snapshot = await page.evaluate(imagePath => {
        const card = document.querySelector('#ball46-daily-performance');
        const today = card?.querySelector('.b46-perf-side.today');
        const yesterday = card?.querySelector('.b46-perf-side.yesterday');
        const style = card ? getComputedStyle(card) : null;
        const todayStyle = today ? getComputedStyle(today) : null;
        const imageStyle = today ? getComputedStyle(today, '::after') : null;
        const values = Object.fromEntries([...card.querySelectorAll('[data-b46-stat], [data-b46-rate], [data-b46-avg-odds]')].map(node => {
          const key = node.hasAttribute('data-b46-stat') ? node.getAttribute('data-b46-stat') : (node.hasAttribute('data-b46-rate') ? `rate-${node.getAttribute('data-b46-rate')}` : `odds-${node.getAttribute('data-b46-avg-odds')}`);
          return [key, node.textContent.trim()];
        }));
        return {
          cardDisplay: style?.display,
          cardHeight: card?.getBoundingClientRect().height,
          cardBackground: style?.backgroundColor,
          cardBorder: style?.borderTopWidth,
          cardPadding: style?.padding,
          todayHeight: today?.getBoundingClientRect().height,
          todayMinHeight: todayStyle?.minHeight,
          yesterdayHeight: yesterday?.getBoundingClientRect().height,
          footballVisual: imageStyle?.backgroundImage?.includes(imagePath),
          todayBackground: todayStyle?.backgroundColor,
          viewportWidth: innerWidth,
          desktopMedia: matchMedia('(min-width: 761px)').matches,
          patchSheets: [...document.styleSheets].filter(sheet => (sheet.href || '').includes('ball46-performance-clean')).map(sheet => ({ href: sheet.href, rules: (() => { try { return sheet.cssRules.length; } catch { return -1; } })() })),
          matchRows: document.querySelectorAll('.match-row[data-match-id]').length,
          values
        };
      }, IMAGE_PATH);
      console.log('CARD_SNAPSHOT ' + label + ':' + theme + ' ' + JSON.stringify(snapshot));
      assert.equal(snapshot.cardDisplay, 'block', `${label}:${theme}:CARD_HIDDEN`);
      assert(snapshot.cardHeight >= 210 && snapshot.cardHeight <= 280, `${label}:${theme}:CARD_HEIGHT:${snapshot.cardHeight}`);
      assert(snapshot.todayHeight >= 145, `${label}:${theme}:TODAY_HEIGHT:${snapshot.todayHeight}`);
      assert(snapshot.yesterdayHeight >= 58, `${label}:${theme}:YESTERDAY_HEIGHT:${snapshot.yesterdayHeight}`);
      assert.equal(snapshot.cardBorder, '0px', `${label}:${theme}:CARD_BORDER_PRESENT`);
      assert.equal(snapshot.footballVisual, true, `${label}:${theme}:FOOTBALL_VISUAL_MISSING`);
      assert(snapshot.matchRows > 0, `${label}:${theme}:MATCH_BOARD_EMPTY`);
      assert(Object.values(snapshot.values).every(value => value !== ''), `${label}:${theme}:PERFORMANCE_VALUE_EMPTY`);
      await page.screenshot({ path: `audit/${label}-${theme}.png`, fullPage: false });
      themes[theme] = snapshot;
    }
    const mobile = {};
    if (fullChecks) {
      await page.setViewport({ width: 390, height: 844 });
      await page.goto(baseOrigin + '/?performanceCardMobile=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => document.querySelectorAll('.match-row[data-match-id]').length > 0, { timeout: 60000 });
      Object.assign(mobile, await page.evaluate(() => ({
        cardDisplay: getComputedStyle(document.querySelector('#ball46-daily-performance')).display,
        matchRows: document.querySelectorAll('.match-row[data-match-id]').length
      })));
      assert.equal(mobile.cardDisplay, 'none', `${label}:MOBILE_CARD_BEHAVIOR_CHANGED`);
      assert(mobile.matchRows > 0, `${label}:MOBILE_MATCH_BOARD_EMPTY`);
      await page.screenshot({ path: `audit/${label}-mobile.png`, fullPage: false });
    }
    assert.equal(pageErrors.length, 0, `${label}:BROWSER_SCRIPT_ERRORS:${pageErrors.join('|')}`);
    return { themes, mobile, pageErrors };
  } finally {
    await browser.close();
  }
}

async function rollback() {
  if (!activated) return;
  const active = await activeVersion();
  if (active === base) return;
  assert.equal(active, candidate, 'PRODUCTION_MOVED_DO_NOT_ROLLBACK_OTHER_CHANGE');
  await api(`/scripts/${SCRIPT}/deployments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: base, percentage: 100 }], annotations: { 'workers/message': `Rollback ${MARK}` } })
  });
  assert.equal(await activeVersion(), base, 'ROLLBACK_NOT_CONFIRMED');
  report.rollback = { version: base, at: new Date().toISOString() };
  save();
}

try {
  base = await activeVersion();
  report.beforeVersion = base;
  const current = await getVersion(base);
  const main = current.modules.find(module => module.name === current.main_module);
  assert(main, 'ACTIVE_MAIN_MISSING');
  const source = Buffer.from(main.content_base64, 'base64').toString('utf8');
  parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const indexModule = current.modules.find(module => module.name === 'assets/index.html');
  assert(indexModule, 'ACTIVE_INDEX_MISSING');
  const moduleHtml = Buffer.from(indexModule.content_base64, 'base64');
  const directHtml = await publicFile('/index.html', DIRECT_ORIGIN);
  const customHtml = await publicFile('/index.html');
  assert.equal(sha(customHtml), sha(directHtml), 'PRODUCTION_ORIGINS_DISAGREE');
  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_DURING_INDEX_LOCK');
  const htmlBefore = directHtml.toString('utf8');
  const runtimeBefore = cardRuntime(htmlBefore);
  const patch = patchHtml(htmlBefore);
  assert.equal(patch.html.replace(patch.tag, ''), htmlBefore, 'NON_LINK_HTML_CHANGED');
  assert.equal(sha(cardRuntime(patch.html)), sha(runtimeBefore), 'DAILY_PERFORMANCE_RUNTIME_CHANGED');
  const settings = await api(`/scripts/${SCRIPT}/settings`);
  const settingsBefore = canonical(settings);
  const cronsBefore = await schedules();
  const backendBefore = await backend();
  report.guards = {
    workerSourceSha: sha(source),
    activeModuleIndexSha: sha(moduleHtml),
    servedIndexSha: sha(directHtml),
    htmlBeforeSha: sha(htmlBefore),
    htmlAfterSha: sha(patch.html),
    cardRuntimeSha: sha(runtimeBefore),
    originalModuleCount: current.modules.length,
    settingsSha: sha(settingsBefore),
    crons: cronsBefore,
    backend: backendBefore
  };
  save();

  const staged = await stageCurrent(current, settings, cronsBefore, source, htmlBefore, patch.html);
  runWrangler(staged, ['deploy', '--dry-run'], 'dry-run');
  report.staged = await verifyStagedBrowser(staged);
  save();
  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_BEFORE_UPLOAD');
  assert.equal(canonical(await api(`/scripts/${SCRIPT}/settings`)), settingsBefore, 'SETTINGS_MOVED_BEFORE_UPLOAD');
  const uploadOutput = runWrangler(staged, ['versions', 'upload', '--tag', MARK, '--message', 'BALL46 Performance card desktop presentation only'], 'version-upload');
  candidate = uploadOutput.match(/Version ID:\s*([a-f0-9-]{36})/i)?.[1];
  assert(candidate && candidate !== base, 'CANDIDATE_VERSION_MISSING');
  report.candidateVersion = candidate;
  save();

  const previewVersion = await getVersion(candidate);
  await verifyCandidate(previewVersion, current, staged, source, patch.html);
  const previewOrigin = previewVersion.urls?.[0];
  assert(previewOrigin?.startsWith(`https://${candidate.slice(0, 8)}-${SCRIPT}.`), 'VERSION_PREVIEW_URL_MISSING');
  report.versionPreview = { url: previewOrigin, metadataVerified: true, runtimeCheck: 'staged exact asset set verified locally because current Worker version URL does not serve the production hostname rail' };
  save();

  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_BEFORE_ACTIVATION');
  assert.equal(canonical(await api(`/scripts/${SCRIPT}/settings`)), settingsBefore, 'SETTINGS_MOVED_BEFORE_ACTIVATION');
  assert.equal(canonical(await schedules()), canonical(cronsBefore), 'SCHEDULES_MOVED_BEFORE_ACTIVATION');
  activated = true;
  await api(`/scripts/${SCRIPT}/deployments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: candidate, percentage: 100 }], annotations: { 'workers/message': 'Verified BALL46 Performance card desktop presentation only' } })
  });
  assert.equal(await activeVersion(), candidate, 'CANDIDATE_NOT_ACTIVE');
  report.afterVersion = candidate;
  save();

  for (let attempt = 0; attempt < 25; attempt++) {
    if (sha(await publicFile('/index.html')) === sha(patch.html) && sha(await publicFile('/index.html', DIRECT_ORIGIN)) === sha(patch.html)) break;
    if (attempt === 24) throw new Error('PUBLIC_HTML_DID_NOT_PROPAGATE');
    await delay(1000);
  }
  assert.equal(sha(await publicFile('/' + CSS_PATH)), staged.cssSha, 'PRODUCTION_CSS_MISMATCH');
  assert.equal(sha(await publicFile('/' + IMAGE_PATH)), staged.imageSha, 'PRODUCTION_IMAGE_MISMATCH');
  await verifyAssets(ORIGIN, staged);
  await verifyAssets(DIRECT_ORIGIN, staged);
  report.production = await inspectBrowser(ORIGIN, 'production', true);
  assert.equal(canonical(await api(`/scripts/${SCRIPT}/settings`)), settingsBefore, 'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()), canonical(cronsBefore), 'SCHEDULES_CHANGED');
  assert.equal(canonical(await backend()), canonical(backendBefore), 'BACKEND_REVISION_CHANGED');
  const finalVersion = await getVersion(candidate);
  await verifyCandidate(finalVersion, current, staged, source, patch.html);
  assert.equal(await activeVersion(), candidate, 'PRODUCTION_MOVED_DURING_VERIFICATION');
  report.result = 'SUCCESS';
  report.completedAt = new Date().toISOString();
  save();
  console.log('BALL46_PERFORMANCE_CARD_CLEAN_SUCCESS ' + JSON.stringify({ beforeVersion: base, afterVersion: candidate, protectedAssets: staged.pathCount, originalModules: current.modules.length, cssSha: staged.cssSha, imageSha: staged.imageSha }));
} catch (error) {
  report.error = error.message;
  report.result = activated ? 'FAILED_ROLLBACK_REQUIRED' : 'FAILED_BEFORE_ACTIVATION';
  save();
  try { await rollback(); } catch (rollbackError) { report.rollbackError = rollbackError.message; save(); }
  console.error(error.stack);
  process.exitCode = 1;
}

