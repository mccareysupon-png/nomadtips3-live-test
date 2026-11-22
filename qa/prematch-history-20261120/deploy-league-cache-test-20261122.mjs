// Deploy Pre-Match TEST ONLY: exactly the main module and an isolated league-name-cache module.
// Copy every other active Cloudflare module unchanged. No API provider calls, no production writes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_DEPLOY_SECRETS');
const testWorker='ball46-prematch-only-test-20261120';
const expectedVersion='73ac82e4-7cc3-4847-a82d-06fb5c1a63ba';
const baseline='db1da16fa0420cb68d842f2d41a63894f638aa5c';
const files=['prematch-only-worker.mjs','league-name-cache.mjs'];
const dir='qa/prematch-history-20261120/';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const url='https://'+testWorker+'.mccarey-supon.workers.dev';
const frontend='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const adminAuth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120','ball46-prematch-performance-test-20261121'];
async function cf(endpoint,options={}){
 const resp=await fetch(endpoint,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(40000)});
 let j=await resp.json();
 assert(resp.ok&&j.success,'CF_FAILED_'+resp.status+'_'+JSON.stringify(j.errors||[]));
 return j.result;
}
async function version(worker){
 const r=await cf(root+'/scripts/'+worker+'/deployments?per_page=1');
 const id=r.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'WORKER_VERSION_NOT_FOUND_'+worker);return id;
}
async function report(path){
 const r=await fetch(url+path,{headers:{authorization:adminAuth},cache:'no-store',signal:AbortSignal.timeout(28000)});
 assert(r.ok,'TEST_ADMIN_HTTP_'+r.status+'_'+path);return r.json();
}
async function publicData(){
 const r=await fetch(frontend+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(28000)});
 assert(r.ok,'TEST_FRONTEND_DATA_HTTP_'+r.status);
 const d=await r.json();
 assert(d.testLedger?.mode==='TEST_ONLY'&&Array.isArray(d.testLedger.rows)&&d.testMonitor?.monitor,'TEST_DATA_SCHEMA_DRIFT');
 return d;
}
const protectedBefore=await Promise.all(protectedWorkers.map(version));
const before=await version(testWorker);
assert.equal(before,expectedVersion,'PREMATCH_TEST_WORKER_CHANGED_SINCE_REVIEW_ABORT');
const active=await cf(root+'/workers/'+testWorker+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs');
assert(active.modules.length>=14,'ACTIVE_HCR_MODULES_MISSING');
const activeModule=name=>{
 const m=active.modules.find(m=>m.name===name);
 assert(m?.content_base64,'ACTIVE_MODULE_NOT_FOUND_'+name);
 return Buffer.from(m.content_base64,'base64').toString('utf8');
};
const baselineMain=execFileSync('git',['show',baseline+':'+dir+'prematch-only-worker.mjs'],{encoding:'utf8'});
assert.equal(activeModule('prematch-only-worker.mjs'),baselineMain,'ACTIVE_PREMATCH_MAIN_DRIFT_ABORT');
const baselineHub=execFileSync('git',['show','ee006ebbc7ed1bd2bb082154958a165979873ebc:'+dir+'normal-hub-monitor.mjs'],{encoding:'utf8'});
assert.equal(activeModule('normal-hub-monitor.mjs'),baselineHub,'HUB_LEAGUE_MODULE_DRIFT_ABORT');
assert(!active.modules.some(x=>x.name==='league-name-cache.mjs'),'CACHE_MODULE_ALREADY_INSTALLED_ABORT');
const settings=await cf(root+'/scripts/'+testWorker+'/settings');
const bindingNames=(settings.bindings||[]).map(x=>x.name).sort();
assert.deepEqual(bindingNames,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'TEST_BINDINGS_DRIFT_ABORT');
const archiveBefore=await report('/history-cargo-registry?detail=0');
const prior=await publicData();
assert.equal(archiveBefore.registry.code,'HCR-V1');
assert.equal(archiveBefore.registry.providerCalls,0);
assert.equal(await version(testWorker),before,'CONCURRENT_TEST_DEPLOY_ABORT');
for(const name of files)execFileSync(process.execPath,['--check',dir+name],{stdio:'pipe'});
const nextMain=fs.readFileSync(dir+'prematch-only-worker.mjs','utf8');
const nextCache=fs.readFileSync(dir+'league-name-cache.mjs','utf8');
assert(nextMain.includes("import {leagueNameRegistryFromFixtures,enrichLeagueNamesOnMonitor}") &&
       nextMain.includes("testMonitor:displayMonitor") &&
       nextMain.includes("prematchLeagueNamesV1"),'MISSING_LEAGUE_CACHE_LOGIC');
assert(nextCache.includes("id(row.home_id)===id(fixture.teams?.home?.id)")&&
       nextCache.includes("id(row.away_id)===id(fixture.teams?.away?.id)"),'MISSING_EXACT_TEAM_MATCH');
const priorHash={};
for(const m of active.modules){
 priorHash[m.name]=crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex');
}
const form=new FormData();
const metadata={
 main_module:active.main_module,
 compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindingNames.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
};
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 assert(m.name.endsWith('.mjs')&&typeof m.content_base64==='string','UNKNOWN_MODULE_SHAPE_ABORT');
 const bytes=m.name==='prematch-only-worker.mjs'?nextMain:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([bytes],{type:'application/javascript+module'}),m.name);
}
form.append('league-name-cache.mjs',new Blob([nextCache],{type:'application/javascript+module'}),'league-name-cache.mjs');
console.log('B46_LEAGUE_ALL_PHASES_TEST_PREFLIGHT '+JSON.stringify({
 worker:testWorker,before,modulesBefore:active.modules.length,modulesAfter:active.modules.length+1,
 modified:['prematch-only-worker.mjs'],added:['league-name-cache.mjs'],
 HCR:archiveBefore.registry.code,
 ledgerRows:prior.testLedger.rows.length,
 stats:prior.testLedger.stats,providerCalls:0,productionWrites:0
}));
await cf(root+'/scripts/'+testWorker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,latest;
for(let i=0;i<25;i++){
 after=await version(testWorker);
 latest=await cf(root+'/workers/'+testWorker+'/versions/'+after+'?include=modules');
 const n=latest.modules?.find(m=>m.name==='league-name-cache.mjs');
 const main=latest.modules?.find(m=>m.name==='prematch-only-worker.mjs');
 if(after!==before&&n?.content_base64&&main?.content_base64&&
    Buffer.from(n.content_base64,'base64').toString('utf8')===nextCache&&
    Buffer.from(main.content_base64,'base64').toString('utf8')===nextMain)break;
 await new Promise(r=>setTimeout(r,1400));
}
assert(after!==before,'TEST_WORKER_VERSION_UNCHANGED');
assert.equal(latest.modules.length,active.modules.length+1,'WRONG_MODULE_COUNT_AFTER');
for(const old of active.modules){
 if(old.name==='prematch-only-worker.mjs')continue;
 const newMod=latest.modules.find(m=>m.name===old.name);
 assert(newMod?.content_base64,'UNCHANGED_MODULE_LOST_'+old.name);
 const hash=crypto.createHash('sha256').update(Buffer.from(newMod.content_base64,'base64')).digest('hex');
 assert.equal(hash,priorHash[old.name],'OTHER_MODULE_CHANGED_'+old.name);
}
const bindAfter=(await cf(root+'/scripts/'+testWorker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindAfter,bindingNames,'BINDINGS_CHANGED');
let post,HCR;
for(let i=0;i<15;i++){
 try{[post,HCR]=await Promise.all([publicData(),report('/history-cargo-registry?detail=0')]);break}
 catch(e){if(i===14)throw e;await new Promise(r=>setTimeout(r,1400))}
}
assert.equal(HCR.registry?.code,'HCR-V1','HCR_CODE_CHANGED');
assert.equal(HCR.registry.providerCalls,0);
assert(HCR.inventory.finishedFixtures>=archiveBefore.inventory.finishedFixtures,'HCR_HISTORY_SHRANK');
assert.deepEqual(post.testLedger.stats,prior.testLedger.stats,'LEDGER_STATS_CHANGED_DURING_UI_ONLY_DEPLOY');
const groups={};
const monitor=post.testMonitor.monitor;
for(const row of post.testLedger.rows){
 const phase=monitor[row.fixture_id]?.phase||'UNKNOWN';
 const name=monitor[row.fixture_id]?.leagueName;
 const part=groups[phase]??={rows:0,named:0,missing:0};
 part.rows++; if(typeof name==='string'&&name.trim())part.named++;else part.missing++;
}
const prodAfter=await Promise.all(protectedWorkers.map(version));
assert.deepEqual(prodAfter,protectedBefore,'PROTECTED_WORKER_VERSION_CHANGED');
console.log('B46_PREMATCH_LEAGUE_ALL_PHASES_TEST_DEPLOY_SUCCESS '+JSON.stringify({
 worker:testWorker,before,after,HCR:{code:HCR.registry.code,ft:HCR.inventory.finishedFixtures},
 unchangedModules:active.modules.length-1,bindings:bindingNames,
 ledger:{rows:post.testLedger.rows.length,stats:post.testLedger.stats},
 leagueCoverage:groups,providerCalls:0,productionWrites:0,protectedWorkers
}));
