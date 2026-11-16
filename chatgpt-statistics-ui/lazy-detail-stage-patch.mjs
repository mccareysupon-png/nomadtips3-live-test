// STAGING ONLY. Defer historical Ledger until a user explicitly requests detail.
// Always patch CURRENT live JS only after strict anchor validation; fail open
// to native behavior if the source has drifted.
export const LAZY_STATS_MARKER='B46_STAGE_LAZY_DETAILS_V1_20261116';
export function patchStageLazyStatistics(source){
  if(typeof source!=='string')return {source,status:'INVALID_SOURCE'};
  if(source.includes(LAZY_STATS_MARKER))return {source,status:'ALREADY_PATCHED'};
  // Production V1 already owns the same shared Stats loader. Prevent the
  // homepage exception from issuing 33+ historical page reads on every visit.
  if(source.includes('B46_VERIFIED_FAST_V1_LAZY_20261116')){
    const old="if(!window.__B46_FAST_DETAILS_REQUESTED && (document.body?.dataset.workspaceView==='statistics'||new URLSearchParams(location.search).get('view')==='statistics'))";
    const fresh="if(!window.__B46_FAST_DETAILS_REQUESTED)";
    const helper='window.__B46_FAST_LOAD_DETAILS=()=>{';
    if(source.split(old).length!==2||source.split(helper).length!==2)
      return {source,status:'PRODUCTION_V1_LOADER_SOURCE_DRIFT'};
    const alias="window.__B46_STAGE_LOAD_DETAILS=()=>{"+
      "window.__B46_STAGE_DETAILS_REQUESTED=true;"+
      "return window.__B46_FAST_LOAD_DETAILS?.()};\n";
    return {source:source.replace(old,fresh).replace(helper,alias+helper),
      status:'STAGING_PROD_V1_HOME_RECOUNT_DISABLED'};
  }
  const start='function startStatistics(){if(state.statsLoaded&&Date.now()-state.statsLoadedAt<STAT_CACHE_MS){';
  const anchor="document.addEventListener('ball46:statistics-snapshot',e=>{state.rows=Array.isArray(e.detail.ledgerRows)";
  const dataLoad='async function load(){\n  if(cached){';
  if(source.split(start).length!==2||source.split(anchor).length!==2||
     source.split(dataLoad).length!==2)
    return {source,status:'SOURCE_DRIFT_NO_LAZY_BOOT'};
  const deferredDataLoad="async function load(){\n"+
    "  // All views: never scan old Ledger on homepage or Statistics first paint.\n"+
    "  if(!window.__B46_STAGE_DETAILS_REQUESTED) {\n"+
    "    return await new Promise(resolve=>document.addEventListener('b46:stage-details-requested',()=>resolve(load()),{once:true}));\n"+
    "  }\n"+
    "  if(cached){";
  const gate="function startStatistics(){if(!window.__B46_STAGE_DETAILS_REQUESTED)return;"+
    "if(state.statsLoaded&&Date.now()-state.statsLoadedAt<STAT_CACHE_MS){";
  const inject=String.raw`
// B46_STAGE_LAZY_DETAILS_V1_20261116
// Explicit detail request is the ONLY trigger for historical Ledger here.
window.__B46_STAGE_LOAD_DETAILS=()=>{
  if(window.__B46_STAGE_DETAILS_REQUESTED)return;
  window.__B46_STAGE_DETAILS_REQUESTED=true;
  document.dispatchEvent(new CustomEvent('b46:stage-details-requested'));
  if(state.view==='statistics')loadStatistics();
  document.dispatchEvent(new CustomEvent('ball46:workspace-view',{detail:{view:'statistics'}}));
};
`;
  return {source:source.replace(dataLoad,deferredDataLoad).replace(start,gate).replace(anchor,inject+anchor),
    status:'STAGING_LAZY_DETAILS_PATCHED'};
}
export function patchStageLazyChart(source){
  if(typeof source!=='string')return {source,status:'INVALID_SOURCE'};
  if(source.includes(LAZY_STATS_MARKER))return {source,status:'ALREADY_PATCHED'};
  if(source.includes('B46_VERIFIED_FAST_V1_LAZY_20261116'))return {source,status:'PRODUCTION_V1_CHART_ALREADY_LAZY'};
  const before='async function load(){if(rowsCache.length&&Date.now()-loadedAt<CACHE_MS){';
  if(source.split(before).length!==2)return{source,status:'SOURCE_DRIFT_NO_CHART_LOAD'};
  return {source:source.replace(before,
    'async function load(){/* '+LAZY_STATS_MARKER+' */'+
    'if(!window.__B46_STAGE_DETAILS_REQUESTED)return;'+
    'if(rowsCache.length&&Date.now()-loadedAt<CACHE_MS){'),
    status:'STAGING_LAZY_CHART_PATCHED'};
}
