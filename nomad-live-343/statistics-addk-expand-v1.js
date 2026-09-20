(()=>{
'use strict';
const EVENT='ball46:statistics';
let addkOpen=false;
let openMarketKey=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed=(v,d=2)=>Number.isFinite(Number(v))?`${Number(v)>0?'+':''}${Number(v).toFixed(d)}`:'—';
const pct=v=>Number.isFinite(Number(v))?`${Number(v)>0?'+':''}${Number(v).toFixed(1)}%`:'—';
function bounds(points){const vals=points.map(p=>Number(p.net)||0).concat([0]);let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=1;max+=1}const span=Math.max(1,max-min),pad=Math.max(.5,span*.12);return{min:min-pad,max:max+pad}}
function chart(summary,compact=false){
  const pts=Array.isArray(summary?.points)?summary.points:[];
  if(pts.length<2)return `<div class="unit-chart-empty">No settled ADD K unit history yet.</div>`;
  const W=compact?220:1000,H=compact?54:280,pad=compact?{l:2,r:2,t:4,b:4}:{l:54,r:22,t:20,b:38};
  const iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,b=bounds(pts),n=Math.max(1,pts.length-1),x=i=>pad.l+(i/n)*iw,y=v=>pad.t+((b.max-v)/(b.max-b.min))*ih;
  const path=pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(Number(p.net)||0).toFixed(1)}`).join(' ');
  if(compact)return `<svg class="unit-spark-svg addk-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="unit-spark-zero" d="M${pad.l},${y(0).toFixed(1)} L${W-pad.r},${y(0).toFixed(1)}"></path><path class="unit-spark-line" d="${path}"></path></svg>`;
  const grid=[];for(let i=0;i<5;i++){const v=b.max-(i/4)*(b.max-b.min),yy=y(v);grid.push(`<g><line class="unit-grid-line" x1="${pad.l}" y1="${yy.toFixed(1)}" x2="${W-pad.r}" y2="${yy.toFixed(1)}"></line><text class="unit-axis-text" x="${pad.l-10}" y="${(yy+4).toFixed(1)}" text-anchor="end">${signed(v,1)}</text></g>`)}
  const zeroY=y(0),last=pts[pts.length-1];
  return `<div class="unit-chart addk-unit-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="ADD K cumulative net units chart">${grid.join('')}<line class="unit-zero-line" x1="${pad.l}" y1="${zeroY.toFixed(1)}" x2="${W-pad.r}" y2="${zeroY.toFixed(1)}"></line><text class="unit-zero-label" x="${pad.l+7}" y="${Math.max(13,zeroY-6).toFixed(1)}">0u</text><path class="unit-main-line" d="${path}"></path><circle class="unit-last-dot" cx="${x(n).toFixed(1)}" cy="${y(Number(last.net)||0).toFixed(1)}" r="5"></circle></svg></div>`;
}
function renderAddK(j){
  const unit=window.BALL46_STAT_UNITS_V1;
  const card=document.querySelector('.ceo-performance-card');
  if(!card||!unit?.summarize)return;
  const rows=(Array.isArray(j?.rows)?j.rows:[]).filter(r=>String(r?.strategy||'OWNER').toUpperCase()==='CEO');
  const s=unit.summarize(rows),netCls=s.net>=0?'positive':'negative';
  card.classList.add('b46-addk-expand-v1','b46-unit-performance-v1');
  card.innerHTML=`<button type="button" class="addk-unit-toggle" data-addk-unit-toggle aria-expanded="${addkOpen?'true':'false'}"><div class="addk-unit-title"><span>SPECIAL STRATEGY</span><h2>ADD K PERFORMANCE</h2><small>${s.sourceCount} settled · Win rate ${s.winRate===null?'—':Number(s.winRate).toFixed(1)+'%'}</small></div><div class="addk-unit-net"><small>NET UNITS</small><strong class="${netCls}">${s.eligibleCount?signed(s.net,2)+'u':'—'}</strong><em>ROI ${pct(s.roi)}</em></div><div class="addk-unit-spark">${chart(s,true)}</div><span class="unit-chevron" aria-hidden="true">⌄</span></button><div class="addk-unit-summary"><div class="unit-wlp"><span class="win"><b>${s.w}</b> W</span><span class="loss"><b>${s.l}</b> L</span><span class="push"><b>${s.push}</b> P</span></div><div class="addk-mini-metrics"><span class="unit-metric"><small>Last 10</small><b class="${s.last.net>=0?'positive':'negative'}">${s.last.count?`${s.last.w}W · ${s.last.l}L · ${signed(s.last.net,2)}u`:'—'}</b></span><span class="unit-metric"><small>Max DD</small><b>${Number(s.maxDrawdown||0).toFixed(2)}u</b></span></div></div><div class="addk-unit-detail" data-addk-unit-detail ${addkOpen?'':'hidden'}><div class="unit-detail-head"><div><span>ADD K UNIT CURVE</span><h4>ADD K · Cumulative Net Units</h4></div><div><span class="unit-metric"><small>Peak</small><b class="${s.peak>=0?'positive':'negative'}">${signed(s.peak,2)}u</b></span><span class="unit-metric"><small>Current</small><b class="${netCls}">${signed(s.net,2)}u</b></span><span class="unit-metric"><small>ROI</small><b class="${netCls}">${pct(s.roi)}</b></span></div></div>${chart(s,false)}</div>`;
}
function restoreMarket(){
  if(!openMarketKey)return;
  const card=[...document.querySelectorAll('[data-unit-market-card]')].find(x=>x.getAttribute('data-unit-market-card')===openMarketKey);if(!card)return;
  const btn=card.querySelector('[data-unit-market-toggle]'),detail=card.querySelector('[data-unit-market-detail]');
  if(btn&&detail){detail.hidden=false;btn.setAttribute('aria-expanded','true');card.classList.add('open')}
}
window.addEventListener(EVENT,e=>{renderAddK(e.detail);requestAnimationFrame(restoreMarket)});
document.addEventListener('click',e=>{
  const addk=e.target.closest('[data-addk-unit-toggle]');
  if(addk){addkOpen=!addkOpen;const card=addk.closest('.b46-addk-expand-v1'),detail=card?.querySelector('[data-addk-unit-detail]');if(detail)detail.hidden=!addkOpen;addk.setAttribute('aria-expanded',addkOpen?'true':'false');card?.classList.toggle('open',addkOpen);return}
  const market=e.target.closest('[data-unit-market-toggle]');
  if(market){requestAnimationFrame(()=>{const card=market.closest('[data-unit-market-card]');openMarketKey=market.getAttribute('aria-expanded')==='true'?card?.getAttribute('data-unit-market-card')||null:null})}
});
})();
