import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { active, canonical, cloudflare, DIRECT, DOMAIN, eventually, get, hash, SITE, version } from
  '../../default-odds-crossdevice-20261123/release/cloudflare.mjs';
import { buildIndex, fromCachedSnapshot } from '../fixture-index.mjs';
import { expected, proofPath, settingFields, settingsForSite, sourceHash } from './inspect.mjs';
import { browserSmoke, protectedSurface, seoSmoke } from './smoke.mjs';

assert.equal(process.env.B46_SEO_MODE, 'activate', 'Release activation must be enabled explicitly');
const pin = process.env.B46_SEO_BASE_SOURCE_HASH;
assert.match(pin ?? '', /^[a-f\d]{64}$/);
const inspected = JSON.parse(await readFile(proofPath, 'utf8'));
assert.equal(inspected.sourceHash, pin);
const entryName = 'b46-frontend-seo-entry-20261124.mjs';
const baseline = await active();
assert.deepEqual(baseline, inspected.live);
assert.equal(baseline.version, expected, 'Production version drifted');
const report = { previousDeployment: baseline.deployment, rollback: baseline.version,
  originalSourceHash: pin };
const proof = () => writeFile(process.env.RUNNER_TEMP + '/ball46-seo-release.json', JSON.stringify(report, null, 2));
await proof();

const protectedWorkers = [
  'nomadtips3-engine-343', 'nomadtips3-5usd-hub-343', 'nomadtips3-full-market-343-ball46',
  'ball46-member-production', 'ball46-shadow-receiver-production', 'ball46-performance-summary',
];
const [base, before, ...others] = await Promise.all([
  version(SITE, expected), settingsForSite(), ...protectedWorkers.map(active),
]);
assert.equal(sourceHash(base), pin, 'Exact Production source differs from its inspection');
assert.equal(base.main_module, inspected.main);
assert(before.subdomain.previews_enabled, 'Could not test an inactive version');
report.originalModules = base.modules.length;
report.originalBindings = base.bindings.length;
await proof();

async function guard(id) {
  const [site, ...current] = await Promise.all([active(), ...protectedWorkers.map(active)]);
  assert.equal(site.version, id, 'Primary Production Worker moved');
  for (const [i, item] of current.entries()) {
    assert.equal(item.version, others[i].version, protectedWorkers[i] + ' moved');
  }
  return site;
}

function compareConfiguration(after) {
  for (const key of settingFields) {
    assert.equal(canonical(after.settings[key]), canonical(before.settings[key]), 'Settings changed: ' + key);
  }
  assert.deepEqual(after.schedules, before.schedules);
  assert.deepEqual(after.subdomain, before.subdomain);
}

function moduleEntry(name, source) {
  return { name, content_type: 'application/javascript+module', content_base64: Buffer.from(source).toString('base64') };
}

async function upload(seed) {
  const wrapper = (await readFile(new URL('./production.mjs', import.meta.url), 'utf8'))
    .replaceAll('__ACTIVE_ENTRY__', base.main_module);
  const sourceNames = ['seo.mjs', 'copy.mjs', 'fixture-index.mjs', 'fixture-cache.mjs'];
  const extra = await Promise.all(sourceNames.map(async name =>
    moduleEntry(name, await readFile(new URL('../' + name, import.meta.url)))));
  const modules = [
    ...base.modules, ...extra, moduleEntry(entryName, wrapper),
    moduleEntry('b46-seo-fixture-seed-20261124.mjs', 'export default ' + JSON.stringify(seed) + ';'),
  ];
  assert.equal(new Set(modules.map(module => module.name)).size, modules.length, 'Module name collision');

  const metadata = {
    main_module: entryName, compatibility_date: base.compatibility_date,
    compatibility_flags: base.compatibility_flags ?? [],
    bindings: base.bindings.map(binding => binding.type === 'secret_text' ?
      { name: binding.name, type: 'inherit', version_id: expected } : binding),
    keep_assets: true, assets: { config: base.assets.config },
    annotations: { 'workers/message': 'BALL46 frontend SEO and international localization' },
  };
  for (const key of settingFields) if (before.settings[key] != null && !(key in metadata)) {
    metadata[key] = before.settings[key];
  }
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  for (const module of modules) {
    form.set(module.name, new Blob([Buffer.from(module.content_base64, 'base64')], { type: module.content_type }), module.name);
  }
  await guard(expected);
  const result = await cloudflare('/scripts/' + SITE + '/versions?bindings_inherit=strict', 'POST', form);
  assert(result.id && result.id !== expected);
  return { id: result.id, modules };
}

async function verifyUploaded(id, modules) {
  const staged = await eventually(() => version(SITE, id), 6, 1400);
  assert.equal(staged.main_module, entryName);
  assert.equal(staged.modules.length, modules.length);
  const actual = new Map(staged.modules.map(module => [module.name, module]));
  for (const expectedModule of modules) {
    const got = actual.get(expectedModule.name);
    assert(got && got.content_type === expectedModule.content_type &&
      hash(Buffer.from(got.content_base64, 'base64')) === hash(Buffer.from(expectedModule.content_base64, 'base64')),
    'Module diff: ' + expectedModule.name);
  }
  assert.equal(staged.bindings.length, base.bindings.length);
  for (const existing of base.bindings) {
    const got = staged.bindings.find(binding => binding.name === existing.name);
    assert(got && got.type === existing.type, 'Missing binding: ' + existing.name);
    if (existing.type !== 'secret_text') assert.equal(canonical(got), canonical(existing), 'Binding diff: ' + existing.name);
  }
  assert.equal(staged.compatibility_date, base.compatibility_date);
  assert.deepEqual(staged.compatibility_flags ?? [], base.compatibility_flags ?? []);
  assert.equal(canonical(staged.assets?.config), canonical(base.assets.config));
  report.stagedModules = staged.modules.length;
  report.bindingsVerified = staged.bindings.length;
}

function assign(id, message) {
  return cloudflare('/scripts/' + SITE + '/deployments', 'POST', {
    strategy: 'percentage', versions: [{ version_id: id, percentage: 100 }],
    annotations: { 'workers/message': message },
  });
}

let candidate;
let activationAttempted = false;
try {
  const [oldSurface, publicSnapshot] = await Promise.all([
    protectedSurface(DIRECT),
    eventually(async () => (await get(DOMAIN + '/api/hub/snapshot')).json(), 4, 1200),
  ]);
  const seed = buildIndex(fromCachedSnapshot(publicSnapshot));
  const sample = seed.entries.find(match => match.status === 'finished');
  assert(sample, 'No finished fixture for post-deploy validation');
  report.seed = { count: seed.entries.length, observedAt: new Date(seed.observedAt).toISOString() };

  const uploaded = await upload(seed);
  candidate = uploaded.id;
  const preview = 'https://' + candidate.slice(0, 8) + '-' + SITE + '.mccarey-supon.workers.dev';
  report.candidate = candidate;
  report.preview = preview;
  await proof();
  console.log('BALL46_SEO_INACTIVE', JSON.stringify({ candidate, preview }));

  await verifyUploaded(candidate, uploaded.modules);
  report.inactiveHttp = await eventually(() => seoSmoke(preview, { preview: true, sample, allLocales: true }), 4, 1500);
  await eventually(async () => assert.deepEqual(await protectedSurface(preview), oldSurface,
    'Protected assets, API contracts or application scripts changed in preview'), 4, 1200);
  report.inactiveBrowser = await browserSmoke(preview);
  report.inactiveQA = 'passed';
  compareConfiguration(await settingsForSite());
  await proof();

  await guard(expected);
  activationAttempted = true;
  const activation = await assign(candidate, 'BALL46 frontend SEO and international localization only');
  report.deployment = activation.id;
  await proof();
  const deployed = await eventually(() => guard(candidate), 10, 2000);
  report.deployment = deployed.deployment;
  report.version = deployed.version;
  report.publicHttp = await Promise.all([
    eventually(() => seoSmoke(DOMAIN, { sample }), 7, 2100),
    eventually(() => seoSmoke('https://www.ball46.com', { sample, allLocales: true }), 7, 2100),
  ]);
  await eventually(async () => assert.deepEqual(await protectedSurface(DIRECT), oldSurface,
    'Protected assets, API contracts or application scripts changed in Production'), 4, 1500);
  report.publicBrowser = await browserSmoke(DOMAIN);
  await guard(candidate);
  compareConfiguration(await settingsForSite());
  report.productionQA = 'passed';
  await proof();
  console.log('BALL46_SEO_PRODUCTION_RELEASE', JSON.stringify(report));
} catch (error) {
  report.error = error.message.split('\n')[0];
  if (candidate && activationAttempted) {
    try {
      const current = await active();
      if (current.version === candidate) {
        const restored = await assign(expected, 'Rollback BALL46 frontend SEO after failed verification');
        await eventually(async () => assert.equal((await active()).version, expected), 10, 2000);
        report.rolledBack = true;
        report.rollbackDeployment = restored.id;
      } else {
        report.activeAfterFailure = current.version;
      }
    } catch (rollbackError) {
      report.rollbackError = rollbackError.message;
    }
  }
  await proof();
  console.log('BALL46_SEO_RELEASE_STOP', JSON.stringify(report));
  throw error;
}
