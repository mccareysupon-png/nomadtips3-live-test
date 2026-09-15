(()=>{
'use strict';
const VERSION='343-expanded-match-v4-stable-lifecycle';
const ODDS_RENDER_OWNER='full-market-bookmaker-only';
const BOARD_API='/api/engine/board';
const HISTORY_API='/api/engine/history';
const BOARD_CACHE_MS=15000;
const HISTORY_CACHE_MS=20000;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
let expandedId=null;
let expandedEl=null;
let boardCache={at:0,data:null,promise:null};
const historyCache=new Map();
let refreshSeq=0;
let refreshTimer=0;
let placementQueued=false;
let lastAnchorTop=null;

async function fetchJson(url){
  const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP_${r.status}`);
  return j;
}
async function getBoard(force=false){
  const now=Date.now();
  if(!force&&boardCache.data&&now-boardCache.at<BOARD_CACHE_MS)return boardCache.data;
  if(boardCache.promise)return boardCache.promise;
  boardCache.promise=fetchJson(BOARD_API).then(j=>{boardCache={at:Date.now(),data:j,promise:null};return j}).catch(e=>{boardCache.promise=null;throw e});
  return boardCache.promise;
}
async function getHistory(id,force=false){
  const now=Date.now(),hit=historyCache.get(id);
  if(!force&&hit?.data&&now-hit.at<HISTORY_CACHE_MS)return hit.data;
  if(hit?.promise)return hit.promise;
  const promise=fetchJson(`${HISTORY_API}?fixtureId=${encodeURIComponent(id)}&window=10`).then(j=>{historyCache.set(id,{at:Date.now(),data:j,promise:null});return j}).catch(e=>{historyCache.delete(id);throw e});
  historyCache.set(id,{at:now,data:null,promise});
  return promise;
}
function fixtureId(f){return String(f?.fixtureId??f?.id??'')}
function findFixture(board,id){return (Array.isArray(board?.fixtures)?board.fixtures:[]).find(f=>fixtureId(f)===String(id))||null}
function currentMinute(f,history){
  const fm=num(f?.minute),pts=Array.isArray(history?.pressure)?history.pressure:[],hm=pts.reduce((m,p)=>Math.max(m,num(p?.minute)??0),0);
  return Math.max(1,Math.round(Math.max(fm??0,hm)));
}
function flowPoints(history,current){
  const src=Array.isArray(history?.pressure)?history.pressure:[];
  const out=[];
  for(const p of src){
    const minute=num(p?.minute),home=num(p?.home),away=num(p?.away);
    if(minute===null||home===null||away===null||minute<0||minute>current+3)continue;
    const row={minute,home:clamp(home,1,100),away:clamp(away,1,100)};
    const last=out[out.length-1];
    if(last&&Math.abs(last.minute-minute)<.001)out[out.length-1]=row;else out.push(row);
  }
  return out.sort((a,b)=>a.minute-b.minute);
}
function pathLine(points,key,w,h,pad,current){return points.map((p,i)=>`${i?'L':'M'} ${xFor(p.minute,w,pad,current).toFixed(1)} ${yFor(p[key],h,pad).toFixed(1)}`).join(' ')}
function areaLine(points,key,w,h,pad,current){
  if(!points.length)return'';
  const base=yFor(1,h,pad),body=points.map(p=>`L ${xFor(p.minute,w,pad,current).toFixed(1)} ${yFor(p[key],h,pad).toFixed(1)}`).join(' ');
  const first=xFor(points[0].minute,w,pad,current),last=xFor(points[points.length-1].minute,w,pad,current);
  return `M ${first.toFixed(1)} ${base.toFixed(1)} ${body} L ${last.toFixed(1)} ${base.toFixed(1)} Z`;
}
function xFor(minute,w,pad,current){return pad.left+(clamp(minute,0,current)/Math.max(1,current))*(w-pad.left-pad.right)}
function yFor(value,h,pad){const v=clamp(value,1,100);return pad.top+((100-v)/99)*(h-pad.top-pad.bottom)}
function flowGrid(w,h,pad,current){
  const ys=[100,75,50,25,1].map(v=>{const y=yFor(v,h,pad);return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="expand-flow-grid${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" text-anchor="end" class="expand-flow-axis">${v}%</text>`}).join('');
  const step=current<=30?5:current<=60?10:15,marks=[0];for(let m=step;m<current;m+=step)marks.push(m);if(!marks.includes(current))marks.push(current);
  const xs=marks.map(m=>{const x=xFor(m,w,pad,current);return `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="expand-flow-grid v"/><text x="${x}" y="${h-7}" text-anchor="middle" class="expand-flow-axis">${m}'</text>`}).join('');
  return ys+xs;
}
function renderFlow(f,history){
  const current=currentMinute(f,history),points=flowPoints(history,current),home=esc(f?.home?.name||'HOME'),away=esc(f?.away?.name||'AWAY');
  if(!points.length)return `<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'</b></div><small>1–100% · Engine history</small></div><div class="expand-empty">กำลังสะสม Event Flow ของคู่นี้</div>`;
  const w=1000,h=232,pad={left:42,right:18,top:14,bottom:30},last=points[points.length-1],hx=xFor(last.minute,w,pad,current),hy=yFor(last.home,h,pad),ay=yFor(last.away,h,pad),safe=norm(fixtureId(f))||'flow';
  return `<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'</b></div><small>Attack pressure · 1–100%</small></div><div class="expand-flow-legend"><span class="home"><i></i>${home} <b>${Math.round(last.home)}%</b></span><span class="away"><i></i>${away} <b>${Math.round(last.away)}%</b></span><small>${points.length} points · missing early history stays blank</small></div><div class="expand-flow-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Event flow from minute zero to current minute"><defs><linearGradient id="eh-${safe}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#31b878" stop-opacity=".22"/><stop offset="100%" stop-color="#31b878" stop-opacity="0"/></linearGradient><linearGradient id="ea-${safe}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e2c94c" stop-opacity=".20"/><stop offset="100%" stop-color="#e2c94c" stop-opacity="0"/></linearGradient></defs>${flowGrid(w,h,pad,current)}<path d="${areaLine(points,'home',w,h,pad,current)}" fill="url(#eh-${safe})" class="expand-flow-area"/><path d="${areaLine(points,'away',w,h,pad,current)}" fill="url(#ea-${safe})" class="expand-flow-area"/><path d="${pathLine(points,'home',w,h,pad,current)}" class="expand-flow-line home"/><path d="${pathLine(points,'away',w,h,pad,current)}" class="expand-flow-line away"/><circle cx="${hx}" cy="${hy}" r="2.4" class="expand-flow-end home"/><circle cx="${hx}" cy="${ay}" r="2.4" class="expand-flow-end away"/></svg></div>`;
}
function shell(id){
  const el=document.createElement('section');el.className='match-expanded';el.dataset.expandedMatch=id;el.dataset.oddsRenderOwner=ODDS_RENDER_OWNER;
  el.innerHTML=`<div class="match-expanded-inner"><section class="expand-card expand-flow-card"><div class="expand-loading">Loading Event Flow…</div></section><section class="expand-card expand-full-market-card" data-full-market-card><div class="expand-loading">Loading Full Market from Bulk Snapshot…</div></section></div>`;
  return el;
}
function setHtmlIfChanged(node,html){if(node&&node.innerHTML!==html)node.innerHTML=html}
function publishFixture(el,fixture){
  if(!fixture||!el)return;
  el._nomadFixture=fixture;
  el.dispatchEvent(new CustomEvent('nomad343:fixture-ready',{bubbles:true,detail:{fixtureId:fixtureId(fixture),fixture}}));
}
function currentRow(id=expandedId){return id?document.querySelector(`.match-row[data-match-id="${CSS.escape(String(id))}"]`):null}
function captureAnchor(){const row=currentRow();if(!row)return;const top=row.getBoundingClientRect().top;if(Number.isFinite(top))lastAnchorTop=top}
function ensurePlacement(){
  placementQueued=false;if(!expandedId||!expandedEl)return;
  const row=currentRow();if(!row)return;
  if(expandedEl.previousElementSibling!==row)row.insertAdjacentElement('afterend',expandedEl);
  row.setAttribute('aria-expanded','true');
  const top=row.getBoundingClientRect().top;
  if(lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible')window.scrollBy(0,delta)}
  if(Number.isFinite(top))lastAnchorTop=row.getBoundingClientRect().top;
}
function queuePlacement(){if(placementQueued)return;placementQueued=true;queueMicrotask(ensurePlacement)}
async function refreshExpanded(force=false){
  const id=expandedId,el=expandedEl;if(!id||!el)return;const seq=++refreshSeq;
  try{
    const [boardRes,histRes]=await Promise.allSettled([getBoard(force),getHistory(id,force)]);if(seq!==refreshSeq||expandedId!==id||expandedEl!==el)return;
    const board=boardRes.status==='fulfilled'?boardRes.value:null,fixture=board?findFixture(board,id):null,flow=el.querySelector('.expand-flow-card'),full=el.querySelector('[data-full-market-card]');
    if(fixture&&histRes.status==='fulfilled')setHtmlIfChanged(flow,renderFlow(fixture,histRes.value));
    else if(flow)setHtmlIfChanged(flow,`<div class="expand-card-head"><div><span>EVENT FLOW</span><b>Unavailable</b></div></div><div class="expand-empty">${esc(histRes.status==='rejected'?histRes.reason?.message:'Fixture not found')}</div>`);
    if(fixture)publishFixture(el,fixture);else if(full&&!full.querySelector('.fmb-head'))setHtmlIfChanged(full,`<div class="expand-card-head"><div><span>FULL MARKET</span><b>Unavailable</b></div></div><div class="expand-empty">${esc(boardRes.status==='rejected'?boardRes.reason?.message:'Fixture not found')}</div>`);
  }catch(err){console.warn('Expanded refresh failed',err)}
}
function scheduleRefresh(force=false){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(expandedId){queuePlacement();refreshExpanded(force)}},60)}
function openExpanded(id){
  const sid=String(id||'');if(!sid)return;
  if(expandedId===sid){closeExpanded();return}
  document.querySelectorAll('.match-row[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'));
  expandedId=sid;refreshSeq++;lastAnchorTop=null;
  if(expandedEl)expandedEl.remove();expandedEl=shell(sid);
  setTimeout(()=>{const row=currentRow(sid);if(!row||expandedId!==sid)return;row.insertAdjacentElement('afterend',expandedEl);row.setAttribute('aria-expanded','true');captureAnchor();refreshExpanded(true)},0);
}
function closeExpanded(){
  expandedId=null;refreshSeq++;clearTimeout(refreshTimer);if(expandedEl)expandedEl.remove();expandedEl=null;lastAnchorTop=null;
  document.querySelectorAll('.match-row[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'));
}
function init(){
  const board=$('[data-board-sections]');if(!board)return;
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-fmb-book]'))return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);
  new MutationObserver(records=>{
    if(!expandedId||!expandedEl)return;
    const external=records.some(record=>!expandedEl.contains(record.target));
    if(!external)return;
    queuePlacement();scheduleRefresh(false);
  }).observe(board,{childList:true,subtree:true});
  const recapture=()=>{if(expandedId&&expandedEl?.isConnected)captureAnchor()};
  window.addEventListener('scroll',recapture,{passive:true});window.addEventListener('resize',recapture,{passive:true});setInterval(recapture,500);
  window.NOMAD343_EXPANDED_MATCH={version:VERSION,oddsRenderOwner:ODDS_RENDER_OWNER,open:openExpanded,close:closeExpanded,reload:()=>expandedId&&refreshExpanded(true),getFixture:id=>{const b=boardCache.data;return b?findFixture(b,id):null}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
