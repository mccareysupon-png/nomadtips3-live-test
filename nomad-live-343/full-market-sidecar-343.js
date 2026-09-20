(()=>{
'use strict';
// BALL46_FULL_MARKET_BRIDGE_V3
// Read central Full-Market cache only, then feed existing dashboard odds cells.
// Creates no UI, no monitor, no debug panel and never calls 5USD from the browser.
const VERSION='343-full-market-bridge-v3-existing-cells-only';
const API='/api/full-market/board-cache';
const ROW='.match-row[data-match-id]';
const CACHE_READ_MS=30_000;
const BATCH_SIZE=16;
const readAt=new Map();
let requestInFlight=false;

function idsOnBoard(){
  return [...new Set([...document.querySelectorAll(ROW)]
    .map(row=>String(row.dataset.matchId||'').trim())
    .filter(Boolean))];
}

function applyEntry(id,entry){
  if(!entry?.fullOdds)return false;
  const dashboard=window.NOMAD343_DASHBOARD_V2;
  if(!dashboard?.applyRichOdds)return false;
  return dashboard.applyRichOdds(String(id),entry.fullOdds,entry.fetchedAt||Date.now())===true;
}

async function fetchBatch(ids){
  const r=await fetch(API,{
    method:'POST',
    cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({fixtureIds:ids})
  });
  const j=await r.json().catch(()=>null);
  if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);
  if(Number(j.externalRequestsAdded||0)!==0||j.viewerRefreshEnabled!==false){
    throw new Error('FULL_MARKET_CACHE_ROUTE_NOT_READ_ONLY');
  }
  const entries=j.entries&&typeof j.entries==='object'?j.entries:{};
  const at=Date.now();
  for(const id of ids){
    readAt.set(id,at);
    if(entries[id]?.fullOdds)applyEntry(id,entries[id]);
  }
}

async function refresh(force=false){
  if(requestInFlight||document.visibilityState==='hidden')return;
  const now=Date.now();
  const ids=idsOnBoard();
  const wanted=ids.filter(id=>force||!readAt.has(id)||now-Number(readAt.get(id)||0)>=CACHE_READ_MS);
  if(!wanted.length)return;
  requestInFlight=true;
  try{
    for(let i=0;i<wanted.length;i+=BATCH_SIZE){
      await fetchBatch(wanted.slice(i,i+BATCH_SIZE));
    }
  }catch(err){
    console.warn('Full Market cache bridge unavailable',err);
  }finally{
    requestInFlight=false;
  }
}

function start(){
  document.querySelectorAll('.b46-fm-sidecar').forEach(el=>el.remove());
  document.getElementById('ball46-full-market-sidecar-v2-style')?.remove();
  document.addEventListener('nomad343:fixture-ready',()=>refresh(false).catch(()=>{}));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')refresh(true).catch(()=>{});
  });
  setTimeout(()=>refresh(true).catch(()=>{}),300);
  setInterval(()=>refresh(false).catch(()=>{}),CACHE_READ_MS);
  window.NOMAD343_FULL_MARKET_SIDECAR={
    version:VERSION,
    mode:'EXISTING_ODDS_CELLS_ONLY',
    cacheApi:API,
    viewerTriggeredProviderFetch:false,
    providerRequestsPerViewer:0,
    createsUi:false,
    createsMonitor:false,
    refresh:()=>refresh(true)
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
