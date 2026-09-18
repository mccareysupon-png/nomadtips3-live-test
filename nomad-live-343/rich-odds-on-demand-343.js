(()=>{
'use strict';
// Ball46 viewer-safe compatibility shim.
// Expanded bookmaker cards are hydrated by full-market-bookmaker-343.js from fixture.providerOdds
// in the shared bulk snapshot. A browser view must never trigger a per-fixture provider fetch.
const VERSION='343-expanded-full-market-bulk-only-v4-viewer-safe';
function start(){
  window.NOMAD343_RICH_ODDS={
    version:VERSION,
    mode:'BULK_SNAPSHOT_ONLY',
    networkMode:'NONE',
    upstreamRequestsPerViewer:0,
    source:'ENGINE_BOARD_SHARED_SNAPSHOT',
    clear:()=>{}
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
