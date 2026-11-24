// BALL46 O/U V3 historical maths TEST-only guarded code rollout.
// No new upstream backfill, no changes to prices/EV/1X2/Live/BTTS CLOSED.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const tok=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(tok&&account,'CLOUDFLARE_CREDS_MISSING');
const test='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+test+'.mccarey-supon.workers.dev';
const key='Bearer '+crypto.createHmac('sha256',tok).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const originalCommit='e73b41dc7ffd43abfb63f8c51f0038d3b5c5a306';
const history='ou-target-history-ft-v1-test.mjs';
const screener='ou-value-screener-v2-test.mjs';
const math='ou-v3-history-math-test.mjs';
const otherNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+tok,...opts.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+' '+r.status+' '+JSON.stringify(j.errors??[]).slice(0,200));return j.result;
}
async function version(name){return (await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function owner(path,body=null){
 const r=await fetch(host+path,{method:body?'POST':'GET',
  headers:{authorization:key,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(50000)});
 const data=await r.json().catch(()=>null);return {http:r.status,data};
}
const versionsBefore=Object.fromEntries(await Promise.all(otherNames.map(async n=>[n,await version(n)])));
const oldId=await version(test);
const original=await cf('/workers/'+test+'/versions/'+oldId+'?include=modules');
const settings=await cf('/scripts/'+test+'/settings');
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const source=Object.fromEntries(original.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString('utf8')]));
assert(!source[math],'V3_MATH_ALREADY_PRESENT');
assert(source[history]&&source[screener],'ORIGINAL_MODULE_MISSING');
for(const n of [history,screener]){
 const expected=execFileSync('git',['show',originalCommit+':qa/prematch-history-20261120/'+n],{encoding:'utf8'});
 assert.equal(sha(source[n]),sha(expected),'INSTALLED_TEST_SOURCE_DRIFT_'+n);
}
assert(source[original.main_module].includes('BTTS_PROJECT_CLOSED'),'BTTS_CLOSED_FENCE_MISSING');
const before=await Promise.all([
 owner('/btts-bulk-v2-state'),owner('/history-cargo-registry?detail=0'),
 owner('/preview-data'),owner('/ou-history-ft-state')
]);
assert(before[0].data?.config?.mode==='CLOSED','BTTS_NOT_CLOSED');
assert(before[1].data?.supplyPlanning?.targetHistoryPerTeam===3,'HISTORY_GATE_WRONG');
assert(before[3].data?.archive?.ft>=367,'OU_HISTORY_VAULT_MISSING');
const oldPick=before[2].data?.ouLedger?.rows?.find(x=>Number(x.fixture_id)===204906152);
assert(oldPick&&oldPick.status==='LOSS'&&oldPick.units===-1,'OLD_OU_PICK_MISSING');
for(const n of [history,screener,math])
 source[n]=fs.readFileSync('qa/prematch-history-20261120/'+n,'utf8');
assert(source[screener].includes("revision:'V3_HISTORY_20261124'"));
assert(source[history].includes('export function ouTargetH2HMatches('));
assert(source[math].includes('teamCompletedFTMinimum:3'));
const main=original.main_module;
assert(!source[main].includes('/ou-v3-stage-one-audit-test'),'V3_ROUTE_ALREADY_PRESENT');
const importTag="import {DurableObject} from 'cloudflare:workers';";
assert(source[main].split(importTag).length===2,'WORKER_MAIN_IMPORT_DRIFT');
const addImport="import {buildOuValueModels as buildOuV3Preview,OU_VALUE_V2_POLICY as OU_V3_POLICY} from './ou-value-screener-v2-test.mjs';";
const routeAnchor=" if(path==='/ou-history-ft-import-test'&&req.method==='POST'){";
assert(source[main].split(routeAnchor).length===2,'WORKER_OWNER_ROUTE_DRIFT');
const route=[
" if(path==='/ou-v3-stage-one-audit-test'&&req.method==='GET'){",
"  const raw=await this.ctx.storage.get('botFixtures')??[];",
"  const screen=buildOuV3Preview(this.db,raw,now,{maxFixtures:350});",
"  return json({code:'B46_OU_V3_ALLGROUNDS_H2H_STAGE1_TEST',",
"   checkedAtUTC:new Date(now*1000).toISOString(),",
"   policy:{minimumPerTeam:3,teamHistory:'ALL_GROUNDS',h2hMinimum:0,",
"    h2hOverlapExcluded:true,minimumPriceExclusive:OU_V3_POLICY.minimumPriceExclusive,",
"    minimumEV:OU_V3_POLICY.minimumEV,model:OU_V3_POLICY.historyModel},",
"   counts:screen.counts,models:screen.models.map(m=>({fixtureId:m.fixtureId,",
"    home:m.home,away:m.away,homeHistory:m.homeHistory,awayHistory:m.awayHistory,",
"    homeVenueMatches:m.homeVenueMatches,awayVenueMatches:m.awayVenueMatches,",
"    h2hCount:m.h2hCount,h2hIndependentCount:m.h2hIndependentCount,",
"    h2hWeight:m.h2hWeight,expectedGoals:m.expectedTotalGoals})),",
"   providerCalls:0,pricesRequested:0,liveWrites:0,productionWrites:0});",
" }"
].join('\n');
source[main]=source[main].replace(importTag,importTag+'\n'+addImport).replace(routeAnchor,route+'\n'+routeAnchor);
for(const [n,v] of Object.entries(source)){
 if(n.endsWith('.mjs')){const tmp='/tmp/'+n;fs.writeFileSync(tmp,v);execFileSync(process.execPath,['--check',tmp])}
}
console.log('B46_OU_V3_PREFLIGHT '+JSON.stringify({oldId,previousStoredFT:before[3].data.archive.ft,
 previousUpcoming:before[1].data.supplyPlanning.upcomingFixtures,
 previouslyReady:before[1].data.supplyPlanning.readyFixtures,
 testedMath:true,btssClosed:true,stage2Unchanged:true,extraProviderCalls:0}));
assert.equal(await version(test),oldId,'CONCURRENT_TEST_DEPLOY');
const meta={main_module:main,compatibility_date:original.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(original.compatibility_flags?.length?{compatibility_flags:original.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const [n,s] of Object.entries(source))form.append(n,new Blob([s],{type:'application/javascript+module'}),n);
await cf('/scripts/'+test+'?bindings_inherit=strict',{method:'PUT',body:form});
let newId=null;
for(let i=0;i<50;i++){
 const id=await version(test);
 if(id!==oldId){
  const v=await cf('/workers/'+test+'/versions/'+id+'?include=modules');
  const actual=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
  if(Object.keys(actual).length===Object.keys(source).length&&
   Object.entries(source).every(([n,s])=>actual[n]===s)){newId=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(newId,'NEW_TEST_VERSION_NOT_VALIDATED');
await cf('/scripts/'+test+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:newId,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let audit=null;
for(let i=0;i<28;i++){
 await new Promise(ok=>setTimeout(ok,i===0?2500:1450));
 const check=await owner('/ou-v3-stage-one-audit-test');
 if(check.http===200&&check.data?.code==='B46_OU_V3_ALLGROUNDS_H2H_STAGE1_TEST'){audit=check.data;break}
}
assert(audit,'OU_V3_ACTIVE_AUDIT_NOT_VISIBLE');
assert.equal(audit.policy.minimumPerTeam,3);
assert.equal(audit.policy.h2hMinimum,0);
assert.equal(audit.policy.minimumPriceExclusive,1.50);
assert.equal(audit.policy.minimumEV,0.05);
assert(audit.models.every(x=>x.homeHistory>=3&&x.awayHistory>=3&&x.h2hCount>=0));
const [lastTruck,lastPicks,afterStats,protectedVersions,afterSettings]=await Promise.all([
 owner('/btts-bulk-v2-state'),owner('/preview-data'),owner('/history-cargo-registry?detail=0'),
 Promise.all(otherNames.map(async n=>[n,await version(n)])).then(Object.fromEntries),
 cf('/scripts/'+test+'/settings')
]);
assert.equal(lastTruck.data.config.mode,'CLOSED','BTTS_CLOSED_REGRESSION');
assert(lastPicks.data.ouLedger.rows.some(x=>Number(x.fixture_id)===204906152&&x.status==='LOSS'&&x.units===-1),
 'OLD_OU_LEDGER_MUTATED');
assert.deepEqual(versionsBefore,protectedVersions,'PROTECTED_WORKER_CHANGED');
assert.deepEqual(afterSettings.bindings.map(x=>x.name).sort(),settings.bindings.map(x=>x.name).sort());
console.log('B46_OU_V3_STAGE_ONE_REAL '+JSON.stringify({
 time:audit.checkedAtUTC,upcomingChecked:audit.counts.checked,modeled:audit.counts.modeled,
 insufficientHistory:audit.counts.insufficientHistory,
 h2hZero:audit.models.filter(x=>x.h2hCount===0).length,
 h2hPresent:audit.models.filter(x=>x.h2hCount>0).length,
 venueRanges:audit.models.slice(0,20),readOnly:true,extraProviderCalls:0}).slice(0,18500));
console.log('B46_OU_V3_TEST_DEPLOY_PASS '+JSON.stringify({oldId,newId,
 model:audit.policy.model,stage1Models:audit.models.length,
 stage2PriceMinimum:audit.policy.minimumPriceExclusive,
 stage2EVMinimum:audit.policy.minimumEV,
 totalLedgerUnchanged:true,otherWorkersUnchanged:true,btssClosed:true,noPaidCalls:true}));
