(()=>{
'use strict';
// BALL46_VIEWER_ZERO_NETWORK_FULL_MARKET_V5
// Expanded view renders only already-cached odds. Default Card sidecar may read the central cache,
// but no viewer action can trigger 5USD or the Full-Market producer.
const VERSION='343-live-summary-central-cache-sidecar-v5';
const SIDECAR_SRC='full-market-sidecar-343.js?v=343-full-market-sidecar-v2-central-cache-batch-all-books';
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const hasData=v=>plain(v)&&Object.keys(v).length>0;
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);
function renderExpanded(expanded,fixture){
  if(!expanded?.isConnected||!fixture||!hasData(fixture?.providerOdds))return;
  defer(()=>{
    if(!expanded?.isConnected)return;
    const sidecar=window.NOMAD343_FULL_MARKET_SIDECAR;
    const hit=sidecar?.current?.(idOf(fixture));
    const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
    if(!renderer?.update)return;
    const rich=hit?.fullOdds?{...fixture,providerOdds:hit.fullOdds,providerOddsUpdatedAt:hit.fetchedAt??fixture.providerOddsUpdatedAt??null,providerOddsFreshAt:hit.fetchedAt??fixture.providerOddsFreshAt??null,providerOddsHeld:Boolean(hit.held),fullMarketSource:'CENTRAL_CACHE_READ_ONLY'}:fixture;
    expanded._nomadRichFixture=rich;
    expanded.dataset.oddsRenderOwner=hit?.fullOdds?'full-market-sidecar-cache':'bulk-snapshot-odds';
    renderer.update(expanded,rich);
  });
}
function onFixtureReady(e){
  const fixture=e?.detail?.fixture,id=idOf(fixture);if(!id)return;
  const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
  if(expanded)renderExpanded(expanded,fixture);
}
function loadSidecar(){
  if(window.NOMAD343_FULL_MARKET_SIDECAR||document.querySelector('script[data-ball46-full-market-sidecar]'))return;
  const s=document.createElement('script');s.src=SIDECAR_SRC;s.defer=true;s.dataset.ball46FullMarketSidecar='v2';document.head.appendChild(s);
}
function start(){
  document.getElementById('ball46-compact-odds-policy-v1')?.remove();
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  loadSidecar();
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={version:VERSION,mode:'VIEWER_READ_ONLY',networkMode:'CENTRAL_CACHE_READ_ONLY_PLUS_BULK_FALLBACK',renderOwner:'FULL_MARKET_SIDECAR_CACHE',defaultCardVisibleEnrichment:true,automaticPolling:false,signalFilterPrefetch:false,viewerTriggeredProviderFetch:false,viewerTriggeredProducerRefresh:false,upstreamRequestsPerViewer:0,source:'CENTRAL_FULL_MARKET_CACHE',sidecar:SIDECAR_SRC};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
