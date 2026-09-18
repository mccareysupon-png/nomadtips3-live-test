(()=>{
'use strict';
// Ball46 viewer-safe compatibility shim.
// All odds stay inside the shared /api/engine/board bulk snapshot.
// A browser view must never trigger a per-fixture provider fetch.
const VERSION='343-expanded-full-market-bulk-only-v5-array-safe';
const BOARD_PATH='/api/engine/board';
const previousFetch=window.fetch.bind(window);
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);

function normalizeBoard(payload){
  if(!plain(payload)||!Array.isArray(payload.fixtures))return payload;
  let changed=false;
  const fixtures=payload.fixtures.map(fixture=>{
    if(!plain(fixture)||!Array.isArray(fixture.providerOdds))return fixture;
    changed=true;
    return {...fixture,providerOdds:{bookmakers:fixture.providerOdds}};
  });
  return changed?{...payload,fixtures}:payload;
}

function isBoardRequest(input){
  try{
    const raw=typeof input==='string'?input:input?.url;
    if(!raw)return false;
    return new URL(raw,window.location.href).pathname===BOARD_PATH;
  }catch{return false}
}

async function viewerSafeFetch(input,init){
  const response=await previousFetch(input,init);
  if(!response.ok||!isBoardRequest(input))return response;
  const text=await response.text();
  let payload;
  try{payload=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers:response.headers})}
  const normalized=normalizeBoard(payload);
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return new Response(JSON.stringify(normalized),{status:response.status,statusText:response.statusText,headers});
}

window.fetch=viewerSafeFetch;
window.NOMAD343_RICH_ODDS={
  version:VERSION,
  mode:'BULK_SNAPSHOT_ONLY',
  networkMode:'NONE',
  upstreamRequestsPerViewer:0,
  source:'ENGINE_BOARD_SHARED_SNAPSHOT',
  arrayRootCompatibility:true,
  normalizeBoard,
  clear:()=>{}
};
})();
