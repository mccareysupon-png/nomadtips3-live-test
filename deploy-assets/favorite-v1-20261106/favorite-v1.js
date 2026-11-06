/* BALL46_FAVORITE_V1_TEST_20261106 */
(()=>{
'use strict';
const STORAGE_KEY='ball46_favorites_v1';
const MAX_AGE=30*24*60*60*1000;
const STAR_SELECTOR='[data-b46-favorite-toggle]';
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
  .match-row{position:relative}
  .b46-fav-btn{appearance:none;border:0;background:transparent;color:#7e8b86;cursor:pointer;display:inline-grid;place-items:center;width:28px;height:28px;padding:0;border-radius:8px;font-size:18px;line-height:1;transition:color .12s ease,background-color .12s ease;flex:0 0 auto}
  .b46-fav-btn:hover{background:rgba(255,255,255,.06)}
  .b46-fav-btn[aria-pressed="true"]{color:#d8a820}
  .b46-fav-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
  .b46-fav-slot{display:inline-flex;align-items:center;justify-content:center;margin-left:4px}
  .b46-fav-filter{display:flex;align-items:center;justify-content:space-between;width:100%}\n  .match-row.b46-fav-hidden{display:none!important}
  .b46-fav-filter .b46-fav-filter-star{color:#d8a820;margin-right:6px}
  @media(max-width:760px){
    .b46-fav-btn{width:36px;height:36px;font-size:20px;border-radius:10px}
    .b46-fav-slot{margin-left:2px}
  }`;
  document.head.appendChild(s);
}
function rowId(row){return row?.getAttribute('data-match-id')||''}
function ensureStar(row){
  if(!row||row.querySelector(STAR_SELECTOR))return;
  const id=rowId(row);if(!id)return;
  const slot=document.createElement('span');slot.className='b46-fav-slot';
  const btn=document.createElement('button');
  btn.type='button';btn.className='b46-fav-btn';btn.dataset.b46FavoriteToggle=id;
  slot.appendChild(btn);
  const target=row.querySelector('.match-score,.match-main,.match-meta,.match-teams')||row.firstElementChild||row;
  target.appendChild(slot);
}
function ensureFilter(){
  if(document.querySelector('[data-b46-favorite-filter]'))return;
  const statusCard=[...document.querySelectorAll('.rail-card')].find(x=>/MATCH STATUS/i.test(x.textContent||''));
  if(!statusCard)return;
  const btn=document.createElement('button');btn.className='filter b46-fav-filter';btn.type='button';btn.dataset.b46FavoriteFilter='1';
  btn.innerHTML='<span><span class="b46-fav-filter-star">★</span>Favorites</span><b data-b46-favorite-count>0</b>';
  const first=statusCard.querySelector('[data-status-filter]');
  if(first?.nextSibling)statusCard.insertBefore(btn,first.nextSibling);else statusCard.appendChild(btn);
}
function updateStars(){
  document.querySelectorAll('.match-row[data-match-id]').forEach(row=>{
    ensureStar(row);
    const btn=row.querySelector(STAR_SELECTOR);if(!btn)return;
    const fav=isFav(rowId(row));
    btn.textContent=fav?'★':'☆';
    btn.setAttribute('aria-pressed',fav?'true':'false');
    btn.setAttribute('aria-label',fav?'Remove from favorites':'Add to favorites');
    btn.title=fav?'Remove from favorites':'Add to favorites';
  });
}
function updateCount(){
  const el=document.querySelector('[data-b46-favorite-count]');if(el)el.textContent=String(favorites.size);
}
function applyFilter(){
  const active=document.body.dataset.b46FavoriteOnly==='1';
  document.querySelectorAll('.match-row[data-match-id]').forEach(row=>{
    row.classList.toggle('b46-fav-hidden',active&&!isFav(rowId(row)));
  });
  document.querySelector('[data-b46-favorite-filter]')?.classList.toggle('active',active);
}
function repaint(){ensureFilter();updateStars();updateCount();applyFilter()}
function onClick(e){
  const star=e.target.closest?.(STAR_SELECTOR);
  if(star){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();toggle(star.dataset.b46FavoriteToggle);return}
  const filter=e.target.closest?.('[data-b46-favorite-filter]');
  if(filter){e.preventDefault();e.stopPropagation();document.body.dataset.b46FavoriteOnly=document.body.dataset.b46FavoriteOnly==='1'?'0':'1';applyFilter()}
}
function boot(){
  ensureStyle();load();repaint();
  document.addEventListener('click',onClick,true);
  const mo=new MutationObserver(()=>{clearTimeout(boot._t);boot._t=setTimeout(repaint,40)});
  mo.observe(document.body,{subtree:true,childList:true});
  window.BALL46_FAVORITES_V1={version:'test-20261106',toggle,isFavorite:isFav,getIds:()=>[...favorites.keys()],repaint,clear:()=>{favorites.clear();save();repaint()}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();