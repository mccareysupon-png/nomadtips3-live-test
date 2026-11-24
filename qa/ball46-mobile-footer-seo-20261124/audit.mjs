import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { active, DIRECT, DOMAIN, get, hash, SITE, version } from
  '../default-odds-crossdevice-20261123/release/cloudflare.mjs';
import { settingsForSite, sourceHash } from '../ball46-seo-20261124/release/inspect.mjs';

const current = await active();
const [base, config, workerResponse, publicResponse] = await Promise.all([
  version(SITE, current.version), settingsForSite(),
  get(DIRECT + '/?view=live'), get(DOMAIN + '/?view=live'),
]);
assert.equal(base.main_module, 'b46-frontend-seo-entry-20261124.mjs');
assert(config.subdomain.previews_enabled, 'Inactive Worker previews are required');
assert(base.assets?.config, 'Missing original static asset configuration');
const modules = new Map(base.modules.map(module => [module.name, Buffer.from(module.content_base64, 'base64')]));
assert.equal(modules.size, base.modules.length);
const entry = modules.get(base.main_module).toString();
const previousEntry = entry.match(/^import original from '\.\/([^']+)';/m)?.[1];
assert(previousEntry && modules.has(previousEntry), 'Active SEO wrapper entry changed');
const seoRelease = new URL('../ball46-seo-20261124/', import.meta.url);
const originalSeo = await readFile(new URL('./seo.mjs', seoRelease));
const expectedEntry = (await readFile(new URL('./release/production.mjs', seoRelease), 'utf8'))
  .replaceAll('__ACTIVE_ENTRY__', previousEntry);
assert.equal(entry, expectedEntry, 'Active SEO entry differs from the source of the verified release');
assert(modules.get('seo.mjs')?.equals(originalSeo), 'Active SEO module differs from the verified release');
const raw = modules.get('assets/index.html').toString();
assert(raw.includes('id="b46-site-footer-v1"') && !raw.includes('data-b46-seo-guide="home"'));
assert(originalSeo.toString().includes("element.append(dashboardGuide('home')"));
const served = [];
for (const response of [workerResponse, publicResponse]) {
  assert.equal(response.headers.get('x-b46-default-odds-movement'), 'single-controller-v4');
  assert.equal(response.headers.get('x-b46-frontend-seo'), 'frontend-seo-i18n-v1');
  const html = await response.text();
  assert.equal((html.match(/id="b46-site-footer-v1"/g) ?? []).length, 1);
  assert.equal((html.match(/data-b46-seo-guide="home"/g) ?? []).length, 1);
  assert(!html.includes('b46-seo-guide--footer-bottom'), 'Footer already released');
  served.push({ host: new URL(response.url).hostname, hash: hash(html) });
}
assert.deepEqual(await active(), current, 'Production changed during source inspection');
const proof = {
  current, rollback: current.version, main: base.main_module, previousEntry,
  sourceHash: sourceHash(base), moduleCount: modules.size, bindings: base.bindings.length,
  staticAssetConfig: base.assets.config, served,
  activeSeoSourceVerified: true, activeEntrySourceVerified: true,
};
await writeFile(process.env.RUNNER_TEMP + '/ball46-mobile-footer-inspection.json', JSON.stringify(proof, null, 2));
console.log('BALL46_MOBILE_FOOTER_BASELINE', JSON.stringify(proof));
