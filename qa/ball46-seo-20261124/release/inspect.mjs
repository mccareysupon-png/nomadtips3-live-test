import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { active, canonical, cloudflare, DIRECT, DOMAIN, eventually, get, hash, SITE, version } from
  '../../default-odds-crossdevice-20261123/release/cloudflare.mjs';

export const settingFields = [
  'usage_model', 'logpush', 'limits', 'observability', 'placement', 'tail_consumers',
  'compatibility_date', 'compatibility_flags', 'tags',
];
export const expected = process.env.B46_SEO_BASE_VERSION;
export const proofPath = process.env.RUNNER_TEMP + '/ball46-seo-inspection.json';

export function sourceHash(base) {
  return hash(canonical(base.modules.map(module => [
    module.name, module.content_type, hash(Buffer.from(module.content_base64, 'base64')),
  ]).sort(([a], [b]) => a.localeCompare(b))));
}

export async function settingsForSite() {
  const [settings, subdomain, schedules] = await Promise.all(
    ['settings', 'subdomain', 'schedules'].map(endpoint => cloudflare('/scripts/' + SITE + '/' + endpoint)),
  );
  return { settings, subdomain, schedules };
}

async function inspect() {
  const live = await active();
  await writeFile(proofPath, JSON.stringify({ live, rollback: live.version }, null, 2));
  assert.equal(live.version, expected, 'Production version differs from the previous verified release');
  const [base, settings, response, board] = await Promise.all([
    version(SITE, live.version),
    settingsForSite(),
    eventually(() => get(DIRECT + '/?view=signal'), 4, 1200),
    eventually(async () => (await get(DOMAIN + '/api/hub/snapshot')).json(), 4, 1200),
  ]);
  assert(settings.subdomain.previews_enabled, 'Inactive Worker preview is unavailable');
  assert(base.assets?.config && base.modules.some(module => module.name === base.main_module && module.content_base64));
  assert.equal(response.headers.get('x-b46-default-odds-movement'), 'single-controller-v4');
  assert.equal(response.headers.get('x-b46-daily-performance'), 'daily-performance-summary-v1');
  const html = await response.text();
  assert(html.includes('id="b46-sidebar-winrate-production"') && html.includes('id="b46-odds-flash-runtime-production"'));
  assert(board.ok && board.cacheOnly && !board.viewerRefreshEnabled && board.externalRequestsAdded === 0);
  assert(!board.stale && board.fixtures.length > 0, 'No current public fixture snapshot');
  assert.equal((await active()).version, expected);
  const report = {
    live, rollback: live.version, sourceHash: sourceHash(base), main: base.main_module,
    modules: base.modules.length, bindings: base.bindings.length,
    assets: base.assets.config, compatibility: base.compatibility_date,
    protectedRuntime: ['Default Odds V3', 'Sidebar Win Rate', 'Performance Summary'],
    cachedBoard: { fixtures: board.fixtures.length, externalRequestsAdded: board.externalRequestsAdded },
  };
  await writeFile(proofPath, JSON.stringify(report, null, 2));
  console.log('BALL46_SEO_BASELINE', JSON.stringify(report));
}

if (process.argv[1]?.endsWith('/release/inspect.mjs')) await inspect();
