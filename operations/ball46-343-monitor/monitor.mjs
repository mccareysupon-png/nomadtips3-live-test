// BALL46 3.43 — monitoring-only observer based on John Ellis (5DollarFootballAPI).
// No Cloudflare writes, no 5USD API calls, no logged API keys, no private member contents.
// Output is an independent observation, NOT a change to signal/settlement logic.
import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';

const CF_ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const CF_TOKEN=process.env.CLOUDFLARE_API_TOKEN||'';
const now=new Date(), since=new Date(now.getTime()-20*60*1000);
const names=['ball46-production','nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46','ball46-member-production','nomadtips3-live-engine-5usd-shadow'];
const checks=[];
function add(check,status,detail){checks.push({check,status,detail});}
function safeNumber(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;}
async function getJSON(url,{auth=false,timeout=17000}={}){
 try{
  const res=await fetch(url,{method:'GET',headers:auth?{Authorization:'Bearer '+CF_TOKEN,Accept:'application/json'}:{Accept:'application/json'},signal:AbortSignal.timeout(timeout),redirect:'manual'});
  const payload=await res.json().catch(()=>null);
  return {http:res.status,ok:res.ok,payload};
 }catch(e){return {http:0,ok:false,error:'network_or_timeout'};}
}
function selectHealth(key,data){
 if(!data||typeof data!=='object')return null;
 if(key==='hub'){
  const ctl=data.control||{};
  return {ok:data.ok??null,version:data.version??null,refreshSeconds:safeNumber(ctl.liveRefreshSeconds??(data.refreshMs==null?null:data.refreshMs/1000)),
   estimatedBulkRPM:safeNumber(data.estimatedBulkRequestsPerMinute),providerRequestCount:safeNumber(data.providerRequestCount),
   lastError:data.lastError?String(data.lastError).slice(0,120):null,lastProviderError:data.lastProviderError?String(data.lastProviderError).slice(0,120):null,
   stale:data.stale??data.snapshot?.stale??null,updatedAt:data.updatedAt??data.lastSuccessAt??data.snapshot?.updatedAt??null};
 }
 if(key==='shadow')return {ok:data.ok??null,mode:data.mode??null,cycleMs:safeNumber(data.cadence?.cycleMs),
   providerLiveRPM:safeNumber(data.rate?.live?.usedLast60s),lastLiveFetchedAt:data.live?.fetchedAt??data.snapshot?.live?.fetchedAt??null};
 return {ok:data.ok??null,version:data.version??data.runtimeContract??null,stale:data.stale??data.board?.stale??null,
   lastError:data.lastError?String(data.lastError).slice(0,120):null,
   lastSuccess:data.lastSuccess??data.lastSuccessAt??data.updatedAt??data.board?.updatedAt??null,
   ledgerTotal:safeNumber(data.ledgerTotal),signalCount:safeNumber(data.signalCount)};
}
async function probeHealth(key,url,required){
 const t=performance.now();
 const r=await getJSON(url);
 const result={key,http:r.http,responseMs:Math.round(performance.now()-t),health:selectHealth(key,r.payload)};
 if(required&&!r.ok)add(key,'CRITICAL','health endpoint unavailable HTTP '+r.http);
 else if(!r.ok)add(key,'UNKNOWN','optional health HTTP '+r.http);
 else if(result.health?.lastProviderError?.includes('429')||String(result.health?.lastError||'').includes('429'))add(key,'WARNING','health reports historical/running 429; inspect timestamps');
 else add(key,'PASS','HTTP '+r.http);
 return result;
}
async function probePublic(key,url,required){
 const t=performance.now();
 try{
  const r=await fetch(url,{method:'GET',headers:{Accept:'text/html'},signal:AbortSignal.timeout(25000),redirect:'follow'});
  const ttfb=Math.round(performance.now()-t);
  const body=await r.arrayBuffer();
  const result={key,http:r.status,ttfbMs:ttfb,totalMs:Math.round(performance.now()-t),bytes:body.byteLength,
   cacheStatus:r.headers.get('cf-cache-status')||null,cacheControl:r.headers.get('cache-control')||null,
   age:r.headers.get('age')||null,contentType:r.headers.get('content-type')?.split(';')[0]||null};
  if(!r.ok)add(key,required?'CRITICAL':'WARNING','site HTTP '+r.status);
  else if(ttfb>3000)add(key,'WARNING','TTFB exceeded provisional 3000ms (single remote runner sample)');
  else add(key,'PASS','HTTP '+r.status);
  return result;
 }catch{add(key,required?'CRITICAL':'WARNING','public page unavailable');return {key,http:0,ttfbMs:null,totalMs:null};}
}
async function cloudflare(){
 if(!CF_ACCOUNT||!CF_TOKEN){add('cloudflare_metrics','UNKNOWN','credentials unavailable');return {ok:false};}
 const query='query($accountTag: string!, $start: Time!, $end: Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end},orderBy:[sum_requests_DESC]){dimensions{scriptName}sum{requests errors subrequests}} durableObjectsInvocationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end},orderBy:[sum_requests_DESC]){dimensions{scriptName type}sum{requests}}}}}';
 try{
  const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:'Bearer '+CF_TOKEN,'content-type':'application/json'},body:JSON.stringify({query,variables:{accountTag:CF_ACCOUNT,start:since.toISOString(),end:now.toISOString()}}),signal:AbortSignal.timeout(23000)});
  const j=await r.json().catch(()=>({}));if(!r.ok||j.errors?.length)throw Error('GraphQL rejected');
  const acc=j.data?.viewer?.accounts?.[0]||{};
  const workers=(acc.workersInvocationsAdaptive||[]).filter(x=>names.includes(x.dimensions?.scriptName)).map(x=>({
   name:x.dimensions.scriptName,requests:safeNumber(x.sum?.requests)||0,errors:safeNumber(x.sum?.errors)||0,subrequests:safeNumber(x.sum?.subrequests)||0}));
  const alarms=(acc.durableObjectsInvocationsAdaptiveGroups||[]).filter(x=>names.includes(x.dimensions?.scriptName)&&x.dimensions?.type==='alarm').map(x=>({name:x.dimensions.scriptName,alarms:safeNumber(x.sum?.requests)||0}));
  add('cloudflare_metrics','PASS','GraphQL summary loaded');
  const shadow=alarms.find(x=>x.name==='nomadtips3-live-engine-5usd-shadow');
  if((shadow?.alarms||0)>4)add('shadow_341_alarm','WARNING','old test Worker alarms seen in 20-minute window');
  else add('shadow_341_alarm','PASS','no recurring 3-second alarm pattern in sample window');
  for(const w of workers){if(w.errors>0)add('worker_error_'+w.name,'WARNING',w.errors+' Worker exceptions in 20 minutes (not 5USD 429 count)');}
  return {ok:true,windowMinutes:20,workers,alarms};
 }catch(e){add('cloudflare_metrics','UNKNOWN','GraphQL not available');return {ok:false,error:'cloudflare_analytics_unavailable'};}
}
async function versionGuard(){
 if(!CF_ACCOUNT||!CF_TOKEN)return [];
 const out=[];
 for(const name of ['ball46-production','nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46','nomadtips3-live-engine-5usd-shadow']){
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(CF_ACCOUNT)+'/workers/scripts/'+encodeURIComponent(name)+'/deployments?per_page=1';
  const r=await getJSON(url,{auth:true});
  const list=Array.isArray(r.payload?.result)?r.payload.result:(r.payload?.result?.deployments||[]);
  const item=list[0];const active=(item?.versions||[]).filter(x=>Number(x.percentage)>0).map(x=>({version:x.version_id,pct:Number(x.percentage)}));
  out.push({name,ok:r.ok&&r.payload?.success===true,active});
  if(!r.ok)add('version_'+name,'UNKNOWN','deployment metadata unavailable');
 }
 return out;
}
const [cloud,publicHome,publicMember,hub,engine,siteEngine,market,shadow,versions]=await Promise.all([
 cloudflare(),
 probePublic('ball46_home','https://www.ball46.com/',true),
 probePublic('ball46_member','https://member.ball46.com/',true),
 probeHealth('hub','https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/health',true),
 probeHealth('engine','https://nomadtips3-engine-343.mccarey-supon.workers.dev/health',false),
 probeHealth('site_engine','https://www.ball46.com/api/engine/health',true),
 probeHealth('full_market','https://nomadtips3-full-market-343-ball46.mccarey-supon.workers.dev/health',false),
 probeHealth('shadow','https://nomadtips3-live-engine-5usd-shadow.mccarey-supon.workers.dev/fiveusd-native',true),
 versionGuard()
]);
if(hub.health?.refreshSeconds!=null && (hub.health.refreshSeconds<10||hub.health.refreshSeconds>60))
 add('hub_poll_interval','WARNING','unexpected live interval '+hub.health.refreshSeconds+'s');
else if(hub.health?.refreshSeconds!=null)add('hub_poll_interval','PASS','live poll configured '+hub.health.refreshSeconds+'s');
else add('hub_poll_interval','UNKNOWN','live interval unavailable');
if(shadow.health?.providerLiveRPM!=null && shadow.health.providerLiveRPM>0)
 add('shadow_provider_poll','WARNING','parked 3.41 test still spending API budget');
else if(shadow.health?.providerLiveRPM===0)add('shadow_provider_poll','PASS','parked 3.41 test live RPM=0');
else add('shadow_provider_poll','UNKNOWN','no 3.41 request counter');
add('provider_http_429','UNKNOWN','not measured: Cloudflare Worker exceptions are not upstream 5USD HTTP 429');
add('provider_rate_headers','UNKNOWN','not measured without per-upstream-call instrumentation');
add('browser_lcp','UNKNOWN','not measured; page TTFB is not LCP');
add('settlement_ledger_integrity','UNKNOWN','not modified or audited in this external observer');

const status=checks.some(x=>x.status==='CRITICAL')?'CRITICAL':checks.some(x=>x.status==='WARNING')?'WARNING':'PASS_WITH_GAPS';
const report={schema:'ball46-343-readonly-v1',observedAtUtc:now.toISOString(),windowStartUtc:since.toISOString(),status,
 architecture:'monitor-only; no API provider request; no production writes',
 endpoints:{publicHome,publicMember,hub,engine,siteEngine,fullMarket:market,shadow},
 cloudflare:cloud,activeDeployments:versions,checks};
await mkdir('reports',{recursive:true});
await writeFile('reports/ball46-343-observation.json',JSON.stringify(report,null,2)+'\n');
const md=['# BALL46 3.43 health monitor',`UTC: ${now.toISOString()} | Status: **${status}**`,'',
'This is a read-only single-sample check. Cloudflare Worker error counts are NOT the provider 429 count.',
'','| Check | Status | Detail |','|---|---|---|',...checks.map(x=>`| ${x.check} | ${x.status} | ${x.detail.replace(/\\|/g,'/')} |`),'',
'## Public latency and cache (runner location dependent)',
`- Main HTTP ${publicHome.http}, TTFB ${publicHome.ttfbMs}ms, total ${publicHome.totalMs}ms, cf-cache-status ${publicHome.cacheStatus||'unknown'}`,
`- Member HTTP ${publicMember.http}, TTFB ${publicMember.ttfbMs}ms, cf-cache-status ${publicMember.cacheStatus||'unknown'}`,
`- HUB configured cadence ${hub.health?.refreshSeconds??'unknown'}s; shadow live requests/min ${shadow.health?.providerLiveRPM??'unknown'}`,
'','## 20-minute Worker metrics',...((cloud.workers||[]).map(x=>`- ${x.name}: ${x.requests} invocations, ${x.errors} Worker errors (not provider HTTP codes)`)),
'','## Evidence limits','429, Retry-After, X-RateLimit headers, snapshot staleness, browser LCP, account-global quota, and FT settlement correctness require separate instrumentation or data-source access.'];
await writeFile('reports/ball46-343-summary.md',md.join('\n')+'\n');
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,md.join('\n')+'\n',{flag:'a'});
console.log('BALL46_MONITOR_DETAILS='+JSON.stringify({
 observedAtUtc:now.toISOString(),public:{home:publicHome,member:publicMember},
 health:{hub:{http:hub.http,latencyMs:hub.responseMs,refreshSeconds:hub.health?.refreshSeconds??null,estimatedBulkRPM:hub.health?.estimatedBulkRPM??null,lastErrorPresent:Boolean(hub.health?.lastError),lastProviderErrorPresent:Boolean(hub.health?.lastProviderError)},
  engine:{http:engine.http,latencyMs:engine.responseMs,ok:engine.health?.ok??null},
  siteEngine:{http:siteEngine.http,latencyMs:siteEngine.responseMs,ok:siteEngine.health?.ok??null},
  fullMarket:{http:market.http,latencyMs:market.responseMs},shadow:{http:shadow.http,liveRPM:shadow.health?.providerLiveRPM??null}},
 cloudflare:cloud,versions
}));
console.log('BALL46_MONITOR_SUMMARY='+JSON.stringify({status,checks:checks.map(x=>({name:x.check,status:x.status})),main:publicHome.http,hubRefreshSeconds:hub.health?.refreshSeconds??null,shadowRPM:shadow.health?.providerLiveRPM??null,workerMetrics:cloud.ok,reportFile:'reports/ball46-343-observation.json'}));
// Do NOT fail deployment CI; this observer never deploys. Alerts can be added after baseline calibration.
