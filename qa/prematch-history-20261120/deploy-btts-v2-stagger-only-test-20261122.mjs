// Install ONLY changed BTTS V2 transport module with +2h stagger.
// Do not modify the 1X2/HCR or main Worker code and do not call 5USD.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CF_DEPLOY_ACCESS');
const worker='ball46-prematch-only-test-20261120';
const expected='0f276292-1fd6-4585-887e-4b15617e86b7';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const ownerAuth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const dir='qa/prematch-history-20261120/',changed='btts-bulk-truck-v2-test.mjs';
const oldSource=fs.readFileSync(dir+changed,'utf8');
assert(oldSource.includes('export function bttsBulkV2Slot')&&
  oldSource.includes("btTsScheduledLocal:['08:00','12:00','16:00','20:00','00:00']")&&
  oldSource.includes("if(state.slot===0)return {state:'NOT_IN_BTTS_WINDOW'"),
  'MISSING_V2_STAGGER_GUARDS');
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
  'ball46-premium-match-colors-test-20261120'];
function digest(x){return crypto.createHash('sha256').update(x).digest('hex')}
async function cf(p,o={}){
 const r=await fetch(root+p,{...o,headers:{authorization:'Bearer '+token,...o.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_API_'+r.status+'_'+JSON.stringify(j.errors??[]));return j.result;
}
async function version(n){
 const r=await cf('/scripts/'+n+'/deployments?per_page=1');
 const v=r.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'NO_ACTIVE_'+n);return v;
}
async function owner(path){
 const r=await fetch('https://'+worker+'.mccarey-supon.workers.dev'+path,
  {headers:{authorization:ownerAuth},cache:'no-store',signal:AbortSignal.timeout(24000)});
 assert(r.ok,'OWNER_'+path+'_'+r.status);return r.json();
}
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(await version(worker),expected,'TEST_VERSION_CHANGED_STOP');
const active=await cf('/workers/'+worker+'/versions/'+expected+'?include=modules');
assert.equal(active.main_module,'prematch-only-worker.mjs','MAIN_MODULE_DRIFT');
const oldMod=active.modules.find(m=>m.name===changed);
assert(oldMod?.content_base64,'CURRENT_BTTS_V2_MODULE_MISSING');
const orig=Buffer.from(oldMod.content_base64,'base64').toString('utf8');
assert(orig.includes("const slot=historySlot(now);"),'CURRENT_DRIVER_ALREADY_CHANGED');
assert(!orig.includes('bttsBulkV2Slot('),'V2_STAGGER_ALREADY_INSTALLED');
const hashes=Object.fromEntries(active.modules.map(m=>[m.name,digest(Buffer.from(m.content_base64,'base64'))]));
const beforeSettings=await cf('/scripts/'+worker+'/settings');
const bindings=beforeSettings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','HUB','OWNER_SECRET','STORE'],'BINDINGS_SHAPE_CHANGED');
const [beforeState,beforeHCR,beforeHist,beforeLedger,beforeStats]=await Promise.all([
 owner('/btts-bulk-v2-state'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-history-private-test'),owner('/test-ledger'),owner('/prematch-stats-registry-audit-test')
]);
assert.equal(beforeState.config.mode,'ACTIVE','NOT_IN_BTTS_V2_MODE');
assert.equal(beforeState.transport.cap.maxDailyProviderCalls,5);
assert(beforeHist.archive.privateFT>=695,'HISTORY_DRIFT');
assert.equal(beforeHCR.registry.code,'HCR-V1');
assert(beforeLedger.rows.length>=76);
assert.equal(beforeStats.verified,true);
console.log('B46_V2_STAGGER_DEPLOY_PRECHECK '+JSON.stringify({oldVersion:expected,
 previousSlots:[6,10,14,18,22],newSlots:[8,12,16,20,0],
 previousRoundCount:beforeState.transport.roundsUsed,
 previousProviderCalls:beforeState.transport.providerCalls,oneX2:beforeLedger.rows.length,
 privateFT:beforeHist.archive.privateFT,newPaidCalls:0,prodWrites:0}));
assert.equal(await version(worker),expected,'TEST_CHANGED_DURING_PREFLIGHT');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({
 main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})
})],{type:'application/json'}),'metadata.json');
for(const m of active.modules){
 const body=m.name===changed?oldSource:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([body],{type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let next=null,script;
for(let i=0;i<35;i++){
 next=await version(worker);
 if(next!==expected){
  try{
   script=await cf('/workers/'+worker+'/versions/'+next+'?include=modules');
   const mod=script.modules.find(m=>m.name===changed);
   if(mod?.content_base64&&Buffer.from(mod.content_base64,'base64').toString('utf8')===oldSource)break;
  }catch{}
 }
 await new Promise(r=>setTimeout(r,1300));
}
assert(next!==expected&&script,'NEW_BTTS_ONLY_VERSION_NOT_ACTIVE');
assert.equal(script.modules.length,active.modules.length,'MODULE_COUNT_CHANGED');
for(const m of active.modules){
 if(m.name===changed)continue;
 const a=script.modules.find(z=>z.name===m.name);
 assert(a?.content_base64,'UNEXPECTED_MODULE_MISSING_'+m.name);
 assert.equal(digest(Buffer.from(a.content_base64,'base64')),hashes[m.name],
  'OTHER_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
const [afterState,afterHCR,afterHist,afterLedger,afterStats]=await Promise.all([
 owner('/btts-bulk-v2-state'),owner('/history-cargo-registry?detail=0'),
 owner('/btts-history-private-test'),owner('/test-ledger'),owner('/prematch-stats-registry-audit-test')
]);
assert.equal(afterState.config.mode,'ACTIVE','V2_NOT_ACTIVE_POST_DEPLOY');
assert.equal(afterState.transport.cap.maxDailyProviderCalls,5);
assert.equal(afterHCR.inventory.finishedFixtures,beforeHCR.inventory.finishedFixtures,'HCR_CHANGED');
assert.equal(afterLedger.rows.length,beforeLedger.rows.length,'1X2_LEDGER_CHANGED');
assert.equal(afterStats.verified,true,'STATS_AUDIT_FAILED');
assert(afterHist.archive.privateFT>=beforeHist.archive.privateFT,'PRIVATE_FT_LOST');
const LondonHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
const expectedSlot=LondonHour>=8&&LondonHour<12?1:LondonHour>=12&&LondonHour<16?2:
 LondonHour>=16&&LondonHour<20?3:LondonHour>=20?4:LondonHour<6?5:0;
assert.equal(afterState.transport.slot,expectedSlot,'NEW_BTTS_SLOT_NOT_APPLIED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),
 protectedBefore,'LIVE_PRODUCTION_MODULE_CHANGED');
console.log('B46_BTTS_STAGGER_ONLY_DEPLOY_PASS '+JSON.stringify({
 worker,from:expected,to:next,onlyChangedModule:changed,
 BTTSActive:true,scheduledLondonHours:['08:00','12:00','16:00','20:00','00:00'],
 LondonHour,currentSlot:afterState.transport.slot,
 maxDailyRounds:5,maxApiCallsForBulkPerDay:5,
 privateFT:afterHist.archive.privateFT,
 oldMainHashUnchanged:true,oneX2LedgerRows:afterLedger.rows.length,
 hcrFT:afterHCR.inventory.finishedFixtures,statsAudit:true,
 productionWrites:0,providerCallsAddedByDeployment:0
}));
