// Read-only diagnostic GETs to public Worker health endpoints; no provider writes or secrets.
const urls=[
 {key:'3.43-HUB',uri:'https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/health'},
 {key:'3.41-SHADOW',uri:'https://nomadtips3-live-engine-5usd-shadow.mccarey-supon.workers.dev/fiveusd-native'}
];
async function health(entry){
 try{
  const r=await fetch(entry.uri,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)});
  const j=await r.json().catch(()=>({}));
  return {key:entry.key,http:r.status,version:String(j?.version||j?.runtimeContract||'').slice(0,100),mode:j?.mode||null,
   lastError:String(j?.lastError||j?.state?.lastError||'').slice(0,160)||null,
   cadence:j?.cadence?{cycleMs:j.cadence.cycleMs,upcomingRefreshMs:j.cadence.upcomingRefreshMs}:null,
   control:j?.control?{liveRefreshSeconds:j.control.liveRefreshSeconds,updatedAt:j.control.updatedAt}:null,
   hubRefreshMs:j?.refreshMs||null,hubBulkRpm:j?.estimatedBulkRequestsPerMinute||null,
   lastSuccessAt:j?.lastSuccessAt||null,
   shadowLiveFetchedAt:j?.snapshot?.live?.fetchedAt||null,
   providerCallsInSnapshot:j?.providerRequestCount||null,
   error:j?.error||null};
 }catch(e){return {key:entry.key,http:0,error:'unavailable'};}
}
const first=await Promise.all(urls.map(health));
await new Promise(resolve=>setTimeout(resolve,4200));
const second=await Promise.all(urls.map(health));
console.log('BALL46_PUBLIC_HEALTH='+JSON.stringify({readOnly:true,atUtc:new Date().toISOString(),before:first,after:second}));
