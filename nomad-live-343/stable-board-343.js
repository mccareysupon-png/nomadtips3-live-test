(()=>{
'use strict';
const VERSION='343-stable-board-v1';
const NATIVE=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')||Object.getOwnPropertyDescriptor(HTMLElement.prototype,'innerHTML');
if(!NATIVE?.get||!NATIVE?.set)return;

function text(el,sel,value){const n=el.querySelector(sel);if(n&&n.textContent!==value)n.textContent=value}
function html(el,sel,next){const cur=el.querySelector(sel);const src=next.querySelector(sel);if(cur&&src&&cur.innerHTML!==src.innerHTML)NATIVE.set.call(cur,src.innerHTML)}
function syncClass(el,next){
  const keepExpanded=el.classList.contains('expanded');
  el.className=next.className;
  if(keepExpanded)el.classList.add('expanded');
  el.setAttribute('aria-expanded',keepExpanded?'true':'false');
  const detail=el.querySelector('.event-details');if(detail)detail.hidden=!keepExpanded;
}
function patchCard(cur,next){
  syncClass(cur,next);
  const id=next.getAttribute('data-match-id');if(id!==null)cur.setAttribute('data-match-id',id);
  text(cur,'.league-scoreboard',next.querySelector('.league-scoreboard')?.textContent||'');
  text(cur,'.fixture-date',next.querySelector('.fixture-date')?.textContent||'');
  text(cur,'.fixture-clock',next.querySelector('.fixture-clock')?.textContent||'');
  text(cur,'.home-slot .team-name',next.querySelector('.home-slot .team-name')?.textContent||'');
  text(cur,'.away-slot .team-name',next.querySelector('.away-slot .team-name')?.textContent||'');
  html(cur,'.score-core',next);
  html(cur,'.signal-state',next);
  const curStats=cur.querySelector('.evidence-card'),nextStats=next.querySelector('.evidence-card');
  if(curStats&&nextStats&&curStats.innerHTML!==nextStats.innerHTML)NATIVE.set.call(curStats,nextStats.innerHTML);
}
function stableSet(board,markup){
  const tpl=document.createElement('template');NATIVE.set.call(tpl,markup);
  const next=[...tpl.content.children];
  const nextCards=next.filter(n=>n.matches?.('.match-card[data-match-id]'));
  if(!nextCards.length){NATIVE.set.call(board,markup);return}

  const current=new Map([...board.children].filter(n=>n.matches?.('.match-card[data-match-id]')).map(n=>[String(n.dataset.matchId||''),n]));
  const wanted=new Set();
  for(const incoming of nextCards){
    const id=String(incoming.dataset.matchId||'');wanted.add(id);
    const existing=current.get(id);
    if(existing){patchCard(existing,incoming);board.appendChild(existing)}
    else board.appendChild(incoming);
  }
  for(const child of [...board.children]){
    if(child.matches?.('.match-card[data-match-id]')&&!wanted.has(String(child.dataset.matchId||'')))child.remove();
    else if(!child.matches?.('.match-card[data-match-id]'))child.remove();
  }
}

for(const board of document.querySelectorAll('[data-board]')){
  Object.defineProperty(board,'innerHTML',{
    configurable:true,
    get(){return NATIVE.get.call(this)},
    set(value){stableSet(this,String(value??''))}
  });
}

const tick=()=>window.NOMAD343_LIVE?.reload?.();
setInterval(tick,3000);
window.NOMAD343_STABLE_BOARD={version:VERSION};
})();
