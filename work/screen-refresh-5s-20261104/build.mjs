import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import{Script}from'node:vm';
const root='work/screen-refresh-5s-20261104',before=await readFile(root+'/stage/dashboard-before.js','utf8'),report=JSON.parse(await readFile(root+'/audit/inspection.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');assert.equal(sha(before),report.dashboard.sha);
let after=before;const changes=[];
function replace(a,b){assert.equal(after.split(a).length,2,'EXACT_SINGLE_PATCH:'+a.slice(0,80));after=after.replace(a,b);changes.push({before:a,after:b});}
const model=(await readFile(root+'/model.mjs','utf8')).replaceAll('export ',''),adapter=await readFile(root+'/adapter.js','utf8');
replace('async function fetchJson(url){',model+'\n'+adapter+'\nasync function fetchJson(url){');
replace('function bindStableMatchRow(el){if(!el||el.dataset.b46StableBound', 'function bindStableMatchRow(el){prepareLiveDisplayClock(el);if(!el||el.dataset.b46StableBound');
replace('fixtures=holdLastGoodOdds(rows).slice().sort(', 'fixtures=mergeLiveDisplay(holdLastGoodOdds(rows),board).slice().sort(');
replace('beginSignals();setTimeout(()=>{loadScorebarSettlements();','beginSignals();startLiveDisplayLoop();setTimeout(()=>{loadScorebarSettlements();');
new Script(after);let restored=after;for(const c of changes.slice().reverse())restored=restored.replace(c.after,c.before);assert.equal(restored,before,'UNRELATED_SOURCE_CHANGED');
for(const k of ['POLL_MS=30_000','SIGNAL_POLL_MS=30_000','SCOREBAR_STATS_POLL_MS=60_000'])assert(after.includes(k));
await writeFile(root+'/stage/dashboard-after.js',after);await writeFile(root+'/audit/build.json',JSON.stringify({ok:true,productionBase:report.workers['ball46-production'].version,beforeSha:sha(before),afterSha:sha(after),changedPublicAssets:[new URL(report.dashboard.url).pathname],existingLoopsUnchanged:true,sourceReversible:true,patchSites:changes.length},null,2));console.log('Build: 4 exact source edits; original loops preserved.');


