(()=>{
'use strict';
const VERSION='343-rich-odds-on-demand-v2-one-per-open-yellow';
const API='/api/hub/rich-odds';
const CLIENT_CACHE_MS=20_000;
const cache=new Map();
const inflight=new Map();
const now=()=>Date.now();
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);

function fixtureId(f){return String(f?.fixtureId??f?.id??'').trim()}
function isLive(f){const s=String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase();return f?.boardState==='live'||/in_play|in play|live|playing|first|second|half|^\d+$/.test(s)}
function mergeRich(a,b){
  if(a===null||a===undefined)return b;
  if(b===null||b===undefined)return a;
  if(Array.isArray(a)&&Array.isArray(b))return [...a,...b];
  if(Array.isArray(a))return a;
  if(Array.isArray(b))return b;
  if(plain(a)&&plain(b)){
    const out={...a};
    for(const [k,v] of Object.entries(b))out[k]=k in out?mergeRich(out[k],v):v;
    return out;
  }
  if(plain(a))return a;
  if(plain(b))return b;
  return b;
}
function mark(expanded,text,state='yellow'){
  if(!expanded)return;
  expanded.dataset.richOddsState=state;
  const title=expanded.querySelector('[data-full-market-card] .fmb-head b');
  if(title)title.textContent=text;
}
function publish(expanded,fixture,id,meta){
  if(!expanded||!fixture)return;
  expanded._nomadFixture=fixture;
  expanded.dispatchEvent(new CustomEvent('nomad343:fixture-ready',{
    bubbles:true,
    detail:{fixtureId:id,fixture,richOddsHydrated:true,richOddsMeta:meta}
  }));
}
async function requestRich(id){
  const hit=cache.get(id),t=now();
  if(hit?.data&&t-hit.at<CLIENT_CACHE_MS)return {...hit.data,clientCache:'HIT'};
  if(hit?.blockedUntil&&t<hit.blockedUntil){const e=new Error('RICH_ODDS_BACKOFF');e.retryAfterSec=Math.max(1,Math.ceil((hit.blockedUntil-t)/1000));throw e}
  if(inflight.has(id))return inflight.get(id);
  const task=fetch(`${API}?fixture_id=${encodeURIComponent(id)}&_=${t}`,{cache:'no-store'})
    .then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok!==true){const e=new Error(j?.error||`HTTP_${r.status}`);e.status=r.status;e.retryAfterSec=Number(j?.retryAfterSec||r.headers.get('retry-after')||0)||null;throw e}cache.set(id,{at:now(),data:j,blockedUntil:0});return {...j,clientCache:'MISS'}})
    .catch(e=>{const retry=Math.max(0,Number(e?.retryAfterSec||0));if(retry)cache.set(id,{at:0,data:null,blockedUntil:now()+retry*1000});throw e})
    .finally(()=>inflight.delete(id));
  inflight.set(id,task);
  return task;
}
async function hydrate(expanded,fixture){
  const id=fixtureId(fixture);
  if(!id||!isLive(fixture)||!expanded)return;
  if(expanded.dataset.richOddsAttemptedFor===id)return;
  expanded.dataset.richOddsAttemptedFor=id;
  try{
    mark(expanded,'RICH ODDS · LOADING','yellow');
    const rich=await requestRich(id);
    if(!expanded?.isConnected||fixtureId(expanded._nomadFixture)!==id)return;
    fixture.providerOdds=mergeRich(fixture.providerOdds,rich.provider);
    fixture.fullOdds=mergeRich(fixture.fullOdds,rich.provider);
    fixture._nomadRichOdds={fetchedAt:rich.fetchedAt,cache:rich.cache,clientCache:rich.clientCache,guard:rich.guard||null};
    publish(expanded,fixture,id,fixture._nomadRichOdds);
    const cacheLabel=rich.clientCache==='HIT'?'CLIENT CACHE':rich.cache==='HIT'?'HUB CACHE':'LIVE FETCH';
    mark(expanded,`RICH ODDS · ${cacheLabel}`,'yellow');
  }catch(err){
    const retry=Number(err?.retryAfterSec||0);
    mark(expanded,retry?`BULK SNAPSHOT · RICH WAIT ${retry}s`:'BULK SNAPSHOT · RICH UNAVAILABLE','yellow');
    console.warn('Rich Odds on-demand unavailable',id,err?.message||err);
  }
}
function start(){
  document.addEventListener('nomad343:fixture-ready',e=>{
    if(e.detail?.richOddsHydrated)return;
    const id=String(e.detail?.fixtureId||'');
    const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
    if(expanded&&e.detail?.fixture)hydrate(expanded,e.detail.fixture);
  });
  window.NOMAD343_RICH_ODDS={version:VERSION,mode:'ON_DEMAND_GUARDED_ONE_PER_OPEN',clientCacheMs:CLIENT_CACHE_MS,clear:id=>id?cache.delete(String(id)):cache.clear()};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();