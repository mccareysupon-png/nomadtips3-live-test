import assert from 'node:assert/strict';
import { active, canonical, cloudflare, hash, version } from '../default-odds-crossdevice-20261123/release/cloudflare.mjs';

const site = 'ball46-production';
const finalUi = '1418e0a2-a276-43d7-889c-4916ef842a59';
const beforeUi = 'e8c1821a-0bef-408e-af77-fa03e624c5ab';
const beforeSeo = 'a75a2a3e-bc0c-49c7-b707-9e25efcbac56';
const cleanDeployments = rows => rows.map(row => ({
  id: row.id, created: row.created_on,
  versions: row.versions?.map(item => ({ id: item.version_id, percent: Number(item.percentage) })),
}));
async function history(script) {
  const { deployments } = await cloudflare('/scripts/' + script + '/deployments?per_page=20');
  assert(Array.isArray(deployments) && deployments.length > 0, 'Missing deployment history for ' + script);
  return cleanDeployments(deployments);
}
const live = await active(site);
const siteHistory = await history(site);
assert.equal(siteHistory[0].id, live.deployment, 'Production moved during inspection');
console.log('B46_LINEAGE_ACTIVE', JSON.stringify(live));
console.log('B46_LINEAGE_HISTORY', JSON.stringify(siteHistory));

function inspectSource(base) {
  const content = new Map(base.modules.map(m => [m.name, Buffer.from(m.content_base64, 'base64')]));
  const checksums = new Map([...content].map(([name, bytes]) => [name, hash(bytes)]));
  const index = content.get('assets/index.html')?.toString() ?? '';
  return {
    entry: base.main_module,
    checksums,
    bindingHash: hash(canonical(base.bindings)),
    focus: Object.fromEntries([...checksums].filter(([name]) =>
      /speed|firstpaint|performance-summary|screen-refresh|index\.html|crossdevice|mobile-footer|^seo\.mjs$/.test(name))),
    indexFlags: ['b46-mobile-first-paint-guard', 'b46-fullmarket-performance-v1']
      .filter(marker => index.includes(marker)),
  };
}

const recent = siteHistory.filter(row => row.created >= '2026-11-21')
  .flatMap(row => row.versions).filter(item => item.percent === 100).map(item => item.id);
const targets = [...new Set([live.version, finalUi, beforeUi, beforeSeo, ...recent.slice(0, 8)])];
const sourceByVersion = new Map();
let dependencies;
for (let i = 0; i < targets.length; i += 2) {
  await Promise.all(targets.slice(i, i + 2).map(async id => {
    try {
      const info = await version(site, id);
      if (id === live.version) dependencies = info.bindings
        .filter(b => ['ENGINE', 'HUB', 'B46_FAST_SNAPSHOT', 'B46_DAILY_PERFORMANCE'].includes(b.name))
        .map(b => [b.name, b.service]);
      const source = inspectSource(info);
      sourceByVersion.set(id, source);
      const { checksums, ...focused } = source;
      console.log('B46_LINEAGE_SOURCE', JSON.stringify({ id, modules: checksums.size, ...focused }));
    } catch (error) {
      if ([live.version, finalUi, beforeUi, beforeSeo].includes(id)) throw error;
      console.log('B46_LINEAGE_ARCHIVE_UNAVAILABLE', JSON.stringify({ id }));
    }
  }));
}
function diff(from, to) {
  const a = sourceByVersion.get(from), b = sourceByVersion.get(to);
  if (!a || !b) return;
  const changed = [], added = [], removed = [];
  for (const [name, original] of a.checksums) {
    if (!b.checksums.has(name)) removed.push(name);
    else if (b.checksums.get(name) !== original) changed.push(name);
  }
  for (const name of b.checksums.keys()) if (!a.checksums.has(name)) added.push(name);
  console.log('B46_LINEAGE_DIFF', JSON.stringify({
    from, to, changed, added, removed, bindingsSame: a.bindingHash === b.bindingHash,
  }));
}
diff(beforeUi, finalUi);
if (finalUi !== live.version) diff(finalUi, live.version);
diff(beforeSeo, beforeUi);
for (let i = 0; i + 1 < recent.length; i++) if (recent[i + 1] !== recent[i]) diff(recent[i + 1], recent[i]);

for (const [binding, service] of dependencies ?? []) {
  if (!service) continue;
  try {
    const rows = await history(service);
    console.log('B46_LINEAGE_SERVICE', JSON.stringify({ binding, service, history: rows.slice(0, 4) }));
  } catch {
    console.log('B46_LINEAGE_SERVICE_UNAVAILABLE', JSON.stringify({ binding, service }));
  }
}
assert.deepEqual(await active(site), live, 'Production changed while comparing archives');
