(()=>{
'use strict';
// Compatibility marker only.
// IMPORTANT: bulk-odds-compat-343.js is the ONLY Ball46 file allowed to wrap window.fetch.
// Rich full-market requests are owned by live-summary-full-odds-343.js through the central gate.
// Keeping this file as a no-op prevents old index references from creating a second fetch layer.
const VERSION='343-rich-odds-compat-v7-no-fetch-wrapper';
window.NOMAD343_RICH_ODDS={
  version:VERSION,
  mode:'COMPAT_NOOP',
  networkMode:'NONE',
  wrapsFetch:false,
  renderOwner:'LIVE_SUMMARY_FULL_ODDS',
  source:'NO_DUPLICATE_NORMALIZER',
  upstreamRequestsPerViewer:0,
  clear:()=>window.NOMAD343_LIVE_SUMMARY_FULL_ODDS?.clear?.()
};
})();
