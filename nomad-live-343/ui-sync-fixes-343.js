(()=>{
'use strict';
const STAT_API='/api/engine/statistics';
let statLoaded=false;

function syncSignalCount(rows){
  const count=Array.isArray(rows)?rows.length:0;
  const apply=()=>{
    const source=document.querySelector('[data-signal-count]');
    const target=document.querySelector('[data-workspace-signal-count]');
    if(source)source.textContent=String(count);
    if(target)target.textContent=String(count);
  };
  apply();
  setTimeout(apply,0);
  requestAnimationFrame(apply);
}

function marketKey(r){
  const d=window.BALL46_MARKET_REGISTRY?.resolve?.(r);
  if(d?.family)return d.family;
  const x=String(r?.marketLabel||r?.market||r?.providerMarket||'').toLowerCase();
  if(/corner/.test(x))return'corners';
  if(/card/.test(x))return'cards';
  if(/btts|both teams/.test(x))return'btts';
  if(/asian|handicap|\bah\b/.test(x))return'ah';
  if(/over|under|o\/u|total/.test(x))return'ou';
  if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';
  return'other';
}

function paintStatCounts(rows){
  const counts={all:rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};
  rows.forEach(r=>{const k=marketKey(r);if(Object.prototype.hasOwnProperty.call(counts,k))counts[k]++});
  document.querySelectorAll('[data-stat-market]').forEach(btn=>{
    const b=btn.querySelector('b'),k=btn.dataset.statMarket;
    if(b&&Object.prototype.hasOwnProperty.call(counts,k))b.textContent=String(counts[k]);
  });
}

async function loadStatCountsOnce(){
  if(statLoaded)return;
  statLoaded=true;
  try{
    const r=await fetch(`${STAT_API}?menu_count=1`,{cache:'no-store'}),j=await r.json();
    if(!r.ok||j?.ok!==true||!Array.isArray(j?.rows))throw new Error('statistics unavailable');
    paintStatCounts(j.rows);
  }catch(err){
    statLoaded=false;
    console.warn('Statistics menu count preload failed',err);
  }
}

window.addEventListener('ball46:signals-snapshot',e=>{
  const rows=Array.isArray(e.detail?.signals)?e.detail.signals:[];
  syncSignalCount(rows);
});

function init(){
  loadStatCountsOnce();
  const rows=window.NOMAD343_DASHBOARD_V2?.getSignals?.();
  if(Array.isArray(rows))syncSignalCount(rows);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
