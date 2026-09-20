(()=>{
'use strict';
// BALL46_FULL_ODDS_19BOOK_RESTORE_V1
// Expanded-card owner only. One fixture request goes through the shared Full-Market gate,
// which requests all configured bookmakers in one upstream call. Never merge rich odds
// back into the compact/default-card providerOdds state.
const VERSION='343-full-odds-19book-expanded-gate-v1';
const API='/api/full-market/fixture-odds';
const CLIENT_CACHE_MS=45_000;
const STALE_KEEP_MS=Number.POSITIVE_INFINITY;
const cache=new Map();
const inflight=new Map();
let retryUntil=0;
const now=()=>Date.now();
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);
function cached(id,allowStale=false){const hit=cache.get(id);if(!hit)return null;const age=now()-Number(hit.at||0);if(age<(allowStale?STALE_KEEP_MS:CLIENT_CACHE_MS))return hit;return null}
function richFixture(base,hit){if(!base||!hit?.fullOdds)return base;return{...base,providerOdds:hit.fullOdds,providerOddsUpdatedAt:hit.fetchedAt??base.providerOddsUpdatedAt??null,providerOddsFreshAt:hit.fetchedAt??base.providerOddsFreshAt??null,providerOddsHeld:Boolean(hit.stale),fullMarketSource:'CENTRAL_SHARED_GATE_19BOOK',fullMarketCached:Boolean(hit.cached),fullMarketStale:Boolean(hit.stale),fullMarketRenderOwner:'RICH_ODDS_ONLY'}}
function renderPinned(expanded,fixture){if(!expanded?.isConnected||!fixture)return;defer(()=>{if(!expanded?.isConnected)return;const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;if(!renderer?.update)return;expanded._nomadRichFixture=fixture;expanded.dataset.oddsRenderOwner='rich-odds-19book';renderer.update(expanded,fixture)})}
function paint(expanded,fixture,hit){if(!expanded?.isConnected||!fixture||!hit?.fullOdds)return;renderPinned(expanded,richFixture(fixture,hit))}
async function requestRich(id){
  id=String(id||'').trim();if(!id)throw new Error('FIXTURE_ID_REQUIRED');
  const fresh=cached(id,false);if(fresh)return fresh;
  if(inflight.has(id))return inflight.get(id);
  if(now()<retryUntil){const stale=cached(id,true);if(stale)return{...stale,stale:true};throw Object.assign(new Error('FULL_MARKET_BACKOFF'),{status:429})}
  const task=(async()=>{
    const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${now()}`,{cache:'no-store'});
    const j=await r.json().catch(()=>null);
    if(!r.ok||j?.ok!==true){
      const retry=Math.max(0,Number(j?.retryAfterSec||r.headers.get('retry-after')||0));
      if(r.status===429&&retry>0)retryUntil=Math.max(retryUntil,now()+retry*1000);
      const stale=cached(id,true);if(stale)return{...stale,stale:true};
      throw Object.assign(new Error(j?.error||`HTTP_${r.status}`),{status:r.status,retryAfter:retry});
    }
    const fullOdds=j?.fullOdds;
    if(!fullOdds||typeof fullOdds!=='object')throw new Error('FULL_MARKET_EMPTY');
    const hit={at:now(),fetchedAt:Number(j?.fetchedAt||now()),fullOdds,cached:Boolean(j?.cached),stale:Boolean(j?.stale),bookmakerCount:Number(j?.bookmakerCount||0),source:j?.source||'5DollarFootballAPI_FULL_MARKET'};
    cache.set(id,hit);return hit;
  })().finally(()=>inflight.delete(id));
  inflight.set(id,task);return task;
}
function maskCompactPrices(){
  if(document.getElementById('ball46-compact-odds-policy-v1'))return;
  const style=document.createElement('style');
  style.id='ball46-compact-odds-policy-v1';
  style.textContent='.match-row>.market-cell b,.match-row>.market-cell small{visibility:hidden!important}.match-row>.market-cell span{opacity:.72}';
  document.head.appendChild(style);
}
function onFixtureReady(e){
  const fixture=e?.detail?.fixture,id=idOf(fixture);
  const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
  if(!id||!expanded)return;
  const pinned=expanded._nomadRichFixture;
  if(idOf(pinned)===id&&pinned?.fullMarketRenderOwner==='RICH_ODDS_ONLY'){renderPinned(expanded,pinned);return}
  const fresh=cached(id,false);if(fresh){paint(expanded,fixture,fresh);return}
  requestRich(id).then(hit=>paint(expanded,fixture,hit)).catch(err=>{if(Number(err?.status)!==429)console.warn('Full-market odds unavailable',err)});
}
function start(){
  maskCompactPrices();
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={version:VERSION,mode:'EXPANDED_FULL_ODDS_19BOOK_SHARED_GATE',renderOwner:'RICH_ODDS_ONLY',automaticPolling:false,defaultCardVisibleEnrichment:false,signalFilterPrefetch:false,fanout:false,clientCacheMs:CLIENT_CACHE_MS,source:'FULL_MARKET_SHARED_GATE_ALL_BOOKMAKERS_ONE_REQUEST',requestRich,current:id=>cache.get(String(id))||null,clear:()=>cache.clear()};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
