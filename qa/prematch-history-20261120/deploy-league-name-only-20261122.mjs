import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_DEPLOY_CREDENTIALS');
const worker='ball46-prematch-only-test-20261120';
const baseline='db1da16fa0420cb68d842f2d41a63894f638aa5c';
const file='normal-hub-monitor.mjs';
const folder='qa/prematch-history-20261120/';
const protectedWorkers=[
  'ball46-production','nomadtips3-engine-343',
  'nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'
];
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');

async function cf(url,opts={}){
  const r=await fetch(url,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(40000)});
  const j=await r.json();
  assert(r.ok&&j.success,'CLOUDFLARE_ERROR_'+r.status+'_'+JSON.stringify(j.errors||[]));
  return j.result;
}
async function version(name){
  const r=await cf(api+'/scripts/'+name+'/deployments?per_page=1');
  const id=r.deployments?.[0]?.versions?.[0]?.version_id;
  assert(id,'MISSING_WORKER_VERSION_'+name);
  return id;
}
async function admin(path){
  const r=await fetch(host+path,{headers:{authorization:auth},signal:AbortSignal.timeout(30000),cache:'no-store'});
  assert(r.ok,'TEST_ADMIN_HTTP_'+r.status+'_'+path);
  return r.json();
}

const protectedBefore=await Promise.all(protectedWorkers.map(version));
const before=await version(worker);
const active=await cf(api+'/workers/'+worker+'/versions/'+before+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs','MAIN_MODULE_DRIFT');
assert(active.modules.length>=13,'ACTIVE_MODULE_COUNT_TOO_SMALL');
const module=active.modules.find(m=>m.name===file);
assert(module&&typeof module.content_base64==='string','MONITOR_MODULE_NOT_PRESENT');
const oldCode=execFileSync('git',['show',baseline+':'+folder+file],{encoding:'utf8'});
const actualCode=Buffer.from(module.content_base64,'base64').toString('utf8');
assert.equal(actualCode,oldCode,'MONITOR_MODULE_ALREADY_CHANGED_STOP');
const changedCode=fs.readFileSync(folder+file,'utf8');
assert(changedCode.includes("leagueName:typeof f.league?.name==='string'"),'LEAGUE_FIELD_MISSING');
assert.equal(changedCode.replace(
  "   // Existing read-only cached league metadata; verified fixture ID + both team IDs above.\n   leagueName:typeof f.league?.name==='string'&&f.league.name.trim()?f.league.name.trim():null,\n",''
),oldCode,'CHANGES_EXCEED_LEAGUE_FIELD');
const settings=await cf(api+'/scripts/'+worker+'/settings');
const names=(settings.bindings||[]).map(b=>b.name).sort();
assert.deepEqual(names,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BINDINGS_DRIFT');
const oldHCR=await admin('/history-cargo-registry?detail=0');
const oldHealth=await admin('/health');
assert.equal(oldHCR.registry?.code,'HCR-V1');
assert.equal(oldHCR.registry?.providerCalls,0);
assert.equal(oldHealth.providerCalls,0);
assert.equal(await version(worker),before,'TEST_WORKER_VERSION_CHANGED_DURING_PREFLIGHT');

console.log('B46_LEAGUE_TEST_DEPLOY_PREFLIGHT '+JSON.stringify({
  worker,before,modules:active.modules.length,
  changedOnly:file,bindings:names,
  HCR:oldHCR.registry.code,priorHistoricFT:oldHCR.inventory?.finishedFixtures,
  zeroAdditionalProviderCalls:true
}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
  main_module:active.main_module,
  compatibility_date:active.compatibility_date||'2026-11-20',
  ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{}),
  bindings:names.map(name=>({name,type:'inherit'}))
})],{type:'application/json'}),'metadata.json');
for(const mod of active.modules){
  assert(mod.name.endsWith('.mjs')&&typeof mod.content_base64==='string','UNKNOWN_MODULE_SHAPE');
  const bytes=mod.name===file?changedCode:Buffer.from(mod.content_base64,'base64');
  form.append(mod.name,new Blob([bytes],{type:'application/javascript+module'}),mod.name);
}
await cf(api+'/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let after;
for(let i=0;i<25;i++){
  after=await version(worker);
  const v=await cf(api+'/workers/'+worker+'/versions/'+after+'?include=modules');
  const source=v.modules?.find(m=>m.name===file);
  if(after!==before&&source?.content_base64&&Buffer.from(source.content_base64,'base64').toString('utf8')===changedCode)break;
  await new Promise(resolve=>setTimeout(resolve,1200));
}
assert(after!==before,'TEST_WORKER_VERSION_DID_NOT_CHANGE');
const deployed=await cf(api+'/workers/'+worker+'/versions/'+after+'?include=modules');
const afterModule=deployed.modules?.find(m=>m.name===file);
assert(afterModule&&Buffer.from(afterModule.content_base64,'base64').toString('utf8')===changedCode,'DEPLOYED_MONITOR_CODE_MISMATCH');
const namesAfter=(await cf(api+'/scripts/'+worker+'/settings')).bindings.map(b=>b.name).sort();
assert.deepEqual(namesAfter,names,'BINDINGS_CHANGED');
for(const mod of active.modules){
  if(mod.name===file)continue;
  const oldHash=crypto.createHash('sha256').update(Buffer.from(mod.content_base64,'base64')).digest('hex');
  const latest=deployed.modules.find(m=>m.name===mod.name);
  assert(latest,'OTHER_MODULE_MISSING_'+mod.name);
  const newHash=crypto.createHash('sha256').update(Buffer.from(latest.content_base64,'base64')).digest('hex');
  assert.equal(newHash,oldHash,'OTHER_MODULE_MUTATED_'+mod.name);
}
let HCR,health;
for(let i=0;i<10;i++){
  try{[HCR,health]=await Promise.all([admin('/history-cargo-registry?detail=0'),admin('/health')]);break}
  catch(e){if(i===9)throw e;await new Promise(resolve=>setTimeout(resolve,1300))}
}
assert.equal(HCR.registry?.code,'HCR-V1');
assert.equal(HCR.registry?.providerCalls,0);
assert.equal(health.providerCalls,0);
assert.equal(HCR.inventory?.finishedFixtures>=oldHCR.inventory?.finishedFixtures,true,'HCR_HISTORY_SHRANK');
assert.equal(health.cutoff,'06:00 Europe/London');
const protectedAfter=await Promise.all(protectedWorkers.map(version));
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKERS_CHANGED');
const frontend='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
let frontendSeen=null;
for(let i=0;i<20;i++){
  try{
    const r=await fetch(frontend+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(20000)});
    assert(r.ok,'FRONTEND_JSON_HTTP_'+r.status);
    const j=await r.json();
    assert.equal(j?.testLedger?.mode,'TEST_ONLY');
    const moni=j.testMonitor?.monitor??{};
    const matched=Object.values(moni).filter(x=>x.phase!=='NOT_IN_HUB'&&x.phase!=='IDENTITY_MISMATCH');
    const named=matched.filter(x=>typeof x.leagueName==='string'&&x.leagueName);
    frontendSeen={ledgerRows:j.testLedger.rows.length,monitorMatches:matched.length,verifiedLeagueNames:named.length,
      mappedLeagueSamples:named.slice(0,3).map(x=>x.leagueName)};
    if(named.length||!matched.length)break;
  }catch(e){if(i===19)throw e}
  await new Promise(resolve=>setTimeout(resolve,1300));
}
console.log('B46_PREMATCH_TEST_LEAGUE_METADATA_DEPLOY_VERIFIED '+JSON.stringify({
  worker,before,after,changedOnly:file,
  noChangesToOtherModules:true,
  HCR: HCR.registry.code,
  historicFT:HCR.inventory?.finishedFixtures,
  frontend:frontendSeen,
  providerCalls:0,productionWrites:0,
  protectedWorkers
}));
