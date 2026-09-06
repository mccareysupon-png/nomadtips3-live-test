(()=>{
'use strict';
const LIVE_SCORE_ENGINE='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev';
const LIVE_SCORE_FALLBACK='https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev';
const DEFAULT_PRICE='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
const PRODUCTION_HOSTS=new Set([
  'www.nomadtips3.com',
  'nomadtips3.com',
  'nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
]);
const FEED_PATH='/feed';
const sameOriginProduction=typeof location!=='undefined'&&PRODUCTION_HOSTS.has(location.hostname);
let priceOverride='';
try{
  localStorage.removeItem('nomadEngine342Base');
  localStorage.removeItem('nomad342FeedLastGoodV1');
  priceOverride=localStorage.getItem('nomadPrice342Base')||'';
}catch{}

function cleanBase(value){return String(value||'').trim().replace(/\/$/,'')}
const ACTIVE_ENGINE=cleanBase(LIVE_SCORE_ENGINE);
const FALLBACK_ENGINE=cleanBase(LIVE_SCORE_FALLBACK);

window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:sameOriginProduction?'PRODUCTION':'GIT',
  transport:'direct-worker-v3',
  engineBase:ACTIVE_ENGINE,
  defaultEngineBase:FALLBACK_ENGINE,
  feedPath:FEED_PATH,
  priceBase:cleanBase(priceOverride||DEFAULT_PRICE),
  pricePath:'/quotes',
  priceHealthPath:'/health',
  pollMs:10000,
  requestTimeoutMs:14000,
  priceTimeoutMs:8000,
});

/* Clean-branch supplement rail only.
   TotalCorner stays authoritative for match identity, minute, score, attack,
   dangerous attack and corner. Goaloo may only fill SOT, Shot Off and
   Possession after strict cross-source match validation. */
const originalFetch=typeof window.fetch==='function'?window.fetch.bind(window):null;
let goalooModulePromise=null;
function isEventFeedRequest(input){
  try{
    const raw=typeof input==='string'?input:input?.url;
    if(!raw)return false;
    const url=new URL(raw,location.href);
    const allowed=new Set([new URL(ACTIVE_ENGINE).host,new URL(FALLBACK_ENGINE).host]);
    return allowed.has(url.host)&&url.pathname===FEED_PATH;
  }catch{return false}
}
async function goalooApi(){
  if(window.NOMAD342_GOALOO_STATS)return window.NOMAD342_GOALOO_STATS;
  if(!goalooModulePromise){
    goalooModulePromise=import('./goaloo-stats-layer.js?v=20260906-v1')
      .then(()=>window.NOMAD342_GOALOO_STATS||null)
      .catch(error=>{goalooModulePromise=null;throw error});
  }
  return goalooModulePromise;
}
if(originalFetch){
  window.fetch=async function(input,init){
    if(!isEventFeedRequest(input))return originalFetch(input,init);
    const response=await originalFetch(input,init);
    if(!response.ok)return response;
    let data;
    try{data=await response.clone().json()}catch{return response}
    if(!Array.isArray(data?.matches))return response;
    try{
      const api=await goalooApi();
      if(api?.enrichMatches)data={...data,matches:await api.enrichMatches(data.matches)};
    }catch(error){
      window.__nomad342GoalooStatsState={ok:false,error:String(error?.message||error),matched:0,total:data.matches.length,updatedAt:Date.now()};
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  };
}
})();
