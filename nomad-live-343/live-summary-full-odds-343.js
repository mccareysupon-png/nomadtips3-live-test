(()=>{
'use strict';
// Ball46 Rich Odds performance owner.
// Compact card odds stay on the shared engine board + dashboard last-good merge.
// Rich 19-book odds are fetched only for: (1) Signal view, (2) a fixture the viewer expands.
// No visible-card scan, no IntersectionObserver, no automatic rich-odds polling.
const VERSION='343-live-summary-john-gated-v8-signal-expanded-only';
const API='/api/full-market/fixture-odds';
const CLIENT_CACHE_MS=45_000;
const STALE_KEEP_MS=Number.POSITIVE_INFINITY;
const SIGNAL_PREFETCH_LIMIT=8;
const cache=new Map();
const inflight=new Map();
let retryUntil=0;
let signalBatch=0;
const now=()=>Date.now();
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);
function cached(id,allowStale=false){const hit=cache.get(id);if(!hit)return null;const age=now()-Number(hit.at||0);if(age<(allowStale?STALE_KEEP_MS:CLIENT_CACHE_MS))return hit;return null}
function richFixture(base,hit){if(!base||!hit?.fullOdds)return base;return{...base,providerOdds:hit.fullOdds,providerOddsUpdatedAt:hit.fetchedAt??base.providerOddsUpdatedAt??null,providerOddsFreshAt:hit.fetchedAt??base.providerOddsFreshAt??null,providerOddsHeld:Boolean(hit.stale),fullMarketSource:'CENTRAL_ON_DEMAND_GATE',fullMarketCached:Boolean(hit.cached),fullMarketStale:Boolean(hit.stale),fullMarketRenderOwner:'RICH_ODDS'}}
function renderPinned(expanded,fixture){if(!expanded?.isConnected||!fixture)return;defer(()=>{if(!expanded?.isConnected)return;const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;if(!renderer?.update)return;expanded._nomadRichFixture=fixture;expanded.dataset.oddsRenderOwner='rich-odds-final';renderer.update(expanded,fixture)})}
function paint(expanded,fixture,hit){if(!expanded?.isConnected||!fixture||!hit?.fullOdds)return;renderPinned(expanded,richFixture(fixture,hit))}
async function requestRich(id){
  id=String(id||'').trim();if(!id)throw new Error('FIXTURE_ID_REQUIRED');
  const fresh=cached(id,false);if(fresh)return fresh;if(inflight.has(id))return inflight.get(id);
  if(now()<retryUntil){const stale=cached(id,true);if(stale)return{...stale,stale:true};throw Object.assign(new Error('FULL_MARKET_BACKOFF'),{status:429})}
  const task=(async()=>{const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${now()}`,{cache:'no-store'});const j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true){const retry=Math.max(0,Number(j?.retryAfterSec||r.headers.get('retry-after')||0));if(r.status===429&&retry>0)retryUntil=Math.max(retryUntil,now()+retry*1000);const stale=cached(id,true);if(stale)return{...stale,stale:true};throw Object.assign(new Error(j?.error||`HTTP_${r.status}`),{status:r.status,retryAfter:retry})}const fullOdds=j?.fullOdds;if(!fullOdds||typeof fullOdds!=='object')throw new Error('FULL_MARKET_EMPTY');const hit={at:now(),fetchedAt:Number(j?.fetchedAt||now()),fullOdds,cached:Boolean(j?.cached),stale:Boolean(j?.stale),bookmakerCount:Number(j?.bookmakerCount||0),source:j?.source||'5DollarFootballAPI_FULL_MARKET'};cache.set(id,hit);return hit})().finally(()=>inflight.delete(id));
  inflight.set(id,task);return task;
}
async function warmSignalFixtures(ids){
  const list=[...new Set((Array.isArray(ids)?ids:[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,SIGNAL_PREFETCH_LIMIT);
  if(!list.length)return;
  const batch=++signalBatch;
  const settled=await Promise.allSettled(list.map(id=>requestRich(id)));
  if(batch!==signalBatch)return;
  const dash=window.NOMAD343_DASHBOARD_V2;
  settled.forEach((result,i)=>{if(result.status!=='fulfilled'||!result.value?.fullOdds)return;dash?.applyRichOdds?.(list[i],result.value.fullOdds,result.value.fetchedAt)});
}
function onSignalFilter(e){warmSignalFixtures(e?.detail?.fixtureIds).catch(()=>{})}
function onFixtureReady(e){
  const fixture=e?.detail?.fixture,id=idOf(fixture);
  const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
  if(!id||!expanded)return;
  const pinned=expanded._nomadRichFixture;if(idOf(pinned)===id&&pinned?.fullMarketRenderOwner==='RICH_ODDS'){renderPinned(expanded,pinned);return}
  const fresh=cached(id,false);if(fresh){paint(expanded,fixture,fresh);return}
  requestRich(id).then(hit=>paint(expanded,fixture,hit)).catch(err=>{if(Number(err?.status)!==429)console.warn('Full-market enrichment unavailable',err)});
}
function start(){
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  document.addEventListener('nomad343:signal-filter-active',onSignalFilter);
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={version:VERSION,mode:'BULK_PLUS_SIGNAL_AND_EXPANDED_RICH',renderOwner:'RICH_ODDS_FINAL',networkMode:'CENTRAL_GATE_SIGNAL_AND_EXPANDED_ONLY',automaticPolling:false,defaultCardVisibleEnrichment:false,signalFilterPrefetch:true,signalPrefetchLimit:SIGNAL_PREFETCH_LIMIT,fanout:false,clientCacheMs:CLIENT_CACHE_MS,staleKeepMs:STALE_KEEP_MS,source:'ENGINE_BOARD_BULK_PLUS_FULL_MARKET_GATE',upstreamRequestsPerViewer:'0 default; 0-or-1 per signal/expanded fixture via shared server cache',current:id=>cache.get(String(id))||null,clear:()=>cache.clear()};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
