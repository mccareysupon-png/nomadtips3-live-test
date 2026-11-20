import assert from 'node:assert/strict';import fs from 'node:fs';import {classifyProviderPath,forwardProvider} from './provider-bridge.mjs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',hub='nomadtips3-5usd-hub-343',eng='nomadtips3-engine-343',market='nomadtips3-full-market-343-ball46';
const staged=JSON.parse(fs.readFileSync('evidence/central-staged-versions.json','utf8'));assert(staged.activeUnchanged===true&&staged.realProviderCalls===0);const versions=Object.fromEntries(staged.evidence.map(x=>[x.worker,{old:x.rollbackVersion,next:x.stagedVersion}]));assert.deepEqual(Object.keys(versions).sort(),[hub,eng,market].sort());

async function cf(p,o={}){const r=await fetch(root+p,{...o,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...o.headers},signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||!j.success)throw Error('CF '+r.status+' '+p+' '+JSON.stringify(j.errors?.map(e=>e.code)));return j.result}
async function current(n){const d=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return d.versions[0].version_id}
const documents={};let checks=0;
for(const [n,x] of Object.entries(versions)){assert.equal(await current(n),x.old,'ACTIVE_BASE_CHANGED');const old=await cf('/workers/'+n+'/versions/'+x.old+'?include=modules'),next=await cf('/workers/'+n+'/versions/'+x.next+'?include=modules');assert.equal(old.main_module,next.main_module);assert.equal(old.compatibility_date,next.compatibility_date);const m=new Map(next.bindings.map(b=>[b.name,b]));for(const b of old.bindings){const q=m.get(b.name);assert.equal(q?.type,b.type);for(const field of ['class_name','namespace_id','service','text','environment','entrypoint'])if(b[field]!==undefined)assert.equal(q[field],b[field],'BINDING_CHANGED');}documents[n]={old,next};checks++}
const moduleWith=(v,marker)=>{const m=v.modules.find(z=>z.content_base64&&Buffer.from(z.content_base64,'base64').toString().includes(marker));assert(m,'SOURCE_MARKER_MISSING');return Buffer.from(m.content_base64,'base64').toString()};
const extract=(s,marker)=>{const a=s.indexOf(marker),b=s.indexOf('\n}',a);assert(a>=0&&b>a);return s.slice(a,b+2)};
const e=documents[eng],m=documents[market];
const oldE=moduleWith(e.old,'async function fetchVerifiedCornerOnly('),newE=moduleWith(e.next,'async function fetchVerifiedCornerOnly('),oldM=moduleWith(m.old,'async function providerRequest(fixtureId, key) {'),newM=moduleWith(m.next,'async function providerRequest(fixtureId, key, env) {');
const decl=oldM.match(/\bBOOKMAKERS\s*=\s*(?:Object\.freeze\(\s*)?\[([\s\S]{0,4000}?)\]/);
const books=decl?[...decl[1].matchAll(/["']([A-Za-z0-9_-]+)["']/g)].map(x=>x[1]):[];
if(!books.length){const i=oldM.search(/\bBOOKMAKERS\s*=/);const preview=oldM.slice(i,i+240).replace(/[^a-zA-Z0-9_.()[\],;:=\s"'-]/g,'?');console.log('BOOKMAKER_DECLARATION',preview)}
assert(books.length>0,'BOOKMAKERS_EMPTY');
const testPath='/v1/fixtures/123/odds?bookmakers='+books.join(',');
console.log('EXACT_BOOKMAKERS',JSON.stringify(books));assert(classifyProviderPath('fullmarket',testPath,Math.floor(Date.now()/1000)));
const oldEF=extract(oldE,'async function fetchVerifiedCornerOnly('),newEF=extract(newE,'async function fetchVerifiedCornerOnly('),oldMF=extract(oldM,'async function providerRequest(fixtureId, key) {'),newMF=extract(newM,'async function providerRequest(fixtureId, key, env) {');
const beforeE=oldEF.split('\n').filter(x=>!x.includes('const response=await fetch(url,')).join('\n'),afterE=newEF.split('\n').filter(x=>!x.includes('const response=await forwardProvider(')).join('\n');assert.equal(beforeE,afterE);
const beforeM=oldMF.split('\n').filter(x=>!x.includes('const r = await fetch(url,')).join('\n');
const afterM=newMF.replace('fixtureId, key, env','fixtureId, key').split('\n').filter(x=>!x.includes('const r = await forwardProvider(')).join('\n');assert.equal(beforeM,afterM);
const srcHub=documents[hub];const originalPolicy=srcHub.old.modules.find(x=>x.name==='speed-policy.mjs'),newPolicy=srcHub.next.modules.find(x=>x.name==='speed-policy.mjs');assert.equal(originalPolicy.content_base64,newPolicy.content_base64);
let status=200,payload={success:1,data:[{odds:2.0}]},count=0,paths=[];
const reply=()=>Response.json(payload,{status,headers:{'x-ratelimit-limit':'40','x-ratelimit-remaining':'31','x-ratelimit-reset':'1795162500','retry-after':status===429?'120':'0'}});
const fakeFetch=async url=>{count++;paths.push(new URL(url).pathname+new URL(url).search);return reply()};
const env={FIVEDOLLAR_API_KEY:'fake',PROVIDER_BRIDGE_SECRET:'test-secret-not-real',HUB:{fetch:async(url,init)=>{const p=JSON.parse(init.body);assert.equal(init.headers.authorization,'Bearer test-secret-not-real');count++;paths.push(p.path);return reply()}}};
const cornerHistorySpec=()=>({market:'corner'}),verifyRecentCornerHistory=(p,id,key,f,now)=>({p,id,key,f});
const erf=(source)=>new Function('fetch','forwardProvider','cornerHistorySpec','verifyRecentCornerHistory','return ('+source+')')(fakeFetch,forwardProvider,cornerHistorySpec,verifyRecentCornerHistory);
const mrk=(source)=>new Function('fetch','forwardProvider','API_BASE','BOOKMAKERS','TIMEOUT_MS','finite','return ('+source+')')(fakeFetch,forwardProvider,'https://api.5dollarfootballapi.com/v1',books,10000,x=>x===null?null:Number(x));
const a=erf(oldEF),b=erf(newEF),c=mrk(oldMF),d=mrk(newMF);
for(const code of [200,429,503]){
 status=code;
 assert.deepEqual(await a(env,123,'test',{}),await b(env,123,'test',{}));checks++;
 async function settled(fn){try{return {ok:true,value:await fn()}}catch(e){return {ok:false,message:e.message,status:e.status,retryAfter:e.retryAfter,providerLimit:e.providerLimit,providerRemaining:e.providerRemaining,providerReset:e.providerReset}}}
 assert.deepEqual(await settled(()=>c(123,'fake')),await settled(()=>d(123,'fake',env)));checks++;
}
for(let i=0;i<paths.length;i+=2)assert.equal(paths[i],paths[i+1]);
console.log('TRANSPORT_PARITY',JSON.stringify({checks,exactSource:true,syntheticRequests:count,providerRequests:0,protectedDetectionLogicUnchanged:true,historyStillOff:true}));
const report={transportChecks:checks,syntheticRequests:count,realProviderCalls:0,historyMode:'OFF',activated:[],rollback:[],state:'PREFLIGHT'};
function finish(){fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/central-rollout.json',JSON.stringify(report,null,2));console.log('CENTRAL_ROLLOUT',JSON.stringify(report))}
const host='https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev',engineHost='https://nomadtips3-engine-343.mccarey-supon.workers.dev';
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'cache-control':'no-cache'}});assert(r.ok,'HEALTH_HTTP_'+r.status);return r.json()}
const observe=async()=>{const [h,e]=await Promise.all([get(host+'/health'),get(engineHost+'/health')]);return {hubOk:h.ok,hubAgeMs:h.ageMs,live:h.counts?.live,liveSeconds:h.control?.liveRefreshSeconds,lastError:h.lastError,lastRateLimitAt:h.lastRateLimitAt,quota:h.bulkSpeedV3?.quotaObserved,engineOk:e.ok,engineError:e.lastError,engineStartedAt:e.startedAt,engineFinishedAt:e.finishedAt,engineLive:e.liveCount,engineMode:e.dataMode}};
const baseline=await observe();report.baseline=baseline;
// Conservative change window: no live fixture and no live engine match.
// No staged version is activated when the safety window is absent.
const safe=x=>x.hubOk===true&&Number.isFinite(x.hubAgeMs)&&x.hubAgeMs<30000&&x.live===0&&x.engineLive===0&&x.quota===true&&!x.lastError&&!x.lastRateLimitAt&&x.engineOk===true&&!x.engineError;
if(!safe(baseline)){report.state='BLOCKED_LIVE_FIRST_GATE';finish();process.exit(0)}
const protectBefore=await current('ball46-production');
async function deploy(n,id){const r=await cf('/scripts/'+n+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})});assert(r.versions?.some(v=>v.version_id===id&&v.percentage===100));}
async function undo(n){if(await current(n)===versions[n].next){await deploy(n,versions[n].old);assert.equal(await current(n),versions[n].old);report.rollback.push(n)}}
// Only the additive HUB route is activated in this first production step;
// live client versions remain inactive until real auth and runtime verification.
try{
 assert.equal(await current(hub),versions[hub].old);assert.equal(await current(eng),versions[eng].old);assert.equal(await current(market),versions[market].old);assert(safe(await observe()),'LIVE_WINDOW_CLOSED');
 await deploy(hub,versions[hub].next);report.activated.push(hub);
 let ok=false;for(let i=0;i<6;i++){try{const health=await observe();report.afterHub=health;const denied=await fetch(host+'/__private/provider/v1',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});if(health.hubOk===true&&health.hubAgeMs<30000&&!health.lastError&&!health.lastRateLimitAt&&health.engineOk===true&&health.liveSeconds===baseline.liveSeconds&&denied.status===404&&await current(hub)===versions[hub].next){ok=true;break}}catch{}await new Promise(r=>setTimeout(r,2500))}
 assert(ok,'ACTIVE_HUB_HEALTH_FAILED');
 assert.equal(await current('ball46-production'),protectBefore);assert.equal(await current(eng),versions[eng].old);assert.equal(await current(market),versions[market].old);report.state='ADDITIVE_HUB_ACTIVE_HISTORY_OFF_CLIENTS_STAGED';
}catch(e){report.error=String(e.message);try{await undo(hub);report.state='ROLLED_BACK'}catch(err){report.rollbackError=String(err.message);report.state='ROLLBACK_REVIEW_REQUIRED'}}
finish();
