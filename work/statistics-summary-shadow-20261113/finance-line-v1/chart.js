(()=>{
'use strict';
const API='/api/engine/statistics';
const CACHE_MS=300000;
const RANGE_DAYS={d7:7,d30:30,d90:90,all:null};
const MARKET_NAMES={all:'Total · All Markets','1x2':'1X2 · Match Result',ah:'AH · Asian Handicap',ou:'Over / Under · Totals',btts:'BTTS · Both Teams To Score',corners:'Corners · All Corner Markets',cards:'Cards · All Card Markets',other:'Other · Remaining Markets'};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const dateMs=v=>{const n=num(v);if(n!==null)return n<1e12?n*1000:n;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:0};
const fmtDate=ms=>{if(!ms)return'—';try{return new Intl.DateTimeFormat(navigator.language||'en-GB',{day:'2-digit',month:'short',year:'2-digit'}).format(new Date(ms))}catch{return'—'}};
const fmtShort=ms=>{if(!ms)return'—';try{return new Intl.DateTimeFormat(navigator.language||'en-GB',{day:'2-digit',month:'short'}).format(new Date(ms))}catch{return'—'}};
let rowsCache=[];
let loadedAt=0;
let loading=null;
let range='all';
let metric='units';
let currentPoints=[];

function marketDef(r){return window.BALL46_MARKET_REGISTRY?.resolve?.(r)||null}
function marketKey(r){const d=marketDef(r);if(d?.family)return d.family;const x=String(r?.marketLabel||r?.market||r?.providerMarket||'').toLowerCase();if(/corner/.test(x))return'corners';if(/card/.test(x))return'cards';if(/btts|both teams/.test(x))return'btts';if(/asian|handicap|\bah\b/.test(x))return'ah';if(/over|under|o\/u|total/.test(x))return'ou';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';return'other'}
function selectionKey(r){const x=String(r?.selection||r?.pick||'').trim().toUpperCase();if(x.includes('HOME'))return'home';if(x.includes('AWAY'))return'away';if(x.includes('DRAW')||x==='X')return'draw';if(x.includes('OVER'))return'over';if(x.includes('UNDER'))return'under';if(x==='YES'||x.includes('BTTS YES'))return'yes';if(x==='NO'||x.includes('BTTS NO'))return'no';return x.toLowerCase().replace(/[^a-z0-9]+/g,'_')||'other'}
function outcome(r){return window.BALL46_STATISTICS_DATA.outcome(r)}
function settlement(r){const o=outcome(r),odds=num(r?.odds);if(o==='PUSH'||o==='VOID')return{profit:0,stake:1,priced:true};if(o==='LOSS')return{profit:-1,stake:1,priced:true};if(o==='HALF_LOSS')return{profit:-.5,stake:1,priced:true};if(o==='WIN'){if(odds===null||odds<=1)return{profit:null,stake:0,priced:false};return{profit:odds-1,stake:1,priced:true}}if(o==='HALF_WIN'){if(odds===null||odds<=1)return{profit:null,stake:0,priced:false};return{profit:(odds-1)/2,stake:1,priced:true}}return{profit:null,stake:0,priced:false}}
function routeFilter(){const q=new URLSearchParams(location.search);return{market:q.get('market')||'all',variant:q.get('variant')||'all',filter:q.get('filter')||'all'}}
function filteredRows(){const f=routeFilter();let rows=rowsCache.slice();if(f.market!=='all')rows=rows.filter(r=>marketKey(r)===f.market);if(f.variant!=='all')rows=rows.filter(r=>marketDef(r)?.key===f.variant);if(f.filter!=='all')rows=rows.filter(r=>selectionKey(r)===f.filter);const days=RANGE_DAYS[range];if(days){const cutoff=Date.now()-days*86400000;rows=rows.filter(r=>dateMs(r?.settledAt??r?.createdAt)>=cutoff)}return rows.sort((a,b)=>dateMs(a?.settledAt??a?.createdAt)-dateMs(b?.settledAt??b?.createdAt))}
function stats(rows){let winCredits=0,wins=0,losses=0,pushes=0,net=0,stake=0,priced=0,oddsSum=0,oddsN=0,peak=0,maxDD=0,trough=0,bestRun=0;const unitPoints=[],roiPoints=[],ratePoints=[];for(const r of rows){const o=outcome(r);winCredits+=o==='WIN'?1:o==='HALF_WIN'?.5:0;if(o==='WIN'||o==='HALF_WIN')wins++;else if(o==='LOSS'||o==='HALF_LOSS')losses++;else if(o==='PUSH'||o==='VOID')pushes++;const odd=num(r?.odds);if(odd!==null&&odd>1){oddsSum+=odd;oddsN++}const s=settlement(r);if(s.priced){priced++;stake+=s.stake;net+=s.profit;peak=Math.max(peak,net);maxDD=Math.max(maxDD,peak-net);trough=Math.min(trough,net);bestRun=Math.max(bestRun,net-trough);unitPoints.push({row:r,value:net,profit:s.profit,date:dateMs(r?.settledAt??r?.createdAt),stake,net});roiPoints.push({row:r,value:stake?net/stake*100:0,profit:s.profit,date:dateMs(r?.settledAt??r?.createdAt),stake,net})}const wl=wins+losses;ratePoints.push({row:r,value:wl?winCredits/wl*100:0,profit:s.profit,date:dateMs(r?.settledAt??r?.createdAt),stake,net})}return{rows:rows.length,wins,losses,pushes,priced,net,stake,roi:stake?net/stake*100:null,avgOdds:oddsN?oddsSum/oddsN:null,maxDD,peak,bestRun,unitPoints,roiPoints,ratePoints}}
function currentTitle(){const f=routeFilter();return $('[data-sp-market-title]')?.textContent?.trim()||MARKET_NAMES[f.market]||'Performance'}
function modeLabel(){return metric==='units'?'Cumulative units':metric==='roi'?'ROI %':'Win rate %'}
function valueText(v){if(!Number.isFinite(v))return'—';if(metric==='units')return`${v>=0?'+':''}${v.toFixed(2)}U`;return`${v.toFixed(1)}%`}
function kpiText(v,type){if(v===null||v===undefined||!Number.isFinite(v))return'—';if(type==='u')return`${v>=0?'+':''}${v.toFixed(2)}U`;if(type==='pct')return`${v.toFixed(1)}%`;if(type==='odds')return v.toFixed(2);return String(v)}
function getPoints(s){return metric==='roi'?s.roiPoints:metric==='rate'?s.ratePoints:s.unitPoints}
function yScale(points){if(metric==='rate')return{min:0,max:100};const vals=points.map(p=>p.value).filter(Number.isFinite);if(!vals.length)return{min:-1,max:1};let min=vals.reduce((a,b)=>Math.min(a,b),0),max=vals.reduce((a,b)=>Math.max(a,b),0);if(min===max){min-=1;max+=1}const pad=(max-min)*.12;min-=pad;max+=pad;if(metric==='roi'){min=Math.floor(min/5)*5;max=Math.ceil(max/5)*5}else{min=Math.floor(min);max=Math.ceil(max)}if(min===max)max=min+1;return{min,max}}
function pathData(points,min,max){
 const L=72,R=18,T=15,B=42,W=1000,H=250,pw=W-L-R,ph=H-T-B,span=Math.max(.0001,max-min);
 const total=points[0]?.sourceTotal||points.length;
 const xy=points.map((p,i)=>({x:L+(total===1?pw/2:Number(p.sourceIndex??i)/(total-1)*pw),y:T+(max-p.value)/span*ph,p}));
 const line=xy.map((q,i)=>(i?'L':'M')+q.x.toFixed(1)+' '+q.y.toFixed(1)).join(' ');
 const baseY=T+(max-0)/span*ph,floor=Math.max(T,Math.min(T+ph,baseY));
 const area=xy.length?line+' L'+xy[xy.length-1].x.toFixed(1)+' '+floor.toFixed(1)+' L'+xy[0].x.toFixed(1)+' '+floor.toFixed(1)+' Z':'';
 return{xy,line,area,baseY,L,R,T,B,W,H,pw,ph};
}
function axisSvg(points,min,max,geo){/* B46_MULTI_YEAR_AXIS_20261012 */
 const yTicks=[];for(let i=0;i<5;i++){const value=max-(max-min)*i/4,y=geo.T+geo.ph*i/4;yTicks.push('<line x1="'+geo.L+'" y1="'+y+'" x2="'+(geo.W-geo.R)+'" y2="'+y+'" class="b46-perf-grid '+(Math.abs(value)<1e-9?'zero':'')+'"></line><text x="'+(geo.L-10)+'" y="'+(y+4)+'" text-anchor="end" class="b46-perf-axis-text">'+esc(valueText(value))+'</text>')}
 const n=points.length,xIdx=[];
 if(metric==='units'){
  const maxTicks=Math.max(3,Math.min(8,Math.floor(window.innerWidth/145))),stride=Math.max(1,Math.ceil(n/maxTicks));
  for(let i=0;i<n;i++)if(i%stride===0||i===n-1)xIdx.push(i)
 }else{
  const slots=Math.min(window.innerWidth<600?3:5,n);for(let i=0;i<slots;i++){const idx=slots===1?0:Math.round(i*(n-1)/(slots-1));if(!xIdx.includes(idx))xIdx.push(idx)}
 }
 const spanMs=Math.max(0,(points[n-1]?.date||0)-(points[0]?.date||0));
 const axisDate=(p)=>{if(metric==='units'&&p?.dayKey)return formatDayKeyEn(p.dayKey);const ms=p?.date;if(!ms)return'—';try{return new Intl.DateTimeFormat('en-GB',spanMs>330*86400000?{month:'short',year:'2-digit'}:{day:'2-digit',month:'short'}).format(new Date(ms))}catch{return fmtShort(ms)}};
 const xTicks=xIdx.map(idx=>{const p=geo.xy[idx],label=axisDate(points[idx]);return '<line x1="'+p.x+'" y1="'+geo.T+'" x2="'+p.x+'" y2="'+(geo.T+geo.ph)+'" class="b46-perf-vgrid"></line><text x="'+p.x+'" y="'+(geo.H-17)+'" text-anchor="middle" class="b46-perf-axis-text">'+esc(label)+'</text>'}).join('');
 return yTicks.join('')+xTicks+'<text x="'+geo.L+'" y="11" class="b46-perf-axis-title">'+esc(modeLabel())+'</text><text x="'+(geo.W-geo.R)+'" y="'+(geo.H-3)+'" text-anchor="end" class="b46-perf-axis-title">'+(metric==='units'?'Daily settlement timeline':'Settled signal timeline')+'</text>'
}
let currentPointOffset=0,currentPointTotal=0,chartGeometry=null;
function bangkokDayKey(ms){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms))}
 catch{return new Date(ms).toISOString().slice(0,10)}
}
function formatDayKeyEn(dayKey){/* B46_DAILY_DATE_AXIS_V9_20261012 */ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey||''));if(!m)return String(dayKey||'—');const mons=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],mi=Number(m[2])-1;return m[3]+' '+(mons[mi]||m[2])+' '+m[1]}
function dailyUnitPoints(points){/* B46_DAILY_OHLC_CHART_V8_20261012 */
 const out=[];let d=null;
 for(const p of points){
  const close=Number(p.value),profit=Number.isFinite(p.profit)?Number(p.profit):0,open=close-profit,key=bangkokDayKey(p.date);
  if(!d||d.dayKey!==key){
   if(d)out.push(d);
   d={dayKey:key,date:p.date,open,high:Math.max(open,close),low:Math.min(open,close),close,value:close,profit:close-open,count:1,firstDate:p.date,lastDate:p.date}
  }else{
   d.high=Math.max(d.high,close);d.low=Math.min(d.low,close);d.close=close;d.value=close;d.profit=d.close-d.open;d.count++;d.lastDate=p.date
  }
 }
 if(d)out.push(d);
 return out
}
function financeSamples(points,maxSamples){
 const n=points.length;
 if(n<=maxSamples)return points.map((p,i)=>({...p,sourceIndex:i,sourceTotal:n}));
 const samples=[{...points[0],sourceIndex:0,sourceTotal:n}];
 const buckets=Math.max(1,Math.floor((maxSamples-2)/2));
 for(let b=0;b<buckets;b++){
  const start=1+Math.floor(b*(n-2)/buckets),end=1+Math.floor((b+1)*(n-2)/buckets);
  let lo=start,hi=start;
  for(let i=start+1;i<end;i++){if(points[i].value<points[lo].value)lo=i;if(points[i].value>points[hi].value)hi=i}
  for(const i of (lo===hi?[lo]:[lo,hi].sort((x,y)=>x-y)))samples.push({...points[i],sourceIndex:i,sourceTotal:n});
 }
 samples.push({...points[n-1],sourceIndex:n-1,sourceTotal:n});
 return samples;
}
function chartHtml(s){
 const all=metric==='units'?dailyUnitPoints(s.unitPoints):getPoints(s);
 if(!all.length){
  currentPoints=[];chartGeometry=null;currentPointOffset=0;currentPointTotal=0;
  return '<div class="b46-perf-empty">No priced settled signals in this range.</div>';
 }
 const plot=financeSamples(all,window.innerWidth<600?480:900);
 currentPoints=all;currentPointOffset=0;currentPointTotal=all.length;
 const scale=yScale(all),geo=pathData(plot,scale.min,scale.max);
 chartGeometry={min:scale.min,max:scale.max,geo};
 const axes=axisSvg(plot,scale.min,scale.max,geo);
 const zero=scale.min<=0&&scale.max>=0?'<line class="b46-perf-zero-line" x1="'+geo.L+'" y1="'+geo.baseY+'" x2="'+(geo.W-geo.R)+'" y2="'+geo.baseY+'"></line>':'';
 const zeroPct=Math.max(0,Math.min(100,(geo.baseY-geo.T)/geo.ph*100));
 const defs='<defs><linearGradient id="b46PerfLineGradient" x1="0" y1="'+geo.T+'" x2="0" y2="'+(geo.T+geo.ph)+'" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-line-pos"></stop><stop offset="'+zeroPct+'%" class="b46-perf-line-pos"></stop><stop offset="'+zeroPct+'%" class="b46-perf-line-neg"></stop><stop offset="100%" class="b46-perf-line-neg"></stop></linearGradient><linearGradient id="b46PerfAreaGradient" x1="0" y1="'+geo.T+'" x2="0" y2="'+(geo.T+geo.ph)+'" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-area-pos" stop-opacity=".17"></stop><stop offset="'+zeroPct+'%" class="b46-perf-area-pos" stop-opacity=".05"></stop><stop offset="'+zeroPct+'%" class="b46-perf-area-neg" stop-opacity=".05"></stop><stop offset="100%" class="b46-perf-area-neg" stop-opacity=".17"></stop></linearGradient></defs>';
 return '<svg class="b46-perf-svg b46-finance-line" data-b46-finance-line="1" data-b46-plot-points="'+plot.length+'" data-b46-source-points="'+all.length+'" viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label="'+esc(modeLabel())+' trend line chart">'+defs+axes+zero+'<path class="b46-perf-area" d="'+geo.area+'"></path><path class="b46-perf-line" d="'+geo.line+'" style="stroke-width:1.8px;stroke-linejoin:round;stroke-linecap:round"></path><line data-b46-hover-line class="b46-perf-hover-line" x1="0" y1="'+geo.T+'" x2="0" y2="'+(geo.T+geo.ph)+'" hidden></line><circle data-b46-hover-dot class="b46-perf-hover-dot" cx="0" cy="0" r="3" hidden></circle></svg><div class="b46-perf-tip" data-b46-perf-tip hidden></div>';
}
function ensureCard(){const el=$('.sp-trend');if(!el)return null;if(!el.classList.contains('b46-perf-card')){el.classList.add('b46-perf-card');el.innerHTML='<div class="b46-perf-shell" data-b46-perf-shell></div>'}return el}
function render(){const card=ensureCard();if(!card)return;const shell=card.querySelector('[data-b46-perf-shell]');if(!shell)return;const rows=filteredRows(),s=stats(rows),roiClass=s.roi===null?'':s.roi>=0?'good':'bad',netClass=s.net>=0?'good':'bad',pricedMissing=Math.max(0,s.rows-s.priced);shell.innerHTML=`<div class="b46-perf-head"><div class="b46-perf-title"><span>LONG-TERM PERFORMANCE · 1 UNIT</span><h3>${esc(currentTitle())}</h3></div><div class="b46-perf-range" role="group" aria-label="Performance range"><button data-b46-range="d7" class="${range==='d7'?'active':''}">7D</button><button data-b46-range="d30" class="${range==='d30'?'active':''}">30D</button><button data-b46-range="d90" class="${range==='d90'?'active':''}">90D</button><button data-b46-range="all" class="${range==='all'?'active':''}">ALL</button></div></div><div class="b46-perf-kpis"><div class="b46-perf-kpi ${roiClass}"><span>ROI</span><b>${kpiText(s.roi,'pct')}</b><small>Net ÷ stake</small></div><div class="b46-perf-kpi ${netClass}"><span>NET</span><b>${kpiText(s.net,'u')}</b><small>Cumulative P/L</small></div><div class="b46-perf-kpi"><span>STAKE</span><b>${s.stake.toFixed(0)}U</b><small>1U per priced signal</small></div><div class="b46-perf-kpi"><span>W · P · L</span><b>${s.wins} · ${s.pushes} · ${s.losses}</b><small>${s.rows} settled</small></div><div class="b46-perf-kpi"><span>AVG ODDS</span><b>${kpiText(s.avgOdds,'odds')}</b><small>Recorded entry</small></div><div class="b46-perf-kpi ${s.maxDD>0?'bad':''}"><span>MAX DRAWDOWN</span><b>${s.maxDD?`-${s.maxDD.toFixed(2)}U`:'0.00U'}</b><small>Peak-to-trough</small></div></div><div class="b46-perf-toolbar"><div class="b46-perf-mode" role="group" aria-label="Chart metric"><button data-b46-mode="units" class="${metric==='units'?'active':''}">UNITS</button><button data-b46-mode="roi" class="${metric==='roi'?'active':''}">ROI</button><button data-b46-mode="rate" class="${metric==='rate'?'active':''}">WIN RATE</button></div><div class="b46-perf-axis-note">Y: ${esc(modeLabel())} · X: ${metric==='units'?'calendar day · 1 point = 1 day':'settled signal timeline · 1 signal = 1.00U'}</div></div><div class="b46-perf-chart-wrap" data-b46-chart-wrap>${chartHtml(s)}</div><div class="b46-perf-foot"><span>Peak <b>${kpiText(s.peak,'u')}</b> · Best recovery <b>${kpiText(s.bestRun,'u')}</b></span><span class="${pricedMissing?'warn':''}">${pricedMissing?`${pricedMissing} settled row${pricedMissing===1?'':'s'} excluded from ROI because entry odds are missing.`:`ROI uses all ${s.priced} priced settled signals.`}</span></div>`;bindCard();bindChart()}
function bindCard(){
 document.querySelectorAll('[data-b46-range]').forEach(b=>b.addEventListener('click',()=>{range=b.dataset.b46Range||'all';render()}));
 document.querySelectorAll('[data-b46-mode]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.b46Mode||'units';render()}));
}
function tipMarkup(p,idx,total){if(metric==='units'&&Number.isFinite(p?.open)){const d=p.close-p.open;return '<div class="b46-perf-tip-head"><span>DAY #'+(currentPointOffset+idx+1)+' / '+(currentPointTotal||total)+'</span><strong>'+esc(formatDayKeyEn(p.dayKey))+'</strong></div><div class="row"><span>Open</span><strong>'+valueText(p.open)+'</strong></div><div class="row"><span>High</span><strong>'+valueText(p.high)+'</strong></div><div class="row"><span>Low</span><strong>'+valueText(p.low)+'</strong></div><div class="row"><span>Close</span><strong class="'+(p.close>=0?'positive':'negative')+'">'+valueText(p.close)+'</strong></div><div class="row"><span>Day P/L</span><strong class="'+(d>0?'positive':d<0?'negative':'')+'">'+(d>=0?'+':'')+d.toFixed(2)+'U</strong></div><div class="row"><span>Settled signals</span><strong>'+p.count+'</strong></div>'}const r=p.row,home=r?.home?.name||'—',away=r?.away?.name||'—',pick=String(r?.selection||r?.pick||'—'),market=String(r?.marketLabel||r?.market||r?.providerMarket||marketKey(r)||'—'),odds=num(r?.odds),profit=p.profit;return`<div class="b46-perf-tip-head"><span>SIGNAL #${currentPointOffset+idx+1} / ${currentPointTotal||total}</span><strong>${esc(fmtDate(p.date))}</strong></div><b>${esc(home)} — ${esc(away)}</b><div class="row"><span>Market</span><strong>${esc(market)}</strong></div><div class="row"><span>Pick</span><strong>${esc(pick)}</strong></div><div class="row"><span>Odds</span><strong>${odds&&odds>1?odds.toFixed(2):'—'}</strong></div><div class="row"><span>Result</span><strong>${esc(outcome(r)||'—')}</strong></div><div class="row"><span>This signal</span><strong class="${profit>0?'positive':profit<0?'negative':''}">${Number.isFinite(profit)?`${profit>=0?'+':''}${profit.toFixed(2)}U`:'—'}</strong></div><div class="row metric"><span>${esc(modeLabel())}</span><strong class="${p.value>=0?'positive':'negative'}">${esc(valueText(p.value))}</strong></div>`}function bindChart(){
 const svg=$('.b46-perf-svg'),tip=$('[data-b46-perf-tip]'),line=$('[data-b46-hover-line]'),dot=$('[data-b46-hover-dot]');
 if(!svg||!tip||!line||!dot||!chartGeometry||!currentPoints.length)return;
 const g=chartGeometry.geo,min=chartGeometry.min,max=chartGeometry.max;
 let frame=0,pending=null,lastIndex=-1;
 const hide=e=>{if(e?.pointerType==='touch')return;if(frame)cancelAnimationFrame(frame);frame=0;pending=null;line.hidden=true;dot.hidden=true;tip.hidden=true;lastIndex=-1};
 const paint=()=>{
  frame=0;if(!pending||!svg.isConnected)return;
  const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const rx=(pending.clientX-rect.left)/rect.width*g.W;
  const ratio=Math.max(0,Math.min(1,(rx-g.L)/g.pw));
  const idx=Math.round(ratio*(currentPoints.length-1)),p=currentPoints[idx];
  const x=g.L+(currentPoints.length===1?g.pw/2:idx/(currentPoints.length-1)*g.pw);
  const y=g.T+(max-p.value)/Math.max(.0001,max-min)*g.ph;
  line.hidden=false;dot.hidden=false;
  line.setAttribute('x1',x);line.setAttribute('x2',x);
  dot.setAttribute('cx',x);dot.setAttribute('cy',y);
  dot.classList.toggle('positive',p.value>=0);dot.classList.toggle('negative',p.value<0);
  if(idx!==lastIndex){tip.innerHTML=tipMarkup(p,idx,currentPoints.length);lastIndex=idx}
  tip.hidden=false;
  const px=x/g.W*rect.width,py=y/g.H*rect.height;
  tip.style.left=Math.max(112,Math.min(rect.width-112,px))+'px';
  tip.style.top=Math.max(100,Math.min(rect.height-36,py))+'px';
 };
 const move=e=>{pending={clientX:e.clientX};if(!frame)frame=requestAnimationFrame(paint)};
 svg.addEventListener('pointermove',move,{passive:true});
 svg.addEventListener('pointerdown',move,{passive:true});
 svg.addEventListener('pointerleave',hide);
 svg.addEventListener('pointercancel',hide);
}
async function load(){if(rowsCache.length&&Date.now()-loadedAt<CACHE_MS){render();return}if(loading){await loading;return}loading=(async()=>{try{const data=await window.BALL46_STATISTICS_DATA.load();rowsCache=data.rows;loadedAt=Date.now();render()}catch(err){const card=ensureCard();if(card){const shell=card.querySelector('[data-b46-perf-shell]');if(shell)shell.innerHTML='<div class="b46-perf-empty">Long-term performance data is incomplete or temporarily unavailable.</div>'}console.warn('[Ball46 performance]',err)}})();try{await loading}finally{loading=null}}
function active(){return document.body.dataset.workspaceView==='statistics'||$('[data-workspace-panel="statistics"]')?.hidden===false}
document.addEventListener('ball46:statistics-snapshot',e=>{rowsCache=e.detail.rows;loadedAt=Date.now();if(active())render()});
function refreshSoon(){setTimeout(()=>{if(active())load()},40)}
document.addEventListener('ball46:workspace-view',e=>{if(e?.detail?.view==='statistics')load()});document.addEventListener('click',e=>{if(e.target.closest('[data-stat-market],[data-sp-filter],[data-sp-variant]'))refreshSoon()});window.addEventListener('popstate',refreshSoon);
const boot=()=>{const label=$('[data-sp-filter-label]');if(label)new MutationObserver(()=>{if(active())render()}).observe(label,{childList:true,subtree:true,characterData:true});if(active())load()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
