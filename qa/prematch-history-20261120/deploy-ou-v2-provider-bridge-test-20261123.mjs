// TEST-only guarded BALL46 PreMatch O/U V2: cache-> Full Market fixture odds via HUB.
// Shared existing V1 one-per-London-day O/U budget. Never changes V1 picks,
// 1X2, BTTS, LIVE, Full Market or HUB. A smoke test must be READ-ONLY.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_CREDS_REQUIRED');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120',
 expectedVersion='4015d2f5-1ab0-43b0-8474-25593fe997d2',
 main='prematch-only-worker.mjs',
 newModule='ou-value-v2-provider-bridge-test.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(60000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CLOUDFLARE_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
const version=async name=>{
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'MISSING_VERSION_'+name);return id;
};
const protect=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await version(name)])));
assert.equal(await version(worker),expectedVersion,'TEST_WORKER_CHANGED_ABORT');
const original=await cf('/workers/'+worker+'/versions/'+expectedVersion+'?include=modules');
assert.equal(original.main_module,main);
assert.equal(original.modules.length,29);
const mainModule=original.modules.find(m=>m.name===main);
assert(mainModule?.content_base64,'MAIN_MODULE_UNREADABLE');
const old=Buffer.from(mainModule.content_base64,'base64').toString('utf8');
assert(old.includes("path==='/ou-value-v2-run'")&&
 old.includes("path==='/ou-value-v2-state'")&&
 old.includes('OU_VALUE_V2_SHADOW_SCREEN_TEST')&&
 old.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 old.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')&&
 old.includes('DISABLED_POST_ISSUE_REPRICE')&&
 old.includes('legacyPredictionsWritten:0'),'TEST_SOURCE_GUARD_DRIFT');
const source=fs.readFileSync('qa/prematch-history-20261120/'+newModule,'utf8');
assert(source.includes('maxPaidAttemptsPerLondonDay:1')&&
 source.includes('sharedWithOuV1:true')&&
 source.includes('sharedProviderQuotaIsAtomic:false')&&
 source.includes("market('/board-cache'")&&
 source.includes("market('/fixture-odds?fixtureId='")&&
 source.includes('price<=')===false&&
 source.includes('noOldLedgerChanges:true')&&
 source.includes("ON CONFLICT(fixture_id) DO NOTHING"),'BRIDGE_QUOTA_SOURCE_GUARD_FAILED');
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+newModule]);
const once=(s,a,b,label)=>{
 const n=s.split(a).length-1;assert.equal(n,1,'MAIN_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
let next=old;
next=once(next,
 "import {screenOuValueV2,recordOuValueShadow,readOuValueShadow,OU_VALUE_V2_POLICY,OU_VALUE_V2_MODEL} from './ou-value-screener-v2-test.mjs';",
 "import {screenOuValueV2,recordOuValueShadow,readOuValueShadow,OU_VALUE_V2_POLICY,OU_VALUE_V2_MODEL} from './ou-value-screener-v2-test.mjs';\n"+
 "import {captureOneValueV2Price,readOuValueV2BridgeState,OU_VALUE_V2_BRIDGE_POLICY} from './ou-value-v2-provider-bridge-test.mjs';",
 'NEW_BRIDGE_IMPORT');
const addon=[
 "   // V2 now gets its FIRST authentic priced candidate on the SAME",
 "   // selection run; no post-issued price changes, no legacy writes.",
 "   let pricedBridge={state:'GUARDED_NOT_RUN',budgetReserved:0,providerCalls:0};",
 "   let bridgeRecorded={added:0,duplicate:0,rejected:0};",
 "   try{",
 "    pricedBridge=await captureOneValueV2Price(this.db,{fixtures,now,",
 "     hubHealth:async()=>{",
 "      if(!this.env.HUB)return {ok:false};",
 "      try{const r=await this.env.HUB.fetch('https://hub.internal/health',{",
 "       method:'GET',signal:AbortSignal.timeout(9000)});",
 "       return r.ok?await r.json():{ok:false};",
 "      }catch{return {ok:false}}",
 "     },",
 "     market:async(path,opts={})=>{",
 "      if(!(path==='/board-cache'&&opts.method==='POST'||",
 "       path==='/health'&&opts.method==='GET'||",
 "       /^\\/fixture-odds\\?fixtureId=[1-9]\\d*$/.test(path)&&opts.method==='GET'))",
 "       throw Error('OU_V2_PROVIDER_PATH_NOT_ALLOWED');",
 "      const init={method:opts.method??'GET',headers:{accept:'application/json'},",
 "       signal:AbortSignal.timeout(14000)};",
 "      if(opts.method==='POST'){init.headers['content-type']='application/json';",
 "       init.body=JSON.stringify(opts.body??{});}",
 "      const r=await this.env.FULL_MARKET.fetch('https://full-market.internal'+path,init);",
 "      if(!r.ok)throw Error('OU_V2_FULL_MARKET_HTTP_'+r.status);",
 "      return r.json();",
 "     }});",
 "    if(pricedBridge.selected)",
 "     bridgeRecorded=recordOuValueShadow(this.db,[pricedBridge.selected],pricedBridge.selected.pickedAt);",
 "   }catch(e){",
 "    pricedBridge={state:'GUARDED_BRIDGE_ERROR',",
 "     error:String(e?.message??e).slice(0,105),",
 "     budget:readOuValueV2BridgeState(this.db,now).sharedOuDailyBudget};",
 "   }"
].join('\n');
const anchor="   const saved=recordOuValueShadow(this.db,screened.selected,now);\n   const report={...screened,recorded:saved,";
next=once(next,anchor,
 "   const saved=recordOuValueShadow(this.db,screened.selected,now);\n"+
 addon+"\n   const report={...screened,recorded:saved,pricedBridge,bridgeRecorded,",
 'CONNECT_V2_PRICE_BRIDGE');
next=once(next,
 "    model:OU_VALUE_V2_MODEL,last:await this.ctx.storage.get('ouValueV2Last')??null,",
 "    model:OU_VALUE_V2_MODEL,priceBridge:readOuValueV2BridgeState(this.db,now),"+
 "last:await this.ctx.storage.get('ouValueV2Last')??null,",
 'EXPOSE_BUDGET_AUDIT_GET_OWNER');
const oldFirst="const q=await stub.fetch('https://prematch.internal/ou-cycle-test',{method:'POST'});if(q.ok){const result=await q.json();console.log('OU_2P5_CAPTURE_AT_ISSUE_TEST added='+(result.recorded?.added??0)+' priced='+(result.recorded?.lockedPrices??0)+' callReserve='+(result.providerCalls??0))}else console.log('OU_2P5_CAPTURE_AT_ISSUE_ERROR '+q.status)";
const oldSecond="const v=await stub.fetch('https://prematch.internal/ou-value-v2-run',{method:'POST'});if(v.ok){const result=await v.json();console.log('OU_VALUE_V2_SHADOW_SCREEN_TEST inspected='+(result.checked??0)+' pricedFixtures='+(result.pricedFixtures??0)+' selected='+(result.recorded?.added??0)+' providerCalls=0')}else console.log('OU_VALUE_V2_SHADOW_SCREEN_ERROR '+v.status)";
next=once(next,oldFirst+';'+oldSecond,oldSecond+';'+oldFirst,'V2_FIRST_SHARED_DAILY_QUOTA');
// Original daily-collection and 1X2 mechanisms remain in exact original order.
assert(next.includes('OU_VALUE_V2_SHADOW_SCREEN_TEST')&&
 next.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 next.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')&&
 next.includes('OU_PENDING_PRICE_COMPLETION_TEST')&&
 next.includes("path==='/ou-value-v2-run'")&&
 next.includes('DISABLED_POST_ISSUE_REPRICE')&&
 next.includes('pricedBridge,bridgeRecorded')&&
 next.includes('maxPaidAttemptsPerLondonDay:1')===false,'POST_PATCH_SAFETY_DRIFT');
const file='/tmp/b46-ou-v2-pricing-main.mjs';
fs.writeFileSync(file,next);
execFileSync(process.execPath,['--check',file]);
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings;
const names=bindings.map(b=>b.name).sort();
assert.deepEqual(names,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const unchanged=Object.fromEntries(original.modules.map(m=>[m.name,sha(Buffer.from(m.content_base64,'base64'))]));
assert.equal(await version(worker),expectedVersion,'TEST_WORKER_CONCURRENT_CHANGED_ABORT');
const metadata={main_module:main,compatibility_date:original.compatibility_date||'2026-11-20',
 bindings:bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(original.compatibility_flags?.length?{compatibility_flags:original.compatibility_flags}:{})};
console.log('B46_OU_V2_BRIDGE_PREFLIGHT '+JSON.stringify({
 testWorker:worker,from:expectedVersion,modulesBefore:29,modulesAfter:30,
 changedExistingModules:[main],addedModule:newModule,
 preservedProtectedWorkers:protect,
 oneSharedOu5UsdRequestPerLondonDay:true,
 V2RunsBeforeV1InCron:true,
 paidRequestsDuringDeploy:0,shadowOnly:true}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of original.modules)
 form.append(m.name,new Blob([m.name===main?next:Buffer.from(m.content_base64,'base64')],{type:'application/javascript+module'}),m.name);
form.append(newModule,new Blob([source],{type:'application/javascript+module'}),newModule);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let active=null,verified=null;
for(let i=0;i<45;i++){
 const id=await version(worker);
 if(id!==expectedVersion){
  const obj=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const a=obj.modules.find(m=>m.name===main),b=obj.modules.find(m=>m.name===newModule);
  if(obj.modules.length===30&&a&&b&&
   Buffer.from(a.content_base64,'base64').toString('utf8')===next&&
   Buffer.from(b.content_base64,'base64').toString('utf8')===source){
    active=id;verified=obj;break;
  }
 }
 await new Promise(r=>setTimeout(r,1000));
}
assert(active&&verified,'NEW_TEST_PRICE_BRIDGE_NOT_ACTIVE');
for(const m of original.modules){
 const deployed=verified.modules.find(x=>x.name===m.name);
 assert(deployed,'MISSING_EXISTING_MODULE_'+m.name);
 if(m.name!==main)assert.equal(sha(Buffer.from(deployed.content_base64,'base64')),
  unchanged[m.name],'EXISTING_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(b=>b.name).sort(),names);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await version(name)]))),protect);
console.log('B46_OU_V2_PROVIDER_BRIDGE_TEST_DEPLOY_PASS '+JSON.stringify({
 worker,previous:expectedVersion,newVersion:active,
 allBookmakerMarketLines:true,marketSource:'FULL_MARKET_VIA_HUB',
 directProviderCallsByBot:0,existingPaidDailyBudget:1,
 sameBudgetAsV1:true,sharedHubQuotaAtomic:false,
 capBeforeRequest:true,noRetries:true,
 onlyTestWorkerChanged:true,otherModulesUnchanged:28,
 shadowOnly:true,existingPicksUntouched:true,
 productionUnchanged:true,engineUnchanged:true,hubUnchanged:true,
 fullMarketWorkerUnchanged:true,
 externalProviderCallsDuringDeploy:0}));
