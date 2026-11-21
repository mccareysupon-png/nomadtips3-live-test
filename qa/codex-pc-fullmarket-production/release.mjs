import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { nativeOptimized, nativePaths } from './native-patches.mjs';
import { fullMarketOddsScript, fullMarketOddsStyles } from '../fullmarket-odds-v3-20261121/fullmarket-odds-v3.mjs';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, RUNNER_TEMP: scratch, ...qaEnv } = process.env;
assert(token && account && scratch, 'Cloudflare credentials and runner directory are required');
const site = 'ball46-production';
const live = 'https://www.ball46.com';
const approved = 'https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev';
const api = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const deployments = '/scripts/' + site + '/deployments';
const versions = '/scripts/' + site + '/versions?bindings_inherit=strict';
const entry = 'codex-pc-fullmarket-v3-entry-20261121.mjs';
const dataModule = 'codex-pc-fullmarket-v3-assets-20261121.mjs';
const note = 'Codex PC | Full Market Odds V3, Event Flow and scroll | 20261121';
const out = scratch + '/codex-pc-fullmarket-production-proof';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const dashboard = '/index.html?status=live';
const originalOpt = "g.setAttribute('data-b46-fmb-perf-input-x',String(x));";
const containment = '<style id="b46-native-scroll-containment-production">@media(min-width:1024px){body[data-workspace-view="live"] .board-sections{overscroll-behavior-y:contain!important}}</style>';
const markup = containment + '<style id="b46-fullmarket-odds-v3-style-production">' + fullMarketOddsStyles +
  '</style><script id="b46-fullmarket-odds-v3-script-production">' + fullMarketOddsScript + '</script>';
const flowSource = scratch + '/ball46-unmodified-flow.js';
await mkdir(out, { recursive: true });

async function retry(action, attempts, delay, shouldRetry = () => true) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function cloudflare(path, body) {
  if (body !== undefined) assert([deployments, versions].includes(path), 'Unexpected Cloudflare write');
  const form = body instanceof FormData;
  const response = await fetch(api + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, ...(body && !form ? { 'content-type': 'application/json' } : {}) },
    body: body && !form ? JSON.stringify(body) : body,
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  assert(response.ok && result.success, `Cloudflare ${response.status} ${path}: ${JSON.stringify(result.errors ?? [])}`);
  return result.result;
}

async function active(worker = site) {
  const result = await cloudflare('/scripts/' + worker + '/deployments?per_page=1');
  const deployment = result.deployments[0];
  const versions = deployment?.versions;
  assert(versions?.length === 1 && Number(versions[0].percentage) === 100, 'Unexpected traffic split on ' + worker);
  return { deploymentId: deployment.id, versionId: versions[0].version_id };
}

async function expectActive(id) {
  assert.equal((await active()).versionId, id, 'Production version changed during this release');
}

function version(id) {
  return retry(() => cloudflare(`/workers/${site}/versions/${id}?include=modules`), 10, 1500);
}

function assign(id, message) {
  return cloudflare(deployments, {
    strategy: 'percentage',
    versions: [{ version_id: id, percentage: 100 }],
    annotations: { 'workers/message': message },
  });
}

async function read(origin, path) {
  const response = await fetch(origin + path, {
    headers: { 'cache-control': 'no-cache', 'user-agent': 'Mozilla/5.0 Ball46-Codex-PC-Fullmarket-V3' },
    signal: AbortSignal.timeout(23000),
  });
  assert.equal(response.status, 200, origin + path);
  assert.equal(new URL(response.url).origin, origin, 'Request left the release host');
  return Buffer.from(await response.arrayBuffer());
}

const baseline = await active();
assert(baseline.deploymentId, 'Missing original Deployment ID');
const rollbackId = baseline.versionId;
const protectedWorkers = ['nomadtips3-engine-343', 'ball46-shadow-receiver-production'];
const [base, settings, subdomain, originalCron, ...services] = await Promise.all([
  version(rollbackId), cloudflare('/scripts/' + site + '/settings'),
  cloudflare('/scripts/' + site + '/subdomain'), cloudflare('/scripts/' + site + '/schedules'),
  ...protectedWorkers.map(worker => active(worker)),
]);
assert(base.main_module && base.modules?.length && base.assets, 'Cannot back up the live application source');
const moduleHashes = modules => Object.fromEntries(modules.map(module =>
  [module.name, sha(Buffer.from(module.content_base64, 'base64'))]));
const manifest = moduleHashes(base.modules);
await writeFile(out + '/rollback.json', JSON.stringify({
  ...baseline, rollbackId, mainModule: base.main_module, moduleHashes: manifest,
  bindings: base.bindings.map(({ name, type }) => ({ name, type })),
  services: Object.fromEntries(protectedWorkers.map((worker, i) => [worker, services[i]])),
}, null, 2));
console.log('Production source inspected and rollback saved', JSON.stringify({ ...baseline, rollbackId, modules: base.modules.length }));

const health = JSON.parse(await read(approved, '/__fullmarket_health'));
assert.equal(health.scope, 'ISOLATED_TEST_ONLY');
assert.equal(health.name, 'ball46-fullmarket-odds-v3-test-20261121');
assert.equal(health.styles, fullMarketOddsStyles);
assert.equal(health.script, fullMarketOddsScript);
assert(!fullMarketOddsScript.includes('fetch(') && !fullMarketOddsScript.includes('window.fetch='));
const originalHome = (await read(live, dashboard)).toString();
const approvedHome = (await read(approved, dashboard)).toString();
assert(!originalHome.includes('b46-fullmarket-odds-v3-style-production'), 'Full Market release is already present');
const protectedHtml = [ 'b46-odds-flash-production', 'b46-odds-flash-runtime-production',
  'codex-pc-default-dark', 'codex-pc-market-icons-production', 'codex-pc-mobile-stats-cards',
  'codex-pc-favorite-stars', 'codex-pc-mobile-footer', 'codex-pc-right-sidebar', 'codex-pc-right-sidebar-view' ];

function htmlBlock(html, id) {
  const openings = ['style', 'script', 'link'].map(tag => ({ tag, start: html.indexOf('<' + tag + ' id="' + id + '"') }));
  const match = openings.find(({ start }) => start !== -1);
  assert(match, 'Missing protected element ' + id);
  const endToken = match.tag === 'link' ? '>' : '</' + match.tag + '>';
  const end = html.indexOf(endToken, match.start);
  assert(end >= 0, 'Unclosed protected element ' + id);
  return html.slice(match.start, end + endToken.length);
}

const protectedBlocks = protectedHtml.map(id => htmlBlock(originalHome, id));
function requestedAsset(html, path, origin) {
  const matches = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)]
    .map(match => new URL(match[1].replaceAll('&amp;', '&'), origin))
    .filter(url => url.pathname === path && url.origin === origin);
  assert.equal(matches.length, 1, 'Expected one browser script reference for ' + path);
  return matches[0].pathname + matches[0].search;
}

const nativeAssets = {};
const diffs = [];
for (const file of nativePaths) {
  const actualPath = requestedAsset(originalHome, file, live);
  assert.equal(requestedAsset(approvedHome, file, approved), actualPath, 'The QA browser loads a different resource');
  const bytes = await read(live, actualPath);
  const before = bytes.toString();
  const after = nativeOptimized(file, before);
  assert.notEqual(after, before, 'Missing exact QA replacement');
  const tested = (await read(approved, actualPath)).toString();
  assert.equal(tested.split(originalOpt).length, file.includes('ui-sync') ? 2 : 1, 'Unexpected QA instrumentation');
  assert.equal(sha(after), sha(tested.replace(originalOpt, '')), 'Native diff does not match QA on ' + actualPath);
  assert(!after.includes('data-b46-fmb-perf-input-x'), 'Test-only diagnostic leaked to production');
  nativeAssets[actualPath] = { sha: sha(bytes), code: after };
  diffs.push({ url: actualPath, before: sha(bytes), after: sha(after), bytesBefore: bytes.length, bytesAfter: Buffer.byteLength(after) });
  if (file.includes('ui-sync')) await writeFile(flowSource, bytes);
}
const protectedAssets = ['/full-market-bookmaker-343.js', '/full-market-bookmaker-343.css',
  '/singlepage-workspace-343.js', '/longterm-performance-343.js', '/b46-member-athlete-20261109.webp?v=1'];
const assetHashes = await Promise.all(protectedAssets.map(path => read(live, path).then(sha)));
await writeFile(out + '/diff.json', JSON.stringify({
  qaCommit: '8a5610f609d0db9676b02dd93ae7b0ca3c6aeb24', patches: diffs,
  additions: [entry, dataModule], protectedAssets: Object.fromEntries(protectedAssets.map((path, i) => [path, assetHashes[i]])),
}, null, 2));
console.log('Compared exact browser asset URLs against the QA Worker', JSON.stringify(diffs));

async function verifyResponse(origin) {
  const html = (await read(origin, dashboard)).toString();
  assert.equal(html.split(markup).length, 2, 'Missing exact Full Market V3 markup on ' + origin);
  assert(!html.includes('b46-fullmarket-odds-v3-style-test') && !html.includes('b46-native-scroll-containment-test'));
  for (const [i, id] of protectedHtml.entries()) assert.equal(sha(htmlBlock(html, id)), sha(protectedBlocks[i]), id);
  const actual = await Promise.all(diffs.map(({ url }) => read(origin, url).then(sha)));
  assert.deepEqual(actual, diffs.map(value => value.after), 'Browser native patch bytes differ');
  const hashes = await Promise.all(protectedAssets.map(path => read(origin, path).then(sha)));
  assert.deepEqual(hashes, assetHashes, 'Unrelated web asset changed');
}

async function verifyProtected() {
  const [cron, ...state] = await Promise.all([
    cloudflare('/scripts/' + site + '/schedules'), ...protectedWorkers.map(worker => active(worker)),
  ]);
  assert.deepEqual(cron, originalCron, 'Production Cron configuration changed');
  assert.deepEqual(state, services, 'Engine or receiver deployment changed during the release');
}

async function runQa(origin, phase) {
  const tests = ['qa.mjs', 'eventflow-refresh-stress.mjs', 'scroll-anchor-qa.mjs', 'mobile-qa.mjs'];
  const evidence = [];
  for (const test of tests) {
    const path = fileURLToPath(new URL('./' + test, import.meta.url));
    let report = '';
    console.log('Browser QA', phase, test, origin);
    await new Promise((resolve, reject) => {
      const process = spawn(processExecPath, [path], {
        cwd: out, env: { ...qaEnv, B46_RELEASE_ORIGIN: origin, B46_NATIVE_FLOW_SOURCE: flowSource },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const stream of [process.stdout, process.stderr]) stream.on('data', chunk => {
        report += chunk;
        console.log(chunk.toString().trimEnd());
      });
      process.on('error', reject);
      process.on('close', code => code === 0 ? resolve() : reject(new Error(phase + ' QA failed: ' + test)));
    }).finally(() => writeFile(out + '/' + phase + '-' + test + '.log', report));
    evidence.push({ test, status: 'pass' });
  }
  return evidence;
}

const processExecPath = process.execPath;
assert(subdomain.enabled && subdomain.previews_enabled, 'Inactive version previews are unavailable');
const entrySource = (await readFile(new URL('./entry.mjs', import.meta.url), 'utf8'))
  .replaceAll("'./__ORIGINAL_MAIN__'", JSON.stringify('./' + base.main_module));
const dataSource = 'export const markup=' + JSON.stringify(markup) + ';export const nativeAssets=' + JSON.stringify(nativeAssets) + ';';
const modules = [...base.modules, ...[[entry, entrySource], [dataModule, dataSource]].map(([name, source]) => ({
  name, content_type: 'application/javascript+module', content_base64: Buffer.from(source).toString('base64'),
}))];
assert.equal(new Set(modules.map(module => module.name)).size, modules.length, 'Duplicate release module');

const bindings = base.bindings;
const metadata = {
  main_module: entry, keep_assets: true,
  compatibility_date: base.compatibility_date, compatibility_flags: base.compatibility_flags ?? [],
  bindings: bindings.map(binding => binding.type === 'secret_text'
    ? { name: binding.name, type: 'inherit', version_id: rollbackId } : binding),
  annotations: { 'workers/message': note },
};
if (base.assets.config) metadata.assets = { config: base.assets.config };
for (const field of ['usage_model', 'logpush', 'limits', 'observability', 'placement', 'tail_consumers']) {
  if (settings[field] != null) metadata[field] = settings[field];
}
const form = new FormData();
form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
for (const module of modules) form.set(module.name,
  new Blob([Buffer.from(module.content_base64, 'base64')], { type: module.content_type }), module.name);

let candidate;
try {
  await expectActive(rollbackId);
  await verifyProtected();
  candidate = (await cloudflare(versions, form)).id;
  assert(candidate && candidate !== rollbackId, 'Invalid inactive version');
  const preview = 'https://' + candidate.slice(0, 8) + '-' + site + '.mccarey-supon.workers.dev';
  const saved = await version(candidate);
  assert.equal(saved.main_module, entry);
  assert.deepEqual(moduleHashes(saved.modules), moduleHashes(modules));
  assert.deepEqual(saved.modules.map(({ name, content_type }) => [name, content_type]).sort(),
    modules.map(({ name, content_type }) => [name, content_type]).sort());
  assert.equal(saved.bindings.length, bindings.length);
  for (const binding of bindings) {
    const copy = saved.bindings.find(value => value.name === binding.name);
    assert.equal(copy?.type, binding.type);
    if (binding.type !== 'secret_text') assert.deepEqual(copy, binding);
  }
  assert.equal(saved.compatibility_date, base.compatibility_date);
  assert.deepEqual(saved.compatibility_flags ?? [], base.compatibility_flags ?? []);
  assert.deepEqual(saved.assets?.config, base.assets?.config);
  console.log('Inactive Production version prepared', candidate, preview);
  await retry(() => verifyResponse(preview), 20, 1700);
  const before = await runQa(preview, 'inactive');
  await expectActive(rollbackId);
  await verifyProtected();
  await assign(candidate, note);
  await retry(() => expectActive(candidate), 12, 1500);
  await retry(() => verifyResponse(live), 24, 2300);
  const after = await runQa(live, 'production');
  await verifyProtected();
  assert.deepEqual(moduleHashes((await version(rollbackId)).modules), manifest, 'Rollback version cannot be verified');
  const activeProduction = await active();
  assert.equal(activeProduction.versionId, candidate);
  assert(activeProduction.deploymentId, 'Missing Production Deployment ID');
  const report = { ...activeProduction, rollbackId, previousDeploymentId: baseline.deploymentId, before, after };
  await writeFile(out + '/production.json', JSON.stringify(report, null, 2));
  console.log('BALL46_FULLMARKET_PRODUCTION_PASS ' + JSON.stringify(report));
} catch (error) {
  if (candidate && (await retry(active, 5, 1200)).versionId === candidate) {
    const rollback = await assign(rollbackId, note + ' | rollback');
    await retry(() => expectActive(rollbackId), 12, 1500);
    console.log('Production rolled back', JSON.stringify({ versionId: rollbackId, deploymentId: rollback.id }));
  }
  throw error;
}
