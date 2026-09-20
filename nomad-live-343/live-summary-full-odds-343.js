(()=>{
'use strict';
// BALL46_VIEWER_ZERO_NETWORK_ODDS_V3
// Viewer odds are rendered only from data already carried by the shared Ball46 bulk snapshot.
// No click, card expansion, signal filter, or page viewer may trigger an odds/API request.
const VERSION='343-live-summary-viewer-bulk-snapshot-zero-network-v3';
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const obj=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const hasData=v=>obj(v)&&Object.keys(v).length>0;
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);

function renderPinned(expanded,fixture,owner='bulk-snapshot-odds-read-only'){
  if(!expanded?.isConnected||!fixture)return;
  defer(()=>{
    if(!expanded?.isConnected)return;
    const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
    if(!renderer?.update)return;
    expanded._nomadRichFixture=fixture;
    expanded.dataset.oddsRenderOwner=owner;
    renderer.update(expanded,fixture);
  });
}

function onFixtureReady(e){
  const fixture=e?.detail?.fixture;
  const id=idOf(fixture);
  const expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);
  if(!id||!expanded)return;

  // Preferred source: bookmaker pack already included in the HUB bulk snapshot.
  if(hasData(fixture?.providerOdds)){
    renderPinned(expanded,fixture,fixture?.providerOddsStale?'bulk-snapshot-last-good-odds':'bulk-snapshot-live-odds');
    return;
  }

  // Compatibility only: render embedded data if the board already supplied it.
  // This branch still performs zero network requests.
  if(hasData(fixture?.fullOdds)||hasData(fixture?.richOdds)){
    renderPinned(expanded,fixture,'embedded-snapshot-odds-read-only');
  }

  // Deliberately do nothing when odds are absent. Never fetch per viewer.
  // The next scheduled HUB snapshot is the only path by which new odds arrive.
}

function start(){
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={
    version:VERSION,
    mode:'VIEWER_READ_ONLY',
    networkMode:'BULK_SNAPSHOT_ONLY_ZERO_NETWORK',
    renderOwner:'BULK_PROVIDER_ODDS_READ_ONLY',
    automaticPolling:false,
    defaultCardVisibleEnrichment:false,
    signalFilterPrefetch:false,
    signalCacheRead:false,
    viewerTriggeredProviderFetch:false,
    viewerTriggeredInternalFetch:false,
    fanout:false,
    source:'HUB_BULK_SNAPSHOT_PROVIDER_ODDS',
    upstreamRequestsPerViewer:0,
    internalRequestsPerViewer:0
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();