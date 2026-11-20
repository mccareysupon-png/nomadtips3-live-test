import assert from 'node:assert/strict';import fs from 'node:fs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(25000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+p);return j.result}
const hub='nomadtips3-5usd-hub-343',eng='nomadtips3-engine-343',market='nomadtips3-full-market-343-ball46';
const known=['add-k-ah-detector','b46-statistics-probe-43437243604','b46-statistics-probe-43524197645','b46-statistics-probe-43528150264','b46-statistics-probe-43528606985','ball46-form-history-v1','ball46-result-native-proxy-20261018','ball46-shadow-hook-stage-20261117','ball46-statistics-engine-candidate-20261113','ball46-statistics-engine-mutation-20261113','nomadtips3-341-5usd-staged','nomadtips3-342-ledger','nomadtips3-343-auto-engine','nomadtips3-343-central-cache','nomadtips3-343-central-cache-canary','nomadtips3-343-full-market-central-canary','nomadtips3-343-full-market-v4-canary',hub,'nomadtips3-5usd-hub-343-stable-canary','nomadtips3-car3-paper-v6',eng,market,'nomadtips3-live-engine','nomadtips3-live-engine-5dollar','nomadtips3-live-engine-5usd-shadow','nomadtips3-market-engine','nomadtips3-odds-display-343','nomadtips3-prediction3-tracker','nomadtips3-rich-odds-343','nomadtips3-s8-sidecar','nomadtips3-shot-sidecar-342','nomadtips3-test-api','nomadtips3-car341-preview'];
const all=await cf('/scripts');const scripts=Array.isArray(all)?all:all.scripts??[];assert(scripts.length>0);
const results=[];
async function inspect(n){
 const deployed=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments?.[0]?.versions??[];
 let schedule=null;try{const s=await cf('/scripts/'+n+'/schedules');schedule=(s.schedules??s??[]).map(x=>x.cron??'unknown')}catch{}
 const out={name:n,schedules:schedule,versions:[]};
 for(const a of deployed.filter(x=>x.percentage>0)){
  const v=await cf('/workers/'+n+'/versions/'+a.version_id+'?include=modules');const b=v.bindings??[];
  const mods=v.modules??[],sources=mods.filter(m=>m.content_base64).map(m=>({name:m.name,text:Buffer.from(m.content_base64,'base64').toString()}));
  const flags=b.filter(x=>x.type==='plain_text'&&/^(?:NOMAD341_LIVE_PROVIDER_ENABLED|FIVEUSD_NATIVE_MODE|FIVEUSD_SHADOW_LEGACY_DISABLED|ENGINE_CYCLE_MODE|PROVIDER_ENABLED|FIVEUSD_ENABLED|LIVE_PROVIDER_ENABLED|API_ENABLED|SOURCE_MODE)$/.test(x.name)).map(x=>({name:x.name,value:/^[A-Za-z0-9_-]{1,30}$/.test(x.text)?x.text:'other'}));
  const keyBindings=b.filter(x=>/FIVE.?DOLLAR|FIVE.?USD|5USD|FOOTBALL_API/i.test(x.name)&&/secret_text|plain_text/.test(x.type)).map(x=>x.name);
  const providerMention=sources.some(m=>/5dollarfootballapi\.com/i.test(m.text));
  const directCandidate=providerMention&&sources.some(m=>/\bfetch\s*\(/.test(m.text));
  const services=b.filter(x=>x.type==='service').map(x=>({name:x.name,service:x.service}));
  const evidence=sources.flatMap(m=>m.text.split('\n').map((l,i)=>({l,i})).filter(x=>/5dollarfootballapi\.com|FIVEDOLLAR_API_KEY|FIVEUSD_API_KEY|FIVEUSD_NATIVE_MODE|NOMAD341_LIVE_PROVIDER_ENABLED|forwardProvider\(|continuousCycles\(|providerHardGate|providerDisabled|providerEnabled/.test(x.l)).map(x=>({module:m.name,line:x.i+1,kind:/forwardProvider\(/.test(x.l)?'BRIDGE':/5dollarfootballapi\.com/.test(x.l)?'PROVIDER_HOST':/continuousCycles\(|providerHardGate|providerDisabled|providerEnabled|FIVEUSD_NATIVE_MODE|NOMAD341_LIVE_PROVIDER_ENABLED/.test(x.l)?'GATE':'KEY_REFERENCE'}))).slice(0,42);
  out.versions.push({id:a.version_id,percentage:a.percentage,modulesReadable:sources.length>0,keyBindings,providerMention,directCandidate,services,flags,evidence});
 }
 return out;
}
const inventory=[...new Set([...known,...scripts.map(x=>x.id).filter(Boolean)])];
for(let i=0;i<inventory.length;i+=5){const group=await Promise.all(inventory.slice(i,i+5).map(async n=>{try{return await inspect(n)}catch(e){return{name:n,error:String(e.message).slice(0,150)}}}));results.push(...group)}
// Inspect all service-binding dependencies without invoking any worker routes.
const inbound=[];const failures=[];
for(let i=0;i<scripts.length;i+=10){await Promise.all(scripts.slice(i,i+10).map(async x=>{const n=x.id;try{if(!n)return;const s=await cf('/scripts/'+n+'/settings');for(const b of s.bindings??[])if(b.type==='service'&&known.includes(b.service))inbound.push({from:n,to:b.service,binding:b.name})}catch{failures.push(n)}}))}
const health=async n=>{const r=await fetch('https://'+n+'.mccarey-supon.workers.dev/health',{signal:AbortSignal.timeout(15000)});assert(r.ok);const j=await r.json();return {ok:j.ok,ageMs:j.ageMs,live:j.counts?.live??j.liveCount,seconds:j.control?.liveRefreshSeconds,lastError:j.lastError,quotaObserved:j.bulkSpeedV3?.quotaObserved,refereeRequests:j.refereeRequests,refereeErrors:j.refereeErrors,bulkSpeedFields:Object.keys(j.bulkSpeedV3??{}),engineFinishedAt:j.finishedAt}};
const h=await health(hub),e=await health(eng);
const concise=results.map(x=>({name:x.name,schedules:x.schedules,error:x.error,versions:x.versions?.map(v=>({id:v.id,modulesReadable:v.modulesReadable,keyBindings:v.keyBindings,providerMention:v.providerMention,flags:v.flags,services:v.services,bridgeReferences:v.evidence.filter(z=>z.kind==='BRIDGE').length}))}));
const unresolved=results.filter(x=>x.error||!x.versions?.length||x.versions.some(v=>!v.modulesReadable||(x.name!==hub&&(v.providerMention||v.keyBindings.length)))).map(x=>x.name);
const report={workers:scripts.length,inspected:results.length,failed:failures,unresolved,accountCoordination:'NOT_PROVEN',historyActivationAllowed:false,legacy:concise,inbound,health:{hub:h,engine:e},realProviderRequestsAdded:0};
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/legacy-account-gate.json',JSON.stringify({...report,details:results},null,2));
console.log('LEGACY_ACCOUNT_GATE '+JSON.stringify(report));
