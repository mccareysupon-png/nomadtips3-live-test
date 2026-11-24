import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { active, canonical, cloudflare, DIRECT, DOMAIN, eventually, get, hash, SITE, version } from
  '../default-odds-crossdevice-20261123/release/cloudflare.mjs';
import { settingFields, settingsForSite, sourceHash } from '../ball46-seo-20261124/release/inspect.mjs';
import { mobileDashboardHead } from '../ball46-seo-20261124/b46-mobile-footer-ui-20261124.mjs';
import { browserQA, surfaces } from './smoke.mjs';

const baselineVersion = '1418e0a2-a276-43d7-889c-4916ef842a59';
const baselineDeployment = '244a25fe-8c8d-4753-89a0-5891d6b79537';
const baselineSource = '5e64504077858be983b9aab4c245fdee68ede0e67f2296446c54d1ada4c6b12f';
const main = 'b46-frontend-seo-entry-20261124.mjs';
const presentation = 'b46-mobile-footer-ui-20261124.mjs';
const message = 'BALL46 PC featured cards and mobile match and Signal presentation 20261124';
const mode = process.env.B46_MOBILE_FOOTER_MODE;
assert(['stage', 'activate'].includes(mode));
const report = { task: 'B46-PC-FEATURED-MOBILE-DETAILS-20261124', mode,
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
assert.equal(base.modules.length, 105);
assert.equal(base.bindings.length, 11);
assert(configuration.subdomain.previews_enabled && base.assets?.config);
const originals = new Map(base.modules.map(module => [module.name, module]));
assert(originals.has('seo.mjs') && originals.has(presentation));
const updated = { ...originals.get(presentation),
  content_base64: (await readFile(new URL('../ball46-seo-20261124/' + presentation, import.meta.url))).toString('base64'),
};
assert.notEqual(updated.content_base64, originals.get(presentation).content_base64);
const modules = base.modules.map(module => module.name === presentation ? updated : module);
report.diff = { replaced: [presentation], added: [], sameModules: modules.length - 1 };
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

async function verifySandbox() {
  const sandbox = await get('https://ball46-mobile-expanded-theme-test-20261124.mccarey-supon.workers.dev/?view=live');
  assert.equal(sandbox.headers.get('x-b46-preview'), 'b46-mobile-expanded-theme-20261124');
  const html = await sandbox.text();
  for (const [, id, css] of mobileDashboardHead.matchAll(/<style id="([^"]+)">([\s\S]*?)<\/style>/g)) {
    const candidate = html.match(new RegExp('<style id="' + id + '">([\\s\\S]*?)<\\/style>'))?.[1];
    assert.equal(hash(candidate?.trim() ?? ''), hash(css.trim()), 'CSS differs from the verified sandbox: ' + id);
  }
  report.sandboxCssVerified = true;
}

let candidate;
let activationAttempted = false;
try {
  const [directBaseline, publicBaseline] = await Promise.all([surfaces(DIRECT, { preview: true }), surfaces(DOMAIN), verifySandbox()]);
  candidate = process.env.B46_MOBILE_FOOTER_CANDIDATE;
  if (mode === 'stage' && !candidate) candidate = await upload();
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
        const rollback = await assign(baselineVersion, 'Restore the audited BALL46 version after failed featured details QA');
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
