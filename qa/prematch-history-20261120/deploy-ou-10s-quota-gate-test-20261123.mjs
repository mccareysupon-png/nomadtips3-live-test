// TEST-only update of O/U price pickup quota health gate: replace exactly one module.
// Existing active code/ledger/FT settlement/1X2/BTTS/Hub/Production untouched.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CF_TEST_CREDENTIALS_MISSING');
const host='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const name='ball46-prematch-only-test-20261120',oldVersion='dd7b0b9b-daf8-4186-9863-acd04b19c328';
const target='ou-price-pickup-v1-test.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
async function cf(path,options={}){
 const r=await fetch(host+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status);return j.result;
}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async x=>[x,await version(x)])));
assert.equal(await version(name),oldVersion,'TEST_WORKER_ACTIVE_VERSION_CHANGED');
const active=await cf('/workers/'+name+'/versions/'+oldVersion+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs');
assert.equal(active.modules.length,26);
const old=Buffer.from(active.modules.find(x=>x.name===target)?.content_base64??'','base64').toString('utf8');
assert(old.includes('minimumHubRefreshMs:30000')&&!old.includes('ACCELERATED_HUB_QUOTA_NOT_VERIFIED'),
 'OLD_GATE_NOT_AS_EXPECTED');
const next=fs.readFileSync('qa/prematch-history-20261120/'+target,'utf8');
assert(next.includes('minimumHubRefreshMs:10000')&&next.includes('ACCELERATED_HUB_QUOTA_NOT_VERIFIED')&&
 next.includes('h.bulkSpeedV3?.quotaObserved!==true')&&
 next.includes('h.bulkSpeedV3?.accelerationAvailable!==true')&&
 next.includes('maxProviderCallsPerLondonDay:1'),'QUOTA_GATE_INVARIANTS');
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+target]);
const bindings=(await cf('/scripts/'+name+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE']);
const originalHashes=Object.fromEntries(active.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]));
assert.equal(await version(name),oldVersion);
const metadata={main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const src=m.name===target?next:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([src],{type:'application/javascript+module'}),m.name);
}
console.log('B46_OU_10S_GATE_PREFLIGHT '+JSON.stringify({worker:name,version:oldVersion,modules:26,
 originalPriceModuleHash:originalHashes[target],change:'VERIFIED_HUB_10S_QUOTA_HEALTH_ONLY',
 maxPaidCallsPerLondonDay:1,protectedNames:protectedBefore}));
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null,installed=null;
for(let i=0;i<40;i++){
 const v=await version(name);
 if(v!==oldVersion){
  const a=await cf('/workers/'+name+'/versions/'+v+'?include=modules');
  const bytes=a.modules.find(m=>m.name===target)?.content_base64;
  if(bytes&&Buffer.from(bytes,'base64').toString('utf8')===next){
   newVersion=v;installed=a;break;
  }
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(newVersion&&installed,'NEW_GATE_WORKER_NOT_ACTIVE');
assert.equal(installed.modules.length,26);
for(const m of active.modules){
 const n=installed.modules.find(x=>x.name===m.name);
 assert(n,'MISSING_MODULE_'+m.name);
 if(m.name!==target)assert.equal(hash(Buffer.from(n.content_base64,'base64')),originalHashes[m.name],
  'ORIGINAL_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+name+'/settings')).bindings.map(x=>x.name).sort(),bindings);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async x=>[x,await version(x)]))),protectedBefore);
console.log('B46_OU_VERIFIED_10S_GATE_DEPLOY_PASS '+JSON.stringify({
 before:oldVersion,after:newVersion,modules:26,protectedModulesIdentical:true,
 btTsClosed:true,original1X2FormulaUntouched:true,originalOuFormulaUntouched:true,
 maxNewRequestsPerLondonDay:1,workerAutoCron:'*/15 * * * *',productionWrites:0
}));
