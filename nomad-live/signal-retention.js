(()=>{
  // D-005: persistent signal truth now comes from the Engine ledger via /feed.
  // Retain the shared runtime contract without fetching or overriding detector state here.
  const ENGINE=window.NOMAD_RUNTIME?.engineBase;
  if(!ENGINE) return;
  const STORE=`nomad341StickySignalsV1:${window.NOMAD_RUNTIME?.environment||'unknown'}`;
  try{localStorage.removeItem(STORE);}catch{}
})();
