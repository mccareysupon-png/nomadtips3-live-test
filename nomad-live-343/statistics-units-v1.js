(()=>{
'use strict';
const EVENT='ball46:statistics';
const ROOT_CLASS='b46-unit-performance-v1';
const nf=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
const signed=(v,d=2)=>Number.isFinite(Number(v))?`${Number(v)>0?'+':''}${Number(v).toFixed(d)}`:'—';
const pct=v=>Number.isFinite(Number(v))?`${Number(v)>0?'+':''}${Number(v).toFixed(1)}%`:'—';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const resultOf=r=>String(r?.result||'').toUpperCase();
const settled=r=>String(r?.status||'SETTLED').toUpperCase()==='SETTLED';
const stamp=(r,i)=>{
  const candidates=[r?.settledAt,r?.settlementAt,r?.finishedAt,r?.finalAt,r?.updatedAt,r?.createdAt];
  for(const v of candidates){const n=Number(v);if(Number.isFinite(n)&&n>0)return n}
  return i;
};
function unitChange(r){
  const x=resultOf(r),o=num(r?.odds);
  if(x==='WIN') return o!==null&&o>1?o-1:null;
  if(x==='HALF_WIN') return o!==null&&o>1?(o-1)/2:null;
  if(x==='LOSS') return -1;
  if(x==='HALF_LOSS') return -.5;
  if(x==='PUSH') return 0;
  return null;
}
function selection(r){
  const x=String(r?.selection||'').toUpperCase();
  if(x==='HOME')return r?.home?.name||'HOME';
  if(x==='AWAY')return r?.away?.name||'AWAY';
  if(x==='DRAW')return'DRAW';
  return r?.selection||'—';
}
function lineText(r){const n=num(r?.line);if(n===null)return'';return `${n>0?'+':''}${Math.round(n*1000)/1000}`}
function rowLabel(r){return `${r?.home?.name||'—'} — ${r?.away?.name||'—'}`}
function summarize(input){
  const source=(Array.isArray(input)?input:[]).map((r,i)=>({r,i,t:stamp(r,i)})).filter(x=>settled(x.r)).sort((a,b)=>a.t-b.t||a.i-b.i);
  let net=0,peak=0,maxDrawdown=0;
  const points=[{seq:0,net:0,start:true}];
  const eligible=[];
  let win=0,halfWin=0,loss=0,halfLoss=0,push=0,unpriced=0;
  for(const x of source){
    const res=resultOf(x.r);
    if(res==='WIN')win++; else if(res==='HALF_WIN')halfWin++; else if(res==='LOSS')loss++; else if(res==='HALF_LOSS')halfLoss++; else if(res==='PUSH')push++; else continue;
    const delta=unitChange(x.r);
    if(delta===null){unpriced++;continue}
    net+=delta;
    peak=Math.max(peak,net);
    maxDrawdown=Math.max(maxDrawdown,peak-net);
    const p={seq:eligible.length+1,net,delta,row:x.r,result:res};
    eligible.push(p);points.push(p);
  }
  const decisions=win+halfWin+loss+halfLoss;
  const winRate=decisions?((win+.5*halfWin)/decisions)*100:null;
  const stake=eligible.length;
  const roi=stake?net/stake*100:null;
  const last=eligible.slice(-10);
  const lastNet=last.reduce((s,p)=>s+p.delta,0);
  const countLast=x=>last.filter(p=>p.result===x).length;
  return {
    sourceCount:source.length,eligibleCount:eligible.length,points,eligible,net,roi,peak,maxDrawdown,win,halfWin,loss,halfLoss,push,unpriced,winRate,
    w:win+halfWin,l:loss+halfLoss,last:{count:last.length,net:lastNet,w:countLast('WIN')+countLast('HALF_WIN'),l:countLast('LOSS')+countLast('HALF_LOSS'),p:countLast('PUSH'),hw:countLast('HALF_WIN'),hl:countLast('HALF_LOSS')}
  };
}
function bounds(points){
  const vals=points.map(p=>p.net).concat([0]);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(min===max){min-=1;max+=1}
  const span=Math.max(1,max-min),pad=Math.max(.5,span*.12);
  min-=pad;max+=pad;
  return {min,max};
}
function chartMarkup(summary,compact=false){
  const pts=summary.points||[];
  if(pts.length<2)return `<div class="unit-chart-empty">No settled unit history yet.</div>`;
  const W=compact?220:1000,H=compact?54:280;
  const pad=compact?{l:2,r:2,t:4,b:4}:{l:54,r:22,t:20,b:38};
  const iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,b=bounds(pts),n=Math.max(1,pts.length-1);
  const x=i=>pad.l+(i/n)*iw;
  const y=v=>pad.t+((b.max-v)/(b.max-b.min))*ih;
  const path=pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ');
  if(compact)return `<svg class="unit-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="unit-spark-zero" d="M${pad.l},${y(0).toFixed(1)} L${W-pad.r},${y(0).toFixed(1)}"></path><path class="unit-spark-line" d="${path}"></path></svg>`;
  const ticks=5,grid=[];
  for(let i=0;i<ticks;i++){
    const v=b.max-(i/(ticks-1))*(b.max-b.min),yy=y(v);
    grid.push(`<g><line class="unit-grid-line" x1="${pad.l}" y1="${yy.toFixed(1)}" x2="${W-pad.r}" y2="${yy.toFixed(1)}"></line><text class="unit-axis-text" x="${pad.l-10}" y="${(yy+4).toFixed(1)}" text-anchor="end">${signed(v,1)}</text></g>`);
  }
  const zeroY=y(0),xTicks=[0,.25,.5,.75,1].map(q=>Math.round(n*q)).filter((v,i,a)=>a.indexOf(v)===i);
  const xLabels=xTicks.map(i=>`<text class="unit-axis-text unit-axis-x" x="${x(i).toFixed(1)}" y="${H-12}" text-anchor="middle">${i===0?'0':i}</text>`).join('');
  const area=`M${x(0).toFixed(1)},${zeroY.toFixed(1)} ${pts.map((p,i)=>`L${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ')} L${x(n).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const last=pts[pts.length-1];
  return `<div class="unit-chart" data-unit-chart><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Cumulative net units chart">${grid.join('')}<path class="unit-chart-area" d="${area}"></path><line class="unit-zero-line" x1="${pad.l}" y1="${zeroY.toFixed(1)}" x2="${W-pad.r}" y2="${zeroY.toFixed(1)}"></line><text class="unit-zero-label" x="${pad.l+7}" y="${Math.max(13,zeroY-6).toFixed(1)}">0u</text>${xLabels}<path class="unit-main-line" d="${path}"></path><circle class="unit-last-dot" cx="${x(n).toFixed(1)}" cy="${y(last.net).toFixed(1)}" r="5"></circle><line class="unit-hover-guide" data-unit-guide x1="0" y1="${pad.t}" x2="0" y2="${H-pad.b}"></line><circle class="unit-hover-dot" data-unit-dot cx="0" cy="0" r="6"></circle><rect class="unit-hit" data-unit-hit x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}"></rect></svg><div class="unit-tooltip" data-unit-tooltip></div></div>`;
}
function tooltipHtml(p){
  if(!p||p.start)return `<b>Start</b><span>0.00u</span>`;
  const r=p.row||{},odds=num(r?.odds),line=lineText(r),market=r?.marketLabel||r?.market||'—';
  return `<b>${esc(rowLabel(r))}</b><span>${esc(market)} · ${esc(selection(r))}${line?' '+esc(line):''}</span><span>Odds ${odds===null?'—':odds.toFixed(2)} · ${esc(p.result)}</span><strong class="${p.delta>=0?'positive':'negative'}">${signed(p.delta,2)}u · Net ${signed(p.net,2)}u</strong>`;
}
function bindChart(el,summary){
  if(!el)return;
  const hit=el.querySelector('[data-unit-hit]'),guide=el.querySelector('[data-unit-guide]'),dot=el.querySelector('[data-unit-dot]'),tip=el.querySelector('[data-unit-tooltip]');
  if(!hit||!guide||!dot||!tip||summary.points.length<2)return;
  const svg=el.querySelector('svg'),pts=summary.points,n=pts.length-1,W=1000,H=280,pad={l:54,r:22,t:20,b:38},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,b=bounds(pts);
  const sx=i=>pad.l+(i/n)*iw,sy=v=>pad.t+((b.max-v)/(b.max-b.min))*ih;
  const showAt=ev=>{
    const rect=svg.getBoundingClientRect(),px=Math.max(0,Math.min(rect.width,(ev.clientX??ev.touches?.[0]?.clientX??rect.left)-rect.left)),ratio=(px/rect.width*W-pad.l)/iw,index=Math.max(0,Math.min(n,Math.round(ratio*n))),p=pts[index],xx=sx(index),yy=sy(p.net);
    guide.setAttribute('x1',xx);guide.setAttribute('x2',xx);dot.setAttribute('cx',xx);dot.setAttribute('cy',yy);tip.innerHTML=tooltipHtml(p);tip.classList.add('show');guide.classList.add('show');dot.classList.add('show');
    const left=Math.max(8,Math.min(el.clientWidth-190,(xx/W)*el.clientWidth));tip.style.left=`${left}px`;tip.style.top=`${Math.max(8,(yy/H)*el.clientHeight-78)}px`;
  };
  hit.addEventListener('pointermove',showAt);hit.addEventListener('pointerdown',showAt);hit.addEventListener('pointerleave',()=>{tip.classList.remove('show');guide.classList.remove('show');dot.classList.remove('show')});
}
function metric(label,value,cls=''){return `<span class="unit-metric"><small>${esc(label)}</small><b class="${cls}">${value}</b></span>`}
function wlp(s){return `<div class="unit-wlp"><span class="win"><b>${s.w}</b> W</span><span class="loss"><b>${s.l}</b> L</span><span class="push"><b>${s.push}</b> P</span>${s.halfWin||s.halfLoss?`<span class="half">HW ${s.halfWin} · HL ${s.halfLoss}</span>`:''}</div>`}
function lastText(s){return s.last.count?`${s.last.w}W · ${s.last.l}L · ${s.last.p}P · ${signed(s.last.net,2)}u`:'—'}
function ensureOverallShell(){
  let el=document.querySelector('[data-unit-performance]');
  if(el)return el;
  const anchor=document.querySelector('.market-performance-title');
  if(!anchor)return null;
  el=document.createElement('section');el.className=`unit-performance-shell ${ROOT_CLASS}`;el.setAttribute('data-unit-performance','');anchor.parentNode.insertBefore(el,anchor);return el;
}
function renderOverall(summary){
  const el=ensureOverallShell();if(!el)return;
  const netCls=summary.net>=0?'positive':'negative';
  el.innerHTML=`<article class="unit-overall-card"><div class="unit-overall-head"><div><span class="unit-kicker">PERFORMANCE TREND</span><h2>Overall Cumulative Net Units</h2><p>Fixed stake: 1.00 unit per settled signal · starts at 0.00u</p></div><div class="unit-current"><small>CURRENT NET</small><strong class="${netCls}">${signed(summary.net,2)}u</strong></div></div><div class="unit-overall-stats">${metric('Settled',String(summary.sourceCount))}${metric('Unit samples',String(summary.eligibleCount))}${metric('ROI',pct(summary.roi),netCls)}${metric('Max drawdown',`${nf(summary.maxDrawdown,2)}u`,'')}${metric('Last 10',esc(lastText(summary)),summary.last.net>=0?'positive':'negative')}</div>${wlp(summary)}<div class="unit-chart-frame"><div class="unit-chart-title"><span>CUMULATIVE NET UNITS</span><small>Hover or tap the line to inspect a settled signal</small></div>${chartMarkup(summary,false)}</div>${summary.unpriced?`<p class="unit-data-note">${summary.unpriced} settled win/half-win item(s) are excluded from the unit curve because a valid recorded entry price was not available. No substitute odds are used.</p>`:''}</article>`;
  bindChart(el.querySelector('[data-unit-chart]'),summary);
}
function marketDefs(j,rows){
  const defs=j?.markets&&typeof j.markets==='object'?j.markets:{};
  const keys=Object.keys(defs),seen=new Set(keys);
  for(const r of rows){if(r?.market&&!seen.has(r.market)){seen.add(r.market);keys.push(r.market)}}
  return keys.map(key=>{const sample=rows.find(r=>r?.market===key)||{};return {key,label:defs[key]?.label||sample.marketLabel||key,period:defs[key]?.period||sample.period||'FT'}});
}
function marketCard(def,rows,index){
  const s=summarize(rows),netCls=s.net>=0?'positive':'negative';
  return `<article class="unit-market-card${s.sourceCount?'':' empty'}" data-unit-market-card="${esc(def.key)}"><button type="button" class="unit-market-toggle" data-unit-market-toggle aria-expanded="false"><div class="unit-market-title"><span>${esc(def.period)}</span><h3>${esc(def.label)}</h3><small>${s.sourceCount} settled</small></div><div class="unit-market-net"><small>NET UNITS</small><strong class="${netCls}">${s.eligibleCount?signed(s.net,2)+'u':'—'}</strong><em>ROI ${pct(s.roi)}</em></div><div class="unit-market-spark">${chartMarkup(s,true)}</div><span class="unit-chevron" aria-hidden="true">⌄</span></button><div class="unit-market-summary">${wlp(s)}<div class="unit-market-mini-metrics">${metric('Win rate',s.winRate===null?'—':`${nf(s.winRate,1)}%`)}${metric('Last 10',esc(lastText(s)),s.last.net>=0?'positive':'negative')}${metric('Max DD',`${nf(s.maxDrawdown,2)}u`)}</div></div><div class="unit-market-detail" data-unit-market-detail hidden><div class="unit-detail-head"><div><span>MARKET UNIT CURVE</span><h4>${esc(def.label)} · Cumulative Net Units</h4></div><div>${metric('Peak',`${signed(s.peak,2)}u`,s.peak>=0?'positive':'negative')}${metric('Current',`${signed(s.net,2)}u`,netCls)}${metric('ROI',pct(s.roi),netCls)}</div></div>${chartMarkup(s,false)}${s.unpriced?`<p class="unit-data-note">${s.unpriced} priced-win sample(s) excluded because stored entry odds were unavailable.</p>`:''}</div></article>`;
}
function renderMarkets(j,rows){
  const grid=document.querySelector('[data-next-stat-markets]');if(!grid)return;
  const defs=marketDefs(j,rows);grid.classList.add('unit-market-performance-grid',ROOT_CLASS);
  grid.innerHTML=defs.length?defs.map((d,i)=>marketCard(d,rows.filter(r=>r?.market===d.key),i)).join(''):'<div class="next-empty">No market performance data yet.</div>';
  grid.querySelectorAll('[data-unit-market-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
    const card=btn.closest('[data-unit-market-card]'),detail=card.querySelector('[data-unit-market-detail]'),opening=detail.hidden;
    grid.querySelectorAll('[data-unit-market-card]').forEach(other=>{if(other===card)return;const b=other.querySelector('[data-unit-market-toggle]'),d=other.querySelector('[data-unit-market-detail]');b?.setAttribute('aria-expanded','false');if(d)d.hidden=true;other.classList.remove('open')});
    detail.hidden=!opening;btn.setAttribute('aria-expanded',opening?'true':'false');card.classList.toggle('open',opening);
    if(opening){const def=defs.find(x=>x.key===card.getAttribute('data-unit-market-card'));const s=summarize(rows.filter(r=>r?.market===def?.key));requestAnimationFrame(()=>bindChart(detail.querySelector('[data-unit-chart]'),s));}
  }));
}
function render(j){
  if(!j||j.ok!==true)return;
  const rows=Array.isArray(j.rows)?j.rows:[];
  renderOverall(summarize(rows));
  renderMarkets(j,rows);
}
window.addEventListener(EVENT,e=>render(e.detail));
window.BALL46_STAT_UNITS_V1={render,summarize,unitChange};
})();