(()=>{
'use strict';
// Ball46 rich-odds render owner.
// John-safe architecture:
// - shared bulk board for live board data
// - one central per-fixture request only when a viewer expands a fixture
// - never call 5USD directly from the browser
// - never poll rich odds automatically
// - never let a later bulk fixture event overwrite a rich 19-book render
const VERSION='343-live-summary-john-gated-v6-last-good-persistent';
const API='/api/full-market/fixture-odds';
const CLIENT_CACHE_MS=45_000;
const STALE_KEEP_MS=Number.POSITIVE_INFINITY;
const cache=new Map();
const inflight=new Map();
let retryUntil=0;

const now=()=>Date.now();
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);

function cached(id,allowStale=false){
  const hit=cache.get(id);
  if(!hit)return null;
  const age=now()-Number(hit.at||0);
  if(age<(allowStale?STALE_KEEP_MS:CLIENT_CACHE_MS))return hit;
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
    fullMarketStale:Boolean(hit.stale),
    fullMarketRenderOwner:'RICH_ODDS'
  };
}

function renderPinned(expanded,fixture){
  if(!expanded?.isConnected||!fixture)return;
  // Run after every listener for nomad343:fixture-ready has completed.
  // This guarantees the bulk renderer cannot paint over the richer fixture.
  defer(()=>{
    if(!expanded?.isConnected)return;
    const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
    if(!renderer?.update)return;
    expanded._nomadRichFixture=fixture;
    expanded.dataset.oddsRenderOwner='rich-odds-final';
    renderer.update(expanded,fixture);
  });
}

function paint(expanded,fixture,hit){
  if(!expanded?.isConnected||!fixture||!hit?.fullOdds)return;
  renderPinned(expanded,richFixture(fixture,hit));
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

  // If this expanded row already owns a rich fixture, keep it pinned.
  // Repeated bulk refresh events must never downgrade it back to bulk-only odds.
  const pinned=expanded._nomadRichFixture;
  if(idOf(pinned)===id&&pinned?.fullMarketRenderOwner==='RICH_ODDS'){
    renderPinned(expanded,pinned);
    return;
  }

  const fresh=cached(id,false);
  if(fresh){
    paint(expanded,fixture,fresh);
    return;
  }

  requestRich(id)
    .then(hit=>paint(expanded,fixture,hit))
    .catch(err=>{
      // 429 means account rate-limit only. Keep bulk/last-good visible and obey backoff.
      if(Number(err?.status)!==429)console.warn('Full-market enrichment unavailable',err);
    });
}

function start(){
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={
    version:VERSION,
    mode:'BULK_PLUS_ON_DEMAND_RICH_FINAL_OWNER',
    renderOwner:'RICH_ODDS_FINAL',
    networkMode:'CENTRAL_GATE_ONLY',
    automaticPolling:false,
    fanout:false,
    clientCacheMs:CLIENT_CACHE_MS,
    staleKeepMs:STALE_KEEP_MS,
    source:'ENGINE_BOARD_BULK_PLUS_FULL_MARKET_GATE',
    upstreamRequestsPerExpandedFixture:'0-or-1 (shared server cache)',
    current:id=>cache.get(String(id))||null,
    clear:()=>cache.clear()
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
