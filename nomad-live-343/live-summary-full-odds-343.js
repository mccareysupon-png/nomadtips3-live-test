(()=>{
'use strict';
// John-safe full-market restore for Ball46.
// The shared bulk board remains the default source for score/minute/events/stats/basic odds.
// Rich 19-book prices are requested ONLY for the single fixture the viewer expands,
// through Ball46's central Durable Object gate. The browser never calls 5USD directly,
// never fans out across the live board, and never polls rich odds automatically.
const VERSION='343-live-summary-john-gated-v4';
const API='/api/full-market/fixture-odds';
const CLIENT_CACHE_MS=45_000;
const STALE_KEEP_MS=180_000;
const cache=new Map();
const inflight=new Map();
let retryUntil=0;

const now=()=>Date.now();
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();

function cached(id,allowStale=false){
  const hit=cache.get(id);
  if(!hit)return null;
  const age=now()-Number(hit.at||0);
  if(age<(allowStale?STALE_KEEP_MS:CLIENT_CACHE_MS))return hit;
  if(age>=STALE_KEEP_MS)cache.delete(id);
  return null;
}

function richFixture(base,hit){
  if(!base||!hit?.fullOdds)return base;
  return {
    ...base,
    providerOdds:hit.fullOdds,
    providerOddsUpdatedAt:hit.fetchedAt??base.providerOddsUpdatedAt??null,
    providerOddsFreshAt:hit.fetchedAt??base.providerOddsFreshAt??null,
    providerOddsHeld:Boolean(hit.stale),
    fullMarketSource:'CENTRAL_ON_DEMAND_GATE',
    fullMarketCached:Boolean(hit.cached),
    fullMarketStale:Boolean(hit.stale)
  };
}

function paint(expanded,fixture,hit){
  const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
  if(!renderer?.update||!expanded?.isConnected||!fixture||!hit?.fullOdds)return;
  renderer.update(expanded,richFixture(fixture,hit));
}

async function requestRich(id){
  const fresh=cached(id,false);
  if(fresh)return fresh;
  if(inflight.has(id))return inflight.get(id);
  if(now()<retryUntil){
    const stale=cached(id,true);
    if(stale)return {...stale,stale:true};
    throw Object.assign(new Error('FULL_MARKET_BACKOFF'),{status:429});
  }

  const task=(async()=>{
    const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${now()}`,{cache:'no-store'});
    const j=await r.json().catch(()=>null);
    if(!r.ok||j?.ok!==true){
      const retry=Math.max(0,Number(j?.retryAfterSec||r.headers.get('retry-after')||0));
      if(r.status===429&&retry>0)retryUntil=Math.max(retryUntil,now()+retry*1000);
      const stale=cached(id,true);
      if(stale)return {...stale,stale:true};
      throw Object.assign(new Error(j?.error||`HTTP_${r.status}`),{status:r.status,retryAfter:retry});
    }
    const fullOdds=j?.fullOdds;
    if(!fullOdds||typeof fullOdds!=='object')throw new Error('FULL_MARKET_EMPTY');
    const hit={
      at:now(),
      fetchedAt:Number(j?.fetchedAt||now()),
      fullOdds,
      cached:Boolean(j?.cached),
      stale:Boolean(j?.stale),
      bookmakerCount:Number(j?.bookmakerCount||0),
      source:j?.source||'5DollarFootballAPI_FULL_MARKET'
    };
    cache.set(id,hit);
    return hit;
  })().finally(()=>inflight.delete(id));
  inflight.set(id,task);
  return task;
}

function onFixtureReady(e){
  const fixture=e?.detail?.fixture;
  const id=idOf(fixture);
  const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
  if(!id||!expanded)return;

  const fresh=cached(id,false);
  if(fresh){paint(expanded,fixture,fresh);return}

  requestRich(id)
    .then(hit=>paint(expanded,fixture,hit))
    .catch(err=>{
      // Keep the shared bulk snapshot visible. A 429 is only a slow-down signal;
      // never blank prices and never start a retry loop from the browser.
      if(Number(err?.status)!==429)console.warn('Full-market enrichment unavailable',err);
    });
}

function start(){
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={
    version:VERSION,
    mode:'BULK_PLUS_ON_DEMAND_RICH',
    networkMode:'CENTRAL_GATE_ONLY',
    automaticPolling:false,
    fanout:false,
    clientCacheMs:CLIENT_CACHE_MS,
    staleKeepMs:STALE_KEEP_MS,
    source:'ENGINE_BOARD_BULK_PLUS_FULL_MARKET_GATE',
    upstreamRequestsPerExpandedFixture:'0-or-1 (shared server cache)',
    clear:()=>cache.clear()
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
