import assert from 'node:assert/strict';import fs from 'node:fs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',hub='nomadtips3-5usd-hub-343',eng='nomadtips3-engine-343',market='nomadtips3-full-market-343-ball46';
const old='d8dd07a2-4f5d-4b14-94b5-52f5fc53311d',next='99e8dea9-0f1f-4300-9efc-083a799f2a4b',hv='9d055652-b66f-463b-988f-486b5747be8e',mv='3a53ee1a-467c-4a20-9f50-ba749e8adab4';
async function cf(p,o={}){const r=await fetch(root+p,{...o,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...o.headers},signal:AbortSignal.timeout(20000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+p);return j.result}
async function current(n){const d=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return d.versions[0].version_id}
async function switchTo(n,id){await cf('/scripts/'+n+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})});for(let i=0;i<10;i++){if(await current(n)===id)return;await new Promise(r=>setTimeout(r,1000))}throw Error('DEPLOYMENT_NOT_CONFIRMED')}
async function get(n){const r=await fetch('https://'+n+'.mccarey-supon.workers.dev/health',{signal:AbortSignal.timeout(12000),headers:{'cache-control':'no-cache'}});assert(r.ok);return r.json()}
async function health(){const [h,e]=await Promise.all([get(hub),get(eng)]);return {hubOk:h.ok,ageMs:h.ageMs,seconds:h.control?.liveRefreshSeconds,live:h.counts?.live,quota:h.bulkSpeedV3?.quotaObserved,hubError:h.lastError,rateLimit:h.lastRateLimitAt,engineOk:e.ok,engineError:e.lastError,engineStartedAt:e.startedAt,engineFinishedAt:e.finishedAt,engineLive:e.liveCount,engineMode:e.dataMode,refereeRequests:e.refereeRequests,refereeErrors:e.refereeErrors,externalOddsRequests:e.externalOddsRequests}}
const safe=x=>x.hubOk===true&&Number.isFinite(x.ageMs)&&x.ageMs<30000&&x.quota===true&&!x.hubError&&!x.rateLimit&&x.engineOk===true&&!x.engineError&&Number.isFinite(x.engineFinishedAt)&&Date.now()-x.engineFinishedAt<180000;
const report={state:'PREFLIGHT',old,next,historyMode:'OFF',manualProviderRequests:0};
function finish(){fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/central-engine-rollout.json',JSON.stringify(report,null,2));console.log('ENGINE_ROLLOUT_RESULT',JSON.stringify(report))}
const baseline=await health();report.baseline=baseline;assert.equal(await current(hub),hv,'HUB_BASE_CHANGED');assert.equal(await current(eng),old,'ENGINE_BASE_CHANGED');assert.equal(await current(market),mv,'MARKET_BASE_CHANGED');
const ui=await current('ball46-production');
if(!safe(baseline)){report.state='HEALTH_GATE_BLOCKED';finish();process.exit(0)}
// The exact approved candidate was previously checked for bindings and logic parity.
const v=await cf('/workers/'+eng+'/versions/'+next+'?include=modules');assert(v.bindings.some(x=>x.name==='PROVIDER_BRIDGE_SECRET')&&v.bindings.some(x=>x.name==='HUB'&&x.service===hub));assert(v.modules.some(m=>m.name==='provider-bridge.mjs'));
let switchedAt=0;
try{
 assert.equal(await current(hub),hv);assert.equal(await current(eng),old);assert(safe(await health()),'HEALTH_GATE_CLOSED');
 switchedAt=Date.now();await switchTo(eng,next);report.switchedAt=switchedAt;
 console.log('ENGINE_VERSION_ACTIVE',JSON.stringify({next,historyMode:'OFF'}));
 // Wait only for the existing natural cron scan; never trigger /scan or provider.
 let good=false,after;
 for(let i=0;i<30;i++){
  after=await health();report.after=after;
  if(!safe(after)||after.seconds!==baseline.seconds)throw Error('LIVE_HEALTH_REGRESSION');
  if(after.engineFinishedAt>=switchedAt&&after.engineStartedAt>=switchedAt){good=true;break}
  await new Promise(r=>setTimeout(r,3500));
 }
 assert(good,'NO_FRESH_NATURAL_SCAN');assert.equal(await current(eng),next);assert.equal(await current(hub),hv);assert.equal(await current(market),mv);assert.equal(await current('ball46-production'),ui);
 report.state='ENGINE_MIGRATED_HISTORY_OFF';report.freshNaturalScan=true;report.actualRefereeProviderRouteObserved=Number(report.after.refereeRequests)>0?'REQUESTS_REPORTED_NOT_INDEPENDENTLY_ATTRIBUTED':'NO_REFEREE_REQUEST_IN_SAMPLE';
}catch(e){
 report.error=String(e.message);
 try{const cur=await current(eng);if(cur===next)await switchTo(eng,old);else if(cur!==old)throw Error('CONCURRENT_ENGINE_CHANGE');assert.equal(await current(eng),old);report.state='ROLLED_BACK';report.rollbackHealth=await health()}catch(err){report.state='ROLLBACK_REVIEW_REQUIRED';report.rollbackError=String(err.message)}
}
finish();
