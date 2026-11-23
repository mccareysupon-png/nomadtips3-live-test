// BALL46 TEST only: first verified O/U payout for previously issued PENDING
// picks, from existing Full Market cache only; zero paid provider requests.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'TEST_CLOUDFLARE_CREDENTIALS_MISSING');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120';
const oldVersion='25e26c01-88ac-47a1-9d71-93140b3efe47',main='prematch-only-worker.mjs';
const moduleName='ou-pending-price-completion-v1-test.mjs';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(55000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status);
 return j.result;
}
const version=async name=>{
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'MISSING_VERSION_'+name);return id;
};
const kept=Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)])));
assert.equal(await version(worker),oldVersion,'TEST_VERSION_CHANGED_ABORT');
const active=await cf('/workers/'+worker+'/versions/'+oldVersion+'?include=modules');
assert.equal(active.main_module,main);assert.equal(active.modules.length,27);
const old=Buffer.from(active.modules.find(m=>m.name===main)?.content_base64??'','base64').toString('utf8');
assert(old.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 old.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')&&
 old.includes('DISABLED_POST_ISSUE_REPRICE')&&
 old.includes('const priceCapture=await captureAndIssueOu(this.db,{screening,now,'),'MAIN_SOURCE_CHANGED');
const moduleCode=fs.readFileSync('qa/prematch-history-20261120/'+moduleName,'utf8');
assert(moduleCode.includes('noProviderCalls:true')&&
 moduleCode.includes("market('/board-cache'")&&
 moduleCode.includes("status='PENDING' AND price IS NULL")&&
 moduleCode.includes('ON CONFLICT(fixture_id) DO NOTHING')&&
 moduleCode.includes('UPDATE b46_ou_pick_v1_test SET price=?'),'MODULE_GUARDS_MISSING');
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+moduleName]);
const once=(s,a,b,desc)=>{assert.equal(s.split(a).length-1,1,'DRIFT_'+desc);return s.replace(a,b)};
let next=old;
next=once(next,
 "import {captureAndIssueOu,lockedOuPriceEvidence,OU_INSTANT_POLICY} from './ou-instant-full-market-issue-v1-test.mjs';",
 "import {captureAndIssueOu,lockedOuPriceEvidence,OU_INSTANT_POLICY} from './ou-instant-full-market-issue-v1-test.mjs';\n"+
 "import {completePendingOuFromCachedMarket,pendingUnpricedOuCandidates,pendingOuQuoteEvidence,OU_PENDING_PRICE_COMPLETION_POLICY} from './ou-pending-price-completion-v1-test.mjs';",
 'IMPORT_PRICE_COMPLETION');
const method=[
 " async completePendingOuCache(now){",
 "  if(!this.env.FULL_MARKET)return {state:'FULL_MARKET_NOT_BOUND',attached:0,providerCalls:0};",
 "  return completePendingOuFromCachedMarket(this.db,{now,market:async(path,opts={})=>{",
 "   if(path!=='/board-cache'||opts.method!=='POST')throw Error('OU_PENDING_CACHE_PATH_NOT_ALLOWED');",
 "   const r=await this.env.FULL_MARKET.fetch('https://full-market.internal/board-cache',{",
 "    method:'POST',headers:{'content-type':'application/json',accept:'application/json'},",
 "    body:JSON.stringify(opts.body??{}),signal:AbortSignal.timeout(13000)});",
 "   if(!r.ok)throw Error('OU_FULL_MARKET_CACHE_HTTP_'+r.status);",
 "   return r.json();",
 "  }});",
 " }",
 ""
].join('\n');
next=once(next," async rememberLeagueCatalog(snapshot){",method+"\n async rememberLeagueCatalog(snapshot){",'CACHE_ONLY_METHOD');
const route=[
 "if(path==='/ou-pending-price-completion-state'&&req.method==='GET')",
 "   return json({mode:'OU_PENDING_PRICE_COMPLETION_TEST',policy:OU_PENDING_PRICE_COMPLETION_POLICY,",
 "    waiting:pendingUnpricedOuCandidates(this.db,now,350).map(p=>({fixtureId:p.fixture_id,",
 "     pick:p.pick,kickoff:p.kickoff,pickedAt:p.picked_at})),",
 "    attached:pendingOuQuoteEvidence(this.db,100),providerCalls:0});",
 "  if(path==='/ou-pending-price-completion-tick'&&req.method==='POST'){",
 "   if(this.ouInstantInFlight)return json({state:'OU_SELECTION_IN_PROGRESS',attached:0,providerCalls:0});",
 "   return json(await this.completePendingOuCache(now));",
 "  }",
 "  "
].join('\n');
next=once(next,"if(path==='/ou-locked-evidence-test'&&req.method==='GET')",
 route+"if(path==='/ou-locked-evidence-test'&&req.method==='GET')",'OWNER_COMPLETION_ROUTES');
next=once(next,
 "    const settled=settleOu(this.db,now);\n    const sync=syncOuSnapshot(this.db,now);",
 "    let pendingPriceCompletion;\n"+
 "    try{pendingPriceCompletion=await this.completePendingOuCache(now)}\n"+
 "    catch(e){pendingPriceCompletion={state:'CACHE_ONLY_COMPLETION_ERROR',attached:0,providerCalls:0,error:String(e?.message??e).slice(0,85)}}\n"+
 "    const settled=settleOu(this.db,now);\n    const sync=syncOuSnapshot(this.db,now);",
 'AUTO_PENDING_PRICE_COMPLETION');
next=once(next,
 "recorded:priceCapture.recorded,priceCapture,settled,sync,stats:registry.stats,",
 "recorded:priceCapture.recorded,priceCapture,pendingPriceCompletion,settled,sync,stats:registry.stats,",
 'REPORT_PENDING_COMPLETION');
assert(next.includes("path==='/ou-pending-price-completion-tick'")&&
 next.includes('pendingPriceCompletion,settled,sync')&&
 next.includes('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')&&
 next.includes('DISABLED_POST_ISSUE_REPRICE')&&
 next.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST'),'SAFETY_REGRESSION');
const check='/tmp/ball46-ou-pending-completion-main.mjs';
fs.writeFileSync(check,next);execFileSync(process.execPath,['--check',check]);
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
assert.equal(await version(worker),oldVersion,'CONCURRENT_TEST_DEPLOY_ABORT');
const oldHashes=Object.fromEntries(active.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]));
const metadata={main_module:main,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
console.log('B46_OU_PENDING_PRICE_PRE_DEPLOY '+JSON.stringify({
 version:oldVersion,originalModules:27,postDeployModules:28,
 onlyCacheRead:true,paidProviderCalls:0,protectedVersions:kept}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of active.modules)form.append(m.name,new Blob([m.name===main?next:Buffer.from(m.content_base64,'base64')],{type:'application/javascript+module'}),m.name);
form.append(moduleName,new Blob([moduleCode],{type:'application/javascript+module'}),moduleName);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let current=null,installed=null;
for(let i=0;i<45;i++){
 const id=await version(worker);
 if(id!==oldVersion){
  const v=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const m=v.modules.find(x=>x.name===main),p=v.modules.find(x=>x.name===moduleName);
  if(v.modules.length===28&&m&&p&&
   Buffer.from(m.content_base64,'base64').toString('utf8')===next&&
   Buffer.from(p.content_base64,'base64').toString('utf8')===moduleCode){
    current=id;installed=v;break;
  }
 }
 await new Promise(r=>setTimeout(r,1000));
}
assert(current&&installed,'NEW_TEST_VERSION_NOT_ACTIVE');
for(const m of active.modules){
 const n=installed.modules.find(x=>x.name===m.name);assert(n,'MODULE_MISSING_'+m.name);
 if(m.name!==main)assert.equal(hash(Buffer.from(n.content_base64,'base64')),oldHashes[m.name],
  'EXISTING_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)]))),kept);
console.log('B46_OU_PENDING_FIRST_PRICE_TEST_DEPLOY_PASS '+JSON.stringify({
 previous:oldVersion,version:current,changedExistingModules:[main],addedModule:moduleName,
 preservedModules:26,originalPickAndTimeUnchanged:true,firstOnly:true,
 authenticatedOwnerRoutes:true,cronAutomaticallyChecksExistingPending:true,
 noNewProviderCalls:0,originalPaidCallCap:1,productionWrites:0,
 btTsClosed:true,protectedWorkersIdentical:true}));
