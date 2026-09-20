(()=>{
'use strict';
// BALL46_FULL_MARKET_BRIDGE_V4
// Read central Full-Market cache only and feed the existing default/expanded odds slots.
// Creates no UI, no monitor, no debug panel and never calls 5USD from the browser.
const VERSION='343-full-market-bridge-v4-existing-slots';
const API='/api/full-market/board-cache';
const ROW='.match-row[data-match-id]';
const CACHE_READ_MS=30_000;
const BATCH_SIZE=16;
const readAt=new Map();
const entriesByFixture=new Map();
let requestInFlight=false;

const idOf=v=>String(v??'').trim();
const escSel=v=>window.CSS?.escape?CSS.escape(String(v)):String(v).replace(/["\\]/g,'\\$&');

function idsOnBoard(){
  return [...new Set([...document.querySelectorAll(ROW)]
    .map(row=>idOf(row.dataset.matchId))
    .filter(Boolean))];
}

function bridgeExpanded(id,entry){
  if(!entry?.fullOdds)return false;
  const expanded=document.querySelector(`.match-expanded[data-expanded-match="${escSel(id)}"]`);
  if(!expanded)return false;
  const dashboard=window.NOMAD343_DASHBOARD_V2;
  const base=expanded._nomadFixture||expanded._nomadRichFixture||dashboard?.getFixture?.(id)||{fixtureId:id};
  const fixture={...base,fixtureId:base?.fixtureId??id,fullOdds:entry.fullOdds,providerOddsUpdatedAt:entry.fetchedAt??base?.providerOddsUpdatedAt??Date.now(),providerOddsFreshAt:entry.fetchedAt??base?.providerOddsFreshAt??Date.now()};
  expanded._nomadFixture=fixture;
  expanded._nomadRichFixture=fixture;
  const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
  if(renderer?.update){renderer.update(expanded,fixture);return true}
  return false;
}

function applyEntry(id,entry){
  if(!entry?.fullOdds)return false;
  entriesByFixture.set(String(id),entry);
  let changed=false;
  const dashboard=window.NOMAD343_DASHBOARD_V2;
  if(dashboard?.applyRichOdds){
    changed=dashboard.applyRichOdds(String(id),entry.fullOdds,entry.fetchedAt||Date.now())===true;
  }
  bridgeExpanded(String(id),entry);
  return changed;
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

function onFixtureReady(e){
  const fixture=e?.detail?.fixture;
  const id=idOf(e?.detail?.fixtureId??fixture?.fixtureId??fixture?.id);
  if(!id)return;
  const cached=entriesByFixture.get(id);
  if(cached?.fullOdds){
    queueMicrotask(()=>bridgeExpanded(id,cached));
    return;
  }
  refresh(false).catch(()=>{});
}

function start(){
  document.querySelectorAll('.b46-fm-sidecar').forEach(el=>el.remove());
  document.getElementById('ball46-full-market-sidecar-v2-style')?.remove();
  document.addEventListener('nomad343:fixture-ready',onFixtureReady);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')refresh(true).catch(()=>{});
  });
  setTimeout(()=>refresh(true).catch(()=>{}),300);
  setInterval(()=>refresh(false).catch(()=>{}),CACHE_READ_MS);
  window.NOMAD343_FULL_MARKET_SIDECAR={
    version:VERSION,
    mode:'EXISTING_ODDS_SLOTS_ONLY',
    cacheApi:API,
    viewerTriggeredProviderFetch:false,
    providerRequestsPerViewer:0,
    createsUi:false,
    createsMonitor:false,
    getEntry:id=>entriesByFixture.get(String(id))||null,
    refresh:()=>refresh(true)
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
