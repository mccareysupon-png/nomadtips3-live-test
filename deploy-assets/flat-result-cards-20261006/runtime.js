/* B46_FLAT_RESULT_CARDS_20261006
 * Visual-only enhancer for Ball46 workspace scorebar result cards below Search.
 * Targets the real Production DOM directly; does not alter data, card dimensions,
 * statistics, signals, settlement, bindings, schedules, or engine logic.
 */
(()=>{'use strict';
const MARK='b46-flat-result-card';
const ROOT='.main-board';
const EXCLUDE='#ball46-daily-performance';
const CARD_SEL='.workspace-scorebar-cell.workspace-scorebar-signal-result,.workspace-scorebar-cell.workspace-scorebar-pending';
const icons={
 win:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4a4 4 0 0 1-8 0V3Z"/><path d="M6 5H3v2a4 4 0 0 0 4 4M18 5h3v2a4 4 0 0 1-4 4M12 11v6M8 21h8M9 17h6"/></svg>',
 loss:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
 draw:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h13l-3-3M19 17H6l3 3"/><path d="M18 7l-3 3M6 17l3-3"/></svg>',
 pending:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 4.5 2.6 6 5 9-2.4 3-5 4.5-5 9h10c0-4.5-2.6-6-5-9 2.4-3 5-4.5 5-9H7Z"/></svg>'
};
function norm(v){return String(v||'').replace(/\s+/g,' ').trim()}
function keyFor(card){
  if(card.classList.contains('workspace-scorebar-pending'))return'pending';
  if(card.classList.contains('outcome-win'))return'win';
  if(card.classList.contains('outcome-loss'))return'loss';
  if(card.classList.contains('outcome-draw'))return'draw';
  const raw=norm(card.getAttribute('data-scorebar-signal-result')).toUpperCase();
  if(raw.startsWith('WIN'))return'win';
  if(raw.startsWith('LOSS'))return'loss';
  if(raw==='PUSH'||raw==='DRAW'||raw.startsWith('DRAW'))return'draw';
  return null;
}
function labelFor(card,key){
  const meta=card.querySelector('.workspace-scorebar-meta');
  if(!meta)return null;
  let label=meta.querySelector(':scope > i');
  if(!label)return null;
  label.classList.add('b46-flat-status-label');
  let icon=label.querySelector(':scope > .b46-flat-status-icon');
  if(!icon){
    icon=document.createElement('span');
    icon.className='b46-flat-status-icon';
    icon.setAttribute('aria-hidden','true');
    label.prepend(icon);
  }
  const sig=key;
  if(icon.dataset.b46Icon!==sig){
    icon.innerHTML=icons[key];
    icon.dataset.b46Icon=sig;
  }
  return label;
}
function annotate(card){
  if(!(card instanceof HTMLElement)||card.closest(EXCLUDE))return false;
  const key=keyFor(card);if(!key)return false;
  card.classList.remove('b46-flat-win','b46-flat-loss','b46-flat-draw','b46-flat-pending');
  card.classList.add(MARK,'b46-flat-'+key);
  card.dataset.b46FlatStatus=key;
  labelFor(card,key);
  const metaScore=card.querySelector('.workspace-scorebar-meta > b');
  if(metaScore)metaScore.classList.add('b46-flat-score');
  const match=card.querySelector('.workspace-scorebar-match');
  if(match)match.classList.add('b46-flat-team');
  const market=card.querySelector('.workspace-scorebar-pick > strong');
  if(market)market.classList.add('b46-flat-market');
  const pick=card.querySelector('.workspace-scorebar-pick > em');
  if(pick){
    pick.classList.add('b46-flat-market');
    if(/@\s*\d(?:\.\d+)?/.test(norm(pick.textContent)))pick.classList.add('b46-flat-odds');
  }
  const entry=card.querySelector('.workspace-scorebar-detail-entry');
  const minute=card.querySelector('.workspace-scorebar-detail-minute');
  const current=card.querySelector('.workspace-scorebar-detail-current');
  for(const el of [entry,minute,current])if(el)el.classList.add('b46-flat-meta');
  return true;
}
function scan(){
  const root=document.querySelector(ROOT);if(!root)return 0;
  let count=0;
  root.querySelectorAll(CARD_SEL).forEach(card=>{if(annotate(card))count++});
  return count;
}
let queued=false;
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan()})}
function boot(){
  scan();
  const root=document.querySelector(ROOT)||document.body;
  const mo=new MutationObserver(queue);
  mo.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','data-scorebar-signal-result']});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
  window.addEventListener('pageshow',queue);
  document.addEventListener('ball46:stable-chrome-ready',queue);
  setInterval(queue,5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();