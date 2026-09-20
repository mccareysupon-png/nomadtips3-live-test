(()=>{
'use strict';
const EVENT='ball46:statistics';
let lastAppliedOrder=[];
let pendingOrder=[];

const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const upper=v=>String(v??'').trim().toUpperCase();

function marketDefs(j,rows){
  const defs=j?.markets&&typeof j.markets==='object'?j.markets:{};
  const keys=Object.keys(defs),seen=new Set(keys);
  for(const r of Array.isArray(rows)?rows:[]){
    const key=String(r?.market||'').trim();
    if(key&&!seen.has(key)){seen.add(key);keys.push(key)}
  }
  return keys.map((key,index)=>{
    const sample=(Array.isArray(rows)?rows:[]).find(r=>String(r?.market||'')===String(key))||{};
    return {key,label:defs[key]?.label||sample.marketLabel||key,index};
  });
}

function fixedRank(def){
  const s=upper(`${def?.key||''} ${def?.label||''}`);
  if(/(^|\s)AH(\s|$)|ASIAN|HANDICAP/.test(s))return 0;
  if(/(^|\s)OVER(\s|$)|\bO\/U\b/.test(s))return 1;
  if(/(^|\s)UNDER(\s|$)/.test(s))return 2;
  if(/1X2|MONEYLINE|MATCH\s*WINNER/.test(s))return 3;
  return 100;
}

function rankedOrder(j){
  const unit=window.BALL46_STAT_UNITS_V1;
  if(!unit?.summarize)return [];
  const rows=Array.isArray(j?.rows)?j.rows:[];
  return marketDefs(j,rows).map(def=>{
    const summary=unit.summarize(rows.filter(r=>String(r?.market||'')===String(def.key)));
    const eligible=Number(summary?.eligibleCount)||0;
    const net=finite(summary?.net);
    const roi=finite(summary?.roi);
    const settled=Number(summary?.sourceCount)||0;
    return {
      key:String(def.key),
      eligible:eligible>0,
      net:net===null?Number.NEGATIVE_INFINITY:net,
      roi:roi===null?Number.NEGATIVE_INFINITY:roi,
      settled,
      fixed:fixedRank(def),
      original:def.index
    };
  }).sort((a,b)=>{
    if(a.eligible!==b.eligible)return a.eligible?-1:1;
    if(a.net!==b.net)return b.net-a.net;
    if(a.roi!==b.roi)return b.roi-a.roi;
    if(a.settled!==b.settled)return b.settled-a.settled;
    if(a.fixed!==b.fixed)return a.fixed-b.fixed;
    return a.original-b.original;
  }).map(x=>x.key);
}

function grid(){return document.querySelector('[data-next-stat-markets]')}

function isOpen(){
  const g=grid();
  if(!g)return false;
  return [...g.querySelectorAll('[data-unit-market-card]')].some(card=>{
    const btn=card.querySelector('[data-unit-market-toggle]');
    const detail=card.querySelector('[data-unit-market-detail]');
    return card.classList.contains('open')||btn?.getAttribute('aria-expanded')==='true'||(detail&&!detail.hidden);
  });
}

function applyOrder(order){
  const g=grid();
  if(!g||!Array.isArray(order)||!order.length)return;
  const cards=[...g.querySelectorAll('[data-unit-market-card]')];
  if(!cards.length)return;
  const byKey=new Map(cards.map(card=>[String(card.getAttribute('data-unit-market-card')||''),card]));
  const used=new Set();
  for(const key of order){
    const card=byKey.get(String(key));
    if(card){g.appendChild(card);used.add(card)}
  }
  for(const card of cards){if(!used.has(card))g.appendChild(card)}
  lastAppliedOrder=[...g.querySelectorAll('[data-unit-market-card]')].map(card=>String(card.getAttribute('data-unit-market-card')||''));
  g.dataset.marketRankMode='net-units-desc';
}

function onStatistics(j){
  const next=rankedOrder(j);
  if(!next.length)return;
  pendingOrder=next;
  requestAnimationFrame(()=>{
    // ADD K restore-market callback is registered before this overlay. At this point
    // the expanded state has been restored, so ranking can safely freeze/reapply.
    if(isOpen()){
      if(lastAppliedOrder.length)applyOrder(lastAppliedOrder);
      return;
    }
    applyOrder(pendingOrder);
    pendingOrder=[];
  });
}

window.addEventListener(EVENT,e=>onStatistics(e?.detail||{}));

document.addEventListener('click',e=>{
  if(!e.target.closest('[data-unit-market-toggle]'))return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(isOpen()){
      if(lastAppliedOrder.length)applyOrder(lastAppliedOrder);
      return;
    }
    if(pendingOrder.length){applyOrder(pendingOrder);pendingOrder=[]}
  }));
});

window.BALL46_MARKET_RANK_V1={rankedOrder};
})();
