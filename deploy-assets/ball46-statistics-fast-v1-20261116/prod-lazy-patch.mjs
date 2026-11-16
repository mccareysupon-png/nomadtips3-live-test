// BALL46 V1 current-source surgical lazy loader patches for Production candidate.
// Exact text anchor guards; drift returns original unchanged and fails Candidate QA.
export const PATCH_TAG='B46_VERIFIED_FAST_V1_LAZY_20261116';
export function patchProdStatistics(source){
 if(typeof source!=='string'||source.includes(PATCH_TAG))
   return {source,status:'ALREADY_OR_INVALID'};
 const nativeSignature="function signature(data) {\n  return JSON.stringify([data.ledgerTotal, data.total, data.pending, data.unresolved,\n    data.win, data.loss, data.push, data.halfWin, data.halfLoss, data.ledgerUpdatedAt]);\n}";
 const stableSignature="function signature(data) {\n"+
 "  // Versioned aggregate state: the Ledger sync clock alone is NOT a content revision.\n"+
 "  const markets=data.byMarket && typeof data.byMarket==='object' ?\n"+
 "    Object.keys(data.byMarket).sort().map(k=>[k,data.byMarket[k]]) : [];\n"+
 "  return JSON.stringify([data.ledgerTotal,data.total,data.pending,data.unresolved,\n"+
 "    data.win,data.loss,data.push,data.halfWin,data.halfLoss,data.version,\n"+
 "    data.settlementRevision,data.statisticsLedgerVersion,\n"+
 "    data.statisticsContentRevision||null,markets]);\n}";
 const originalDirect="  try { return await directAll(); } catch (error) { console.warn('Statistics direct read fallback', error?.message || error); }";
 const directSafe="  // The unpaged /api/engine/statistics endpoint can answer 599/non-JSON; use the \n"+
 "  // canonical cursor pages. No change to the payout/count verification rules.";
 const originalRead="async function readAll() {";
 const resilientRead="async function readAllOnce() {";
 const recoverAfter="async function readAll() {\n"+
 "  let failure;\n"+
 "  for(let attempt=0;attempt<4;attempt++){\n"+
 "    try{return await readAllOnce()}\n"+
 "    catch(e){\n"+
 "      failure=e;\n"+
 "      const message=String(e?.message||e);\n"+
 "      if(!/Statistics changed during pagination|Statistics HTTP|Statistics feed unavailable|Statistics continuation/.test(message))throw e;\n"+
 "      if(attempt===3)break;\n"+
 "      await new Promise(resolve=>setTimeout(resolve,450*(attempt+1)));\n"+
 "    }\n"+
 "  }\n"+
 "  throw failure||Error('Statistics cannot verify a complete Ledger');\n"+
 "}\n";
 const dataLoad='async function load() {\n  if (cached && Date.now() - loadedAt < CACHE_MS) return cached;';
 const start='function startStatistics(){if(state.statsLoaded&&Date.now()-state.statsLoadedAt<STAT_CACHE_MS){';
 const anchor="document.addEventListener('ball46:statistics-snapshot',e=>{state.rows=Array.isArray(e.detail.ledgerRows)";
 if([dataLoad,start,anchor,nativeSignature,originalDirect,originalRead].some(x=>source.split(x).length!==2))
   return {source,status:'SOURCE_ANCHOR_DRIFT'};
 const deferred="async function load() {\n"+
   "  if(!window.__B46_FAST_DETAILS_REQUESTED && (document.body?.dataset.workspaceView==='statistics'||new URLSearchParams(location.search).get('view')==='statistics')) {\n"+
   "    return await new Promise(resolve=>document.addEventListener('b46:fast-details-requested',()=>resolve(load()),{once:true}));\n"+
   "  }\n"+
   "  if (cached && Date.now() - loadedAt < CACHE_MS) return cached;";
 const gated="function startStatistics(){if(!window.__B46_FAST_DETAILS_REQUESTED)return;"+
   "if(state.statsLoaded&&Date.now()-state.statsLoadedAt<STAT_CACHE_MS){";
 const injected=String.raw`
// B46_VERIFIED_FAST_V1_LAZY_20261116
window.__B46_FAST_LOAD_DETAILS=()=>{
 if(window.__B46_FAST_DETAILS_REQUESTED)return;
 window.__B46_FAST_DETAILS_REQUESTED=true;
 document.dispatchEvent(new CustomEvent('b46:fast-details-requested'));
 if(state.view==='statistics')loadStatistics();
 document.dispatchEvent(new CustomEvent('ball46:workspace-view',{detail:{view:'statistics'}}));
};
`;
 return {source:source.replace(nativeSignature,stableSignature)
   .replace(originalDirect,directSafe)
   .replace(originalRead,resilientRead)
   .replace(dataLoad,recoverAfter+deferred)
   .replace(start,gated).replace(anchor,injected+anchor),
   status:'PATCHED_FULL_LEDGER_LAZY'};
}
export function patchProdChart(source){
 if(typeof source!=='string'||source.includes(PATCH_TAG))
   return {source,status:'ALREADY_OR_INVALID'};
 const anchor='async function load(){if(rowsCache.length&&Date.now()-loadedAt<CACHE_MS){';
 if(source.split(anchor).length!==2)return{source,status:'SOURCE_ANCHOR_DRIFT'};
 const changed='async function load(){/* '+PATCH_TAG+' */'+
  'if(!window.__B46_FAST_DETAILS_REQUESTED)return;'+
  'if(rowsCache.length&&Date.now()-loadedAt<CACHE_MS){';
 return {source:source.replace(anchor,changed),status:'PATCHED_GRAPH_LEDGER_LAZY'};
}
