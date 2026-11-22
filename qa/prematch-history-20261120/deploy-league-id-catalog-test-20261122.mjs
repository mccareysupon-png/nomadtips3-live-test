// BALL46 - TEST ONLY. Replace three league-metadata modules on active
// Pre-Match Worker. Preserve every other module and binding byte-for-byte.
// No provider requests, no HCR/ledger/1X2 formula changes, no prod deploy.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_CREDENTIALS_MISSING');
const repoDir='qa/prematch-history-20261120/';
const baseline='f1bce414a8c69917d46af42c008cec22426b5b58';
const files=['league-name-cache.mjs','stored-prematch-feed.mjs','prematch-only-worker.mjs'];
const worker='ball46-prematch-only-test-20261120';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120','ball46-prematch-performance-test-20261121'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(url,opts={}){
 const r=await fetch(url,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_FAILED_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function version(name){
 const d=await cf(root+'/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'MISSING_ACTIVE_VERSION_'+name);return id;
}
async function owner(path){
 const r=await fetch(host+path,{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'OWNER_ROUTE_'+path+'_'+r.status);return r.json();
}
async function frontend(){
 const r=await fetch('https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'TEST_FRONTEND_HTTP_'+r.status);
 return r.json();
}
const protectedBefore=await Promise.all(protectedNames.map(version));
const before=await version(worker);
const active=await cf(root+'/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs');
assert(active.modules?.length>=16,'ACTIVE_MODULE_COUNT_DRIFT');
const current=name=>{
 const m=active.modules.find(x=>x.name===name);
 assert(m?.content_base64,'MISSING_ACTIVE_MODULE_'+name);
 return Buffer.from(m.content_base64,'base64').toString('utf8');
};
const settings=await cf(root+'/scripts/'+worker+'/settings');
const bindingNames=(settings.bindings||[]).map(x=>x.name).sort();
assert.deepEqual(bindingNames,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BINDING_CHANGE_DETECTED');
for(const name of files){
 const expected=execFileSync('git',['show',baseline+':'+repoDir+name],{encoding:'utf8'});
 assert.equal(current(name),expected,'ACTIVE_SOURCE_DRIFT_'+name);
 execFileSync(process.execPath,['--check',repoDir+name],{stdio:'pipe'});
}
const priorHCR=await owner('/history-cargo-registry?detail=0');
const priorFull=await owner('/history-cargo-full');
const priorHealth=await owner('/health');
assert.equal(priorHCR.registry.code,'HCR-V1');
assert.equal(priorFull.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(priorHealth.providerCalls,0);
const priorFrontend=await frontend();
const priorCount=priorFrontend.testLedger?.rows?.length??0;
const preserved=Object.fromEntries(active.modules.map(x=>[x.name,crypto.createHash('sha256').update(Buffer.from(x.content_base64,'base64')).digest('hex')]));
const next=Object.fromEntries(files.map(name=>[name,fs.readFileSync(repoDir+name,'utf8')]));
assert(next['prematch-only-worker.mjs'].includes("path==='/league-name-audit'")&&
 next['league-name-cache.mjs'].includes('leagueCatalogFromCachedHub')&&
 next['stored-prematch-feed.mjs'].includes('prev.league.id===n.league.id'),'LEAGUE_ID_FIX_ABSENT');
assert.equal(await version(worker),before,'TEST_CHANGED_DURING_PREFLIGHT');
console.log('B46_LEAGUE_ID_TEST_PREPARE '+JSON.stringify({before,worker,files,priorLedgerRows:priorCount,priorFT:priorHCR.inventory.finishedFixtures,rounds:priorHCR.scope.rounds,providerCalls:0,productionWrites:0}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,
 compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindingNames.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 assert(m.name.endsWith('.mjs')&&typeof m.content_base64==='string','UNEXPECTED_MODULE_FORMAT');
 form.append(m.name,new Blob([files.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64')],{type:'application/javascript+module'}),m.name);
}
await cf(root+'/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,latest;
for(let i=0;i<25;i++){
 after=await version(worker);
 latest=await cf(root+'/workers/'+worker+'/versions/'+after+'?include=modules');
 if(after!==before&&files.every(name=>{
  const m=latest.modules?.find(x=>x.name===name);
  return !!m?.content_base64&&Buffer.from(m.content_base64,'base64').toString('utf8')===next[name];
 }))break;
 await new Promise(r=>setTimeout(r,1000));
}
assert.notEqual(after,before,'TEST_DEPLOYMENT_UNCHANGED');
assert.equal(latest.modules.length,active.modules.length,'MODULE_COUNT_CHANGED');
for(const m of active.modules){
 if(files.includes(m.name))continue;
 const updated=latest.modules.find(x=>x.name===m.name);
 assert(updated,'MISSING_UNTOUCHED_MODULE_'+m.name);
 assert.equal(crypto.createHash('sha256').update(Buffer.from(updated.content_base64,'base64')).digest('hex'),preserved[m.name],'UNEXPECTED_OTHER_MODULE_CHANGE_'+m.name);
}
const bindingAfter=(await cf(root+'/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindingAfter,bindingNames,'BINDINGS_CHANGED');
let names,HCR,cargo,liveFrontend;
for(let i=0;i<25;i++){
 try{
  // Public preview intentionally reads only the already cached HUB snapshot.
  await owner('/preview-data');
  [names,HCR,cargo,liveFrontend]=await Promise.all([owner('/league-name-audit'),owner('/history-cargo-registry?detail=0'),owner('/history-cargo-full'),frontend()]);
  assert.equal(names.code,'PREMATCH_LEAGUE_ID_CATALOG_V1');
  break;
 }catch(e){if(i===24)throw e;await new Promise(r=>setTimeout(r,1100))}
}
assert.equal(names.providerCalls,0);
assert.equal(HCR.registry.code,'HCR-V1');
assert.equal(cargo.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(cargo.providerCalls,0);
assert(HCR.inventory.finishedFixtures>=priorHCR.inventory.finishedFixtures,'ARCHIVE_SHRUNK');
assert.deepEqual((await cf(root+'/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindingNames);
const protectedAfter=await Promise.all(protectedNames.map(version));
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_VERSION_CHANGED');
const page=liveFrontend.testLedger??{};
const monitor=liveFrontend.testMonitor?.monitor??{};
const coverage={total:page.rows?.length??0,named:0,missing:0};
for(const row of page.rows??[]){
 const n=monitor[String(row.fixture_id)]?.leagueName;
 if(typeof n==='string'&&n.trim())coverage.named++;else coverage.missing++;
}
console.log('B46_LEAGUE_ID_TEST_DEPLOY_SUCCESS '+JSON.stringify({
 worker,before,after,changedOnly:files,unchangedModules:active.modules.length-files.length,
 nameAudit:names,frontendCoverage:coverage,
 historicFT:HCR.inventory.finishedFixtures,HCR:HCR.registry.code,
 fullCargo:{rounds:cargo.roundsTracked,fixtures:cargo.fixtureRecords},
 protectedNames,providerCallsAdded:0,productionWrites:0,formula1X2Unchanged:true
}));
