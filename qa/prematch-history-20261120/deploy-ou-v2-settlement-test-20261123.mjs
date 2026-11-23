// Guarded add-only O/U V2 TEST FT settlement + existing UI integration.
// Do not change formulas, odds provider routing, 1X2/BTTS/HCR or Production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CF_ACCESS');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const target='ball46-prematch-only-test-20261120',main='prematch-only-worker.mjs';
const moduleName='ou-v2-settlement-test.mjs';
const file='qa/prematch-history-20261120/'+moduleName;
const moduleBody=fs.readFileSync(file,'utf8');
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CLOUDFLARE_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,180));
 return j.result;
}
const ver=async name=>{
 const v=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'VERSION_NOT_FOUND_'+name);return v;
};
const before=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await ver(n)])));
const oldVersion=await ver(target);
const existing=await cf('/workers/'+target+'/versions/'+oldVersion+'?include=modules');
assert(existing.modules.every(m=>m.content_base64),'NOT_TEXT_MODULES');
assert(!existing.modules.some(m=>m.name===moduleName),'SETTLEMENT_ALREADY_INSTALLED');
const raw=existing.modules.find(m=>m.name===main);
assert(raw,'MAIN_MODULE_MISSING');
let code=Buffer.from(raw.content_base64,'base64').toString('utf8');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashes=Object.fromEntries(existing.modules.map(m=>[m.name,digest(Buffer.from(m.content_base64,'base64'))]));
const replace=(from,to,label)=>{
 const count=code.split(from).length-1;assert.equal(count,1,'SOURCE_ANCHOR_'+label+'_'+count);
 code=code.replace(from,to);
};
assert(code.includes('prematch-ou-engine-v1-test.mjs')&&code.includes('runPreMatchOuEngineV1'),
 'EXISTING_OU_ENGINE_IMPORT_MISSING');
assert(!code.includes('ou-v2-settlement-test.mjs'),'SETTLEMENT_IMPORT_ALREADY_PRESENT');
code="import {settleOuV2FromExistingResults,syncOuV2SettlementSnapshot,readOuV2SettlementState} from './ou-v2-settlement-test.mjs';\n"+code;
replace(
 "   const b46BulkMs=Number(snapshot?.fetchedAt);",
 "   let b46Settlement={state:'NOT_ATTEMPTED'};\n"+
 "   try{b46Settlement=settleOuV2FromExistingResults(this.db,{now,snapshot});}\n"+
 "   catch(e){b46Settlement={state:'OU_V2_SETTLEMENT_ERROR',error:String(e?.message??e).slice(0,130),providerCalls:0}}\n"+
 "   const b46BulkMs=Number(snapshot?.fetchedAt);",
 'HUB_SNAPSHOT_SETTLEMENT_FIRST');
replace(
 "   await this.ctx.storage.put('b46PreMatchOuEngineCursor',result.cursorOut);",
 "   const b46V2StatsSync=syncOuV2SettlementSnapshot(this.db,now);\n"+
 "   await this.ctx.storage.put('b46PreMatchOuEngineCursor',result.cursorOut);",
 'STAT_SNAPSHOT_ON_ISSUE');
replace(
 "   const answer={...result,at:now,",
 "   const answer={...result,at:now,v2Settlement:b46Settlement,v2StatsSync:b46V2StatsSync,",
 'ENGINE_STATUS');
replace(
 "  evaluate:evaluateAsianOu\n });",
 "  evaluate:evaluateAsianOu,\n  settlementState:readOuV2SettlementState(this.db,now)\n });",
 'PRICED_UI_SNAPSHOT');
const route="  if(path==='/prematch-ou-engine-state'&&req.method==='GET')";
const routes=[
 "  if(path==='/ou-v2-settlement-state'&&req.method==='GET')",
 "   return json(readOuV2SettlementState(this.db,now));",
 "  if(path==='/ou-v2-settlement-tick'&&req.method==='POST'){",
 "   let hub=null;",
 "   if(this.env.HUB)try{const r=await this.env.HUB.fetch('https://hub.internal/snapshot',{method:'GET',signal:AbortSignal.timeout(15000)});",
 "    if(r.ok)hub=await r.json();}catch{}",
 "   return json(settleOuV2FromExistingResults(this.db,{now,snapshot:hub}));",
 "  }",
 ""
].join('\n');
replace(route,routes+route,'PRIVATE_SETTLEMENT_ROUTES');
assert(code.includes('B46_HUB_BULK_REFRESH_GUARD_V1'),'EXISTING_BULK_POLICY_LOST');
assert(code.includes("enablePaidQuoteFallback:true"),'PRICE_FALLBACK_CHANGED');
assert(code.includes("event.cron!=='*/15 * * * *'"),'CRON_CHANGED');
assert(code.includes("const v2Settlement=readOuV2SettlementState")===false,'UNINTENDED_OLD_ANCHOR');
const local='/tmp/b46-ou-v2-settlement-backend-installed.mjs';
fs.writeFileSync(local,code);
execFileSync(process.execPath,['--check',local]);
const settings=await cf('/scripts/'+target+'/settings');
const bindings=settings.bindings.map(b=>b.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
assert.equal(await ver(target),oldVersion,'TEST_VERSION_DRIFT_ABORT');
console.log('B46_OU_V2_SETTLEMENT_DEPLOY_PREFLIGHT '+JSON.stringify({oldVersion,otherModulesKept:existing.modules.length-1,
 addedModule:moduleName,modifiesMainModuleOnly:true,oddsFormulaUnchanged:true,
 paidPriceFallbackUnchanged:true,providerCalls:0,productionWrites:0}));
const metadata={main_module:existing.main_module,
 compatibility_date:existing.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(existing.compatibility_flags?.length?{compatibility_flags:existing.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of existing.modules){
 const b=m.name===main?code:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([b],{type:'application/javascript+module'}),m.name);
}
form.append(moduleName,new Blob([moduleBody],{type:'application/javascript+module'}),moduleName);
await cf('/scripts/'+target+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null,installed=null;
for(let i=0;i<40;i++){
 const v=await ver(target);
 if(v!==oldVersion){
  const data=await cf('/workers/'+target+'/versions/'+v+'?include=modules');
  const newMain=data.modules.find(m=>m.name===main);
  const newModule=data.modules.find(m=>m.name===moduleName);
  if(newMain&&newModule&&Buffer.from(newMain.content_base64,'base64').toString('utf8')===code&&
    Buffer.from(newModule.content_base64,'base64').toString('utf8')===moduleBody){
   newVersion=v;installed=data;break;
  }
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(newVersion&&installed,'TEST_DEPLOY_PROPAGATION_NOT_CONFIRMED');
assert.equal(installed.modules.length,existing.modules.length+1,'MODULE_COUNT_CHANGED');
for(const m of existing.modules){
 if(m.name===main)continue;
 const candidate=installed.modules.find(x=>x.name===m.name);
 assert(candidate,'EXISTING_MODULE_MISSING_'+m.name);
 assert.equal(digest(Buffer.from(candidate.content_base64,'base64')),hashes[m.name],
  'PROTECTED_EXISTING_MODULE_CHANGED_'+m.name);
}
const after=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await ver(n)])));
assert.deepEqual(after,before,'PROTECTED_WORKER_CHANGED');
assert.deepEqual((await cf('/scripts/'+target+'/settings')).bindings.map(b=>b.name).sort(),bindings,
 'SERVICE_BINDINGS_CHANGED');
console.log('B46_OU_V2_SETTLEMENT_DEPLOY_PASS '+JSON.stringify({worker:target,oldVersion,newVersion,
 moduleCount:installed.modules.length,cron:'*/15 * * * *',settleFromExistingHubOrArchive:true,
 outcome:'WIN_LOSS_PUSH_ASIAN_HALVES',snapshot:'EVENT_DELTAS_NO_HISTORY_RECALC_ON_PAGE_READ',
 existingUI:true,thresholdsUnchanged:true,providerRequestsAdded:0,productionWrites:0}));
