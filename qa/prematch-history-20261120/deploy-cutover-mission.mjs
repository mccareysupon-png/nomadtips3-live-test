// Deployment limited to the existing isolated Pre-Match test Worker.
// Normal HUB is used via service-binding GET /snapshot; never calls 5USD directly.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'MISSING_CLOUDFLARE_TEST_CREDENTIALS');
const script='ball46-prematch-only-test-20261120';
const host='https://'+script+'.mccarey-supon.workers.dev';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const secret=crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const modules=['prematch-only-worker.mjs','history.mjs','prematch-bot.mjs','stored-prematch-feed.mjs','stored-signal-adapter.mjs','evaluate-btts-signal.mjs','evaluate-1x2-signal.mjs','market-1x2.mjs','test-pick-ledger.mjs','normal-hub-monitor.mjs','london-cutoff.mjs','history-five-rounds.mjs','hub-upcoming-feed.mjs'];
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(30000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_REQUEST_FAILED '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));
 return j.result;
}
async function api(path){
 const r=await fetch(host+path,{headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(25000),cache:'no-store'});
 assert(r.ok,'TEST_ROUTE '+path+' '+r.status);
 return r.json();
}
const ver=async()=>Promise.all(protectedNames.map(async name=>({name,versions:(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions})));
const before=await ver();
const ledgerBefore=await api('/test-ledger');
assert(ledgerBefore.mode==='TEST_ONLY'&&ledgerBefore.stats.total>=8,'OLD_PICKS_NOT_FOUND');
const frozenPrices=new Map(ledgerBefore.rows.map(r=>[r.fixture_id,{price:r.price,pick:r.pick,observed:r.observed,selected:r.picked_at,status:r.status}]));
const code=fs.readFileSync('qa/prematch-history-20261120/prematch-only-worker.mjs','utf8');
assert(code.includes('runDailyMission(now)')&&code.includes('if(history.completed<5)for(let roundNo=1;roundNo<=5;roundNo++)'),'FIVE_ROUND_ONCE_PER_DAY_MISSION_MISSING');
assert(code.includes('scheduledFromNormalHub(snapshot,now)')&&code.includes("mergeStoredPrematch(await this.ctx.storage.get('botFixtures')"),'AUTO_BOT_INPUT_MISSING');
assert(!code.includes('api.5dollarfootballapi.com'),'UNAUTHORIZED_PROVIDER_FETCH');
assert(code.includes("event.cron!=='*/15 * * * *'"),'NORMAL_BOT_SCHEDULE_CHANGED');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({main_module:modules[0],compatibility_date:'2026-11-20',bindings:[
 {name:'STORE',type:'durable_object_namespace',class_name:'PrematchStore'},
 {name:'OWNER_SECRET',type:'secret_text',text:secret},
 {name:'HUB',type:'service',service:'nomadtips3-5usd-hub-343',environment:'production'}
]})],{type:'application/json'}),'metadata.json');
for(const m of modules)form.append(m,new Blob([fs.readFileSync('qa/prematch-history-20261120/'+m)],{type:'application/javascript+module'}),m);
const uploaded=await cf('/scripts/'+script,{method:'PUT',body:form});
console.log('AUTO_MISSION_UPLOADED '+JSON.stringify({script,version:uploaded.deployment_id}));
const intended=(await cf('/scripts/'+script+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const intendedModules=await cf('/workers/'+script+'/versions/'+intended+'?include=modules');
const intendedCode=Buffer.from(intendedModules.modules.find(m=>m.name===intendedModules.main_module).content_base64,'base64').toString();
assert(intendedCode.includes('if(history.completed<5)for(let roundNo=1;roundNo<=5;roundNo++)'),'DEPLOYED_VERSION_UNEXPECTED');
await cf('/scripts/'+script+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:intended,percentage:100}],code_update_strategy:{mode:'immediate'}})});
console.log('AUTO_MISSION_TEST_DURABLE_OBJECT_IMMEDIATE '+intended);
let serving=null,health=null,state=null;
for(let i=0;i<70;i++){
 try{
  health=await api('/health');
  state=await api('/daily-mission-state');
  if(Object.prototype.hasOwnProperty.call(health,'dailyMission')&&Object.prototype.hasOwnProperty.call(state,'mission')&&state.extraProviderCalls===0&&state.history?.maxRounds===5&&state.history?.maxPerRound===100&&state.history?.maxPerDay===500){serving=true;break}
  if(i%10===0)console.log('AUTO_MISSION_ROUTE_PROPAGATING '+JSON.stringify({attempt:i,healthKeys:Object.keys(health).slice(-9)}));
 }catch(e){if(i%10===0)console.log('AUTO_MISSION_ROUTE_PROPAGATING '+i+' '+String(e.message).slice(0,140))}
 await new Promise(r=>setTimeout(r,1800));
}
assert(serving,'AUTO_MISSION_NOT_SERVING_PUBLIC_TEST_ROUTE');
const dep=(await cf('/scripts/'+script+'/deployments?per_page=1')).deployments[0];
const v=await cf('/workers/'+script+'/versions/'+dep.versions[0].version_id+'?include=modules');
assert(v.modules.some(m=>m.name==='hub-upcoming-feed.mjs'),'NEW_AUTO_FEED_MODULE_NOT_ACTIVE');
const ledgerAfter=await api('/test-ledger');
assert(ledgerAfter.stats.total>=ledgerBefore.stats.total,'PICK_LEDGER_REGRESSED');
for(const row of ledgerAfter.rows){
 const f=frozenPrices.get(row.fixture_id);if(!f)continue;
 assert(row.price===f.price&&row.pick===f.pick&&row.observed===f.observed&&row.picked_at===f.selected,'HISTORICAL_PICK_MUTATED');
}
const after=await ver();
assert.deepEqual(after,before,'PRODUCTION_OR_HUB_CHANGED');
assert.equal(health.providerCalls,0);
console.log('AUTO_MISSION_DEPLOY_VERIFIED '+JSON.stringify({url:host,version:dep.versions[0].version_id,firstCutoff:'06:00 Europe/London',existingCron:'*/15 * * * *',fiveRoundsConsecutive:true,perRoundCap:100,perDayCap:500,historyGateway:'DISABLED_WHILE_UNVERIFIED',botAutoFeed:'NORMAL_HUB_CACHED_ODDS',testPicksBefore:ledgerBefore.stats.total,testPicksAfter:ledgerAfter.stats.total,protectedUnchanged:true,extraProviderCalls:0}));
