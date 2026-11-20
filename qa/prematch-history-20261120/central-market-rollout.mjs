import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',hub='nomadtips3-5usd-hub-343',eng='nomadtips3-engine-343',market='nomadtips3-full-market-343-ball46';
const old='3a53ee1a-467c-4a20-9f50-ba749e8adab4',next='9d2b9d75-0749-4fdb-9066-d40c711d4e40',hv='9d055652-b66f-463b-988f-486b5747be8e',ev='99e8dea9-0f1f-4300-9efc-083a799f2a4b',probe='ball46-central-market-health-test-20261120';
async function cf(p,o={}){const r=await fetch(root+p,{...o,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...o.headers},signal:AbortSignal.timeout(25000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+p);return j.result}
async function current(n){const d=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return d.versions[0].version_id}
async function switchTo(n,id){await cf('/scripts/'+n+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})});for(let i=0;i<12;i++){if(await current(n)===id)return;await new Promise(r=>setTimeout(r,1000))}throw Error('DEPLOYMENT_NOT_CONFIRMED')}
const report={state:'PREFLIGHT',old,next,historyMode:'OFF',manualProviderRequests:0};
function finish(){fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/central-market-rollout.json',JSON.stringify(report,null,2));console.log('MARKET_ROLLOUT_RESULT',JSON.stringify(report))}
const sub=(await cf('/subdomain')).subdomain,secret=crypto.randomBytes(32).toString('hex'),url='https://'+probe+'.'+sub+'.workers.dev';
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({main_module:'index.mjs',compatibility_date:'2026-11-19',bindings:[{name:'MARKET',type:'service',service:market,environment:'production'},{name:'PROBE',type:'secret_text',text:secret}]})],{type:'application/json'}),'metadata.json');
form.append('index.mjs',new Blob(['export default{async fetch(req,env){if(req.method!=="GET"||new URL(req.url).pathname!=="/health"||req.headers.get("Authorization")!=="Bearer "+env.PROBE)return new Response("Not found",{status:404});return env.MARKET.fetch("https://market.internal/health",{method:"GET"})}}'],{type:'application/javascript+module'}),'index.mjs');
let probeCreated=false,switched=false;
async function get(url,headers={}){const r=await fetch(url,{headers:{'cache-control':'no-cache',...headers},signal:AbortSignal.timeout(12000)});assert(r.ok,'HEALTH_HTTP_'+r.status);return r.json()}
const readMarket=()=>get(url+'/health',{authorization:'Bearer '+secret});
const summarizeMarket=m=>({ok:m.ok,version:m.version,providerMeta:m.providerMeta??m.provider??null,prewarmMeta:m.prewarmMeta??m.prewarm??null,callsLast60s:m.callsLast60s??m.requestsLast60s??null,blockedUntil:m.blockedUntil??null,config:m.config??null});
async function observe(){const [h,e,m]=await Promise.all([get('https://'+hub+'.'+sub+'.workers.dev/health'),get('https://'+eng+'.'+sub+'.workers.dev/health'),readMarket()]);return {hubOk:h.ok,ageMs:h.ageMs,seconds:h.control?.liveRefreshSeconds,live:h.counts?.live,quota:h.bulkSpeedV3?.quotaObserved,hubError:h.lastError,rateLimit:h.lastRateLimitAt,engineOk:e.ok,engineError:e.lastError,engineStartedAt:e.startedAt,engineFinishedAt:e.finishedAt,engineLive:e.liveCount,refereeRequests:e.refereeRequests,refereeErrors:e.refereeErrors,market:summarizeMarket(m)}}
const safe=x=>x.hubOk===true&&Number.isFinite(x.ageMs)&&x.ageMs<30000&&x.quota===true&&!x.hubError&&!x.rateLimit&&x.engineOk===true&&!x.engineError&&Number.isFinite(x.engineFinishedAt)&&Date.now()-x.engineFinishedAt<180000&&x.market.ok===true;
try{
 assert.equal(await current(hub),hv);assert.equal(await current(eng),ev);assert.equal(await current(market),old);const ui=await current('ball46-production');
 const v=await cf('/workers/'+market+'/versions/'+next+'?include=modules');assert(v.bindings.some(x=>x.name==='PROVIDER_BRIDGE_SECRET')&&v.bindings.some(x=>x.name==='HUB'&&x.service===hub));
 assert(![hub,eng,market,'ball46-production'].includes(probe));
 await cf('/scripts/'+probe,{method:'PUT',body:form});probeCreated=true;await cf('/scripts/'+probe+'/subdomain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 let ready=false;for(let i=0;i<15;i++){try{if((await readMarket()).ok===true){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1500))}assert(ready,'MARKET_HEALTH_PROBE_UNAVAILABLE');
 assert.equal((await fetch(url+'/health',{signal:AbortSignal.timeout(12000)})).status,404);
 const baseline=await observe();report.baseline=baseline;console.log('MARKET_BASELINE',JSON.stringify(baseline));if(!safe(baseline)){report.state='HEALTH_GATE_BLOCKED';returnFinish()}else{
  assert.equal(await current(hub),hv);assert.equal(await current(eng),ev);assert.equal(await current(market),old);
  const at=Date.now();await switchTo(market,next);switched=true;report.switchedAt=at;console.log('MARKET_VERSION_ACTIVE',next);
  let fresh=false;for(let i=0;i<30;i++){const after=await observe();report.after=after;if(!safe(after)||after.seconds!==baseline.seconds)throw Error('LIVE_HEALTH_REGRESSION');
   const beforeP=baseline.market.providerMeta,afterP=after.market.providerMeta;
   if(afterP?.at>Math.max(at,beforeP?.at??0)&&Number(afterP.lastStatus??afterP.status)>=400)throw Error('NEW_MARKET_PROVIDER_ERROR');
   if(after.engineStartedAt>=at&&after.engineFinishedAt>=at){fresh=true;break}await new Promise(r=>setTimeout(r,3500))
  }
  assert(fresh,'NO_FRESH_ENGINE_SCAN');assert.equal(await current(hub),hv);assert.equal(await current(eng),ev);assert.equal(await current(market),next);assert.equal(await current('ball46-production'),ui);
  report.state='MARKET_MIGRATED_HISTORY_OFF';report.freshNaturalScan=true;
  const pm=report.after.market.providerMeta;report.marketProviderObserved=pm?.at>=at&&Number(pm.lastStatus??pm.status)===200?'FRESH_PROVIDER_SUCCESS':'NO_FRESH_PROVIDER_META_IN_SAMPLE';
 }
}catch(e){report.error=String(e.message);if(switched||await current(market)===next){try{if(await current(market)===next)await switchTo(market,old);assert.equal(await current(market),old);report.state='ROLLED_BACK';report.rollbackHealth=await observe()}catch(err){report.state='ROLLBACK_REVIEW_REQUIRED';report.rollbackError=String(err.message)}}else report.state='BLOCKED_BEFORE_SWITCH'}
finally{if(probeCreated)try{await cf('/scripts/'+probe+'/subdomain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:false,previews_enabled:false})});report.probeDisabled=true}catch(e){report.probeDisabled=false;report.probeCleanupError=String(e.message)}finish()}
function returnFinish(){}
