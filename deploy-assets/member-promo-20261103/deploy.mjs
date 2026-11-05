import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';
import puppeteer from 'puppeteer-core';

const MARK = 'B46_MEMBER_PROMO_20261103';
const CSS_PATH = 'ball46-member-promo-20261103a.css';
const JS_PATH = 'ball46-member-promo-20261103a.js';
const IMAGE_PATH = 'ball46-member-promo-20261103a.jpg';
const IMAGE_MODULE = 'b46-member-promo-20261103a.bin';
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
  scope: 'Membership promotion card before the existing Featured Match card only. Existing match DOM, APIs, Engine, Signal, statistics, authentication, settlement, bindings and schedules remain unchanged.'
};
mkdirSync('audit', { recursive: true });
const save = () => writeFileSync('audit/member-promo-20261103.json', JSON.stringify(report, null, 2));
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

function promoTag() {
  return `
  <!-- ${MARK} -->
  <link rel="stylesheet" href="/${CSS_PATH}?v=1">
  <script src="/${JS_PATH}?v=1" data-asset="/${IMAGE_PATH}" defer></script>
`;
}

function patchHtml(html) {
  assert(!html.includes(MARK), 'MEMBER_PROMO_PATCH_ALREADY_PRESENT');
  const anchor = '</body>';
  assert.equal(html.split(anchor).length - 1, 1, 'BODY_ANCHOR_CHANGED');
  const tag = promoTag();
  return { html: html.replace(anchor, tag + anchor), tag };
}

function hasServedPromo(bytes) {
  const html = bytes.toString('utf8');
  return html.split(MARK).length - 1 === 1
    && html.includes(`href="/${CSS_PATH}?v=1"`)
    && html.includes(`src="/${JS_PATH}?v=1"`);
}

function patchWorkerSource(source, css, runtimeJs) {
  assert(!source.includes(MARK), 'WORKER_PROMO_PATCH_ALREADY_PRESENT');
  assert(!source.includes(IMAGE_MODULE), 'WORKER_PROMO_IMAGE_MODULE_ALREADY_PRESENT');
  assert(!css.includes('</style>') && !runtimeJs.includes('</script>'), 'PROMO_ASSET_INLINE_TERMINATOR_FOUND');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const defaultExports = ast.body.filter(node => node.type === 'ExportDefaultDeclaration');
  assert.equal(defaultExports.length, 1, 'WORKER_DEFAULT_EXPORT_COUNT_CHANGED');
  const finalExport = defaultExports[0];
  assert.equal(source.slice(finalExport.end).trim(), '', 'WORKER_CODE_AFTER_DEFAULT_EXPORT');
  assert(finalExport.declaration?.start !== undefined && finalExport.declaration?.end !== undefined, 'WORKER_DEFAULT_EXPORT_DECLARATION_MISSING');
  const delegate = '__b46BeforeMemberPromo20261103';
  const exportedValue = source.slice(finalExport.declaration.start, finalExport.declaration.end);
  const wrapper = `const ${delegate}=${exportedValue};\n` +
    `const __b46MemberPromoCss20261103=${JSON.stringify(css)};\n` +
    `const __b46MemberPromoJs20261103=${JSON.stringify(runtimeJs)};\n` +
    `const __b46MemberPromo20261103={...__b46BeforeMemberPromo20261103,async fetch(request,env,ctx){\n` +
    ` const url=new URL(request.url),path=url.pathname;\n` +
    ` if(request.method==='GET'&&path==='/${CSS_PATH}')return new Response(__b46MemberPromoCss20261103,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=31536000, immutable','x-ball46-member-promo':'${MARK}'}});\n` +
    ` if(request.method==='GET'&&path==='/${JS_PATH}')return new Response(__b46MemberPromoJs20261103,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'public, max-age=31536000, immutable','x-ball46-member-promo':'${MARK}'}});\n` +
    ` if(request.method==='GET'&&path==='/${IMAGE_PATH}')return new Response(__b46MemberPromoImage20261103.slice(0),{headers:{'content-type':'image/jpeg','cache-control':'public, max-age=31536000, immutable','x-ball46-member-promo':'${MARK}'}});\n` +
    ` const response=await __b46BeforeMemberPromo20261103.fetch.call(__b46BeforeMemberPromo20261103,request,env,ctx);\n` +
    ` if(request.method!=='GET'||!['/','/index.html'].includes(path)||response.status!==200||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;\n` +
    ` const html=await response.text();if(html.includes('${MARK}'))throw Error('MEMBER_PROMO_RUNTIME_DUPLICATE');if(html.split('</body>').length!==2)throw Error('MEMBER_PROMO_BODY_ANCHOR_DRIFT');\n` +
    ` const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-cache, must-revalidate');headers.set('x-ball46-member-promo','${MARK}');\n` +
    ` return new Response(html.replace('</body>',${JSON.stringify(promoTag())}+'</body>'),{status:response.status,statusText:response.statusText,headers});\n` +
    `}};\nexport default __b46MemberPromo20261103;\n`;
  const patched = `import __b46MemberPromoImage20261103 from './${IMAGE_MODULE}';\n` + source.slice(0, finalExport.start) + wrapper;
  parse(patched, { ecmaVersion: 'latest', sourceType: 'module' });
  return patched;
}

function moduleContentType(name, mainModule) {
  if (name === mainModule || /\.m?js$/.test(name)) return 'application/javascript+module';
  if (name.endsWith('.bin')) return 'application/octet-stream';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.html')) return 'text/html';
  throw new Error(`UNSUPPORTED_MODULE_CONTENT_TYPE:${name}`);
}

async function uploadKeepAssetsVersion(current, patchedSource, image) {
  const metadata = {
    main_module: current.main_module,
    compatibility_date: current.compatibility_date,
    compatibility_flags: current.compatibility_flags || [],
    bindings: current.bindings,
    keep_assets: true,
    assets: { config: current.assets.config },
    annotations: { 'workers/tag': MARK, 'workers/message': 'BALL46 membership promo before Featured Match only; preserve active static assets' }
  };
  if (current.placement) metadata.placement = current.placement;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  for (const module of current.modules) {
    const bytes = module.name === current.main_module ? Buffer.from(patchedSource) : Buffer.from(module.content_base64, 'base64');
    form.append(module.name, new Blob([bytes], { type: module.content_type || moduleContentType(module.name, current.main_module) }), module.name);
  }
  form.append(IMAGE_MODULE, new Blob([image], { type: 'application/octet-stream' }), IMAGE_MODULE);
  const result = await api(`/scripts/${SCRIPT}/versions`, { method: 'POST', body: form });
  assert(result?.id, 'VERSION_UPLOAD_ID_MISSING');
  return result.id;
}

function sourceString(source, name) {
  const match = source.match(new RegExp(`const ${name}=("(?:\\\\.|[^"\\\\])*");`));
  assert(match, `ACTIVE_SOURCE_CONSTANT_MISSING:${name}`);
  return JSON.parse(match[1]);
}

function restoreRuntimePatchedAsset(path, bytes, source) {
  if (path === 'signal-next.js') {
    const anchor = sourceString(source, '__b46SignalOldJsAnchor');
    const injection = sourceString(source, '__b46SignalJsInjection');
    const patched = injection + '\n' + anchor;
    const body = bytes.toString('utf8');
    assert.equal(body.split(patched).length - 1, 1, 'ACTIVE_SIGNAL_JS_PATCH_SHAPE_CHANGED');
    return Buffer.from(body.replace(patched, anchor));
  }
  if (path === 'signal.html') {
    const oldTag = sourceString(source, '__b46SignalOldHtmlTag');
    const newTag = sourceString(source, '__b46SignalNewHtmlTag');
    const body = bytes.toString('utf8');
    assert.equal(body.split(newTag).length - 1, 1, 'ACTIVE_SIGNAL_HTML_PATCH_SHAPE_CHANGED');
    assert.equal(body.includes(oldTag), false, 'ACTIVE_SIGNAL_HTML_ALREADY_RAW');
    return Buffer.from(body.replace(newTag, oldTag));
  }
  return bytes;
}

function safeAssetPath(moduleName) {
  assert(moduleName.startsWith('assets/'), `NON_PUBLIC_ASSET_MODULE:${moduleName}`);
  const path = moduleName.slice('assets/'.length);
  assert(path && /^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/.test(path) && !path.split('/').includes('..'), `UNSAFE_ASSET_PATH:${path}`);
  return path;
}

function configFromCurrent(version, settings, crons, assetsDirectory, extraModules) {
  assert.equal(version.main_module, 'index.js', 'CURRENT_MAIN_MODULE_CHANGED');
  assert(version.compatibility_date, 'CURRENT_COMPATIBILITY_DATE_MISSING');
  assert(Array.isArray(version.bindings), 'CURRENT_BINDINGS_MISSING');
  const unsupportedBindings = version.bindings.filter(binding => !['assets', 'service', 'kv_namespace'].includes(binding.type));
  assert.equal(unsupportedBindings.length, 0, `UNSUPPORTED_CURRENT_BINDING_STOP:${JSON.stringify(unsupportedBindings.map(binding => ({ name: binding.name, type: binding.type })))}`);
  const assetBindings = version.bindings.filter(binding => binding.type === 'assets');
  assert.equal(assetBindings.length, 1, 'CURRENT_ASSET_BINDING_SHAPE_CHANGED');
  const kvBindings = version.bindings.filter(binding => binding.type === 'kv_namespace');
  assert(kvBindings.every(binding => binding.name && binding.namespace_id), 'CURRENT_KV_BINDING_SHAPE_CHANGED');
  const assetConfig = version.assets?.config;
  assert(assetConfig && assetConfig.base_path === '/', 'CURRENT_ASSET_CONFIG_MISSING');
  const config = {
    name: SCRIPT,
    main: './index.js',
    compatibility_date: version.compatibility_date,
    compatibility_flags: version.compatibility_flags || [],
    no_bundle: true,
    services: version.bindings.filter(binding => binding.type === 'service').map(binding => ({ binding: binding.name, service: binding.service, ...(binding.environment ? { environment: binding.environment } : {}) })),
    kv_namespaces: kvBindings.map(binding => ({ binding: binding.name, id: binding.namespace_id })),
    assets: {
      directory: assetsDirectory,
      binding: assetBindings[0].name,
      html_handling: assetConfig.html_handling,
      not_found_handling: assetConfig.not_found_handling,
      run_worker_first: assetConfig.run_worker_first
    },
    triggers: { crons }
  };
  const moduleRules = [
    { type: 'Data', globs: extraModules.filter(module => module.name.endsWith('.bin')).map(module => module.name), fallthrough: true },
    { type: 'ESModule', globs: extraModules.filter(module => /\.m?js$/.test(module.name)).map(module => module.name), fallthrough: true },
    { type: 'Text', globs: extraModules.filter(module => module.name.endsWith('.txt')).map(module => module.name), fallthrough: true }
  ].filter(rule => rule.globs.length);
  if (moduleRules.length) config.rules = moduleRules;
  for (const key of ['logpush', 'limits', 'observability']) if (settings[key] !== undefined && settings[key] !== null) config[key] = settings[key];
  if (settings.placement?.mode === 'smart') config.placement = settings.placement;
  return config;
}

async function stageCurrent(version, settings, crons, source, htmlBefore, patchedHtml) {
  const runtime = resolve('runtime');
  const assets = resolve(runtime, 'assets');
  mkdirSync(runtime, { recursive: true });
  const originalHashes = {};
  const extraHashes = {};
  const requiredPaths = new Set(readFileSync(resolve('assets', 'production-paths-20260928.txt'), 'utf8').split(/\r?\n/).filter(Boolean));
  const publicModules = version.modules.filter(module => module.name !== version.main_module && module.name.startsWith('assets/'));
  const extraModules = version.modules.filter(module => module.name !== version.main_module && !module.name.startsWith('assets/'));
  const rawPublicModules = new Map(publicModules.map(module => [safeAssetPath(module.name), Buffer.from(module.content_base64, 'base64')]));
  for (const path of rawPublicModules.keys()) requiredPaths.add(path);
  for (const module of extraModules) {
    assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:bin|m?js|txt)$/.test(module.name), `UNSUPPORTED_EXTRA_MODULE:${module.name}`);
    assert(source.includes(module.name), `UNREFERENCED_EXTRA_MODULE:${module.name}`);
    const bytes = Buffer.from(module.content_base64, 'base64');
    assert(bytes.length > 0, `EMPTY_EXTRA_MODULE:${module.name}`);
    writeFileSync(resolve(runtime, module.name), bytes);
    extraHashes[module.name] = sha(bytes);
  }
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
      const direct = await probePublic('/' + path, DIRECT_ORIGIN);
      if (direct.status === 404 && !requiredPaths.has(path)) return null;
      assert.equal(direct.status, 200, `DIRECT_ORIGIN_ASSET_HTTP:${path}:${direct.status}`);
      // Version modules are the authoritative raw bytes. HTTP responses may
      // already contain guarded Worker transformations and must never be fed
      // back into the next version as source assets.
      const stored = rawPublicModules.get(path) || restoreRuntimePatchedAsset(path, direct.bytes, source);
      return { served: direct.bytes, stored };
    }));
    results.forEach((result, offset) => {
      const path = batch[offset];
      if (!result) return;
      originalHashes[path] = sha(result.served);
      const target = resolve(assets, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, path === 'index.html' ? patchedHtml : result.stored);
    });
  }
  assert(originalHashes['index.html'], 'ACTIVE_INDEX_MODULE_MISSING');
  const css = readFileSync(resolve('assets', CSS_PATH));
  const runtimeJs = readFileSync(resolve('assets', JS_PATH));
  const image = readFileSync(resolve('assets', IMAGE_PATH));
  assert(css.includes(Buffer.from(MARK)), 'CSS_MARKER_MISSING');
  assert(runtimeJs.includes(Buffer.from(MARK)), 'JS_MARKER_MISSING');
  assert(image.length > 100000 && image.length < 500000, `IMAGE_SIZE_OUT_OF_RANGE:${image.length}`);
  writeFileSync(resolve(assets, CSS_PATH), css);
  writeFileSync(resolve(assets, JS_PATH), runtimeJs);
  writeFileSync(resolve(assets, IMAGE_PATH), image);
  writeFileSync(resolve(runtime, 'index.js'), source);
  writeFileSync(resolve(runtime, 'wrangler.jsonc'), JSON.stringify(configFromCurrent(version, settings, crons, assets, extraModules), null, 2));
  return { runtime, assets, originalHashes, extraHashes, pathCount: Object.keys(originalHashes).length, cssSha: sha(css), jsSha: sha(runtimeJs), imageSha: sha(image) };
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

async function verifyCandidate(candidateVersion, current, source, imageSha) {
  const after = moduleMap(candidateVersion);
  const main = after.get(candidateVersion.main_module);
  assert(main, 'CANDIDATE_MAIN_MISSING');
  assert.equal(sha(Buffer.from(main.content_base64, 'base64')), sha(source), 'WORKER_SOURCE_CHANGED');
  assert.equal(canonical(candidateVersion.bindings), canonical(current.bindings), 'BINDINGS_CHANGED');
  assert.equal(canonical(candidateVersion.assets?.config), canonical(current.assets?.config), 'ASSET_CONFIG_CHANGED');
  assert.equal(candidateVersion.compatibility_date, current.compatibility_date, 'COMPATIBILITY_DATE_CHANGED');
  assert.equal(canonical(candidateVersion.compatibility_flags || []), canonical(current.compatibility_flags || []), 'COMPATIBILITY_FLAGS_CHANGED');
  for (const module of current.modules) {
    if (module.name === current.main_module) continue;
    const preserved = after.get(module.name);
    assert(preserved, `CANDIDATE_MODULE_MISSING:${module.name}`);
    assert.equal(sha(Buffer.from(preserved.content_base64, 'base64')), sha(Buffer.from(module.content_base64, 'base64')), `CANDIDATE_MODULE_CHANGED:${module.name}`);
  }
  const image = after.get(IMAGE_MODULE);
  assert(image, 'CANDIDATE_PROMO_IMAGE_MODULE_MISSING');
  assert.equal(sha(Buffer.from(image.content_base64, 'base64')), imageSha, 'CANDIDATE_PROMO_IMAGE_MODULE_CHANGED');
  assert.equal(after.size, current.modules.length + 1, 'CANDIDATE_MODULE_COUNT_CHANGED');
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
  const mime = path => path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.png') ? 'image/png' : path.endsWith('.jpg') || path.endsWith('.jpeg') ? 'image/jpeg' : path.endsWith('.webp') ? 'image/webp' : path.endsWith('.xml') ? 'application/xml' : 'application/octet-stream';
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
    return await inspectPromo(`http://127.0.0.1:${address.port}`, 'staged', true);
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

async function inspectPromo(baseOrigin, label, includeMobile) {
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  assert(executablePath, 'CHROME_MISSING');
  const browser = await puppeteer.launch({ executablePath, headless: true, timeout: 60000, protocolTimeout: 60000, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const pageErrors = [];
  const snapshots = {};
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    const viewports = includeMobile ? [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }] : [{ name: 'desktop', width: 1440, height: 1000 }];
    for (const viewport of viewports) {
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.setCacheEnabled(false);
      await page.goto(baseOrigin + '/?memberPromoAudit=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(path => [...document.styleSheets].some(sheet => (sheet.href || '').includes(path)), { timeout: 60000 }, CSS_PATH);
      await page.waitForFunction(() => document.querySelector('.featured-card[data-featured]'), { timeout: 90000 });
      await page.waitForFunction(() => document.querySelector('.b46-member-promo'), { timeout: 60000 });
      for (const theme of ['dark', 'light']) {
        await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
        await delay(250);
        const snapshot = await page.evaluate(({ imagePath, jsPath }) => {
          const cards = [...document.querySelectorAll('.b46-member-promo')];
          const visible = cards.find(card => {
            const rect = card.getBoundingClientRect();
            const style = getComputedStyle(card);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          });
          const card = visible || cards[0];
          const rect = card?.getBoundingClientRect();
          const image = card?.querySelector('.b46-member-promo__image');
          return {
            count: cards.length,
            visible: Boolean(visible),
            width: rect?.width || 0,
            height: rect?.height || 0,
            href: card?.href || '',
            beforeFeatured: (() => {
              const featured = card?.parentElement?.querySelector('.featured-card[data-featured]');
              return Boolean(
                card &&
                featured &&
                card.parentElement === featured.parentElement &&
                (card.compareDocumentPosition(featured) & Node.DOCUMENT_POSITION_FOLLOWING)
              );
            })(),
            imageSrcCorrect: Boolean(image?.src.includes(imagePath)),
            imageLoaded: Boolean(image?.complete && image.naturalWidth > 0 && image.src.includes(imagePath)),
            scriptLoaded: [...document.scripts].some(script => (script.src || '').includes(jsPath)),
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
            title: card?.querySelector('.b46-member-promo__title')?.textContent?.replace(/\s+/g, '') || ''
          };
        }, { imagePath: IMAGE_PATH, jsPath: JS_PATH });
        assert(snapshot.count >= 1, `${label}:${viewport.name}:${theme}:PROMO_MISSING`);
        assert.equal(snapshot.href, 'https://member.ball46.com/pricing', `${label}:${viewport.name}:${theme}:PROMO_LINK_CHANGED`);
        assert.equal(snapshot.beforeFeatured, true, `${label}:${viewport.name}:${theme}:PROMO_POSITION_CHANGED`);
        assert.equal(snapshot.imageSrcCorrect, true, `${label}:${viewport.name}:${theme}:PROMO_IMAGE_SOURCE_CHANGED`);
        if (snapshot.visible) assert.equal(snapshot.imageLoaded, true, `${label}:${viewport.name}:${theme}:PROMO_IMAGE_MISSING`);
        assert.equal(snapshot.scriptLoaded, true, `${label}:${viewport.name}:${theme}:PROMO_SCRIPT_MISSING`);
        assert.equal(snapshot.horizontalOverflow, false, `${label}:${viewport.name}:${theme}:HORIZONTAL_OVERFLOW`);
        assert.equal(snapshot.title, 'GOBEYONDTHESCORE.', `${label}:${viewport.name}:${theme}:PROMO_COPY_CHANGED`);
        if (viewport.name === 'desktop') {
          assert.equal(snapshot.visible, true, `${label}:${theme}:PROMO_NOT_VISIBLE_DESKTOP`);
          assert(snapshot.height >= 130 && snapshot.height <= 190, `${label}:${theme}:PROMO_HEIGHT:${snapshot.height}`);
        }
        snapshots[`${viewport.name}-${theme}`] = snapshot;
        await page.screenshot({ path: `audit/${label}-${viewport.name}-${theme}.png`, fullPage: false });
      }
    }
    assert.equal(pageErrors.length, 0, `${label}:BROWSER_SCRIPT_ERRORS:${pageErrors.join('|')}`);
    return { snapshots, pageErrors };
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
  const patch = patchHtml(htmlBefore);
  assert.equal(patch.html.replace(patch.tag, ''), htmlBefore, 'NON_PROMO_HTML_CHANGED');
  const css = readFileSync(resolve('assets', CSS_PATH));
  const runtimeJs = readFileSync(resolve('assets', JS_PATH));
  const image = readFileSync(resolve('assets', IMAGE_PATH));
  assert(css.includes(Buffer.from(MARK)) && runtimeJs.includes(Buffer.from(MARK)), 'PROMO_ASSET_MARKER_MISSING');
  assert(image.length > 100000 && image.length < 500000, `IMAGE_SIZE_OUT_OF_RANGE:${image.length}`);
  const patchedSource = patchWorkerSource(source, css.toString('utf8'), runtimeJs.toString('utf8'));
  const settings = await api(`/scripts/${SCRIPT}/settings`);
  const settingsBefore = canonical(settings);
  const cronsBefore = await schedules();
  const backendBefore = await backend();
  report.guards = {
    workerSourceSha: sha(source),
    candidateWorkerSourceSha: sha(patchedSource),
    activeModuleIndexSha: sha(moduleHtml),
    servedIndexSha: sha(directHtml),
    htmlBeforeSha: sha(htmlBefore),
    htmlAfterSha: sha(patch.html),
    originalModuleCount: current.modules.length,
    settingsSha: sha(settingsBefore),
    crons: cronsBefore,
    backend: backendBefore
  };
  save();

  const staged = await stageCurrent(current, settings, cronsBefore, source, htmlBefore, patch.html);
  report.staged = await verifyStagedBrowser(staged);
  save();
  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_BEFORE_UPLOAD');
  assert.equal(canonical(await api(`/scripts/${SCRIPT}/settings`)), settingsBefore, 'SETTINGS_MOVED_BEFORE_UPLOAD');
  candidate = await uploadKeepAssetsVersion(current, patchedSource, image);
  assert(candidate && candidate !== base, 'CANDIDATE_VERSION_MISSING');
  report.candidateVersion = candidate;
  save();

  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_DURING_CANDIDATE_UPLOAD');
  const deployedVersion = await getVersion(candidate);
  await verifyCandidate(deployedVersion, current, patchedSource, sha(image));
  const previewOrigin = `https://${candidate.slice(0, 8)}-${SCRIPT}.mccarey-supon.workers.dev`;
  report.preview = await inspectPromo(previewOrigin, 'candidate-preview', true);
  assert.equal(await activeVersion(), base, 'PRODUCTION_MOVED_DURING_CANDIDATE_PREVIEW');

  await api(`/scripts/${SCRIPT}/deployments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: candidate, percentage: 100 }], annotations: { 'workers/message': `Deploy ${MARK}` } })
  });
  activated = true;
  assert.equal(await activeVersion(), candidate, 'CANDIDATE_NOT_ACTIVE');
  report.afterVersion = candidate;
  save();

  let propagated = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const custom = await publicFile('/index.html');
      const direct = await publicFile('/index.html', DIRECT_ORIGIN);
      if (hasServedPromo(custom) && hasServedPromo(direct) && sha(custom) === sha(direct)) {
        propagated = true;
        break;
      }
    } catch (error) {
      // Cloudflare can briefly return a transient edge status while the newly
      // activated version propagates. Retry only rate-limit/server statuses;
      // authentication, routing and all other failures still fail closed.
      if (!/PUBLIC_HTTP:\/index\.html:(?:429|5\d\d)$/.test(String(error.message))) throw error;
    }
    await delay(1000);
  }
  assert.equal(propagated, true, 'PUBLIC_HTML_DID_NOT_PROPAGATE');
  assert.equal(sha(await publicFile('/' + CSS_PATH)), staged.cssSha, 'PRODUCTION_CSS_MISMATCH');
  assert.equal(sha(await publicFile('/' + JS_PATH)), staged.jsSha, 'PRODUCTION_JS_MISMATCH');
  assert.equal(sha(await publicFile('/' + IMAGE_PATH)), staged.imageSha, 'PRODUCTION_IMAGE_MISMATCH');
  await verifyAssets(DIRECT_ORIGIN, staged);
  report.production = await inspectPromo(ORIGIN, 'production', true);
  assert.equal(canonical(await api(`/scripts/${SCRIPT}/settings`)), settingsBefore, 'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()), canonical(cronsBefore), 'SCHEDULES_CHANGED');
  assert.equal(canonical(await backend()), canonical(backendBefore), 'BACKEND_REVISION_CHANGED');
  const finalVersion = await getVersion(candidate);
  await verifyCandidate(finalVersion, current, patchedSource, sha(image));
  assert.equal(await activeVersion(), candidate, 'PRODUCTION_MOVED_DURING_VERIFICATION');
  report.result = 'SUCCESS';
  report.completedAt = new Date().toISOString();
  save();
  console.log('BALL46_MEMBER_PROMO_SUCCESS ' + JSON.stringify({ beforeVersion: base, afterVersion: candidate, protectedAssets: staged.pathCount, originalModules: current.modules.length, cssSha: staged.cssSha, jsSha: staged.jsSha, imageSha: staged.imageSha }));
} catch (error) {
  report.error = error.message;
  report.result = activated ? 'FAILED_ROLLBACK_REQUIRED' : 'FAILED_BEFORE_ACTIVATION';
  save();
  try { await rollback(); } catch (rollbackError) { report.rollbackError = rollbackError.message; save(); }
  console.error(error.stack);
  process.exitCode = 1;
}


