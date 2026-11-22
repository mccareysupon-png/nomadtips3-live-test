// Deploy ONLY BTTS Bulk Truck V2 to existing isolated PreMatch TEST Worker.
// Cutover remains STAGED until separate proven activation; the current old
// history vehicle runs unmodified until V2 is verified + activated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_DEPLOY_ACCESS');
const worker='ball46-prematch-only-test-20261120';
const expected='035e6e8f-95df-4775-9b44-8e70650afabb';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const dir='qa/prematch-history-20261120/';
const main='prematch-only-worker.mjs',newModule='btts-bulk-truck-v2-test.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120'];
function hash(x){return crypto.createHash('sha256').update(x).digest('hex')}
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
 signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+r.status+' '+JSON.stringify(j.errors||[]));
 return j.result;
}
async function version(n){
 const d=await cf('/scripts/'+n+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'MISSING_VERSION_'+n);return v;
}
async function owner(p,method='GET',payload=null){
 const r=await fetch(host+p,{method,headers:{authorization:auth,...(payload?{'content-type':'application/json'}:{})},
 ...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store',signal:AbortSignal.timeout(28000)});
 assert(r.ok,'TEST_OWNER_'+p+'_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(await version(worker),expected,'TEST_VERSION_DRIFT_STOP');
const active=await cf('/workers/'+worker+'/versions/'+expected+'?include=modules');
assert.equal(active.main_module,main,'WRONG_EXISTING_WORKER');
assert(!active.modules.some(x=>x.name===newModule),'V2_MODULE_ALREADY_PRESENT');
const old=active.modules.find(x=>x.name===main);
assert(old?.content_base64,'MAIN_MODULE_MISSING');
const baseline=execFileSync('git',['show',
 '8dd8ac7f1aa29ad5e745533710fb9e978d1a9a35^:'+dir+main],{encoding:'utf8'});
assert.equal(Buffer.from(old.content_base64,'base64').toString('utf8'),baseline,'TEST_MAIN_SOURCE_DRIFT_STOP');
const beforeSettings=await cf('/scripts/'+worker+'/settings');
const bindingNames=(beforeSettings.bindings??[]).map(x=>x.name).sort();
assert.deepEqual(bindingNames,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'TEST_BINDINGS_DRIFT_STOP');
const originalHashes=Object.fromEntries(active.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]));
const newMain=fs.readFileSync(dir+main,'utf8'),newTransport=fs.readFileSync(dir+newModule,'utf8');
for(const f of [main,newModule])execFileSync(process.execPath,['--check',dir+f],{stdio:'pipe'});
assert(newMain.includes("path==='/btts-bulk-v2-control'")&&
 newMain.includes("if(!bulkActive&&history.completed<5)")&&
 newMain.includes('BTTS_ULTRA_BULK_V2_TRANSPORT')&&
 newTransport.includes('b46_btts_bulk_v2_rounds')&&
 newTransport.includes('b46_btts_bulk_v2_originals'),'BULK_V2_MISSING_REQUIRED_PROTECTIONS');
const [hcrBefore,privateBefore,ledgerBefore,statBefore,activeStatsBefore]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/btts-history-private-test'),
 owner('/test-ledger'),owner('/prematch-stats-registry-test?days=90'),
 owner('/prematch-stats-registry-audit-test')]);
assert.equal(hcrBefore.registry.code,'HCR-V1');assert(hcrBefore.inventory.finishedFixtures>=1433);
assert(privateBefore.archive.privateFT>=595,'NOT_ENOUGH_VERIFIED_BULK_FT');
assert(ledgerBefore.rows.length>=76,'EXISTING_1X2_LEDGER_MISSING');
assert.equal(activeStatsBefore.verified,true,'EXISTING_STATS_INVALID_STOP');
const ledgerHash=hash(JSON.stringify({rows:ledgerBefore.rows,stats:ledgerBefore.stats}));
console.log('B46_BTTS_BULK_V2_DEPLOY_PREFLIGHT '+JSON.stringify({existingVersion:expected,
 archivePrivateFT:privateBefore.archive.privateFT,HCRFT:hcrBefore.inventory.finishedFixtures,
 oneX2Rows:ledgerBefore.rows.length,statsVerified:activeStatsBefore.verified,
 providerCalls:0,productionWrites:0}));
assert.equal(await version(worker),expected,'TEST_VERSION_CHANGED_BEFORE_DEPLOY');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindingNames.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const body=m.name===main?newMain:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([body],{type:'application/javascript+module'}),m.name)
}
form.append(newModule,new Blob([newTransport],{type:'application/javascript+module'}),newModule);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,script;
for(let i=0;i<30;i++){
 after=await version(worker);
 try{script=await cf('/workers/'+worker+'/versions/'+after+'?include=modules')}
 catch{await new Promise(r=>setTimeout(r,1250));continue}
 const a=script.modules.find(m=>m.name===main),b=script.modules.find(m=>m.name===newModule);
 if(after!==expected&&a?.content_base64&&b?.content_base64&&
  Buffer.from(a.content_base64,'base64').toString('utf8')===newMain&&
  Buffer.from(b.content_base64,'base64').toString('utf8')===newTransport)break;
 await new Promise(r=>setTimeout(r,1300));
}
assert(after&&after!==expected,'TEST_DEPLOY_NOT_ACTIVE');
assert.equal(script.modules.length,active.modules.length+1,'MODULE_COUNT_CHANGED_UNEXPECTEDLY');
for(const m of active.modules){
 if(m.name===main)continue;
 const n=script.modules.find(x=>x.name===m.name);
 assert(n?.content_base64&&hash(Buffer.from(n.content_base64,'base64'))===originalHashes[m.name],
  'PREEXISTING_MODULE_MUTATED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindingNames);
let bulk;
for(let i=0;i<30;i++){
 try{
  bulk=await owner('/btts-bulk-v2-state');
  if(bulk.system==='BTTS_ULTRA_BULK_V2_TEST')break;
 }catch(e){if(i===29)throw e}
 await new Promise(r=>setTimeout(r,1300));
}
assert.equal(bulk.config.mode,'STAGED','BULK_V2_PREMATURELY_ACTIVE');
assert.equal(bulk.transport.providerCalls,0);
const [hcrAfter,privateAfter,ledgerAfter,statAfter,auditAfter]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/btts-history-private-test'),
 owner('/test-ledger'),owner('/prematch-stats-registry-test?days=90'),
 owner('/prematch-stats-registry-audit-test')]);
assert.equal(hcrAfter.inventory.finishedFixtures,hcrBefore.inventory.finishedFixtures,'HCR_MUTATED');
assert.equal(privateAfter.archive.privateFT,privateBefore.archive.privateFT,'HISTORY_MUTATED');
assert.equal(hash(JSON.stringify({rows:ledgerAfter.rows,stats:ledgerAfter.stats})),ledgerHash,'1X2_MUTATED');
assert.equal(statAfter.markets['1X2'].total,statBefore.markets['1X2'].total,'1X2_REGISTRY_MUTATED');
assert.equal(auditAfter.verified,true);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),
 protectedBefore,'PROTECTED_VERSION_CHANGED');
console.log('B46_BTTS_BULK_V2_STAGED_TEST_PASS '+JSON.stringify({worker,before:expected,after,
 gate:'STAGED_NOT_ACTIVE',oldCacheTruck:'RUNS_UNTIL_PROVEN_ACTIVATION',
 sourceModulesPreserved:active.modules.length-1,addedModule:newModule,
 cap:{roundsPerDay:5,providerCallsPerRound:1,rowsPerRound:100},
 rawArchive:true,historyFT:privateAfter.archive.privateFT,
 HCRFT:hcrAfter.inventory.finishedFixtures,oneX2Rows:ledgerAfter.rows.length,
 statsAuditVerified:auditAfter.verified,
 newProviderCalls:0,productionWrites:0,protectedNames}));
