import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Change only the two existing history modules and add ONE full cargo module
// on the existing Pre-Match TEST Worker. No new provider transport or API call.
const worker='ball46-prematch-only-test-20261120';
const expectedVersion='d8ecb600-b38d-4653-99af-201786427175';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_DEPLOY_CREDENTIALS');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const url='https://'+worker+'.mccarey-supon.workers.dev';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120','ball46-prematch-performance-test-20261121'];
const updated=['history-five-rounds.mjs','prematch-only-worker.mjs'];
const added='history-cargo-full-payload.mjs';
const dir='qa/prematch-history-20261120/';
const owner='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(endpoint,options={}){
 const r=await fetch(endpoint,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(40000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_FAILED_'+r.status+' '+JSON.stringify(j.errors||[]));return j.result;
}
async function version(n){
 const r=await cf(root+'/scripts/'+n+'/deployments?per_page=1');
 const id=r.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'MISSING_VERSION_'+n);return id;
}
async function admin(path){
 const r=await fetch(url+path,{headers:{authorization:owner},cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'TEST_ADMIN_HTTP_'+r.status+' '+path);return r.json();
}
const protectedBefore=await Promise.all(protectedNames.map(version));
const before=await version(worker);
assert.equal(before,expectedVersion,'TEST_WORKER_HAS_CHANGED_STOP_TO_PREVENT_OVERWRITE');
const active=await cf(root+'/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs','MAIN_MODULE_DRIFT');
assert(active.modules?.length>=15,'CURRENT_15_MODULES_NOT_PRESENT');
assert(!active.modules.some(m=>m.name===added),'FULL_CARGO_MODULE_ALREADY_EXISTS');
const current=name=>{
 const m=active.modules.find(m=>m.name===name);
 assert(m?.content_base64,'CURRENT_MODULE_MISSING_'+name);
 return Buffer.from(m.content_base64,'base64').toString('utf8');
};
const baseline={
 'history-five-rounds.mjs':'db1da16fa0420cb68d842f2d41a63894f638aa5c',
 'prematch-only-worker.mjs':'722cd6d1a298b55520fa7bd11f79c32af9983753'
};
for(const name of updated){
 const old=execFileSync('git',['show',baseline[name]+':'+dir+name],{encoding:'utf8'});
 assert.equal(current(name),old,'LIVE_SOURCE_DRIFT_'+name);
}
const priorHCR=await admin('/history-cargo-registry?detail=0'),priorHealth=await admin('/health');
assert.equal(priorHCR.registry.code,'HCR-V1');
assert.equal(priorHCR.registry.providerCalls,0);
const settings=await cf(root+'/scripts/'+worker+'/settings');
const bindingNames=(settings.bindings||[]).map(b=>b.name).sort();
assert.deepEqual(bindingNames,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'TEST_BINDING_SHAPE_DRIFT');
const priorModules={};
for(const m of active.modules){
 assert(m.name.endsWith('.mjs')&&typeof m.content_base64==='string','UNEXPECTED_MODULE_TYPE');
 priorModules[m.name]=crypto.createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex');
}
for(const name of [...updated,added])execFileSync(process.execPath,['--check',dir+name],{stdio:'pipe'});
const next=Object.fromEntries([...updated,added].map(name=>[name,fs.readFileSync(dir+name,'utf8')]));
assert(next['history-five-rounds.mjs'].includes('storeHistoryRoundFullCargo(db,')&&
 next['prematch-only-worker.mjs'].includes("path==='/history-cargo-full'")&&
 next[added].includes('JSON.stringify(raw)'),'MISSING_FULL_PAYLOAD_IMPLEMENTATION');
assert.equal(await version(worker),before,'TEST_WORKER_CHANGED_MID_PREFLIGHT');
console.log('B46_FULL_CARGO_PREPARE '+JSON.stringify({worker,before,currentModules:active.modules.length,changed:updated,added,existingFT:priorHCR.inventory.finishedFixtures,hcrCode:priorHCR.registry.code,quotaExtraCalls:0,productionWrites:0}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,
 compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindingNames.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const data=updated.includes(m.name)?next[m.name]:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([data],{type:'application/javascript+module'}),m.name);
}
form.append(added,new Blob([next[added]],{type:'application/javascript+module'}),added);
await cf(root+'/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after,verified;
for(let i=0;i<25;i++){
 after=await version(worker);
 verified=await cf(root+'/workers/'+worker+'/versions/'+after+'?include=modules');
 if(after!==before&&[...updated,added].every(name=>{
  const mod=verified.modules?.find(m=>m.name===name);
  return mod?.content_base64&&Buffer.from(mod.content_base64,'base64').toString('utf8')===next[name];
 }))break;
 await new Promise(resolve=>setTimeout(resolve,1250));
}
assert.notEqual(after,before,'NO_NEW_TEST_WORKER_DEPLOYMENT');
assert.equal(verified.modules.length,active.modules.length+1,'UNEXPECTED_TEST_MODULE_COUNT');
for(const m of active.modules){
 if(updated.includes(m.name))continue;
 const latest=verified.modules.find(x=>x.name===m.name);
 assert(latest?.content_base64,'PREEXISTING_MODULE_MISSING_'+m.name);
 const hash=crypto.createHash('sha256').update(Buffer.from(latest.content_base64,'base64')).digest('hex');
 assert.equal(hash,priorModules[m.name],'OTHER_MODULE_MODIFIED_'+m.name);
}
const namesAfter=(await cf(root+'/scripts/'+worker+'/settings')).bindings.map(b=>b.name).sort();
assert.deepEqual(namesAfter,bindingNames,'BINDINGS_CHANGED');
let hcr,cargo,health;
for(let i=0;i<20;i++){
 try{
  [hcr,cargo,health]=await Promise.all([
   admin('/history-cargo-registry?detail=0'),admin('/history-cargo-full'),admin('/health')
  ]);break;
 }catch(e){if(i===19)throw e;await new Promise(r=>setTimeout(r,1100))}
}
assert.equal(hcr.registry.code,'HCR-V1');
assert.equal(cargo.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(cargo.providerCalls,0);
assert.equal(health.providerCalls,0);
assert(hcr.inventory.finishedFixtures>=priorHCR.inventory.finishedFixtures,'FT_ARCHIVE_SHRANK');
assert.deepEqual(health.dailyBook,priorHealth.dailyBook,'ACCOUNTING_CHANGED');
const protectedAfter=await Promise.all(protectedNames.map(version));
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_PREMATCH_FULL_CARGO_TEST_DEPLOY_VERIFIED '+JSON.stringify({
 worker,before,after,modified:updated,added,untouchedModules:active.modules.length-updated.length,
 HCR:{code:hcr.registry.code,finishedFixtures:hcr.inventory.finishedFixtures,rounds:hcr.scope.rounds},
 fullCargo:{code:cargo.registry,roundsTracked:cargo.roundsTracked,fixtureRecords:cargo.fixtureRecords,source:cargo.source},
 quota:{extraProviderRequests:0,maxRoundsPerBusinessDay:5,maxFixturesPerRound:100,maxPerDay:500},
 accountUnchanged:true,productionWrites:0,protectedNames
}));
