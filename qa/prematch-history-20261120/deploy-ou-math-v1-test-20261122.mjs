// Protected, fail-closed, TEST backend-only deployment of O/U Math V1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchOuMain} from './patch-ou-math-v1-main-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_DEPLOY_CREDENTIALS');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120',main='prematch-only-worker.mjs',added='ou-math-v1-test.mjs';
const expected='617c0de0-15a7-4e33-85d1-856d6feec373';
const front='ball46-premium-match-colors-test-20261120';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',front,
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const hmac=crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const host='https://'+worker+'.mccarey-supon.workers.dev';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(50000)});
 const d=await r.json();assert(r.ok&&d.success,'CF_'+r.status+'_'+path+'_'+JSON.stringify(d.errors??[]));return d.result;
}
async function version(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;assert(id,'NO_VERSION_'+name);return id;
}
async function owner(path,method='GET'){
 const r=await fetch(host+path,{method,headers:{authorization:'Bearer '+hmac},cache:'no-store',signal:AbortSignal.timeout(40000)});
 assert(r.ok,'TEST_OWNER_'+path+'_'+r.status);return r.json();
}
const beforeProtected=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(await version(worker),expected,'TEST_BACKEND_VERSION_DRIFT_STOP');
const active=await cf('/workers/'+worker+'/versions/'+expected+'?include=modules');
assert.equal(active.main_module,main);
assert.equal(active.modules.length,23,'UNEXPECTED_TEST_MODULE_COUNT');
assert(!active.modules.some(m=>m.name===added),'OU_ALREADY_DEPLOYED_STOP');
const priorMain=Buffer.from(active.modules.find(m=>m.name===main).content_base64,'base64').toString('utf8');
const newMain=patchOuMain(priorMain).code;
const newModule=fs.readFileSync('qa/prematch-history-20261120/'+added,'utf8');
for(const [label,src] of [['main',newMain],['ou',newModule]]){
 const tmp='/tmp/b46-ou-check-'+label+'.mjs';fs.writeFileSync(tmp,src);
 execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'});
}
assert(newMain.replace("import {initOu,screenOu,recordOu,settleOu,syncOuSnapshot,readOuLedger,readOuSnapshot,historicalOuBacktest,OU_POLICY} from './ou-math-v1-test.mjs';","").includes("const bttsSettled=settleBttsPicks(this.db,now)"),'ORIGINAL_BTTS_REMOVED');
const names=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(names,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE']);
const hashes=Object.fromEntries(active.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]));
const [oldLedger,oldAudit,oldHCR,oldBulk]=await Promise.all([
 owner('/test-ledger'),owner('/prematch-stats-registry-audit-test'),
 owner('/history-cargo-registry?detail=0'),owner('/btts-bulk-v2-state')
]);
console.log('OU_BASELINE_STATUS '+JSON.stringify({ledgerMode:oldLedger.mode,auditVerified:oldAudit.verified,bulkMode:oldBulk.config?.mode,bulkCap:oldBulk.transport?.cap?.maxDailyProviderCalls}));
assert(oldLedger.mode==='TEST_ONLY'&&oldAudit.verified&&oldBulk.transport?.cap?.maxDailyProviderCalls===5,'BASELINE_INVALID');
const oldHash=hash(JSON.stringify({rows:oldLedger.rows,stats:oldLedger.stats}));
console.log('OU_MATH_TEST_DEPLOY_PREFLIGHT '+JSON.stringify({backendBefore:expected,oneX2Rows:oldLedger.rows.length,
 protected:beforeProtected,bulkCap:oldBulk.transport.cap.maxDailyProviderCalls,providerCalls:0}));
assert.equal(await version(worker),expected,'CONCURRENT_TEST_DEPLOY_STOP');
const meta={main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:names.map(n=>({name:n,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const raw=m.name===main?newMain:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([raw],{type:'application/javascript+module'}),m.name);
}
form.append(added,new Blob([newModule],{type:'application/javascript+module'}),added);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let current,installed=null;
for(let i=0;i<38;i++){
 current=await version(worker);
 if(current!==expected){
  installed=await cf('/workers/'+worker+'/versions/'+current+'?include=modules');
  const m=installed.modules.find(x=>x.name===main),n=installed.modules.find(x=>x.name===added);
  if(m&&n&&Buffer.from(m.content_base64,'base64').toString()===newMain&&Buffer.from(n.content_base64,'base64').toString()===newModule)break;
 }
 await new Promise(r=>setTimeout(r,1150));
}
assert(current&&current!==expected,'NEW_BACKEND_VERSION_NOT_ACTIVE');
assert.equal(installed.modules.length,active.modules.length+1);
for(const m of active.modules){
 if(m.name===main)continue;
 assert.equal(hash(Buffer.from(installed.modules.find(x=>x.name===m.name).content_base64,'base64')),hashes[m.name],'ORIGINAL_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),names);
const back=await owner('/ou-backtest-test?limit=350');
assert.equal(back.providerCalls,0);assert.equal(back.persistentChanges,0);
let cycle;
for(let i=0;i<15;i++){
 try{cycle=await owner('/ou-cycle-test','POST');if(cycle.mode==='OU_MATH_V1_TEST')break}catch(e){if(i===14)throw e}
 await new Promise(r=>setTimeout(r,1200));
}
assert(cycle&&cycle.mode==='OU_MATH_V1_TEST','OU_CYCLE_UNAVAILABLE');
assert.equal(cycle.providerCalls,0);assert.equal(cycle.paidOddsRequested,0);
const repeat=await owner('/ou-cycle-test','POST');
assert.equal(repeat.recorded.added,0,'OU_DUPLICATED_TEST_PICKS');
assert.equal(repeat.sync.processed,0,'OU_DUPLICATED_SNAPSHOT_EVENTS');
const [ledger,audit,hcr,bulk,state]=await Promise.all([
 owner('/test-ledger'),owner('/prematch-stats-registry-audit-test'),
 owner('/history-cargo-registry?detail=0'),owner('/btts-bulk-v2-state'),owner('/ou-state-test')]);
assert.equal(hash(JSON.stringify({rows:ledger.rows,stats:ledger.stats})),oldHash,'1X2_SOURCE_MUTATED');
assert.equal(audit.verified,true,'1X2_BTTS_REGISTRY_CHANGED');
assert(hcr.inventory.finishedFixtures>=oldHCR.inventory.finishedFixtures);
assert.equal(bulk.transport.cap.maxDailyProviderCalls,oldBulk.transport.cap.maxDailyProviderCalls);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),beforeProtected);
console.log('B46_OU_MATH_BACKEND_TEST_PASS '+JSON.stringify({
 before:expected,after:current,model:'ou-poisson-shrinkage-2p5-v1',
 firstCycle:{screening:cycle.screening,recorded:cycle.recorded,settled:cycle.settled},
 repeatedCycle:{added:repeat.recorded.added,snapshotEvents:repeat.sync.processed},
 stats:state.stats,backtest:back.stats,backtestMode:back.mode,
 oneX2RowsUnchanged:ledger.rows.length,registryValid:audit.verified,
 providerCallsAdded:0,productionWrites:0,protectedVersionsUnchanged:true
}));
