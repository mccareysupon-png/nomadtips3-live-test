(()=>{
'use strict';
// Ball46 viewer-safe compatibility shim.
// Live list odds are rendered from the shared 5USD bulk snapshot already carried by /api/engine/board.
// IMPORTANT: this file must never call /api/full-market/fixture-odds or any provider endpoint.
const VERSION='343-live-summary-bulk-only-v3-viewer-safe';
function start(){
  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={
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
