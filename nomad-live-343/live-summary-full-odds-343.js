(()=>{
'use strict';
// BALL46_VIEWER_ZERO_NETWORK_FULL_MARKET_V4
// Display only what the shared HUB/Engine board snapshot already carries.
// Never hide Default Card odds. Never fetch per fixture. Never trigger 5USD from a viewer.
const VERSION='343-live-summary-zero-network-full-market-sidecar-v4';
const SIDECAR_SRC='full-market-sidecar-343.js?v=343-full-market-sidecar-v1-cache-only-all-provider-books';
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const hasData=v=>plain(v)&&Object.keys(v).length>0;
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);
function renderExpanded(expanded,fixture){
  if(!expanded?.isConnected||!fixture||!hasData(fixture?.providerOdds))return;
  defer(()=>{
    if(!expanded?.isConnected)return;
    const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
    if(!renderer?.update)return;
    expanded._nomadRichFixture=fixture;
    expanded.dataset.oddsRenderOwner='bulk-snapshot-full-market';
    renderer.update(expanded,fixture);
  });
}
function onFixtureReady(e){
  const fixture=e?.detail?.fixture,id=idOf(fixture);if(!id)return;
  const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
  if(expanded)renderExpanded(expanded,fixture);
}
function loadSidecar(){
  if(window.NOMAD343_FULL_MARKET_SIDECAR||document.querySelector('script[data-ball46-full-market-sidecar]'))return;
  const s=document.createElement('script');s.src=SIDECAR_SRC;s.defer=true;s.dataset.ball46FullMarketSidecar='v1';document.head.appendChild(s);
}
function start(){
  document.getElementById('ball46-compact-odds-policy-v1')?.remove();
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  loadSidecar();
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={
    version:VERSION,
    mode:'VIEWER_READ_ONLY',
    networkMode:'BULK_SNAPSHOT_ONLY_ZERO_API',
    renderOwner:'BULK_PROVIDER_ODDS_READ_ONLY',
    defaultCardVisibleEnrichment:true,
    automaticPolling:false,
    signalFilterPrefetch:false,
    viewerTriggeredProviderFetch:false,
    viewerTriggeredInternalApiFetch:false,
    upstreamRequestsPerViewer:0,
    source:'ENGINE_BOARD_PROVIDER_ODDS',
    sidecar:SIDECAR_SRC
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
