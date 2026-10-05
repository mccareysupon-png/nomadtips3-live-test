import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {inspect,api,sha,publicFile} from '../daily-performance-20261005/production.mjs';

mkdirSync('audit-statistics-scout',{recursive:true});
const frontend=await inspect();
writeFileSync('audit-statistics-scout/frontend-main.js',frontend.source);
writeFileSync('audit-statistics-scout/frontend-version.json',JSON.stringify(frontend.version,null,2));
for(const name of ['index.html','singlepage-workspace-343.js','longterm-performance-343.js','dashboard-v2-stage3.js','ui-sync-fixes-343-v2.js']){
  writeFileSync('audit-statistics-scout/'+name,await publicFile('/'+name));
}
const worker='nomadtips3-engine-343';
const deps=await api(`/scripts/${worker}/deployments`);
const active=deps.deployments?.[0]?.versions;
assert(active?.length===1&&Number(active[0].percentage)===100,'ENGINE_ACTIVE_AMBIGUOUS');
const id=active[0].version_id;
const version=await api(`/workers/${worker}/versions/${id}?include=modules`);
assert(version.main_module&&version.modules?.length,'ENGINE_MODULES_MISSING');
writeFileSync('audit-statistics-scout/engine-version.json',JSON.stringify(version,null,2));
writeFileSync('audit-statistics-scout/engine-settings.json',JSON.stringify(await api(`/scripts/${worker}/settings`),null,2));
writeFileSync('audit-statistics-scout/engine-schedules.json',JSON.stringify(await api(`/scripts/${worker}/schedules`),null,2));
for(const mod of version.modules){
  assert(/^[A-Za-z0-9_.-]+$/.test(mod.name),'UNEXPECTED_MODULE_PATH');
  const bytes=Buffer.from(mod.content_base64,'base64');
  writeFileSync('audit-statistics-scout/engine-'+mod.name,bytes);
  console.log('ENGINE_MODULE',mod.name,sha(bytes));
}
const endpoint='https://www.ball46.com/api/engine/statistics';
const first=await (await fetch(endpoint,{cache:'no-store'})).json();
const stats=await (await fetch(endpoint+'?limit='+first.ledgerTotal,{cache:'no-store'})).json();
assert(stats.ok&&stats.rows.length===stats.ledgerTotal,'FULL_SCOUT_SNAPSHOT_NOT_AVAILABLE');
writeFileSync('audit-statistics-scout/statistics.json',JSON.stringify(stats));
const summary={engineVersion:id,frontendVersion:frontend.restore.version,total:stats.total,
  ledgerTotal:stats.ledgerTotal,engineMain:version.main_module,frontendMain:frontend.version.main_module,
  compatibilityDate:version.compatibility_date,bindings:version.bindings.map(({name,type,class_name,namespace_id,service,environment})=>({name,type,class_name,namespace_id,service,environment}))};
writeFileSync('audit-statistics-scout/summary.json',JSON.stringify(summary,null,2));
console.log('READ_ONLY_STATISTICS_SCOUT',JSON.stringify(summary));
