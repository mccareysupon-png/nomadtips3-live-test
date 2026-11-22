// PreMatch TEST ONLY: install persistent Registry V1 in existing Durable Object.
// Only prematch-only-worker.mjs modified; one new stats registry module.
// All other workers, source ledgers, HCR, Live, Stats and Production protected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CF_TEST_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const expectedActive='d2e9c9ce-4f1b-4661-818e-a5cc44fdc3ef';
const baseline='0b60cf2478d19efae6fb6a88a56eace8a3caa1e8';
const dir='qa/prematch-history-20261120/';
const modified='prematch-only-worker.mjs',added='prematch-stats-registry-test.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const ownerAuthorization='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,options={}){
 const r=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function version(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'NO_ACTIVE_VERSION_'+name);return v;
}
async function owner(path,method='GET'){
 const r=await fetch(host+path,{method,headers:{authorization:ownerAuthorization},cache:'no-store',signal:AbortSignal.timeout(24000)});
 assert(r.ok,'OWNER_'+path+'_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(protectedBefore['ball46-premium-match-colors-test-20261120'],
 '1962deed-fec4-4c17-9bd4-5aa6cd06dfa1','EXISTING_USER_UI_CHANGED_STOP');
const before=await version(worker);assert.equal(before,expectedActive,'BACKEND_TEST_VERSION_DRIFT_STOP');
const script=await cf('/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(script.main_module,'prematch-only-worker.mjs');
assert.equal(script.modules.length,20,'TEST_MODULE_COUNT_DRIFT');
assert(!script.modules.some(m=>m.name===added),'REGISTRY_MODULE_ALREADY_PRESENT');
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'PREMATCH_TEST_BINDINGS_DRIFT');
const oldMain=script.modules.find(m=>m.name===modified);
assert(oldMain?.content_base64,'EXISTING_MAIN_NOT_FOUND');
const baseSource=execFileSync('git',['show',baseline+':'+dir+modified],{encoding:'utf8'});
assert.equal(Buffer.from(oldMain.content_base64,'base64').toString('utf8'),baseSource,'ACTIVE_MAIN_CODE_DRIFT');
const hashes=Object.fromEntries(script.modules.map(m=>[m.name,crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex')]));
const nextMain=fs.readFileSync(dir+modified,'utf8'),nextRegistry=fs.readFileSync(dir+added,'utf8');
for(const file of [modified,added])execFileSync(process.execPath,['--check',dir+file],{stdio:'pipe'});
assert(nextMain.includes('initPreMarketStatsRegistry')&&nextMain.includes("path==='/prematch-stats-registry-sync-test'")&&
 nextMain.includes('statsRegistry:{code:registry.code')&&nextRegistry.includes('b46_pre_daily_snapshot_test'),'STATS_REGISTRY_WIRING_MISSING');
const [oldLedger,hcr,btHistory,oldPreview]=await Promise.all([
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-history-private-test'),owner('/preview-data')]);
assert.equal(oldLedger.mode,'TEST_ONLY');assert.equal(oldLedger.rows.length,75);
assert.equal(hcr.registry.code,'HCR-V1');assert.equal(btHistory.mode,'BTTS_PRIVATE_HISTORY_TEST');
assert.equal(btHistory.archive.privateFT,20);
assert.equal(oldPreview.testLedger.rows.length,75);
const ledgerHash=crypto.createHash('sha256').update(JSON.stringify({rows:oldLedger.rows,stats:oldLedger.stats})).digest('hex');
assert.equal(await version(worker),before,'TEST_CHANGED_DURING_PREFLIGHT');
console.log('B46_STATS_REGISTRY_PREFLIGHT '+JSON.stringify({worker,before,oldLedger:oldLedger.rows.length,
 bttsPrivateFT:btHistory.archive.privateFT,HCRFT:hcr.inventory.finishedFixtures,
 protectedWorkers:protectedNames,providerCalls:0,productionWrites:0}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:script.main_module,compatibility_date:script.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(script.compatibility_flags?.length?{compatibility_flags:script.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of script.modules){
 const code=m.name===modified?nextMain:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([code],{type:'application/javascript+module'}),m.name);
}
form.append(added,new Blob([nextRegistry],{type:'application/javascript+module'}),added);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,active;
for(let i=0;i<30;i++){
 after=await version(worker);
 try{active=await cf('/workers/'+worker+'/versions/'+after+'?include=modules')}
 catch{await new Promise(r=>setTimeout(r,1300));continue}
 if(after!==before&&[modified,added].every(n=>{
  const m=active.modules.find(x=>x.name===n);
  return m?.content_base64&&Buffer.from(m.content_base64,'base64').toString('utf8')===(n===modified?nextMain:nextRegistry);
 }))break;
 await new Promise(r=>setTimeout(r,1200));
}
assert.notEqual(after,before,'TEST_NEW_VERSION_NOT_ACTIVE');
assert.equal(active.modules.length,script.modules.length+1,'UNEXPECTED_MODULE_COUNT');
for(const m of script.modules){
 if(m.name===modified)continue;
 const newer=active.modules.find(x=>x.name===m.name);
 assert(newer?.content_base64,'OTHER_MODULE_MISSING_'+m.name);
 assert.equal(crypto.createHash('sha256').update(Buffer.from(newer.content_base64,'base64')).digest('hex'),hashes[m.name],
  'OTHER_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings,'BINDINGS_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_STATS_REGISTRY_MODULE_DEPLOYED '+JSON.stringify({worker,before,after,changedOnly:modified,addedModule:added,
 otherModulesUnchanged:script.modules.length-1,source1x2Preserved:true,
 sourceHCRPreserved:true,userFrontendUnchanged:true,providerCallsAdded:0,productionWrites:0}));
// Wait for Cloudflare's global route propagation, then boot Snapshot registry
// ONCE using already-stored 1X2/BTTS ledgers. No upstream request.
let bootstrap=null,lastError=null;
for(let i=0;i<40;i++){
 try{
  bootstrap=await owner('/prematch-stats-registry-sync-test','POST');
  assert.equal(bootstrap.snapshot.code,'B46_PREMATCH_STATS_REGISTRY_V1');
  assert.equal(bootstrap.audit.verified,true);
  break;
 }catch(error){lastError=error;if(i<39)await new Promise(r=>setTimeout(r,1400))}
}
assert(bootstrap,'TEST_REGISTRY_BOOTSTRAP_NOT_READY_'+String(lastError));
assert(bootstrap.snapshot.registryEvents>=75,'1X2_EXISTING_HISTORY_NOT_REGISTERED');
assert.equal(bootstrap.snapshot.markets['1X2'].total,oldLedger.rows.length,'EXISTING_1X2_STATS_DIFFER');
assert.equal(bootstrap.snapshot.markets.TOTAL.total,
 bootstrap.snapshot.markets['1X2'].total+bootstrap.snapshot.markets.BTTS.total,'TOTAL_MARKET_SUM_MISMATCH');
const repeat=await owner('/prematch-stats-registry-sync-test','POST');
assert.equal(repeat.update.processed,0,'REGISTRY_SECOND_RUN_DUPLICATED_EVENTS');
assert.equal(repeat.audit.verified,true,'REGISTRY_AUDIT_FAILURE');
const [currentLedger,currentHCR,currentPrivate]=await Promise.all([
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),owner('/btts-history-private-test')]);
assert.equal(crypto.createHash('sha256').update(JSON.stringify({rows:currentLedger.rows,stats:currentLedger.stats})).digest('hex'),
 ledgerHash,'SOURCE_1X2_LEDGER_MUTATED');
assert(currentHCR.inventory.finishedFixtures>=hcr.inventory.finishedFixtures,'HCR_ARCHIVE_LOST');
assert.equal(currentPrivate.archive.privateFT,btHistory.archive.privateFT,'BTTS_PRIVATE_FT_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),protectedBefore,'PROTECTED_WORKERS_POST_BOOTSTRAP_CHANGED');
console.log('B46_STATS_REGISTRY_V1_ACTIVE_PASS '+JSON.stringify({
 worker,active:after,registry:bootstrap.snapshot.code,events:repeat.snapshot.registryEvents,
 btts:repeat.snapshot.markets.BTTS,oneX2:repeat.snapshot.markets['1X2'],total:repeat.snapshot.markets.TOTAL,
 days90:{btts:repeat.snapshot.dailySeries.BTTS.length,total:repeat.snapshot.dailySeries.TOTAL.length},
 idempotentSecondSync:repeat.update.processed===0,auditVerified:repeat.audit.verified,
 privateFT:currentPrivate.archive.privateFT,unchanged1X2Rows:currentLedger.rows.length,
 HCRFT:currentHCR.inventory.finishedFixtures,providerCalls:0,productionWrites:0,uiUnchanged:true
}));
