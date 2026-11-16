// B46 Statistics Loader recovery — STAGING ONLY.
// Rewrites only the first statistics-data owner closure in the CURRENT public JS.
// Intentionally preserves formulas, pagination/count guards and DOM rendering.
export const STAGE_LOADER_MARKER='B46_STAGE_LOADER_RECOVERY_V1_20261116';
const replacementPage=`async function page(params = {}) {
  const query = new URLSearchParams(params);
  query.set('paged', '1');
  let lastError = null;
  for (let attempt=0; attempt<3; attempt++) {
    query.set('_',String(Date.now()+attempt));
    try {
      const response = await fetch(API+'?'+query, {
        credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(12000)
      });
      if (!response.ok) {
        if ([502,503,504,599].includes(response.status) && attempt<2) {
          try { await response.body?.cancel(); } catch {}
          await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
          continue;
        }
        throw new Error('Statistics HTTP '+response.status);
      }
      const type = response.headers.get('content-type') || '';
      if (!type.toLowerCase().includes('application/json')) throw new Error('Statistics response not JSON');
      const data = await response.json();
      if (data?.ok !== true || !Array.isArray(data.rows)) throw new Error('Statistics feed unavailable');
      if (!Number.isSafeInteger(data.total) || data.total < 0 ||
          !Number.isSafeInteger(data.ledgerTotal) || data.ledgerTotal < data.total) {
        throw new Error('Statistics ledger totals missing');
      }
      return data;
    } catch (error) {
      lastError=error;
      if (attempt<2 && (error.name==='TimeoutError' || error.name==='AbortError' || error instanceof TypeError)) {
        await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
        continue;
      }
      break;
    }
  }
  throw lastError || new Error('Statistics fetch failed');
}
// B46_STAGE_LOADER_RECOVERY_V1_20261116`;
export function patchCurrentStatisticsLoader(source){
  if(typeof source!=='string')return {source,status:'INVALID_SOURCE'};
  if(source.includes(STAGE_LOADER_MARKER))return {source,status:'ALREADY_PATCHED'};
  const owner='window.BALL46_STATISTICS_DATA = Object.freeze(';
  const pageStart=source.indexOf('async function page(params = {}) {');
  const directStart=source.indexOf('\nasync function directAll() {',pageStart);
  const ownerEnd=source.indexOf(owner,directStart);
  if(pageStart<0||directStart<0||ownerEnd<0||source.indexOf('async function page(params = {}) {',pageStart+1)!==-1){
    return {source,status:'SOURCE_DRIFT_MISSING_OWNER'};
  }
  const prefix=source.slice(0,pageStart),suffix=source.slice(ownerEnd);
  let block=replacementPage+source.slice(directStart,ownerEnd);
  const directAt=block.indexOf('async function directAll() {');
  const directEnd=block.indexOf('\nasync function readAll() {',directAt);
  if(directAt<0||directEnd<directAt)return {source,status:'SOURCE_DRIFT_DIRECT_LAYOUT'};
  let direct=block.slice(directAt,directEnd);
  const jsonOld='  const data = await response.json();';
  if(!direct.includes(jsonOld))return {source,status:'SOURCE_DRIFT_GZIP_READER'};
  const jsonStage=`  // B46_STAGE_GZIP_VERIFIED: staging KV stores validated public Ledger as GZIP binary.
  // Native DecompressionStream makes the network transfer 4.7 MB, not 58 MB.
  let data;
  if(response.ok && ['VERIFIED_SAVED','VERIFIED_PREVIOUS'].includes(response.headers.get('x-b46-stage-snapshot'))){
    if(typeof DecompressionStream==='undefined')throw new Error('STAGE_GZIP_UNSUPPORTED');
    const raw=await response.arrayBuffer();
    data=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  }else{
    if(!response.ok)throw new Error('Statistics direct HTTP '+response.status);
    data=await response.json();
  }`;
  direct=direct.replace(jsonOld,jsonStage);
  block=block.slice(0,directAt)+direct+block.slice(directEnd);
  const skip=`  try { return await directAll(); } catch (error) { console.warn('Statistics direct read fallback', error?.message || error); }`;
  if(!block.includes(skip))return {source,status:'SOURCE_DRIFT_DIRECT_FALLBACK'};
  block=block.replace(skip,`  // STAGING: Unpaged endpoint fails intermittently with non-JSON 599. Read cursor pages directly.`);
  const promiseEnd=`  });\n  try { return await loading; } finally { loading = null; }`;
  if(!block.includes(promiseEnd))return {source,status:'SOURCE_DRIFT_LOAD_FALLBACK'};
  block=block.replace(promiseEnd,`  }).catch(error=>{
    // A verified prior full ledger remains usable for display; no partial replacement.
    if(cached && cached.ok===true && Array.isArray(cached.ledgerRows) &&
       cached.ledgerRows.length===cached.ledgerTotal && cached.hasMore===false){
      console.warn('[B46 staging] using last verified Statistics snapshot',error?.message||error);
      return cached;
    }
    throw error;
  });
  try { return await loading; } finally { loading = null; }`);
  return {source:prefix+block+suffix,status:'CURRENT_LOADER_PATCHED'};
}
