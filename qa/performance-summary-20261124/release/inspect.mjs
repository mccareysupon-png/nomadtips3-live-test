import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { active, canonical, cloudflare, DIRECT, eventually, get, hash, SITE, TEST, version } from './cloudflare.mjs';

const [site, sandbox, settings, subdomain, schedules] = await Promise.all([
  active(), active(TEST), cloudflare('/scripts/' + SITE + '/settings'),
  cloudflare('/scripts/' + SITE + '/subdomain'), cloudflare('/scripts/' + SITE + '/schedules'),
]);
const live = await version(SITE, site.version);
const main = live.modules.find(m => m.name === live.main_module);
assert(main?.content_base64, 'Active Worker source missing');
const html = await eventually(async () => (await get(DIRECT + '/?view=signal')).text(),4,1000);
assert.equal(html.split('<script id="b46-daily-performance-runtime">').length - 1, 1);
assert.equal(html.split('class="board-toolbar"').length - 1, 1);
const statistics = await eventually(async () => (await get(DIRECT + '/api/engine/statistics?paged=1')).json(),4,1000);
assert(statistics.ok && statistics.statisticsSource === 'LEDGER_V2_ONLY' && Array.isArray(statistics.rows));
const report = {
  site, sandbox, rollback: site.version, main: live.main_module,
  mainHash: hash(Buffer.from(main.content_base64,'base64')), modules: live.modules.length,
  originalModulesHash: hash(canonical(live.modules.map(m=>[m.name, hash(Buffer.from(m.content_base64,'base64'))]).sort())),
  bindings: live.bindings.map(b=>({name:b.name,type:b.type,service:b.service,environment:b.environment})),
  compatibilityDate: live.compatibility_date,
  assetConfig: live.assets?.config,
  settingsFields: Object.keys(settings), previewsEnabled: subdomain.previews_enabled,
  crons: (Array.isArray(schedules) ? schedules : schedules.schedules).map(s=>s.cron).sort(),
  ledger: {rows:statistics.ledgerTotal,page:statistics.rows.length,source:statistics.statisticsSource,revision:statistics.settlementRevision},
};
console.log('PRODUCTION_AUDIT ' + JSON.stringify(report));
await writeFile(process.env.RUNNER_TEMP + '/performance-inspection.json', JSON.stringify(report,null,2));
