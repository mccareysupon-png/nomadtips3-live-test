(()=>{
'use strict';
const BOARD_API='/api/engine/board';
const FLOW_POLL_MS=45000;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const qs=()=>new URLSearchParams(location.search);
const validStatus=new Set(['all','live','scheduled','unknown','finished']);
let flowTimer=0;

function classify(f){
  const raw=String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase();
  if(/finish|full.?time|ended|\bft\b/.test(raw))return'finished';
  if(/live|in.?play|playing|\b1h\b|\b2h\b/.test(raw))return'live';
  if(/schedule|upcoming|not.?started|\bns\b/.test(raw))return'scheduled';
  return'unknown';
}
function setCount(key,value){
  $$(`[data-flow-count="${key}"]`).forEach(el=>el.textContent=String(value));
  $$(`[data-board-count="${key}"]`).forEach(el=>el.textContent=String(value));
}
function renderBoardCounts(board){
  const fixtures=Array.isArray(board?.fixtures)?board.fixtures:[];
  const c={all:fixtures.length,live:0,scheduled:0,unknown:0,finished:0};
  fixtures.forEach(f=>{const k=classify(f);c[k]=(c[k]||0)+1});
  Object.entries(c).forEach(([k,v])=>setCount(k,v));
}
async function hydrateSignalWorkspaceCounts(){
  if(document.body?.dataset?.page!=='signal')return;
  try{
    const r=await fetch(`${BOARD_API}?_=${Date.now()}`,{cache:'no-store'});
    const j=await r.json();
    if(!r.ok||j?.ok!==true||!Array.isArray(j?.fixtures))throw new Error('board unavailable');
    renderBoardCounts(j);
  }catch(err){console.warn('Flow board count refresh failed',err)}
}
function mirrorSignalCount(){
  const source=$('[data-signal-count]')||$('[data-next-active-signals]');
  const targets=$$('[data-flow-signal-count]');
  if(!source||!targets.length)return;
  const sync=()=>targets.forEach(target=>{target.textContent=source.textContent||'0'});
  sync();
  new MutationObserver(sync).observe(source,{childList:true,characterData:true,subtree:true});
}
function applyStatusFromUrl(){
  if(document.body?.dataset?.page!=='live')return;
  const status=qs().get('status');
  if(!status||!validStatus.has(status)||status==='all')return;
  const btn=$(`[data-status-filter="${status}"]`);
  if(btn&&!btn.classList.contains('active'))btn.click();
}
function bindStatusToUrl(){
  if(document.body?.dataset?.page!=='live')return;
  $$('[data-status-filter]').forEach(btn=>{
    if(btn.dataset.flowUrlBound==='1')return;
    btn.dataset.flowUrlBound='1';
    btn.addEventListener('click',()=>{
      const status=btn.dataset.statusFilter||'all';
      const q=qs();
      if(status==='all')q.delete('status');else q.set('status',status);
      q.delete('match');
      const next=`${location.pathname}${q.toString()?`?${q}`:''}`;
      history.replaceState(null,'',next);
    });
  });
}
function focusRequestedMatch(){
  if(document.body?.dataset?.page!=='live')return;
  const id=qs().get('match');if(!id)return;
  const find=()=>{
    let row=null;
    try{row=document.querySelector(`[data-match-id="${CSS.escape(id)}"]`)}catch{}
    if(!row)return false;
    row.click();
    row.scrollIntoView({behavior:'smooth',block:'center'});
    row.classList.add('flow-focus');
    setTimeout(()=>row.classList.remove('flow-focus'),1800);
    return true;
  };
  if(find())return;
  const root=$('[data-board-sections]');if(!root)return;
  const obs=new MutationObserver(()=>{if(find())obs.disconnect()});
  obs.observe(root,{childList:true,subtree:true});
  setTimeout(()=>obs.disconnect(),15000);
}
function bindLiveSignalDeepLinks(){
  if(document.body?.dataset?.page!=='live')return;
  document.addEventListener('click',e=>{
    const cell=e.target.closest('.signal-cell.locked');
    if(!cell)return;
    const row=cell.closest('[data-match-id]');if(!row)return;
    e.preventDefault();e.stopPropagation();
    location.href=`signal-flow-preview.html?fixture=${encodeURIComponent(row.dataset.matchId||'')}`;
  },true);
}
function marketFromText(text){
  const x=String(text||'').toLowerCase();
  if(/corner/.test(x))return'corners';
  if(/card/.test(x))return'cards';
  if(/btts|both teams/.test(x))return'btts';
  if(/asian|handicap|\bah\b/.test(x))return'ah';
  if(/over|under|o\/u|total/.test(x))return'ou';
  if(/1x2|match result|moneyline|winner/.test(x))return'1x2';
  return'all';
}
function decorateSignalCards(){
  if(document.body?.dataset?.page!=='signal')return;
  $$('[data-next-card]').forEach(card=>{
    if(card.dataset.flowDecorated==='1')return;
    card.dataset.flowDecorated='1';
    const fixture=card.getAttribute('data-next-card')||'';
    const market=marketFromText(card.querySelector('.next-market-name')?.textContent);
    const actions=document.createElement('div');
    actions.className='flow-context-actions';
    actions.innerHTML=`<a href="index-flow-preview.html?match=${encodeURIComponent(fixture)}">View match</a><a href="statistics-v2-preview.html${market==='all'?'':`?market=${market}`}">View statistics</a>`;
    const detail=card.querySelector('.next-signal-detail');
    if(detail)card.insertBefore(actions,detail);else card.appendChild(actions);
  });
}
function focusRequestedSignal(){
  if(document.body?.dataset?.page!=='signal')return;
  const id=qs().get('fixture');if(!id)return;
  const find=()=>{
    let card=null;
    try{card=document.querySelector(`[data-next-card="${CSS.escape(id)}"]`)}catch{}
    if(!card)return false;
    const toggle=card.querySelector('[data-next-toggle]');
    if(toggle&&toggle.getAttribute('aria-expanded')!=='true')toggle.click();
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('flow-focus');
    setTimeout(()=>card.classList.remove('flow-focus'),1800);
    return true;
  };
  if(find())return;
  const root=$('[data-next-signal-list]');if(!root)return;
  const obs=new MutationObserver(()=>{decorateSignalCards();if(find())obs.disconnect()});
  obs.observe(root,{childList:true,subtree:true});
  setTimeout(()=>obs.disconnect(),15000);
}
function observeSignalCards(){
  if(document.body?.dataset?.page!=='signal')return;
  const root=$('[data-next-signal-list]');if(!root)return;
  const run=()=>decorateSignalCards();
  run();
  new MutationObserver(run).observe(root,{childList:true,subtree:true});
}
function init(){
  applyStatusFromUrl();
  bindStatusToUrl();
  mirrorSignalCount();
  bindLiveSignalDeepLinks();
  observeSignalCards();
  focusRequestedMatch();
  focusRequestedSignal();
  hydrateSignalWorkspaceCounts();
  if(document.body?.dataset?.page==='signal')flowTimer=setInterval(hydrateSignalWorkspaceCounts,FLOW_POLL_MS);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('beforeunload',()=>{if(flowTimer)clearInterval(flowTimer)},{once:true});
})();
