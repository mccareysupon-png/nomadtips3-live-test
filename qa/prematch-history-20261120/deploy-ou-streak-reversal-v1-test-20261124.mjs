// Add isolated bi-directional O/U streak reversal + its own live-updating
// TEST-only ledger, snapshot, daily stats and page. Keep all original O/U
// bookmaker EV, 1X2, BTTS and production workers untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_CREDS');
const worker='ball46-prematch-only-test-20261120';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const authorization='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();
 assert(r.ok&&j.success,'CF_ERROR_'+path+'_'+r.status+'_'+JSON.stringify(j.errors??[]).slice(0,200));
 return j.result;
}
async function version(name){
 return (await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
}
async function owner(path,post=false){
 const r=await fetch(host+path,{method:post?'POST':'GET',
  headers:{authorization,...(post?{'content-type':'application/json'}:{})},
  ...(post?{body:'{}'}:{}),cache:'no-store',signal:AbortSignal.timeout(35000)});
 assert(r.ok,'OWNER_ROUTE_'+path+'_'+r.status);
 return r.json();
}
function once(text,old,replace){
 assert.equal(text.split(old).length,2,'EXACT_ONE_ANCHOR_FAILED_'+old.slice(0,85));
 return text.replace(old,replace);
}
const baseline=Object.fromEntries(await Promise.all(protectedWorkers.map(async n=>[n,await version(n)])));
const oldId=await version(worker);
const [old,settings,stage,engine,btss]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+oldId+'?include=modules'),
 cf('/scripts/'+worker+'/settings'),
 owner('/ou-v3-stage-one-audit-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state')]);
assert.equal(stage.policy.minimumPriceInclusive,1.4);
assert.equal(stage.policy.maximumPriceInclusive,10);
assert.equal(stage.policy.minimumEV,.05);
assert.equal(engine.policy.minEV,.05);
assert.equal(btss.config.mode,'CLOSED');
assert.deepEqual(settings.bindings.map(b=>b.name).sort(),
 ['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const previous=Object.fromEntries(old.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const modules={...previous},main=old.main_module;
const added=['ou-streak-reversal-v1-test.mjs','ou-streak-reversal-web-v1-test.mjs'];
for(const n of added){
 assert(!modules[n],'MODULE_ALREADY_INSTALLED_'+n);
 modules[n]=fs.readFileSync('qa/prematch-history-20261120/'+n,'utf8');
}
assert(modules[main].includes('/ou-two-over-then-under25-audit-test'),'PREVIOUS_AUDIT_MISSING');
assert(!modules[main].includes('ou-streak-reversal-tick-test'),'DUPLICATE_INSTALL');
const imp="import {DurableObject} from 'cloudflare:workers';";
const plus=[
 "import {screenStreakReversal,readStreakStats,runStreakReversal} from './ou-streak-reversal-v1-test.mjs';",
 "import {streakReversalTestHtml} from './ou-streak-reversal-web-v1-test.mjs';"].join('\n');
modules[main]=once(modules[main],imp,imp+'\n'+plus);
const existing=" if(path==='/ou-two-over-then-under25-audit-test'&&req.method==='GET'){";
const addRoutes=[
 " if(path==='/ou-streak-reversal-state-test'&&req.method==='GET'){",
 "  const fixtures=await this.ctx.storage.get('botFixtures')??[];",
 "  const screen=screenStreakReversal(this.db,fixtures,now);",
 "  return json({...readStreakStats(this.db,now),screeningCounts:screen.counts,",
 "   activeCandidates:screen.candidates,conflictingCandidates:screen.conflicts});",
 " }",
 " if(path==='/ou-streak-reversal-tick-test'&&req.method==='POST'){",
 "  const fixtures=await this.ctx.storage.get('botFixtures')??[];",
 "  return json(runStreakReversal(this.db,fixtures,now));",
 " }"
].join('\n');
modules[main]=once(modules[main],existing,addRoutes+'\n'+existing);
const publicAnchor="if(req.method==='GET'&&p==='/preview')";
const page="if(req.method==='GET'&&p==='/ou-streak-test')return new Response(streakReversalTestHtml,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});";
const data="if(req.method==='GET'&&p==='/ou-streak-test-data')return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch('https://prematch.internal/ou-streak-reversal-state-test');";
modules[main]=once(modules[main],publicAnchor,page+data+publicAnchor);
// Schedule the new isolated rule without relying on the old BTTS cron string,
// whose implementation may legitimately differ between TEST revisions.
const cron="async scheduled(event,env){";
const addCron="try{if(event.cron==='*/15 * * * *'){const stub=env.STORE.get(env.STORE.idFromName('prematch-only-v1'));const streak=await stub.fetch('https://prematch.internal/ou-streak-reversal-tick-test',{method:'POST'});console.log('B46_OU_STREAK_TEST_CYCLE '+streak.status)}}catch(error){console.log('B46_OU_STREAK_TEST_ERROR '+String(error.message).slice(0,100))};";
modules[main]=once(modules[main],cron,cron+addCron);
assert.equal(Object.keys(modules).length,Object.keys(previous).length+2);
for(const [name,body] of Object.entries(previous))
 if(name!==main)assert.equal(modules[name],body,'UNRELATED_MODULE_MODIFIED_'+name);
for(const name of [main,...added]){
 const tmp='/tmp/b46-streak-dual-'+name;
 fs.writeFileSync(tmp,modules[name]);
 execFileSync(process.execPath,['--check',tmp]);
}
console.log('B46_OU_STREAK_PRE_DEPLOY '+JSON.stringify({oldId,EV:engine.policy.minEV,
 selectedPriceBounds:[stage.policy.minimumPriceInclusive,stage.policy.maximumPriceInclusive],
 independentModule:true,publishedToProduction:false,providerCalls:0}));
assert.equal(await version(worker),oldId,'TEST_VERSION_CHANGED_CONCURRENTLY');
const metadata={main_module:main,compatibility_date:old.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(old.compatibility_flags?.length?{compatibility_flags:old.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,content] of Object.entries(modules))
 form.append(name,new Blob([content],{type:'application/javascript+module'}),name);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let next=null;
for(let i=0;i<45;i++){
 const id=await version(worker);
 if(id!==oldId){
  const installed=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const source=Object.fromEntries(installed.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(source).length===Object.keys(modules).length&&
   Object.entries(modules).every(([name,body])=>source[name]===body)){next=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(next,'NEW_BINARY_VERIFICATION_FAILED');
await cf('/scripts/'+worker+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:next,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let screen;
for(let i=0;i<25;i++){
 await new Promise(ok=>setTimeout(ok,i?1350:2500));
 try{
  screen=await owner('/ou-streak-reversal-state-test');
  if(screen.mode==='B46_OU_2MATCH_REVERSAL_V1_TEST')break;
 }catch{}
}
assert.equal(screen?.mode,'B46_OU_2MATCH_REVERSAL_V1_TEST','NEW_AUDIT_NOT_AVAILABLE');
const tick=await owner('/ou-streak-reversal-tick-test',true);
assert.equal(tick.providerCalls,0);
assert.equal(tick.issued.otherStatsTouched,false);
const [stats,stageAfter,engineAfter,closedAfter,protectedAfter]=await Promise.all([
 owner('/ou-streak-reversal-state-test'),
 owner('/ou-v3-stage-one-audit-test'),
 owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),
 Promise.all(protectedWorkers.map(async name=>[name,await version(name)])).then(Object.fromEntries)
]);
assert.equal(stageAfter.policy.minimumPriceInclusive,1.4);
assert.equal(stageAfter.policy.maximumPriceInclusive,10);
assert.equal(engineAfter.policy.minEV,.05);
assert.equal(engineAfter.shadowCount,engine.shadowCount,'ORIGINAL_OU_SHADOW_CHANGED');
assert.equal(closedAfter.config.mode,'CLOSED');
assert.deepEqual(protectedAfter,baseline,'PROD_OR_HUB_DEPLOY_CHANGED');
assert.equal(stats.stats.total,stats.stats.pending+stats.stats.win+stats.stats.loss);
assert.equal(stats.neverCombinedWith1X2BtssOu,true);
assert.equal(stats.hasPricedPL,false);
const web=await fetch(host+'/ou-streak-test',{signal:AbortSignal.timeout(30000)});
assert.equal(web.status,200,'PUBLIC_STREAK_TEST_UI_MISSING');
assert((await web.text()).includes('STREAK REVERSAL TEST'),'WRONG_UI_CONTENT');
const read=await fetch(host+'/ou-streak-test-data',{signal:AbortSignal.timeout(30000)});
assert.equal(read.status,200,'PUBLIC_READ_ONLY_STATS_MISSING');
const state=await read.json();
assert.equal(state.mode,'B46_OU_2MATCH_REVERSAL_V1_TEST');
console.log('B46_OU_STREAK_REVERSAL_V1_TEST_PASS '+JSON.stringify({
 worker,from:oldId,to:next,
 candidatesUnder:tick.screening.counts.underCandidates,
 candidatesOver:tick.screening.counts.overCandidates,
 conflicts:tick.screening.counts.conflicts,
 newPicks:tick.issued.added,duplicates:tick.issued.duplicate,
 settledNow:tick.settlement.settled,
 stats:stats.stats,today:stats.today,
 activeCandidates:stats.activeCandidates.map(x=>({fixtureId:x.fixtureId,pick:x.pick,home:x.home,away:x.away})),
 webUrl:host+'/ou-streak-test',
 automaticallyEvery15Min:true,statsMerged:false,providerCalls:0,productionWrites:0
}).slice(0,22000));
