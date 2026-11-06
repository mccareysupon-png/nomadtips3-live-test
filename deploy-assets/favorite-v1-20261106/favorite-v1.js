/* BALL46_FAVORITE_V1_TEST_20261106 */
(()=>{
'use strict';
const STORAGE_KEY='ball46_favorites_v1';
const MAX_AGE=30*24*60*60*1000;
const STAR_SELECTOR='[data-b46-favorite-toggle]';
const DESKTOP_ROW_SELECTOR='.match-row[data-match-id]';
const MOBILE_CARD_SELECTOR='.b46gn-card[data-b46gn-fixture]';
let favorites=new Map();

function now(){return Date.now()}
function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    const t=now();
    const next=new Map();
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
      for(const [id,v] of Object.entries(raw)){
        const at=Number(v?.addedAt||v||0);
        if(id&&Number.isFinite(at)&&t-at<=MAX_AGE)next.set(String(id),{addedAt:at});
      }
    }
    favorites=next;
    save();
  }catch{favorites=new Map()}
}
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(Object.fromEntries(favorites)))}catch{}
}
function isFav(id){return favorites.has(String(id))}
function toggle(id){
  id=String(id||''); if(!id)return;
  if(isFav(id))favorites.delete(id);else favorites.set(id,{addedAt:now()});
  save(); repaint();
}
function ensureStyle(){
  if(document.getElementById('b46-favorite-v1-style'))return;
  const s=document.createElement('style');s.id='b46-favorite-v1-style';
  s.textContent=`
  .match-row{position:relative;padding-left:38px!important;box-sizing:border-box}
  :root{--b46-fav-yellow:#d9aa16;--b46-fav-hover:rgba(217,170,22,.10);--b46-fav-focus:rgba(217,170,22,.35)}
  html[data-theme="dark"]{--b46-fav-yellow:#ffd43b;--b46-fav-hover:rgba(255,212,59,.11);--b46-fav-focus:rgba(255,212,59,.42)}
  html[data-theme="light"]{--b46-fav-yellow:#c99700;--b46-fav-hover:rgba(201,151,0,.09);--b46-fav-focus:rgba(201,151,0,.30)}
  .b46-fav-btn{appearance:none;border:0;background:transparent;color:var(--b46-fav-yellow);cursor:pointer;display:grid;place-items:center;width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;max-width:36px!important;max-height:36px!important;padding:0;border-radius:8px;font-size:20px;line-height:1;transition:background-color .12s ease,transform .12s ease;flex:0 0 36px!important}
  .b46-fav-btn:hover{background:var(--b46-fav-hover)}
  .b46-fav-btn[aria-pressed="true"]{color:var(--b46-fav-yellow)}
  .b46-fav-btn:focus-visible{outline:2px solid var(--b46-fav-focus);outline-offset:1px}
  .b46-fav-slot{position:absolute;left:1px;top:50%;transform:translateY(-50%);z-index:3;display:grid;place-items:center;width:36px;height:36px;margin:0}
  .b46-fav-filter{display:flex;align-items:center;justify-content:space-between;width:100%}\n  .match-row.b46-fav-hidden,.b46gn-card.b46-fav-hidden{display:none!important}\n  .b46gn-card.b46-fav-mobile-ready{position:relative!important;padding-left:38px!important;box-sizing:border-box!important}\n  .b46gn-mobile-fav-btn{position:absolute!important;left:1px!important;right:auto!important;top:50%!important;transform:translateY(-50%)!important;z-index:5!important;width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;display:grid!important;place-items:center!important;border:0!important;border-radius:8px!important;background:transparent!important;color:var(--b46-fav-yellow)!important;font-size:20px!important;line-height:1!important;cursor:pointer!important;box-sizing:border-box!important}\n  .b46gn-mobile-fav-btn:hover{background:var(--b46-fav-hover)!important}\n  .b46gn-mobile-fav-btn[aria-pressed="true"]{color:var(--b46-fav-yellow)!important}\n  .b46gn-mobile-fav-filter{appearance:none;border:1px solid rgba(120,150,140,.24);background:transparent;color:inherit;min-height:28px;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;cursor:pointer}\n  .b46gn-mobile-fav-filter.active{border-color:#d8a820;color:#d8a820}
  .b46-fav-filter .b46-fav-filter-star{color:#d8a820;margin-right:6px}
  @media(max-width:760px){
    .b46-fav-btn,.b46gn-mobile-fav-btn{font-size:20px!important}
  }`;
  document.head.appendChild(s);
}
function rowId(row){return row?.getAttribute('data-match-id')||''}
function mobileId(card){return card?.getAttribute('data-b46gn-fixture')||''}
function bindStarPointerIsolation(el){
  if(!el||el.dataset.b46PointerIsolation==='1')return;
  el.dataset.b46PointerIsolation='1';
  const stop=e=>{e.stopPropagation();e.stopImmediatePropagation()};
  el.addEventListener('pointerdown',stop,false);
  el.addEventListener('mousedown',stop,false);
  el.addEventListener('touchstart',stop,{passive:true});
}
function ensureStar(row){
  if(!row||row.querySelector(STAR_SELECTOR))return;
  const id=rowId(row);if(!id)return;
  const slot=document.createElement('span');slot.className='b46-fav-slot';
  const btn=document.createElement('button');
  btn.type='button';btn.className='b46-fav-btn';btn.dataset.b46FavoriteToggle=id;btn.dataset.b46FavoriteSurface='desktop';bindStarPointerIsolation(btn);
  slot.appendChild(btn);
  const target=row.querySelector('.match-score,.match-main,.match-meta,.match-teams')||row.firstElementChild||row;
  target.appendChild(slot);
}
function ensureMobileStar(card){
  if(!card||card.querySelector(STAR_SELECTOR))return;
  const id=mobileId(card);if(!id)return;
  card.classList.add('b46-fav-mobile-ready');
  const star=document.createElement('span');
  star.className='b46gn-mobile-fav-btn';
  star.dataset.b46FavoriteToggle=id;
  star.dataset.b46FavoriteSurface='mobile';
  star.setAttribute('role','button');
  star.setAttribute('tabindex','0');
  bindStarPointerIsolation(star);
  card.appendChild(star);
}
function ensureFilter(){
  if(!document.querySelector('[data-b46-favorite-filter="desktop"]')){
    const statusCard=[...document.querySelectorAll('.rail-card')].find(x=>/MATCH STATUS/i.test(x.textContent||''));
    if(statusCard){
      const btn=document.createElement('button');btn.className='filter b46-fav-filter';btn.type='button';btn.dataset.b46FavoriteFilter='desktop';
      btn.innerHTML='<span><span class="b46-fav-filter-star">★</span>Favorites</span><b data-b46-favorite-count>0</b>';
      const first=statusCard.querySelector('[data-status-filter]');
      if(first?.nextSibling)statusCard.insertBefore(btn,first.nextSibling);else statusCard.appendChild(btn);
    }
  }
  if(!document.querySelector('[data-b46-favorite-filter="mobile"]')){
    const section=[...document.querySelectorAll('.b46gn-section')].find(x=>/All Matches/i.test(x.textContent||''));
    if(section){
      const btn=document.createElement('button');btn.type='button';btn.className='b46gn-mobile-fav-filter';btn.dataset.b46FavoriteFilter='mobile';
      btn.innerHTML='<span>★ Favorites</span><b data-b46-favorite-count>0</b>';
      const see=section.querySelector('.b46gn-seeall');
      if(see)section.insertBefore(btn,see);else section.appendChild(btn);
    }
  }
}
function paintControl(btn,fav){
  if(!btn)return;
  btn.textContent=fav?'★':'☆';
  btn.setAttribute('aria-pressed',fav?'true':'false');
  btn.setAttribute('aria-label',fav?'Remove from favorites':'Add to favorites');
  btn.title=fav?'Remove from favorites':'Add to favorites';
}
function updateStars(){
  document.querySelectorAll(DESKTOP_ROW_SELECTOR).forEach(row=>{
    ensureStar(row);paintControl(row.querySelector(STAR_SELECTOR),isFav(rowId(row)));
  });
  document.querySelectorAll(MOBILE_CARD_SELECTOR).forEach(card=>{
    ensureMobileStar(card);paintControl(card.querySelector(STAR_SELECTOR),isFav(mobileId(card)));
  });
}
function updateCount(){
  document.querySelectorAll('[data-b46-favorite-count]').forEach(el=>el.textContent=String(favorites.size));
}
function applyFilter(){
  const active=document.body.dataset.b46FavoriteOnly==='1';
  document.querySelectorAll(DESKTOP_ROW_SELECTOR).forEach(row=>{
    row.classList.toggle('b46-fav-hidden',active&&!isFav(rowId(row)));
  });
  document.querySelectorAll(MOBILE_CARD_SELECTOR).forEach(card=>{
    card.classList.toggle('b46-fav-hidden',active&&!isFav(mobileId(card)));
  });
  document.querySelectorAll('[data-b46-favorite-filter]').forEach(x=>x.classList.toggle('active',active));
}
function repaint(){ensureFilter();updateStars();updateCount();applyFilter()}
function onClick(e){
  const star=e.target.closest?.(STAR_SELECTOR);
  if(star){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();toggle(star.dataset.b46FavoriteToggle);return}
  const filter=e.target.closest?.('[data-b46-favorite-filter]');
  if(filter){e.preventDefault();e.stopPropagation();document.body.dataset.b46FavoriteOnly=document.body.dataset.b46FavoriteOnly==='1'?'0':'1';applyFilter()}
}
function onKeydown(e){
  if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('[data-b46-favorite-surface="mobile"]')){
    e.preventDefault();e.stopPropagation();toggle(e.target.dataset.b46FavoriteToggle);
  }
}
function boot(){
  ensureStyle();load();repaint();
  document.addEventListener('click',onClick,true);
  document.addEventListener('keydown',onKeydown,true);
  const mo=new MutationObserver(()=>{clearTimeout(boot._t);boot._t=setTimeout(repaint,40)});
  mo.observe(document.body,{subtree:true,childList:true});
  window.BALL46_FAVORITES_V1={version:'v1.1-fixed-20261106',toggle,isFavorite:isFav,getIds:()=>[...favorites.keys()],repaint,clear:()=>{favorites.clear();save();repaint()}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();