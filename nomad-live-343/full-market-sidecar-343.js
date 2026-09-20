(()=>{
'use strict';
// BALL46_FULL_MARKET_BRIDGE_V5
// compatibility-marker: 343-full-market-bridge-v3-existing-cells-only
// Read central Full-Market cache only and feed the existing default/expanded odds slots.
// Creates no UI, no monitor, no debug panel and never calls 5USD from the browser.
const VERSION='343-full-market-bridge-v5-dynamic-api-data';
const API='/api/full-market/board-cache';
const ROW='.match-row[data-match-id]';
const CACHE_READ_MS=30_000;
const BATCH_SIZE=16;
const readAt=new Map();
const entriesByFixture=new Map();
let requestInFlight=false;
let repaintQueued=false;

const idOf=v=>String(v??'').trim();
const escSel=v=>window.CSS?.escape?CSS.escape(String(v)):String(v).replace(/["\\]/g,'\\$&');
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const norm=v=>String(v??'').toLowerCase().replace(/[\s-]+/g,'_');
const price=v=>{const n=num(v);return n===null?'—':n.toFixed(2)};
const line=v=>{const n=num(v);if(n===null)return'—';const s=Number.isInteger(n)?String(n):String(Math.round(n*100)/100);return n>0?`+${s}`:s};

function idsOnBoard(){
  return [...new Set([...document.querySelectorAll(ROW)]
    .map(row=>idOf(row.dataset.matchId))
    .filter(Boolean))];
}

function bookmakerRows(fullOdds){
  const root=plain(fullOdds?.data)?fullOdds.data:fullOdds;
  const candidates=[root?.bookmakers,fullOdds?.bookmakers,root?.data?.bookmakers,root?.odds?.bookmakers,root?.markets?.bookmakers];
  return candidates.find(Array.isArray)||[];
}

function bookOdds(row){
  return row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??null;
}

function exactMarket(odds,target){
  if(!plain(odds))return null;
  const wanted=target==='1X2'?'1x2':target==='AH'?'asian_handicap':'goal_line';
  for(const [raw,value] of Object.entries(odds)){
    if(norm(raw)===wanted&&value&&typeof value==='object')return value;
  }
  return null;
}

function pickStage(market){
  if(!market||typeof market!=='object')return null;
  const order=[
    ['LIVE',market.current??market.latest??market.inplay??market.in_play??market.live],
    ['CLOSE',market.closing??market.close],
    ['OPEN',market.opening??market.open]
  ];
  const hit=order.find(([,v])=>v&&typeof v==='object');
  if(hit)return hit;
  const directKeys=['home','draw','away','home_odds','away_odds','over','under','over_odds','under_odds','line','hdp','handicap','total'];
  return directKeys.some(k=>market[k]!==undefined)?['',market]:null;
}

function marketValue(target,value){
  if(target==='1X2'){
    const h=num(value?.home??value?.home_odds??value?.homeOdds),d=num(value?.draw??value?.draw_odds??value?.drawOdds),a=num(value?.away??value?.away_odds??value?.awayOdds);
    if(h===null&&d===null&&a===null)return null;
    return[h,d,a].map(price).join('/');
  }
  const ln=num(value?.line??value?.hdp??value?.handicap??value?.total);
  if(target==='AH'){
    const h=num(value?.home??value?.home_odds??value?.homeOdds),a=num(value?.away??value?.away_odds??value?.awayOdds);
    if(ln===null&&h===null&&a===null)return null;
    const ps=h===null&&a===null?'':[h,a].map(price).join('/');
    return[line(ln),ps].filter(Boolean).join(' · ');
  }
  const o=num(value?.over??value?.over_odds??value?.overOdds),u=num(value?.under??value?.under_odds??value?.underOdds);
  if(ln===null&&o===null&&u===null)return null;
  const ps=o===null&&u===null?'':[o,u].map(price).join('/');
  return[line(ln),ps].filter(Boolean).join(' · ');
}

function compact(fullOdds,target){
  for(const row of bookmakerRows(fullOdds)){
    if(!plain(row))continue;
    const market=exactMarket(bookOdds(row),target),stage=pickStage(market);
    if(!stage)continue;
    const value=marketValue(target,stage[1]);
    if(!value)continue;
    const book=idOf(row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug);
    return{stage:stage[0],value,book};
  }
  return{stage:'',value:'—',book:''};
}

function setExistingCell(cell,label,data){
  if(!cell)return;
  let span=cell.querySelector('span'),bold=cell.querySelector('b'),small=cell.querySelector('small');
  if(span)span.textContent=data.stage?`${label} · ${data.stage}`:label;
  if(bold)bold.textContent=data.value||'—';
  if(data.book){
    if(!small){small=document.createElement('small');cell.appendChild(small)}
    small.textContent=data.book;
    cell.title=[data.book,data.stage].filter(Boolean).join(' · ');
  }else{
    if(small)small.remove();
    cell.removeAttribute('title');
  }
}

function fillDefaultCells(id,entry){
  if(!entry?.fullOdds)return false;
  const row=document.querySelector(`.match-row[data-match-id="${escSel(id)}"]`);
  if(!row)return false;
  const cells=[...row.querySelectorAll('.market-cell')];
  if(cells.length<3)return false;
  setExistingCell(cells[0],'1X2',compact(entry.fullOdds,'1X2'));
  setExistingCell(cells[1],'AH',compact(entry.fullOdds,'AH'));
  setExistingCell(cells[2],'O/U',compact(entry.fullOdds,'OU'));
  return true;
}

function bridgeExpanded(id,entry){
  if(!entry?.fullOdds)return false;
  const expanded=document.querySelector(`.match-expanded[data-expanded-match="${escSel(id)}"]`);
  if(!expanded)return false;
  const dashboard=window.NOMAD343_DASHBOARD_V2;
  const base=expanded._nomadFixture||expanded._nomadRichFixture||dashboard?.getFixture?.(id)||{fixtureId:id};
  const fixture={
    ...base,
    fixtureId:base?.fixtureId??id,
    providerOdds:entry.fullOdds,
    fullOdds:entry.fullOdds,
    providerOddsUpdatedAt:entry.fetchedAt??base?.providerOddsUpdatedAt??Date.now(),
    providerOddsFreshAt:entry.fetchedAt??base?.providerOddsFreshAt??Date.now()
  };
  expanded._nomadFixture=fixture;
  expanded._nomadRichFixture=fixture;
  const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;
  if(renderer?.update){renderer.update(expanded,fixture);return true}
  return false;
}

function queueRepaint(){
  if(repaintQueued)return;
  repaintQueued=true;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    repaintQueued=false;
    for(const [id,entry] of entriesByFixture){fillDefaultCells(id,entry);bridgeExpanded(id,entry)}
  }));
}

function applyEntry(id,entry){
  if(!entry?.fullOdds)return false;
  entriesByFixture.set(String(id),entry);
  let changed=false;
  const dashboard=window.NOMAD343_DASHBOARD_V2;
  if(dashboard?.applyRichOdds){
    changed=dashboard.applyRichOdds(String(id),entry.fullOdds,entry.fetchedAt||Date.now())===true;
  }
  fillDefaultCells(String(id),entry);
  bridgeExpanded(String(id),entry);
  queueRepaint();
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
  if(!wanted.length){queueRepaint();return}
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
    queueMicrotask(()=>{fillDefaultCells(id,cached);bridgeExpanded(id,cached)});
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
  const board=document.querySelector('[data-board-sections]');
  if(board)new MutationObserver(()=>queueRepaint()).observe(board,{childList:true,subtree:true});
  setTimeout(()=>refresh(true).catch(()=>{}),300);
  setInterval(()=>refresh(false).catch(()=>{}),CACHE_READ_MS);
  window.NOMAD343_FULL_MARKET_SIDECAR={
    version:VERSION,
    mode:'EXISTING_ODDS_SLOTS_DYNAMIC_API_DATA',
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
