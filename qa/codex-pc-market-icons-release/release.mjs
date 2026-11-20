import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, RUNNER_TEMP: scratch } = process.env;
assert(token && account && scratch, 'Cloudflare credentials and runner directory are required');

const site = 'ball46-production';
const live = 'https://www.ball46.com';
const test = 'https://ball46-codex-pc-stats-market-icons-preview.mccarey-supon.workers.dev';
const statistics = '/index.html?view=statistics';
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const versionsPath = `/scripts/${site}/versions?bindings_inherit=strict`;
const deploymentsPath = `/scripts/${site}/deployments`;
const annotation = 'Codex PC | Ball46 statistics market icons';
const entry = 'codex-pc-market-icons-entry-v1.mjs';
const assetModule = 'codex-pc-market-icons-assets-v1.mjs';
const marker = 'id="codex-pc-market-icons-production"';
const prefix = '/_codex-pc-market-icons/';
const out = scratch + '/codex-pc-market-icons-production-proof';
const require = createRequire(scratch + '/codex-pc-icons-runtime/package.json');
const { chromium, devices } = require('playwright');
const sha = data => createHash('sha256').update(data).digest('hex');
const paths = ['market-art.css', ...[
  'total', '1x2', 'asian-handicap', 'over-under', 'both-teams-to-score', 'corners', 'cards', 'other',
].map(name => `icons/${name}.webp`)];
const assetsRoot = new URL('../codex-pc-stats-market-icons/public/', import.meta.url);
await mkdir(out, { recursive: true });

async function retry(action, attempts, interval) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}

async function cloudflare(path, body) {
  const write = body !== undefined;
  if (write) assert([versionsPath, deploymentsPath].includes(path), 'Unexpected Cloudflare write target');
  const form = body instanceof FormData;
  const response = await fetch(api + path, {
    method: write ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(write && !form ? { 'content-type': 'application/json' } : {}),
    },
    body: write && !form ? JSON.stringify(body) : body,
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  assert(response.ok && result.success, `Cloudflare ${response.status} ${path}: ${JSON.stringify(result.errors ?? [])}`);
  return result.result;
}

async function active() {
  const { deployments } = await cloudflare(deploymentsPath + '?per_page=1');
  const versions = deployments[0].versions;
  assert(versions.length === 1 && Number(versions[0].percentage) === 100, 'Production traffic is split');
  return versions[0].version_id;
}

async function expectActive(id) {
  assert.equal(await active(), id, 'Production Worker version changed while preparing this release');
}

const baseline = await active();
await writeFile(out + '/baseline.json', JSON.stringify({ worker: site, baseline }));
console.log('Production baseline', baseline);

function version(id) {
  return retry(() => cloudflare(`/workers/${site}/versions/${id}?include=modules`), 10, 1500);
}

function assign(id, label) {
  return cloudflare(deploymentsPath, {
    strategy: 'percentage',
    versions: [{ version_id: id, percentage: 100 }],
    annotations: { 'workers/message': label },
  });
}

async function request(origin, path) {
  const response = await fetch(origin + path, {
    headers: { 'cache-control': 'no-cache', 'user-agent': 'Mozilla/5.0 Ball46-Codex-PC-Release' },
    signal: AbortSignal.timeout(25000),
  });
  assert.equal(response.status, 200, origin + path);
  assert.equal(new URL(response.url).origin, origin, 'Request left the release host');
  return { body: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') };
}

const assets = Object.fromEntries(await Promise.all(paths.map(async path => {
  const key = prefix + path;
  const data = await readFile(new URL(key.slice(1), assetsRoot));
  return [key, {
    type: path.endsWith('.css') ? 'text/css; charset=utf-8' : 'image/webp',
    etag: '"' + sha(data) + '"',
    data: data.toString('base64'),
  }];
})));

async function verifyAssets(origin) {
  await Promise.all(Object.entries(assets).map(async ([path, asset]) => {
    const { body, type } = await request(origin, path);
    assert(type?.startsWith(asset.type.split(';')[0]), 'Wrong content type for ' + path);
    assert.equal(sha(body), asset.etag.slice(1,-1), 'Artwork differs from test package: ' + path);
  }));
}

async function verifyHtml(origin) {
  const { body } = await request(origin, statistics);
  const html = body.toString();
  assert.equal(html.split(marker).length, 2, 'Expected one production stylesheet on ' + origin);
  assert(html.includes('href="' + prefix + 'market-art.css"'), 'Missing market stylesheet on ' + origin);
}

const originalScripts = [
  '/singlepage-workspace-343.js',
  '/longterm-performance-343.js',
  '/b46-statistics-fast-v1-20261116.js',
];
const originalHashes = await Promise.all(originalScripts.map(async path => sha((await request(live, path)).body)));

async function verifyOriginalScripts(origin) {
  const results = await Promise.all(originalScripts.map(async path => sha((await request(origin, path)).body)));
  assert.deepEqual(results, originalHashes, 'Existing statistics scripts differ');
}

async function browserQA(origin, phase) {
  const browser = await chromium.launch({ headless: true });
  const selector = '#b46-finance-chart-card .f46-overview > div:first-child:has(> .f46-value):visible';
  const activeMarket = '.left-rail [data-stat-market].active';
  const cases = [
    { theme: 'dark', layout: 'desktop', market: 'total' },
    { theme: 'light', layout: 'desktop', market: 'asian-handicap' },
    { theme: 'dark', layout: 'mobile', market: 'total' },
  ];
  try {
    await Promise.all(cases.map(async ({ theme, layout, market }) => {
      const config = layout === 'mobile' ? devices['iPhone 13'] : { viewport: { width: 1920, height: 950 } };
      const page = await browser.newPage({ ...config, serviceWorkers: 'block' });
      await page.addInitScript(value => localStorage.setItem('nomad343_dashboard_theme_v1', value), theme);
      await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
      const response = await page.goto(origin + statistics, { waitUntil: 'domcontentloaded', timeout: 40000 });
      assert(response?.ok() && new URL(page.url()).origin === origin, 'Statistics did not open on ' + origin);
      const header = page.locator(selector).first();
      await header.waitFor({ timeout: 35000 });
      if (market === 'asian-handicap') {
        await page.locator('.left-rail [data-stat-market="ah"]').first().click();
        await page.waitForFunction(selector => document.querySelector(selector)?.dataset.statMarket === 'ah', activeMarket);
        await header.waitFor({ timeout: 35000 });
      }
      const icon = prefix + `icons/${market}.webp`;
      await page.evaluate(async src => {
        const img = new Image();
        img.src = src;
        await img.decode();
      }, icon);
      const proof = await header.evaluate(element => {
        const art = getComputedStyle(element, '::after');
        const text = document.createRange();
        text.selectNodeContents(element.querySelector('.f46-meta'));
        return {
          theme: document.documentElement.dataset.theme,
          asset: art.backgroundImage,
          shadow: art.filter,
          clearOfText: text.getBoundingClientRect().right + 8 <
            element.getBoundingClientRect().right - parseFloat(art.width),
        };
      });
      assert.equal(proof.theme, theme);
      assert(proof.asset.includes(icon) && proof.clearOfText && proof.shadow.startsWith('drop-shadow('), JSON.stringify(proof));
      await page.locator('#b46-finance-chart-card .f46-overview:visible').first().screenshot({
        path: `${out}/${phase}-${theme}-${layout}.png`, animations: 'disabled',
      });
      console.log('Browser verified', JSON.stringify({ phase, theme, layout, market }));
      await page.close();
    }));
  } finally {
    await browser.close();
  }
}

await verifyAssets(test);

const [base, settings, subdomain] = await Promise.all([
  version(baseline), cloudflare(`/scripts/${site}/settings`), cloudflare(`/scripts/${site}/subdomain`),
]);
assert(base.main_module && base.modules?.length, 'Production version has no modules');
assert(subdomain.enabled && subdomain.previews_enabled, 'Inactive Worker version previews are unavailable');

const entrySource = (await readFile(new URL('./entry.mjs', import.meta.url), 'utf8'))
  .replaceAll("'./__ORIGINAL_MAIN__'", JSON.stringify('./' + base.main_module));
const added = [[entry, entrySource], [assetModule, 'export default ' + JSON.stringify(assets) + ';']];
const modules = [
  ...base.modules,
  ...added.map(([name, source]) => ({
    name,
    content_type: 'application/javascript+module',
    content_base64: Buffer.from(source).toString('base64'),
  })),
];
assert.equal(new Set(modules.map(module => module.name)).size, modules.length, 'Duplicate release module');
const bindings = base.bindings ?? [];
const metadata = {
  main_module: entry,
  compatibility_date: base.compatibility_date,
  compatibility_flags: base.compatibility_flags ?? [],
  bindings: bindings.map(binding => binding.type === 'secret_text'
    ? { name: binding.name, type: 'inherit', version_id: baseline } : binding),
  keep_assets: true,
  annotations: { 'workers/message': annotation },
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
  candidate = (await cloudflare(versionsPath, form)).id;
  assert(candidate && candidate !== baseline, 'Invalid inactive Worker version');
  const preview = `https://${candidate.slice(0,8)}-${site}.mccarey-supon.workers.dev`;
  await writeFile(out + '/candidate.json', JSON.stringify({ baseline, candidate, preview }));
  console.log('Inactive candidate', candidate, preview);

  const saved = await version(candidate);
  assert.equal(saved.main_module, entry);
  assert.equal(saved.modules.length, modules.length);
  const uploadedModules = new Map(saved.modules.map(module => [module.name, module]));
  for (const module of modules) {
    const uploaded = uploadedModules.get(module.name);
    assert(uploaded && uploaded.content_type === module.content_type, 'Module metadata changed: ' + module.name);
    assert.equal(sha(Buffer.from(uploaded.content_base64, 'base64')), sha(Buffer.from(module.content_base64, 'base64')),
      'Module bytes changed: ' + module.name);
  }
  assert.equal(saved.bindings.length, bindings.length);
  for (const binding of bindings) {
    const uploaded = saved.bindings.find(item => item.name === binding.name);
    assert(uploaded && uploaded.type === binding.type, 'Binding changed: ' + binding.name);
    if (binding.type !== 'secret_text') assert.deepEqual(uploaded, binding);
  }
  assert.equal(saved.compatibility_date, base.compatibility_date);
  assert.deepEqual(saved.compatibility_flags ?? [], base.compatibility_flags ?? []);
  assert.deepEqual(saved.assets?.config, base.assets?.config);

  await retry(() => verifyHtml(preview), 18, 1700);
  await Promise.all([verifyAssets(preview), verifyOriginalScripts(preview)]);
  await browserQA(preview, 'inactive');
  await expectActive(baseline);
  await assign(candidate, annotation);
  await retry(() => expectActive(candidate), 12, 1500);
  await retry(() => verifyHtml(live), 22, 2300);
  await Promise.all([verifyAssets(live), verifyOriginalScripts(live)]);
  await browserQA(live, 'production');
  await expectActive(candidate);
  await writeFile(out + '/production.json', JSON.stringify({ worker: site, baseline, active: candidate, annotation }));
  console.log('Production release verified', candidate);
} catch (error) {
  if (candidate && await active() === candidate) {
    await assign(baseline, annotation + ' | rollback');
    await retry(() => expectActive(baseline), 12, 1500);
    console.log('Production rolled back to', baseline);
  }
  throw error;
}
