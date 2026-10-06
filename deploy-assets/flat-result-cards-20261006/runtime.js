/* B46_FLAT_RESULT_CARDS_20261006
 * Visual-only enhancer for detailed result cards below the search toolbar.
 * Does not alter match/result/statistics data or card dimensions.
 */
(()=>{'use strict';
const MARK='b46-flat-result-card';
const ROOT='.main-board';
const EXCLUDE='#ball46-daily-performance';
const STATUS=/^(WIN|LOSS|DRAW|PUSH|PENDING)$/i;
const SCORE=/^\s*\d{1,2}\s*[-–:]\s*\d{1,2}\s*$/;
const DETAIL=/(ENTRY|FULL\s*TIME|\bFT\b|\bLIVE\b|CORNERS?|BTTS|\bAH\b|OVER|UNDER|@\s*\d)/i;
const icons={
 win:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4a4 4 0 0 1-8 0V3Z"/><path d="M6 5H3v2a4 4 0 0 0 4 4M18 5h3v2a4 4 0 0 1-4 4M12 11v6M8 21h8M9 17h6"/></svg>',
 loss:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
 draw:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h13l-3-3M19 17H6l3 3"/><path d="M18 7l-3 3M6 17l3-3"/></svg>',
 pending:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 4.5 2.6 6 5 9-2.4 3-5 4.5-5 9h10c0-4.5-2.6-6-5-9 2.4-3 5-4.5 5-9H7Z"/></svg>'
};
function norm(s){return String(s||'').replace(/\s+/g,' ').trim()}
function ownText(el){return norm([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.nodeValue).join(' '))}
function statusKey(s){s=String(s||'').toUpperCase();if(s==='WIN')return'win';if(s==='LOSS')return'loss';if(s==='PENDING')return'pending';if(s==='DRAW'||s==='PUSH')return'draw';return null}
function exactStatusElement(el){
  const all=[el,...el.querySelectorAll('*')];
  return all.find(x=>STATUS.test(norm(x.textContent))&&norm(x.textContent).length<=10) || null;
}
function scoreElement(el){
  const all=[...el.querySelectorAll('*')];
  return all.find(x=>SCORE.test(norm(x.textContent))&&norm(x.textContent).length<=9) || null;
}
function qualifies(el,label){
  if(!(el instanceof HTMLElement)||el.matches(EXCLUDE)||el.closest(EXCLUDE))return false;
  const t=norm(el.innerText||el.textContent);
  if(t.length<24||t.length>900)return false;
  const s=norm(label?.textContent);
  if(!STATUS.test(s))return false;
  if(!/(\d{1,2}\s*[-–:]\s*\d{1,2})/.test(t))return false;
  if(!DETAIL.test(t))return false;
  return true;
}
function findCard(label,root){
  let el=label;
  for(let i=0;i<9&&el&&el!==root;i++,el=el.parentElement){
    if(qualifies(el,label))return el;
  }
  return null;
}
function annotate(card,label,key){
  card.classList.remove('b46-flat-win','b46-flat-loss','b46-flat-draw','b46-flat-pending');
  card.classList.add(MARK,'b46-flat-'+key);
  label.classList.add('b46-flat-status-label');
  if(!label.querySelector(':scope > .b46-flat-status-icon')){
    const icon=document.createElement('span');
    icon.className='b46-flat-status-icon';
    icon.setAttribute('aria-hidden','true');
    icon.innerHTML=icons[key];
    label.prepend(icon);
  }
  const score=scoreElement(card);if(score)score.classList.add('b46-flat-score');
  for(const el of card.querySelectorAll('*')){
    if(el===label||el.classList.contains('b46-flat-status-icon')||el.closest('.b46-flat-status-icon'))continue;
    const t=norm(el.textContent);
    if(!t||t.length>180)continue;
    if(SCORE.test(t))el.classList.add('b46-flat-score');
    if(/\s·\s/.test(t)&&!DETAIL.test(t))el.classList.add('b46-flat-team');
    if(/CORNERS?|BTTS|\bAH\b|OVER|UNDER|FULL\s*TIME/i.test(t))el.classList.add('b46-flat-market');
    if(/@\s*\d(?:\.\d+)?/.test(t))el.classList.add('b46-flat-odds');
    if(/ENTRY|\bFT\b|\bLIVE\b|\b\d{1,3}'\b/i.test(t))el.classList.add('b46-flat-meta');
  }
  card.dataset.b46FlatStatus=key;
}
function scan(){
  const root=document.querySelector(ROOT);if(!root)return 0;
  let count=0,seen=new Set();
  const labels=[...root.querySelectorAll('*')].filter(el=>{
    if(el.closest(EXCLUDE))return false;
    const t=norm(el.textContent);
    return STATUS.test(t)&&t.length<=10;
  });
  for(const label of labels){
    const key=statusKey(norm(label.textContent));if(!key)continue;
    const card=findCard(label,root);if(!card||seen.has(card))continue;
    seen.add(card);annotate(card,label,key);count++;
  }
  return count;
}
let queued=false;
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan()})}
function boot(){
  scan();
  const root=document.querySelector(ROOT)||document.body;
  const mo=new MutationObserver(queue);
  mo.observe(root,{childList:true,subtree:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
  window.addEventListener('pageshow',queue);
  setInterval(queue,5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();