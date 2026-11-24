// Fix the actual deployed inline O/U V2 projection to honor persisted FT settlement.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {projectPricedOuV2Ui} from './patch-priced-ou-into-existing-prematch-ui-test-20261123.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CLOUDFLARE_TEST_TOKEN');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const test='ball46-prematch-only-test-20261120',main='prematch-only-worker.mjs';
const front='ball46-premium-match-colors-test-20261120';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46',front];
async function cf(p,opts={}){
 const r=await fetch(root+p,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+p+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,150));
 return j.result;
}
const version=async name=>{
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=d.deployments[0]?.versions?.[0]?.version_id;
 assert(v,'WORKER_VERSION_NOT_FOUND_'+name);return v;
};
const protectedBefore=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
const before=await version(test);
assert.equal(before,'6589efe8-9300-4309-8022-eb4a296442c6','TEST_VERSION_CHANGED');
const v=await cf('/workers/'+test+'/versions/'+before+'?include=modules');
const old=Buffer.from(v.modules.find(x=>x.name===main).content_base64,'base64').toString();
assert(old.includes("settlementState:readOuV2SettlementState(this.db,now)"),'SETTLEMENT_STATE_NOT_PASSED');
assert(old.includes("settleOuV2FromExistingResults(this.db,{now,snapshot})"),'SETTLEMENT_WORKER_NOT_ACTIVE');
const startMark='const __b46ProjectPricedOuForUi=';
const endMark=';\nexport class PrematchStore extends DurableObject{';
const start=old.indexOf(startMark);
const end=old.indexOf(endMark,start);
assert(start>=0&&end>start&&old.lastIndexOf(startMark)===start&&old.indexOf(endMark,end+1)<0,
 'INLINE_PROJECTION_BOUNDARY_CHANGED');
const previous=old.slice(start,end);
assert(previous.includes("status:'PENDING'")&&previous.includes('pricedOnly:true')&&
 !previous.includes("settlementState=null"),'OLD_INLINE_PROJECTION_IS_NOT_EXPECTED_PENDING_ONLY');
const next=old.slice(0,start)+startMark+projectPricedOuV2Ui.toString()+old.slice(end);
assert(next.includes("status:validSettled?settled.status:'PENDING'"));
assert(next.includes("stats:settlementState?.stats??"));
assert(next.includes("ouDailyBook:settlementState?.dailyBook??ouDailyBook"));
assert(next.includes("enablePaidQuoteFallback:true")&&next.includes('B46_HUB_BULK_REFRESH_GUARD_V1'));
assert(next.includes('B46_LEGACY_OU_CRON_ISSUER_DISABLED_PRESERVE_PICKS_AND_FT_SETTLEMENT'));
const file='/tmp/b46-ou-v2-ft-view-patched.mjs';
fs.writeFileSync(file,next);
execFileSync(process.execPath,['--check',file]);
const owner={authorization:'Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex')};
const url='https://'+test+'.mccarey-supon.workers.dev';
const read=async path=>{
 const r=await fetch(url+path,{headers:owner,cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'TEST_READ_'+path);return r.json();
};
const [beforeUI,beforeSettlement]=await Promise.all([read('/preview-data'),read('/ou-v2-settlement-state')]);
const pick=beforeUI.ouLedger.rows.find(x=>Number(x.fixture_id)===204906152);
assert(pick&&pick.status==='PENDING'&&Number(pick.price)===2.8,'EXPECTED_STUCK_UI_PREDICTION_NOT_FOUND');
const saved=beforeSettlement.settlements['204906152'];
assert(saved&&saved.status==='LOSS'&&saved.hg===2&&saved.ag===2&&saved.units===-1,'VERIFIED_REAL_SETTLED_LOSS_NOT_FOUND');
assert.equal(beforeSettlement.stats.loss,1,'FT_SNAPSHOT_NOT_SETTLED');
console.log('B46_OU_FT_VIEW_BUG_PROVEN '+JSON.stringify({
 fixtureId:204906152,currentUiStatus:pick.status,realSettledStatus:saved.status,
 realScore:'2-2',realPnlUnits:-1,source:saved.result_source,providerCalls:0}));
const settings=await cf('/scripts/'+test+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const keep=Object.fromEntries(v.modules.map(m=>[m.name,digest(Buffer.from(m.content_base64,'base64'))]));
assert.equal(await version(test),before,'CONCURRENT_TEST_CHANGE');
const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of v.modules){
 form.append(m.name,new Blob([m.name===main?next:Buffer.from(m.content_base64,'base64')],
  {type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+test+'?bindings_inherit=strict',{method:'PUT',body:form});
let after=null,deployed=null;
for(let i=0;i<35;i++){
 const id=await version(test);
 if(id!==before){
  const check=await cf('/workers/'+test+'/versions/'+id+'?include=modules');
  const m=check.modules.find(x=>x.name===main);
  if(m&&Buffer.from(m.content_base64,'base64').toString()===next){
   after=id;deployed=check;break;
  }
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(after&&deployed,'NEW_ACTIVE_TEST_VIEW_NOT_CONFIRMED');
assert.equal(deployed.modules.length,v.modules.length);
for(const m of deployed.modules){
 if(m.name!==main)assert.equal(digest(Buffer.from(m.content_base64,'base64')),keep[m.name],
  'UNRELATED_MODULE_CHANGED_'+m.name);
}
const fresh=await read('/preview-data');
const corrected=fresh.ouLedger.rows.find(x=>Number(x.fixture_id)===204906152);
assert(corrected&&corrected.status==='LOSS'&&corrected.hg===2&&corrected.ag===2&&
 corrected.units===-1&&corrected.price===2.8&&corrected.bookmaker==='ladbrokes',
 'FT_PRICE_AND_SCORE_NOT_ON_UI');
assert.equal(fresh.ouLedger.stats.loss,1);
assert.equal(fresh.ouLedger.stats.pending,0);
assert.equal(fresh.ouLedger.stats.units,-1);
assert(fresh.testLedger?.rows?.length>=110,'ORIGINAL_1X2_LEDGER_REGRESSION');
const frontend=await fetch('https://'+front+'.mccarey-supon.workers.dev/__b46_prematch_data',
 {cache:'no-store',signal:AbortSignal.timeout(30000)});
assert.equal(frontend.status,200);
const screen=await frontend.json();
const visible=screen.ouLedger?.rows?.find(x=>Number(x.fixture_id)===204906152);
assert(visible&&visible.status==='LOSS'&&visible.units===-1&&visible.hg===2&&visible.ag===2,
 'EXISTING_FRONTEND_NOT_SETTLED');
const protectedAfter=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_MUTATION');
console.log('B46_OU_REAL_FT_VISIBLE_END_TO_END_PASS '+JSON.stringify({
 testWorker:test,from:before,to:after,fixtureId:204906152,
 match:'Neftchi Fargona v Al Hilal Riyadh',
 result:'2-2',side:'UNDER_2.5',lockedPrice:2.8,
 status:visible.status,pnlUnits:visible.units,
 uiStats:fresh.ouLedger.stats,oneX2Rows:fresh.testLedger.rows.length,
 realFt:true,source:saved.result_source,providerCallsDuringDeploy:0,productionWrites:0
}));
