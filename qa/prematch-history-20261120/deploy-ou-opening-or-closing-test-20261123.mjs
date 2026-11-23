// BALL46: TEST Worker only. Replace O/U exact 2.5 price parser module.
// Accept real Bet365 closing first or opening second from existing full odds response.
// Deploy makes ZERO external provider calls and leaves daily 5USD cap, all ledgers,
// engine, HUB, BTTS closed, 1X2, frontend and production byte-for-byte unchanged.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_CREDENTIALS_MISSING');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120';
const originalVersion='13835689-f001-4451-aa0c-b89da962602b';
const target='ou-verified-price-ingest-v1-test.mjs';
const originalMain='prematch-only-worker.mjs';
const protectedWorkers=['ball46-production','nomadtips3-engine-343',
 'nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(55000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
const version=async name=>{
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'VERSION_MISSING_'+name);return v;
};
const beforeVersions=Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)])));
assert.equal(await version(worker),originalVersion,'ACTIVE_TEST_VERSION_DRIFT_ABORT');
const active=await cf('/workers/'+worker+'/versions/'+originalVersion+'?include=modules');
assert.equal(active.main_module,originalMain,'WRONG_TEST_WORKER_MODULE');
assert.equal(active.modules.length,26,'TEST_MODULE_SET_CHANGED');
const old=Buffer.from(active.modules.find(x=>x.name===target)?.content_base64??'','base64').toString('utf8');
assert(old.includes("const fixed=odds.goal_line_fixed;")&&
 old.includes("if(hit[0].closing===null)return fail('PRICE_WITHDRAWN');")&&
 !old.includes('openingIsHistorical'),'OLD_PARSER_NOT_AS_EXPECTED');
const path='qa/prematch-history-20261120/'+target;
const next=fs.readFileSync(path,'utf8');
assert(next.includes("openingIsHistorical:stage==='opening'")&&
 next.includes("accept(fixed25.opening,'BET365_GOAL_LINE_FIXED','opening')")&&
 next.includes("accept(values,'BET365_MAIN_GOAL_LINE',step)")&&
 next.includes("const selectedPrice=pick==='OVER_2.5'?quote.over:quote.under"),
 'NEW_OU_OPENING_CLOSING_INVARIANTS_FAILED');
execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
const otherHashes=Object.fromEntries(active.modules.map(m=>[m.name,digest(Buffer.from(m.content_base64,'base64'))]));
const currentMain=Buffer.from(active.modules.find(x=>x.name===originalMain).content_base64,'base64').toString('utf8');
assert(currentMain.includes("https://api.5dollarfootballapi.com")&&
 currentMain.includes("OU_2P5_PRICE_PICKUP_TEST")&&
 currentMain.includes("BTTS_CYCLE_DISABLED_PROJECT_CLOSED"),
 'CURRENT_OU_TRANSPORT_NOT_PRESERVED');
const priceSource=Buffer.from(active.modules.find(x=>x.name==='ou-price-pickup-v1-test.mjs').content_base64,'base64').toString('utf8');
assert(priceSource.includes("const path='/v1/fixtures/'+candidate.fixture_id+'/odds';")&&
 priceSource.includes('maxProviderCallsPerLondonDay:1')&&
 priceSource.includes('ACCELERATED_HUB_QUOTA_NOT_VERIFIED'),
 'EXISTING_PROVIDER_BUDGET_OR_FULL_ODDS_NOT_PRESERVED');
const bindings=(await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE']);
assert.equal(await version(worker),originalVersion,'CONCURRENT_TEST_DEPLOY_ABORT');
const metadata={main_module:active.main_module,
 compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
console.log('B46_OU_OPEN_OR_CLOSE_PREFLIGHT '+JSON.stringify({worker,oldVersion:originalVersion,
 moduleCount:active.modules.length,changedModules:[target],protectedVersions:beforeVersions,
 existingPaidCallCapPerLondonDay:1,paidCallsDuringDeploy:0}));
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const contents=m.name===target?next:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([contents],{type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null,installed=null;
for(let i=0;i<40;i++){
 const id=await version(worker);
 if(id!==originalVersion){
  const a=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const mod=a.modules.find(x=>x.name===target);
  if(a.modules.length===26&&mod&&Buffer.from(mod.content_base64,'base64').toString('utf8')===next){
   newVersion=id;installed=a;break;
  }
 }
 await new Promise(resolve=>setTimeout(resolve,1100));
}
assert(newVersion&&installed,'OPENING_CLOSING_PARSER_VERSION_NOT_ACTIVE');
for(const m of active.modules){
 const latest=installed.modules.find(x=>x.name===m.name);
 assert(latest,'MODULE_DISAPPEARED_'+m.name);
 if(m.name!==target)assert.equal(digest(Buffer.from(latest.content_base64,'base64')),
  otherHashes[m.name],'ORIGINAL_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async name=>[name,await version(name)]))),
 beforeVersions,'PROTECTED_DEPLOYMENTS_CHANGED');
console.log('B46_OU_OPENING_OR_CLOSING_TEST_DEPLOY_PASS '+JSON.stringify({
 before:originalVersion,after:newVersion,
 supports:['BET365_FIXED_2P5_CLOSING','BET365_FIXED_2P5_OPENING',
 'BET365_MAIN_2P5_CLOSING','BET365_MAIN_2P5_OPENING'],
 realPricesOnly:true,neverInplay:true,neverNumericLines:true,
 preserveStageSource:true,unmodifiedModules:25,bindingsPreserved:true,
 existingPaidCallCapPerLondonDay:1,paidCallsDuringDeploy:0,
 sharedHUBUnchanged:true,engineUnchanged:true,productionUnchanged:true,btTsClosed:true
}));
