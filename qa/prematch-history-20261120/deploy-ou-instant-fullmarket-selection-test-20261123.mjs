// BALL46 Pre-Match isolated TEST only: connect Full Market service to EXACT O/U
// model-qualified selection run and issue locked price atomically, never reprice.
// Adds one service binding, one module; changes one main module; all 25 remaining
// modules and protected workers unchanged. No paid upstream calls during deploy.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_CREDENTIALS_REQUIRED');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const name='ball46-prematch-only-test-20261120',expectedVersion='9be55361-eb85-4515-8619-bfeb5787e5a8';
const fullMarket='nomadtips3-full-market-343-ball46';
const main='prematch-only-worker.mjs',newModule='ou-instant-full-market-issue-v1-test.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 fullMarket,'ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(60000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+r.status+'_'+path+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
const version=async target=>{
 const v=await cf('/scripts/'+target+'/deployments?per_page=1');
 assert(v.deployments?.[0]?.versions?.[0]?.version_id,'DEPLOYMENT_MISSING_'+target);
 return v.deployments[0].versions[0].version_id;
};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const protection=Object.fromEntries(await Promise.all(protectedNames.map(async x=>[x,await version(x)])));
assert.equal(await version(name),expectedVersion,'ACTIVE_TEST_VERSION_CHANGED_ABORT');
const active=await cf('/workers/'+name+'/versions/'+expectedVersion+'?include=modules');
assert.equal(active.main_module,main);
assert.equal(active.modules.length,26);
const mainText=Buffer.from(active.modules.find(m=>m.name===main)?.content_base64??'','base64').toString('utf8');
const quoteReader=Buffer.from(active.modules.find(m=>m.name==='ou-verified-price-ingest-v1-test.mjs')?.content_base64??'','base64').toString('utf8');
assert(quoteReader.includes("minBeforeKickoffSec:300")&&quoteReader.includes("openingIsHistorical:stage==='opening'"));
const quotePickup=Buffer.from(active.modules.find(m=>m.name==='ou-price-pickup-v1-test.mjs')?.content_base64??'','base64').toString('utf8');
assert(quotePickup.includes('maxProviderCallsPerLondonDay:1'));
const quoteSource=fs.readFileSync('qa/prematch-history-20261120/'+newModule,'utf8');
assert(quoteSource.includes('noPostIssueReprice:true')&&
 quoteSource.includes('noHistoricalBackfill:true')&&
 quoteSource.includes('maxPaidCallsPerLondonDay:1')&&
 quoteSource.includes('captureAndIssueOu')&&quoteSource.includes('issueOuAtSelection')&&
 quoteSource.includes('ON CONFLICT(fixture_id) DO NOTHING')&&
 !quoteSource.includes('UPDATE b46_ou_pick_v1_test'),'IMMUTABLE_PRICE_SOURCE_GUARD');
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+newModule]);
const once=(s,from,to,label)=>{
 const n=s.split(from).length-1;
 assert.equal(n,1,'TEST_MAIN_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(from,to);
};
let next=mainText;
next=once(next,
 "import {initOuPricePickup,readOuPricePickupState,runOuPricePickup,OUV1_PICKUP_POLICY} from './ou-price-pickup-v1-test.mjs';",
 "import {initOuPricePickup,readOuPricePickupState,runOuPricePickup,OUV1_PICKUP_POLICY} from './ou-price-pickup-v1-test.mjs';\n"+
 "import {captureAndIssueOu,lockedOuPriceEvidence,OU_INSTANT_POLICY} from './ou-instant-full-market-issue-v1-test.mjs';",
 'ADD_INSTANT_QUOTE_MODULE_IMPORT');
// Exact existing O/U issue route. Screen math stays byte-for-byte unchanged.
const previousIssue=String.raw`if(path==='/ou-cycle-test'&&req.method==='POST'){
   const fixtures=await this.ctx.storage.get('botFixtures')??[];
   const screening=screenOu(this.db,fixtures,now,350);
   const recorded=recordOu(this.db,screening,now);
   const settled=settleOu(this.db,now);
   const sync=syncOuSnapshot(this.db,now);
   const registry=readOuSnapshot(this.db,now);
   return json({mode:'OU_MATH_V1_TEST',screening:screening.counts,recorded,settled,sync,stats:registry.stats,model:OU_POLICY.model,providerCalls:0,paidOddsRequested:0});
  }`;
const newIssue=String.raw`if(path==='/ou-cycle-test'&&req.method==='POST'){
   // Lock the price at the same screening run: never post-issue overwrite.
   if(!this.env.FULL_MARKET)return json({state:'FULL_MARKET_BINDING_MISSING',providerCalls:0,issued:0});
   if(this.ouInstantInFlight)return json(await this.ouInstantInFlight);
   this.ouInstantInFlight=(async()=>{
    const fixtures=await this.ctx.storage.get('botFixtures')??[];
    const screening=screenOu(this.db,fixtures,now,350);
    const priceCapture=await captureAndIssueOu(this.db,{screening,now,
     hubHealth:async()=>{
      if(!this.env.HUB)return {ok:false};
      try{
       const r=await this.env.HUB.fetch('https://hub.internal/health',
        {method:'GET',signal:AbortSignal.timeout(9000)});
       return r.ok?await r.json():{ok:false};
      }catch{return {ok:false}}
     },
     market:async(path,opts={})=>{
      if(!(/^\/board-cache$/.test(path)||/^\/health$/.test(path)||
        /^\/fixture-odds\?fixtureId=[1-9]\d*$/.test(path)))
       throw Error('FULL_MARKET_PATH_NOT_ALLOWED');
      const init={method:opts.method??'GET',headers:{accept:'application/json'},
       signal:AbortSignal.timeout(13000)};
      if(opts.method==='POST'){
       init.headers['content-type']='application/json';
       init.body=JSON.stringify(opts.body??{});
      }
      const r=await this.env.FULL_MARKET.fetch('https://full-market.internal'+path,init);
      if(!r.ok)throw Error('FULL_MARKET_'+r.status);
      return r.json();
     }});
    const settled=settleOu(this.db,now);
    const sync=syncOuSnapshot(this.db,now);
    const registry=readOuSnapshot(this.db,now);
    return {mode:'OU_INSTANT_PRICE_AT_SELECTION_TEST',screening:screening.counts,
     recorded:priceCapture.recorded,priceCapture,settled,sync,stats:registry.stats,
     model:OU_POLICY.model,providerCalls:priceCapture.providerCalls,
     paidOddsRequested:priceCapture.providerCalls,preMatchOnly:true,noPostIssueReprice:true};
   })();
   try{return json(await this.ouInstantInFlight)}
   finally{this.ouInstantInFlight=null}
  }`;
next=once(next,previousIssue,newIssue,'REPLACE_OLD_MODEL_ONLY_ISSUE');
next=once(next,
 "if(path==='/ou-price-pickup-tick'&&req.method==='POST')\n    return json(await this.runOuPricePickupTick(now));",
 "if(path==='/ou-price-pickup-tick'&&req.method==='POST')\n    return json({state:'DISABLED_POST_ISSUE_REPRICE',providerCalls:0,oldPredictionsUntouched:true});",
 'DISABLE_LEGACY_POST_ISSUE_QUOTE_ROUTE');
next=once(next,
 "if(path==='/ou-state-test'&&req.method==='GET'){",
 "if(path==='/ou-locked-evidence-test'&&req.method==='GET')\n   return json({mode:'LOCKED_OU_SELECTION_QUOTE_EVIDENCE',rows:lockedOuPriceEvidence(this.db,50),providerCalls:0});\n  if(path==='/ou-state-test'&&req.method==='GET'){",
 'TEST_PRICE_EVIDENCE_ROUTE');
// Existing cron runs every 15 minutes, preserve cadence, but choose/price
// in ONE O/U screen cycle (instead of attempting to fill issued predictions).
const oldCron="const q=await stub.fetch('https://prematch.internal/ou-price-pickup-tick',{method:'POST'});if(q.ok){const result=await q.json();console.log('OU_2P5_PRICE_PICKUP_TEST '+result.state+' providerCalls='+(result.providerCalls??0))}else console.log('OU_2P5_PRICE_PICKUP_ERROR '+q.status)";
const newCron="const q=await stub.fetch('https://prematch.internal/ou-cycle-test',{method:'POST'});if(q.ok){const result=await q.json();console.log('OU_2P5_CAPTURE_AT_ISSUE_TEST added='+(result.recorded?.added??0)+' priced='+(result.recorded?.lockedPrices??0)+' callReserve='+(result.providerCalls??0))}else console.log('OU_2P5_CAPTURE_AT_ISSUE_ERROR '+q.status)";
next=once(next,oldCron,newCron,'OU_AUTO_CRON_AT_ISSUE');
assert(next.includes("const screening=screenOu(this.db,fixtures,now,350);"));
assert(!next.includes('const recorded=recordOu(this.db,screening,now);'));
assert(next.includes('DISABLED_POST_ISSUE_REPRICE')&&
 next.includes('/ou-locked-evidence-test')&&
 next.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 next.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')&&
 next.includes("path==='/prematch-stats-registry-test'")&&
 next.includes("path==='/btts-project-shutdown-test'"),'TEST_SAFETY_OR_STATUS_ANCHOR_LOST');
fs.writeFileSync('/tmp/b46-ou-instant-main-check.mjs',next);
execFileSync(process.execPath,['--check','/tmp/b46-ou-instant-main-check.mjs']);
const beforeBindings=(await cf('/scripts/'+name+'/settings')).bindings;
assert.deepEqual(beforeBindings.map(x=>x.name).sort(),['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE']);
const addedBinding={name:'FULL_MARKET',type:'service',service:fullMarket,environment:'production'};
const inherited=[...beforeBindings.map(x=>({name:x.name,type:'inherit'})),addedBinding];
const hashes=Object.fromEntries(active.modules.map(x=>[x.name,sha(Buffer.from(x.content_base64,'base64'))]));
const metadata={main_module:main,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:inherited,
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
assert.equal(await version(name),expectedVersion,'TEST_CONCURRENT_DEPLOY_ABORT');
console.log('B46_OU_SELECTION_PRICE_PREFLIGHT '+JSON.stringify({before:expectedVersion,
 modulesBefore:26,modulesAfter:27,
 newBinding:{name:'FULL_MARKET',service:fullMarket},
 newModule,oldScreenModelUnchanged:true,
 existingDailyPaidRequestCap:1,providerRequestsDuringDeploy:0,
 protectedWorkerVersions:protection}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const source=m.name===main?next:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([source],{type:'application/javascript+module'}),m.name);
}
form.append(newModule,new Blob([quoteSource],{type:'application/javascript+module'}),newModule);
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let current=null,installed=null;
for(let i=0;i<45;i++){
 const id=await version(name);
 if(id!==expectedVersion){
  const v=await cf('/workers/'+name+'/versions/'+id+'?include=modules');
  const n=v.modules.find(x=>x.name===newModule),m=v.modules.find(x=>x.name===main);
  if(v.modules.length===27&&n&&m&&
    Buffer.from(n.content_base64,'base64').toString('utf8')===quoteSource&&
    Buffer.from(m.content_base64,'base64').toString('utf8')===next){
   current=id;installed=v;break;
  }
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(current&&installed,'NEW_TEST_INSTANT_PRICING_NOT_ACTIVE');
for(const m of active.modules){
 const newm=installed.modules.find(x=>x.name===m.name);
 assert(newm,'TEST_MODULE_DISAPPEARED_'+m.name);
 if(m.name!==main)assert.equal(sha(Buffer.from(newm.content_base64,'base64')),hashes[m.name],
  'EXISTING_MODULE_CHANGED_'+m.name);
}
const afterBindings=(await cf('/scripts/'+name+'/settings')).bindings;
assert.deepEqual(afterBindings.map(x=>x.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const actualBinding=afterBindings.find(x=>x.name==='FULL_MARKET');
assert.equal(actualBinding.service,fullMarket);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async x=>[x,await version(x)]))),
 protection,'PROTECTED_WORKER_CHANGED');
console.log('B46_OU_INSTANT_FULL_MARKET_DEPLOY_PASS '+JSON.stringify({
 worker:name,version:current,previous:expectedVersion,
 fullMarketService:fullMarket,previousModulesUntouched:25,
 preservedDb:true,immutableOldPredictions:true,priceAtIssuance:true,
 oldCronQuotePickupDisabled:true,cronIssuesNewPredictions:true,
 preMatchCaptureStage:['opening','closing'],maximumPaidRequestsPerLondonDay:1,
 providerRequestsDuringDeploy:0,formulaChanged:false,
 BTTS:'CLOSED',HUBChanged:false,engineChanged:false,productionChanged:false}));
