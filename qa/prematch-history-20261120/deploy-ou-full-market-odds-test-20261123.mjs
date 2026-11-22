// BALL46 TEST ONLY. Fix O/U quote pickup to use the full 5USD native odds page
// once per preselected fixture: fixed 2.5 AND main goal_line in one response.
// Reuses the existing 1-call-per-London-day durable cap; ZERO additional tests
// that call the paid provider. 1X2/BTTS/HCR/HUB/Engine/Production unchanged.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_TEST_CREDENTIALS');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120';
const expectedVersion='ebf8f95e-4379-4cae-9b27-aeea9c87b13d';
const priceModule='ou-price-pickup-v1-test.mjs';
const mainModule='prematch-only-worker.mjs';
const protectedWorkers=[
 'ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120',
 'ball46-prematch-performance-test-20261121'];
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(55000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+r.status+'_'+path+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
async function version(name){
 const data=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=data.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'WORKER_VERSION_MISSING_'+name);return id;
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)])));
assert.equal(await version(worker),expectedVersion,'ACTIVE_TEST_VERSION_CHANGED_FAIL_CLOSED');
const active=await cf('/workers/'+worker+'/versions/'+expectedVersion+'?include=modules');
assert.equal(active.modules.length,26,'EXPECTED_26_TEST_MODULES');
assert.equal(active.main_module,mainModule,'ACTIVE_MAIN_CHANGED');
const oldMain=Buffer.from(active.modules.find(x=>x.name===mainModule).content_base64,'base64').toString('utf8');
const oldPickup=Buffer.from(active.modules.find(x=>x.name===priceModule).content_base64,'base64').toString('utf8');
const newPickup=fs.readFileSync('qa/prematch-history-20261120/'+priceModule,'utf8');
const oldFilter=String.raw`if(!/^\/v1\/fixtures\/[1-9]\d*\/odds\?market=goalline_fixed$/.test(path))`;
const newFilter=String.raw`if(!/^\/v1\/fixtures\/[1-9]\d*\/odds$/.test(path))`;
assert.equal(oldMain.split(oldFilter).length-1,1,'MAIN_OLD_FILTER_MISSING_OR_DUPLICATE');
assert(oldMain.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED'));
assert(oldMain.includes('OU_2P5_PRICE_PICKUP_TEST'));
assert(oldMain.includes("path==='/ou-price-pickup-state'"));
assert(oldMain.includes("path==='/ou-price-pickup-tick'"));
assert(oldPickup.includes("const path='/v1/fixtures/'+candidate.fixture_id+'/odds?market=goalline_fixed';"));
assert(oldPickup.includes('maxProviderCallsPerLondonDay:1'));
assert(newPickup.includes("const path='/v1/fixtures/'+candidate.fixture_id+'/odds';"));
assert(!newPickup.includes("'/odds?market=goalline_fixed'"));
assert(newPickup.includes('maxProviderCallsPerLondonDay:1'));
assert(newPickup.includes('ACCELERATED_HUB_QUOTA_NOT_VERIFIED'));
assert(newPickup.includes("runOuPricePickup"));
const newMain=oldMain.replace(oldFilter,newFilter);
const tempfile='/tmp/b46-ou-new-full-native-odds-worker.mjs';
fs.writeFileSync(tempfile,newMain);
execFileSync(process.execPath,['--check',tempfile],{stdio:'pipe'});
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+priceModule],{stdio:'pipe'});
assert(!newMain.includes('odds\\?market=goalline_fixed'));
assert.equal(newMain.split(newFilter).length-1,1);
const names=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(names,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE']);
const originalHashes=Object.fromEntries(active.modules.map(m=>[m.name,digest(Buffer.from(m.content_base64,'base64'))]));
const metadata={main_module:mainModule,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:names.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
assert.equal(await version(worker),expectedVersion,'CONCURRENT_TEST_DEPLOY_STOP');
console.log('B46_OU_FULL_MARKET_PREFLIGHT '+JSON.stringify({
 before:expectedVersion,modules:26,change:'ONE_NATIVE_FIXTURE_ODDS_REQUEST_BOTH_OU_MARKETS',
 callsPerLondonDay:1,paidProviderRequestsDuringDeploy:0,protected:protectedBefore}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const contents=m.name===mainModule?newMain:m.name===priceModule?newPickup:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([contents],{type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let current=null,installed=null;
for(let i=0;i<40;i++){
 const id=await version(worker);
 if(id!==expectedVersion){
  const check=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const main=check.modules.find(m=>m.name===mainModule);
  const pickup=check.modules.find(m=>m.name===priceModule);
  if(main&&pickup&&Buffer.from(main.content_base64,'base64').toString('utf8')===newMain&&
     Buffer.from(pickup.content_base64,'base64').toString('utf8')===newPickup){
    current=id;installed=check;break;
  }
 }
 await new Promise(r=>setTimeout(r,1100));
}
assert(current&&installed,'NEW_FULL_ODDS_TEST_VERSION_NOT_ACTIVE');
assert.equal(installed.modules.length,26);
for(const m of active.modules){
 const newm=installed.modules.find(x=>x.name===m.name);
 assert(newm?.content_base64,'MODULE_DISAPPEARED_'+m.name);
 if(m.name===mainModule||m.name===priceModule)continue;
 assert.equal(digest(Buffer.from(newm.content_base64,'base64')),originalHashes[m.name],
  'PROTECTED_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),names);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)]))),protectedBefore);
console.log('B46_OU_FULL_MARKET_TEST_DEPLOY_SUCCESS '+JSON.stringify({
 before:expectedVersion,after:current,
 fullNativeOdds:"/v1/fixtures/{id}/odds",
 marketKeys:["goal_line_fixed","goal_line"],
 preservedDailyCap:1,existingRequestLedgerPreserved:true,
 unchangedTestModules:24,unchangedBindings:true,unchangedProtectedWorkers:true,
 paidProviderRequestsDuringDeploy:0,productionWrites:0}));
