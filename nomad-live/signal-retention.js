(()=>{
  // D-005: persistent signal truth now comes from the Engine ledger via /feed.
  // Remove the legacy browser-local sticky cache and never override detector state client-side.
  const STORE=`nomad341StickySignalsV1:${window.NOMAD_RUNTIME?.environment||'unknown'}`;
  try{localStorage.removeItem(STORE);}catch{}
})();
