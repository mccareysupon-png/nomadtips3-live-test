// STAGING-ONLY verified chart first paint. Never changes Production or Ledger.
// An additive preview, removed as soon as the ORIGINAL full renderer is ready.
export const stageFastChartScript=String.raw`(()=>{
'use strict';
const START=performance.now();
const $=s=>document.querySelector(s);
const fmt=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const diag={status:'pending',startedAt:Date.now(),stageOnly:true};
window.__B46_FAST_CHART_DIAG=diag;
let head=null,graph=null,preview=null,interval=null;
const ns='http://www.w3.org/2000/svg';
function validRoute(){
 const q=new URLSearchParams(location.search);
 return document.body?.dataset.workspaceView==='statistics' &&
   ['all',''].includes(q.get('market')||'all') &&
   ['all',''].includes(q.get('variant')||'all') &&
   ['all',''].includes(q.get('filter')||'all');
}
function nativeReady(){
 const svg=$('#b46-finance-chart-card svg.f46-svg');
 const root=$('#b46-finance-chart-card');
 return !!(svg?.getClientRects().length && root?.querySelector('[data-f46-value]'));
}
function cleanup(){
 if(preview){preview.remove();preview=null}
 document.documentElement.classList.remove('b46-stage-fast-preview');
 if(interval!==null){clearInterval(interval);interval=null}
}
function validData(h,g){
 if(h?.schema!==1||h.ok!==true||g?.schema!==1||g.ok!==true ||
    g.market!=='all'||g.variant!=='all'||g.filter!=='all'||g.range!=='all'||
    g.asOf!==h.snapshotSavedAt||g.summary?.rows!==h.total ||
    g.summary.wins!==h.win+h.halfWin||
    g.summary.losses!==h.loss+h.halfLoss||
    g.summary.pushes!==h.push ||
    !Array.isArray(g.series?.units)||g.series.units.length<1 ||
    g.series.units.some(p=>!Number.isFinite(p.value)||!Number.isFinite(p.date)) ||
    !Number.isFinite(g.summary.net))return false;
 return true;
}
function chartSvg(points){
 const W=560,H=190,L=15,R=60,T=14,B=27;
 const values=points.map(p=>p.value);
 let lo=Math.min(0,...values),hi=Math.max(0,...values);
 const span=Math.max(1,hi-lo);
 if(lo<0)lo-=span*.12;
 hi+=span*.12;
 if(lo===hi)hi=lo+1;
 const x=i=>L+(points.length===1?(W-L-R)/2:i/(points.length-1)*(W-L-R));
 const y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 '+W+' '+H);
 svg.setAttribute('preserveAspectRatio','none');
 svg.setAttribute('role','img');
 svg.setAttribute('aria-label','Verified saved net units daily chart');
 svg.style.cssText='display:block;width:100%;height:100%;overflow:visible';
 for(let i=0;i<4;i++){
   const yy=T+i*(H-T-B)/3,line=document.createElementNS(ns,'line');
   line.setAttribute('x1',L);line.setAttribute('x2',W-R);
   line.setAttribute('y1',yy);line.setAttribute('y2',yy);
   line.setAttribute('stroke','#29433c');line.setAttribute('stroke-width','1');
   svg.appendChild(line);
 }
 const d=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(p.value).toFixed(2)).join(' ');
 const path=document.createElementNS(ns,'path');
 path.setAttribute('d',d);path.setAttribute('stroke','#48d6a6');
 path.setAttribute('stroke-width','2');path.setAttribute('fill','none');
 path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
 svg.appendChild(path);
 const tip=document.createElementNS(ns,'text');
 tip.setAttribute('x',W-R+7);tip.setAttribute('y',y(points.at(-1).value)+4);
 tip.setAttribute('fill','#a8d8c4');tip.setAttribute('font-size','13');
 tip.textContent=fmt(points.at(-1).value);
 svg.appendChild(tip);
 return svg;
}
function styleOnce(){
 if($('#b46-stage-fast-style'))return;
 const style=document.createElement('style');
 style.id='b46-stage-fast-style';
 style.textContent=[
 '#b46-stage-fast-preview{box-sizing:border-box;padding:15px;margin:12px 0 16px;color:#e9f5ee;background:#0e1916;border:1px solid #29443b;border-radius:13px;box-shadow:0 10px 25px rgba(0,0,0,.08);font-family:inherit}',
 '#b46-stage-fast-preview *{box-sizing:border-box}',
 '#b46-stage-fast-preview .b46-fast-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px}',
 '#b46-stage-fast-preview .b46-fast-kicker{color:#85aa9b;font-size:10px;font-weight:700;letter-spacing:.09em}',
 '#b46-stage-fast-preview .b46-fast-chart{height:185px;min-width:0}',
 '#b46-stage-fast-preview .b46-fast-net{font-size:clamp(22px,2.1vw,29px);font-weight:800;color:#47d49f;margin:10px 0 14px}',
 '#b46-stage-fast-preview .b46-fast-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
 '#b46-stage-fast-preview .b46-fast-stat{padding:10px;background:#172b24;border-radius:8px}',
 '#b46-stage-fast-preview .b46-fast-stat small{display:block;color:#92b8a6;font-size:10px}',
 '#b46-stage-fast-preview .b46-fast-stat b{display:block;font-size:15px;margin-top:4px}',
 '#b46-stage-fast-preview .b46-fast-foot{font-size:10px;color:#9bb8a9;margin-top:12px}',
 '@media(max-width:850px){#b46-stage-fast-preview .b46-fast-columns{grid-template-columns:1fr}#b46-stage-fast-preview .b46-fast-chart{height:150px}}'
 ].join('');
 document.head.appendChild(style);
}
function mount(){
 if(!graph||!head||!validRoute()||nativeReady()){if(nativeReady())cleanup();return}
 if(preview?.isConnected)return;
 const panel=$('[data-workspace-panel="statistics"]');
 if(!panel||panel.hidden)return;
 styleOnce();
 preview=document.createElement('section');
 preview.id='b46-stage-fast-preview';
 preview.setAttribute('aria-label','Saved verified statistics first paint');
 const kicker=document.createElement('div');
 kicker.className='b46-fast-kicker';kicker.textContent='LONG-TERM PERFORMANCE · SAVED VERIFIED SNAPSHOT';
 const cols=document.createElement('div');cols.className='b46-fast-columns';
 const left=document.createElement('div'),right=document.createElement('div');
 const title=document.createElement('div');
 title.className='b46-fast-kicker';title.textContent='DAILY NET UNITS · ALL MARKETS';
 const chart=document.createElement('div');chart.className='b46-fast-chart';
 chart.appendChild(chartSvg(graph.series.units));
 left.append(title,chart);
 const net=document.createElement('div');net.className='b46-fast-net';
 net.textContent=(graph.summary.net>=0?'+':'')+fmt(graph.summary.net)+' U';
 const label=document.createElement('div');label.className='b46-fast-kicker';
 label.textContent='NET · 1 UNIT PER PRICED SIGNAL';
 const stats=document.createElement('div');stats.className='b46-fast-stats';
 const wl=head.win+head.loss+head.halfWin+head.halfLoss;
 const rate=wl?(head.win+head.halfWin*.5)/wl*100:null;
 const pairs=[['ROI',graph.summary.roi==null?'—':fmt(graph.summary.roi,1)+'%'],
  ['WIN RATE',rate==null?'—':fmt(rate,1)+'%'],
  ['SETTLED',head.total.toLocaleString('en-US')],
  ['MAX DRAWDOWN','-'+fmt(graph.summary.maxDD)+' U']];
 for(const [name,value] of pairs){
   const cell=document.createElement('div');cell.className='b46-fast-stat';
   const small=document.createElement('small');small.textContent=name;
   const strong=document.createElement('b');strong.textContent=value;
   cell.append(small,strong);stats.appendChild(cell);
 }
 right.append(label,net,stats);
 cols.append(left,right);
 const foot=document.createElement('div');foot.className='b46-fast-foot';
 foot.textContent='Saved snapshot · Detailed history and live verification loading separately';
 preview.append(kicker,cols,foot);
 const content=panel.querySelector('.sp-stats-content');
 if(content)panel.insertBefore(preview,content);
 else panel.appendChild(preview);
 document.documentElement.classList.add('b46-stage-fast-preview');
 diag.status='fast-preview-visible';diag.fastPaintMs=Math.round(performance.now()-START);
 diag.pointCount=graph.series.units.length;diag.net=graph.summary.net;
 if(interval===null){
   interval=setInterval(()=>{
     if(nativeReady()){
       diag.nativeReadyMs=Math.round(performance.now()-START);
       diag.status='native-ready';cleanup();
     }else if(!validRoute()&&preview){cleanup();diag.status='route-changed'}
   },200);
 }
}
const begin=async()=>{
 try{
   const [h,g]=await Promise.all([
     fetch('/_b46_stage_stats_summary',{cache:'no-store',signal:AbortSignal.timeout(9000)}),
     fetch('/_b46_stage_stats_chart',{cache:'no-store',signal:AbortSignal.timeout(9000)})
   ]);
   if(!h.ok||!g.ok)throw Error('FAST_STAGE_HTTP_'+h.status+'_'+g.status);
   [head,graph]=await Promise.all([h.json(),g.json()]);
   if(!validData(head,graph))throw Error('FAST_STAGE_COUNT_MISMATCH');
   mount();
 }catch(e){diag.status='unavailable';diag.error=String(e.message||e).slice(0,120)}
};
document.addEventListener('ball46:workspace-view',()=>{if(preview&&!validRoute())cleanup();else mount()});
document.addEventListener('click',e=>{
 if(e.target?.closest?.('[data-stat-market],[data-sp-filter],[data-sp-variant]')){
   cleanup();diag.status='filter-selected';
 }
},true);
window.addEventListener('popstate',()=>{if(!validRoute())cleanup();else mount()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});
else begin();
})();`;
