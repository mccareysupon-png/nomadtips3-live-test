import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dashboardPath, marker, patchDashboard, patchHtml } from './patch.mjs';
import { ThemeResponsePending, verifyTheme } from './verify.mjs';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, RUNNER_TEMP: scratch } = process.env;
assert(token && account && scratch, 'Cloudflare credentials and runner directory are required');
const site = 'ball46-production';
const live = 'https://www.ball46.com';
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const deployments = `/scripts/${site}/deployments`;
const versions = `/scripts/${site}/versions?bindings_inherit=strict`;
const entry = 'codex-pc-default-dark-entry-v1.mjs';
const patch = 'codex-pc-default-dark-patch-v1.mjs';
const note = 'Codex PC | Ball46 first visit defaults to Dark';
const out = scratch + '/codex-pc-default-dark-production-proof';
const playwright = createRequire(scratch + '/codex-pc-theme-runtime/package.json')('playwright');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
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

async function active() {
  const result = await cloudflare(deployments + '?per_page=1');
  const versions = result.deployments[0].versions;
  assert(versions.length === 1 && Number(versions[0].percentage) === 100, 'Production traffic is split');
  return versions[0].version_id;
}

async function expectActive(id) {
  assert.equal(await active(), id, 'Production version changed during this release');
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
    headers: { 'cache-control': 'no-cache', 'user-agent': 'Mozilla/5.0 Ball46-Codex-PC-Theme' },
    signal: AbortSignal.timeout(23000),
  });
  assert.equal(response.status, 200, origin + path);
  if (origin !== 'https://ball46.com') assert.equal(new URL(response.url).origin, origin);
  return Buffer.from(await response.arrayBuffer());
}

const baseline = await active();
await writeFile(out + '/baseline.json', JSON.stringify({ worker: site, baseline }));
console.log('Production baseline', baseline);
const [base, settings, subdomain] = await Promise.all([
  version(baseline), cloudflare(`/scripts/${site}/settings`), cloudflare(`/scripts/${site}/subdomain`),
]);
assert(base.main_module && base.modules?.length, 'Production version is missing source modules');
const alreadyActive = base.modules.some(module => module.name === entry);
const originalDashboard = (await read(live, dashboardPath)).toString();
const expectedDashboard = alreadyActive ? originalDashboard : patchDashboard(originalDashboard);
new Function(expectedDashboard);

const paths = ['/', '/index.html?view=statistics', '/index.html?view=signal'];
const unchanged = [
  '/singlepage-workspace-343.js', '/longterm-performance-343.js',
  '/_codex-pc-market-icons/market-art.css', '/_codex-pc-market-icons/icons/total.webp',
];
const unchangedHashes = await Promise.all(unchanged.map(async path => sha(await read(live, path))));
if (!alreadyActive) {
  await Promise.all(paths.map(async path => assert(patchHtml((await read(live, path)).toString()).includes(marker))));
}

async function verifyResponse(origin) {
  await Promise.all(paths.map(async path => {
    const html = (await read(origin, path)).toString();
    assert(html.includes(marker) && /<html\b[^>]*\bdata-theme="dark"/i.test(html), 'Missing Dark startup: ' + origin + path);
    assert(html.includes('codex_pc_default_dark=1') && html.includes('content="#050807"'), 'Incomplete startup theme: ' + origin + path);
    assert(html.includes('id="codex-pc-market-icons-production"'), 'Market icons stylesheet missing');
  }));
  const dashboard = (await read(origin, dashboardPath + '?codex_pc_default_dark=1')).toString();
  assert.equal(sha(dashboard), sha(expectedDashboard), 'Dashboard theme script differs from the checked patch');
  const hashes = await Promise.all(unchanged.map(async path => sha(await read(origin, path))));
  assert.deepEqual(hashes, unchangedHashes, 'A scope-external asset changed');
}

async function recordProduction(id) {
  await retry(() => verifyResponse(live), 24, 2300);
  const tests = await retry(() => verifyTheme(playwright, live), 6, 3000, error => {
    if (!(error instanceof ThemeResponsePending)) return false;
    console.log('Waiting for new HTML to reach every browser:', error.message);
    return true;
  });
  await retry(async () => {
    const apex = (await read('https://ball46.com', '/')).toString();
    assert(apex.includes(marker) && /<html\b[^>]*\bdata-theme="dark"/i.test(apex), 'Apex website did not receive Dark startup');
  }, 18, 2300);
  await expectActive(id);
  await writeFile(out + '/production.json', JSON.stringify({ worker: site, baseline, active: id, tests }, null, 2));
  console.log('Production default Dark verified', id);
}

if (alreadyActive) {
  await recordProduction(baseline);
  process.exit(0);
}

assert(subdomain.enabled && subdomain.previews_enabled, 'Inactive version previews are unavailable');
const entrySource = (await readFile(new URL('./entry.mjs', import.meta.url), 'utf8'))
  .replaceAll("'./__ORIGINAL_MAIN__'", JSON.stringify('./' + base.main_module));
const patchSource = await readFile(new URL('./patch.mjs', import.meta.url), 'utf8');
const modules = [...base.modules, ...[[entry, entrySource], [patch, patchSource]].map(([name, source]) => ({
  name, content_type: 'application/javascript+module', content_base64: Buffer.from(source).toString('base64'),
}))];
assert.equal(new Set(modules.map(module => module.name)).size, modules.length, 'Duplicate release modules');
const bindings = base.bindings ?? [];
const metadata = {
  main_module: entry,
  compatibility_date: base.compatibility_date,
  compatibility_flags: base.compatibility_flags ?? [],
  bindings: bindings.map(binding => binding.type === 'secret_text'
    ? { name: binding.name, type: 'inherit', version_id: baseline } : binding),
  keep_assets: true,
  annotations: { 'workers/message': note },
};
if (base.assets?.config) metadata.assets = { config: base.assets.config };
for (const field of ['usage_model', 'logpush', 'limits', 'observability', 'placement', 'tail_consumers']) {
  if (settings[field] != null) metadata[field] = settings[field];
}
const form = new FormData();
form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
for (const module of modules) {
  form.set(module.name, new Blob([Buffer.from(module.content_base64, 'base64')], { type: module.content_type }), module.name);
}

let candidate;
try {
  await expectActive(baseline);
  candidate = (await cloudflare(versions, form)).id;
  assert(candidate && candidate !== baseline, 'Invalid inactive version');
  const preview = `https://${candidate.slice(0, 8)}-${site}.mccarey-supon.workers.dev`;
  await writeFile(out + '/candidate.json', JSON.stringify({ baseline, candidate, preview }));
  console.log('Inactive candidate', candidate, preview);
  const saved = await version(candidate);
  const uploaded = new Map(saved.modules.map(module => [module.name, module]));
  assert.equal(saved.main_module, entry);
  assert.equal(uploaded.size, modules.length);
  for (const module of modules) {
    const copy = uploaded.get(module.name);
    assert(copy?.content_type === module.content_type, 'Module metadata changed: ' + module.name);
    assert.equal(sha(Buffer.from(copy.content_base64, 'base64')), sha(Buffer.from(module.content_base64, 'base64')), module.name);
  }
  assert.equal(saved.bindings.length, bindings.length);
  for (const binding of bindings) {
    const copy = saved.bindings.find(value => value.name === binding.name);
    assert.equal(copy?.type, binding.type);
    if (binding.type !== 'secret_text') assert.deepEqual(copy, binding);
  }
  assert.equal(saved.compatibility_date, base.compatibility_date);
  assert.deepEqual(saved.compatibility_flags ?? [], base.compatibility_flags ?? []);
  assert.deepEqual(saved.assets?.config, base.assets?.config);

  await retry(() => verifyResponse(preview), 20, 1700);
  const tests = await verifyTheme(playwright, preview);
  await writeFile(out + '/inactive-tests.json', JSON.stringify(tests, null, 2));
  await expectActive(baseline);
  await assign(candidate, note);
  await retry(() => expectActive(candidate), 12, 1500);
  await recordProduction(candidate);
} catch (error) {
  if (candidate && await retry(active, 5, 1200) === candidate) {
    await assign(baseline, note + ' | rollback');
    await retry(() => expectActive(baseline), 12, 1500);
    console.log('Production rolled back to', baseline);
  }
  throw error;
}
