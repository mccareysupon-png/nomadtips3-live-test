// Shadow's public diagnostics: persistent rate reservation counters & last fetched times.
// Pure GET; do not print fixture data, odds, key, or any custom headers.
const url='https://nomadtips3-live-engine-5usd-shadow.mccarey-supon.workers.dev/fiveusd-native';
async function one(){
 try{
  const r=await fetch(url,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(14000)});
  const j=await r.json().catch(()=>({}));
  const h=j.rate||{};
  const st=j.state||{};
  return {
   ok:r.ok,status:r.status,contract:String(j.runtimeContract||'').slice(0,60),mode:j.mode,
   hasKey:Boolean(j.hasKey),cycleMs:j.cadence?.cycleMs??null,
   liveFetchedAt:j.live?.fetchedAt??j.snapshot?.live?.fetchedAt??null,
   liveFixtures:j.live?.count??j.snapshot?.live?.fixtures?.length??null,
   cycleStartedAt:st.startedAt??null,cycleFinishedAt:st.finishedAt??null,
   stateOk:st.ok??null,rateLimited:st.rateLimited??null,throttled:(st.throttled||[]).map(x=>x.path).slice(0,5),
   providerBudget:h.global?.globalCeiling??null,
   globalRequestsLast60s:h.global?.usedLast60s??null,
   liveRequestsLast60s:h.live?.usedLast60s??null,
   refereeRequestsLast60s:h.referee?.usedLast60s??null,
   upcomingRequestsLast60s:h.upcoming?.usedLast60s??null
  };
 }catch{return {ok:false,status:0,error:'health_unavailable'};}
}
const results=[];for(let i=0;i<4;i++){results.push({timeUtc:new Date().toISOString(),...await one()});if(i<3)await new Promise(resolve=>setTimeout(resolve,3000));}
const advance=results.map((x,i)=>i?Number(x.liveFetchedAt)-Number(results[i-1].liveFetchedAt):null);
console.log('BALL46_SHADOW_OUTBOUND_COUNTER='+JSON.stringify({readOnly:true,results,fetchedAtAdvancesMs:advance}));
