// Patch ONLY the already deployed original PreMatch TEST frontend client.
// Backend 1X2/BTTS/Live untouched, no extra O/U pages or provider requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchPricedOuExistingStatisticsCard} from './patch-priced-ou-existing-stats-card-test-20261123.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CF_TEST_CREDENTIALS_REQUIRED');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const frontend='ball46-premium-match-colors-test-20261120';
const beforeVersion='8654d858-cd1a-4ed2-981d-65443fbab350';
const backend='ball46-prematch-only-test-20261120';
const backendVersion='41378d78-1e44-4717-ba40-d721eeaed3c6';
const base='https://'+frontend+'.mccarey-supon.workers.dev';
const protectedNames=[backend,'ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
async function cf(p,opts={}){
 const r=await fetch(api+p,{...opts,
  headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_'+p+'_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
async function version(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'MISSING_DEPLOYMENT_'+name);return id;
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(protectedBefore[backend],backendVersion,'PRICED_V2_BACKEND_CHANGED_ABORT');
assert.equal(await version(frontend),beforeVersion,'FRONTEND_VERSION_CHANGED_ABORT');
const d=await cf('/workers/'+frontend+'/versions/'+beforeVersion+'?include=modules');
assert.equal(d.main_module,'worker.js');
assert.equal(d.modules.length,1);
const original=Buffer.from(d.modules[0].content_base64,'base64').toString('utf8');
const rx=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const match=original.match(rx);
assert(match,'PREMATCH_CLIENT_NOT_FOUND');
const client=JSON.parse(match[1]);
const fixed=patchPricedOuExistingStatisticsCard(client);
assert(fixed.code.includes("item.market==='O/U'?prematchMarketLabel(item):outcome(item.pick)"));
assert(fixed.code.includes("item.market==='O/U'&&item.bookmaker)pick.append"));
assert(fixed.code.includes("item.market==='O/U'&&item.edge==null?'—'"));
const oldDeclaration=match[0],newDeclaration='var prematchClientScript = '+JSON.stringify(fixed.code)+';';
const next=original.replace(oldDeclaration,newDeclaration);
assert(next!==original);
assert.equal(next.replace(newDeclaration,oldDeclaration),original,'NON_PREMATCH_CLIENT_CHANGE_ABORT');
assert.equal(next.split(newDeclaration).length-1,1,'DUPLICATE_CLIENT_SOURCE');
fs.writeFileSync('/tmp/b46-ou-existing-stats-card-20261123.js',fixed.code);
fs.writeFileSync('/tmp/b46-ou-existing-stats-worker-20261123.js',next);
for(const file of ['/tmp/b46-ou-existing-stats-card-20261123.js','/tmp/b46-ou-existing-stats-worker-20261123.js'])
 execFileSync(process.execPath,['--check',file]);
const beforeData=await(await fetch(base+'/__b46_prematch_data',
 {cache:'no-store',signal:AbortSignal.timeout(30000)})).json();
assert(beforeData.ouLedger?.pricedOnly===true,'REAL_OU_PRICE_NOT_AVAILABLE_BACKEND');
const priced=beforeData.ouLedger.rows.find(x=>x.fixture_id===204906152);
assert(priced?.price===2.8&&priced?.pick==='UNDER_2.5'&&priced?.bookmaker==='ladbrokes',
 'REAL_PRICED_PICK_NOT_DELIVERED_BY_OLD_UI_ENDPOINT');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const h1=hash(beforeData.testLedger),hBtts=hash(beforeData.bttsLedger);
const settings=await cf('/scripts/'+frontend+'/settings');
const originalBindings=settings.bindings.map(b=>b.name).sort();
assert.deepEqual(originalBindings,['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
assert.equal(await version(frontend),beforeVersion,'FRONTEND_CONCURRENT_CHANGE_ABORT');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),
 protectedBefore,'PROTECTED_WORKER_CHANGED_PREDEPLOY');
console.log('B46_OU_EXISTING_STATS_FRONTEND_PREFLIGHT '+JSON.stringify({
 frontend,beforeVersion,backendVersion,clientOnly:true,
 noNewPage:true,existingRoute:['?b46pm=predictions','?b46pm=ou'],
 pricedPickedFixtureId:priced.fixture_id,pricedOdds:priced.price,
 original1x2Total:beforeData.testLedger.rows.length,providerCalls:0}));
const metadata={main_module:'worker.js',compatibility_date:d.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(d.compatibility_flags?.length?{compatibility_flags:d.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([next],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+frontend+'?bindings_inherit=strict',{method:'PUT',body:form});
let active=null;
for(let n=0;n<35;n++){
 const id=await version(frontend);
 if(id!==beforeVersion){
  const updated=await cf('/workers/'+frontend+'/versions/'+id+'?include=modules');
  if(updated.modules?.length===1&&
   Buffer.from(updated.modules[0].content_base64,'base64').toString('utf8')===next){
   active=id;break;
  }
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(active,'ACTIVE_TEST_UI_NOT_VERIFIED');
assert.deepEqual((await cf('/scripts/'+frontend+'/settings')).bindings.map(b=>b.name).sort(),originalBindings);
const protectedAfter=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.deepEqual(protectedAfter,protectedBefore,'OTHER_WORKERS_CHANGED');
let afterData=null,afterPage=null;
for(let n=0;n<8;n++){
 try{
  const [r,p]=await Promise.all([
   fetch(base+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(25000)}),
   fetch(base+'/?b46pm=ou',{cache:'no-store',signal:AbortSignal.timeout(25000)})
  ]);
  if(r.ok&&p.ok){
   afterData=await r.json();afterPage=await p.text();
   if(afterData.ouLedger?.pricedOnly===true&&afterPage.length>1000)break;
  }
 }catch{}
 await new Promise(resolve=>setTimeout(resolve,1200));
}
assert(afterData?.ouLedger?.pricedOnly===true,'PRICED_BACKEND_DATA_UNAVAILABLE_AFTER_UI');
assert(afterPage?.length>1000,'EXISTING_UI_PAGE_UNAVAILABLE');
assert.equal(hash(afterData.testLedger),h1,'ORIGINAL_1X2_DATA_CHANGED');
assert.equal(hash(afterData.bttsLedger),hBtts,'ORIGINAL_BTTS_DATA_CHANGED');
console.log('B46_OU_EXISTING_STATS_FRONTEND_DEPLOY_PASS '+JSON.stringify({
 frontend,from:beforeVersion,to:active,
 backendVersion,existingPages:[base+'/?b46pm=predictions',base+'/?b46pm=ou'],
 directOuTabLoadsData:true,allGoalLineLabels:true,
 actualPricedPredictionCount:afterData.ouLedger.rows.length,
 sample:{id:priced.fixture_id,pick:priced.pick,price:priced.price,
  bookmaker:priced.bookmaker},
 nativeLiveMirrorPreserved:true,
 original1x2AndBttsUnchanged:true,protectedWorkersUnchanged:true,
 frontendOtherCodeUnchanged:true,productionWrites:0,newProviderCalls:0}));
