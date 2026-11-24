import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { active, canonical, cloudflare, DIRECT, DOMAIN, eventually, hash, SITE, version } from
  '../default-odds-crossdevice-20261123/release/cloudflare.mjs';
import { settingFields, settingsForSite, sourceHash } from '../ball46-seo-20261124/release/inspect.mjs';
import { browserQA, surfaces } from './smoke.mjs';

const baselineVersion = 'e8c1821a-0bef-408e-af77-fa03e624c5ab';
const baselineDeployment = '00cd0d8c-9cd4-4d0c-b59e-514fdf427a14';
const baselineSource = 'ba8cef3f50034047848808e8c98600d2461e332a18f2b102b1d465684ae9e0ad';
const main = 'b46-frontend-seo-entry-20261124.mjs';
const presentation = 'b46-mobile-footer-ui-20261124.mjs';
const message = 'BALL46 mobile match drawer and footer SEO guide 20261124';
const mode = process.env.B46_MOBILE_FOOTER_MODE;
assert(['stage', 'activate'].includes(mode));
const report = { task: 'B46-FOOTER-SEO-BOTTOM-20261124', mode,
  commit: process.env.GITHUB_SHA, rollbackVersion: baselineVersion, previousDeployment: baselineDeployment };
const proof = async () => writeFile(process.env.RUNNER_TEMP + '/ball46-mobile-footer-release.json', JSON.stringify(report, null, 2));
await proof();

const protectedWorkers = [
  'nomadtips3-engine-343', 'nomadtips3-5usd-hub-343', 'nomadtips3-full-market-343-ball46',
  'ball46-member-production', 'ball46-shadow-receiver-production', 'ball46-performance-summary',
];
const before = await Promise.all([
  active(), version(SITE, baselineVersion), settingsForSite(), ...protectedWorkers.map(active),
]);
const [starting, base, configuration, ...protectedVersions] = before;
assert.deepEqual(starting, { deployment: baselineDeployment, version: baselineVersion }, 'The audited live deployment moved');
assert.equal(sourceHash(base), baselineSource, 'Active Worker modules changed since inspection');
assert.equal(base.main_module, main);
assert.equal(base.modules.length, 104);
assert.equal(base.bindings.length, 11);
assert(configuration.subdomain.previews_enabled && base.assets?.config);
const originals = new Map(base.modules.map(module => [module.name, module]));
assert(originals.has('seo.mjs') && !originals.has(presentation));
const changedModules = await Promise.all(['seo.mjs', presentation].map(async name => ({
  name, content_type: 'application/javascript+module',
  content_base64: (await readFile(new URL('../ball46-seo-20261124/' + name, import.meta.url))).toString('base64'),
})));
assert.notEqual(changedModules[0].content_base64, originals.get('seo.mjs').content_base64);
const modules = base.modules.map(module => module.name === 'seo.mjs' ? changedModules[0] : module);
modules.push(changedModules[1]);
report.diff = { replaced: ['seo.mjs'], added: [presentation], sameModules: modules.length - 2 };
report.expectedSource = sourceHash({ modules });
await proof();

async function verifyConfiguration() {
  const current = await settingsForSite();
  for (const key of settingFields) {
    assert.equal(canonical(current.settings[key]), canonical(configuration.settings[key]), 'Changed Worker setting: ' + key);
  }
  assert.deepEqual(current.subdomain, configuration.subdomain);
  assert.deepEqual(current.schedules, configuration.schedules);
}

async function guard(id) {
  const [site, ...current] = await Promise.all([active(), ...protectedWorkers.map(active)]);
  assert.equal(site.version, id, 'Production changed');
  if (id === baselineVersion) assert.equal(site.deployment, baselineDeployment, 'Production was redeployed');
  for (const [i, item] of current.entries()) {
    assert.deepEqual(item, protectedVersions[i], 'Protected Worker deployment changed: ' + protectedWorkers[i]);
  }
  return site;
}

async function upload() {
  const metadata = {
    main_module: main, compatibility_date: base.compatibility_date, compatibility_flags: base.compatibility_flags ?? [],
    bindings: base.bindings.map(binding => binding.type === 'secret_text' ?
      { name: binding.name, type: 'inherit', version_id: baselineVersion } : binding),
    keep_assets: true, assets: { config: base.assets.config },
    annotations: { 'workers/message': message },
  };
  for (const field of settingFields) {
    if (configuration.settings[field] != null && !(field in metadata)) metadata[field] = configuration.settings[field];
  }
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  for (const module of modules) {
    form.set(module.name, new Blob([Buffer.from(module.content_base64, 'base64')], { type: module.content_type }), module.name);
  }
  await guard(baselineVersion);
  const staged = await cloudflare('/scripts/' + SITE + '/versions?bindings_inherit=strict', 'POST', form);
  assert(staged.id && staged.id !== baselineVersion);
  return staged.id;
}

async function verifyCandidate(id) {
  const actual = await version(SITE, id);
  assert.equal(actual.main_module, main);
  assert.equal(actual.modules.length, modules.length);
  assert.equal(sourceHash(actual), report.expectedSource, 'Candidate module hashes differ from the approved patch');
  assert.equal(actual.bindings.length, base.bindings.length);
  for (const binding of base.bindings) {
    const result = actual.bindings.find(item => item.name === binding.name && item.type === binding.type);
    assert(result, 'Missing binding: ' + binding.name);
    if (binding.type !== 'secret_text') assert.equal(canonical(result), canonical(binding), 'Changed binding: ' + binding.name);
  }
  assert.equal(canonical(actual.assets?.config), canonical(base.assets.config));
  assert.equal(actual.compatibility_date, base.compatibility_date);
  assert.deepEqual(actual.compatibility_flags ?? [], base.compatibility_flags ?? []);
  report.modulesVerified = actual.modules.length;
  report.bindingsVerified = actual.bindings.length;
  report.assetsKept = true;
}

function assign(id, label) {
  return cloudflare('/scripts/' + SITE + '/deployments', 'POST', {
    strategy: 'percentage', versions: [{ version_id: id, percentage: 100 }],
    annotations: { 'workers/message': label },
  });
}

function compareSurface(actual, expected) {
  for (const key of Object.keys(expected.invariant)) {
    assert.equal(hash(canonical(actual.invariant[key])), hash(canonical(expected.invariant[key])),
      'Protected public surface changed: ' + key);
  }
}

let candidate;
let activationAttempted = false;
try {
  const [directBaseline, publicBaseline] = await Promise.all([surfaces(DIRECT, { preview: true }), surfaces(DOMAIN)]);
  candidate = mode === 'stage' ? await upload() : process.env.B46_MOBILE_FOOTER_CANDIDATE;
  assert.match(candidate ?? '', /^[0-9a-f-]{36}$/);
  assert.notEqual(candidate, baselineVersion);
  const preview = 'https://' + candidate.slice(0, 8) + '-' + SITE + '.mccarey-supon.workers.dev';
  Object.assign(report, { candidate, preview });
  console.log('BALL46_MOBILE_FOOTER_CANDIDATE', JSON.stringify({ candidate, preview }));
  await proof();
  await verifyCandidate(candidate);
  await verifyConfiguration();
  const candidateSurface = await eventually(() => surfaces(preview, { candidate: true, preview: true }), 6, 2200);
  compareSurface(candidateSurface, directBaseline);
  report.inactiveMatchSitemap = candidateSurface.matchSitemapUrls;
  report.inactiveQA = 'HTTP passed';
  await proof();
  if (mode === 'stage') {
    report.inactiveBrowser = await browserQA(preview, 'inactive');
    await guard(baselineVersion);
    await verifyConfiguration();
    report.inactiveQA = 'passed';
  } else {
    await guard(baselineVersion);
    activationAttempted = true;
    const deployment = await assign(candidate, message);
    report.deployment = deployment.id;
    report.version = candidate;
    await proof();
    const deployed = await eventually(() => guard(candidate), 8, 1800);
    assert.equal(deployment.id, deployed.deployment);
    const publicSurface = await eventually(() => surfaces(DOMAIN, { candidate: true }), 10, 4500);
    compareSurface(publicSurface, publicBaseline);
    report.publicMatchSitemap = publicSurface.matchSitemapUrls;
    report.publicBrowser = await browserQA(DOMAIN, 'production');
    await guard(candidate);
    await verifyConfiguration();
    report.productionQA = 'passed';
  }
  console.log('BALL46_MOBILE_FOOTER_RELEASE', JSON.stringify(report));
} catch (error) {
  report.failure = error.message.split('\n')[0];
  if (activationAttempted && candidate) {
    try {
      const live = await active();
      if (live.version === candidate) {
        const rollback = await assign(baselineVersion, 'Restore the audited BALL46 version after failed mobile and footer QA');
        await eventually(async () => assert.equal((await active()).version, baselineVersion), 8, 1800);
        report.rollbackDeployment = rollback.id;
      }
    } catch (rollbackError) {
      report.rollbackError = rollbackError.message;
    }
  }
  throw error;
} finally {
  await proof();
}
