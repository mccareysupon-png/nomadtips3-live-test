(()=>{
'use strict';
const DEFAULT_ENGINE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
const DEFAULT_PRICE='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
const PRODUCTION_HOSTS=new Set([
  'www.nomadtips3.com',
  'nomadtips3.com',
  'nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
]);
const FEED_PATH='/feed';
const FEED_LKG_KEY='nomad342FeedLastGoodV1';
const FEED_LKG_MAX_AGE_MS=3*60*1000;
const sameOriginProduction=typeof location!=='undefined'&&PRODUCTION_HOSTS.has(location.hostname);
const ACTIVE_ENGINE=sameOriginProduction?`${location.origin}/nomad-live-342`:DEFAULT_ENGINE;
let priceOverride='';
try{
  localStorage.removeItem('nomadEngine342Base');
  priceOverride=localStorage.getItem('nomadPrice342Base')||'';
}catch{}

function cleanBase(value){return String(value||'').trim().replace(/\/$/,'')}
function requestUrl(input){
  if(typeof input==='string')return input;
  if(input&&typeof input.url==='string')return input.url;
  return '';
}
function installFeedResilience(engineBase,feedPath){
  if(typeof window.fetch!=='function'||window.__nomad342FeedResilienceInstalled)return;
  const nativeFetch=window.fetch.bind(window),target=`${cleanBase(engineBase)}${feedPath}`;
  let memoryRecord=null;

  function isTarget(input){
    const url=requestUrl(input).split('#')[0];
    return url===target||url.startsWith(`${target}?`);
  }
  function validFeed(data){return Boolean(data&&String(data.version)==='3.42'&&Array.isArray(data.matches))}
  function storeLastGood(data){
    if(!validFeed(data)||data.ok===false)return;
    const record={savedAt:Date.now(),data};
    memoryRecord=record;
    try{localStorage.setItem(FEED_LKG_KEY,JSON.stringify(record))}catch{}
  }
  function readLastGood(){
    let record=memoryRecord;
    if(!record){
      try{record=JSON.parse(localStorage.getItem(FEED_LKG_KEY)||'null')}catch{record=null}
    }
    const savedAt=Number(record?.savedAt),age=Date.now()-savedAt;
    if(!validFeed(record?.data)||!Number.isFinite(savedAt)||age<0||age>FEED_LKG_MAX_AGE_MS){
      memoryRecord=null;
      try{localStorage.removeItem(FEED_LKG_KEY)}catch{}
      return null;
    }
    memoryRecord=record;
    return {record,age};
  }
  function fallbackResponse(reason){
    if(typeof Response!=='function')return null;
    const cached=readLastGood();
    if(!cached)return null;
    const ageSeconds=Math.max(0,Math.floor(cached.age/1000)),data=cached.record.data;
    const matches=data.matches.map(match=>({
      ...match,
      source:{...(match.source||{}),fallback:'LAST_GOOD',degraded:true},
      freshness:{...(match.freshness||{}),stale:true,fallback:true}
    }));
    const payload={
      ...data,
      ok:true,
      degraded:true,
      fallback:'LAST_GOOD',
      fallbackAgeSeconds:ageSeconds,
      lastError:String(reason||'TotalCorner feed unavailable'),
      cycle:`${data.cycle??'—'} LKG+${ageSeconds}s`,
      counts:{...(data.counts||{}),live:matches.length,stale:matches.length},
      matches
    };
    return new Response(JSON.stringify(payload),{
      status:200,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-nomad-feed-fallback':'LAST_GOOD'}
    });
  }

  window.fetch=async function(...args){
    if(!isTarget(args[0]))return nativeFetch(...args);
    try{
      const response=await nativeFetch(...args);
      if(!response.ok)return fallbackResponse(`engine_http_${response.status}`)||response;
      let data=null;
      try{data=await response.clone().json()}catch{}
      if(validFeed(data)&&data.ok!==false){storeLastGood(data);return response}
      if(validFeed(data)&&data.ok===false)return fallbackResponse(data.lastError||'342_feed_not_ok')||response;
      return fallbackResponse('invalid_342_feed_contract')||response;
    }catch(error){
      const reason=error?.name==='AbortError'?'feed_timeout':String(error?.message||error||'feed_fetch_failed');
      const fallback=fallbackResponse(reason);
      if(fallback)return fallback;
      throw error;
    }
  };
  window.__nomad342FeedResilienceInstalled=true;
  window.__nomad342FeedResilience=Object.freeze({target,maxAgeMs:FEED_LKG_MAX_AGE_MS,storageKey:FEED_LKG_KEY});
}

installFeedResilience(ACTIVE_ENGINE,FEED_PATH);

window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:sameOriginProduction?'PRODUCTION':'GIT',
  transport:sameOriginProduction?'same-origin':'direct-worker',
  engineBase:cleanBase(ACTIVE_ENGINE),
  defaultEngineBase:DEFAULT_ENGINE,
  feedPath:FEED_PATH,
  priceBase:cleanBase(priceOverride||DEFAULT_PRICE),
  pricePath:'/quotes',
  priceHealthPath:'/health',
  pollMs:10000,
  requestTimeoutMs:14000,
  priceTimeoutMs:8000,
});
})();
