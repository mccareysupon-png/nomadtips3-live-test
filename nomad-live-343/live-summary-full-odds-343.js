(()=>{
'use strict';
// BALL46_VIEWER_ZERO_NETWORK_FULL_MARKET_V8
// Central Full-Market cache feeds the existing default and expanded odds slots only.
// No extra card/panel/monitor is created here and no viewer action can call 5USD.
const VERSION='343-live-summary-existing-odds-slots-v8';
const SIDECAR_SRC='full-market-sidecar-343.js?v=343-full-market-bridge-v5-dynamic-api-data';
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);
function renderExpanded(expanded,fixture){
  if(!expanded?.isConnected||!fixture)return;
  defer(()=>{
    if(!expanded?.isConnected)return;
    const id=idOf(fixture);
    const cached=window.NOMAD343_FULL_MARKET_SIDECAR?.getEntry?.(id);
    const rich=cached?.fullOdds?{...fixture,providerOdds:cached.fullOdds,fullOdds:cached.fullOdds,providerOddsUpdatedAt:cached.fetchedAt??fixture?.providerOddsUpdatedAt}:fixture;
    const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
    if(!renderer?.update)return;
    expanded._nomadRichFixture=rich;
    expanded._nomadFixture=rich;
    renderer.update(expanded,rich);
  });
}
function onFixtureReady(e){
  const fixture=e?.detail?.fixture,id=idOf(fixture);if(!id)return;
  const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
  if(expanded)renderExpanded(expanded,fixture);
}
function loadSidecar(){
  const current=document.querySelector('script[data-ball46-full-market-sidecar]');
  if(window.NOMAD343_FULL_MARKET_SIDECAR?.version==='343-full-market-bridge-v5-dynamic-api-data')return;
  if(current)current.remove();
  const s=document.createElement('script');s.src=SIDECAR_SRC;s.defer=true;s.dataset.ball46FullMarketSidecar='v5';document.head.appendChild(s);
}
function start(){
  document.querySelectorAll('.b46-fm-sidecar').forEach(el=>el.remove());
  document.getElementById('ball46-full-market-sidecar-v2-style')?.remove();
  document.getElementById('ball46-compact-odds-policy-v1')?.remove();
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  loadSidecar();
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={
    version:VERSION,
    mode:'VIEWER_READ_ONLY',
    networkMode:'CENTRAL_CACHE_READ_ONLY',
    defaultCardVisibleEnrichment:true,
    expandedCardVisibleEnrichment:true,
    createsExtraUi:false,
    viewerTriggeredProviderFetch:false,
    viewerTriggeredProducerRefresh:false,
    upstreamRequestsPerViewer:0,
    source:'CENTRAL_FULL_MARKET_CACHE',
    sidecar:SIDECAR_SRC
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
