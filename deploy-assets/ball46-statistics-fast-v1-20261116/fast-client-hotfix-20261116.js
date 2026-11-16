(()=>{
'use strict';
const START=performance.now();
const $=s=>document.querySelector(s);
const fmt=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const diag={status:'pending',startedAt:Date.now(),stageOnly:true};
window.__B46_FAST_V1_DIAG=diag;
let head=null,graph=null,preview=null,interval=null;
const ns='http://www.w3.org/2000/svg';
// The real workspace script may initialize AFTER an immediately failing
// snapshot fetch. Do not lose the fallback event because its helper was absent.
let fallbackQueued=false;
function triggerNativeFallback(){
 if(fallbackQueued)return;
 fallbackQueued=true;
 let attempts=0;
 const poll=()=>{
   if(typeof window.__B46_FAST_LOAD_DETAILS==='function'){
     diag.fallbackTriggered=true;
     diag.fallbackPolls=attempts;
     window.__B46_FAST_LOAD_DETAILS();
     return;
   }
   if(++attempts<100){setTimeout(poll,100);return}
   diag.fallbackTriggerMissing=true;
   // Safety: do not fabricate chart/history if the native module is missing.
 };
 poll();
}
// Read the hidden, ORIGINAL finance calculation to fill the filtered-market
// right card. Never fetch another API, infer odds, or change existing totals.
function enhanceFilteredMarket(){
 if(!window.matchMedia('(min-width:851px)').matches)return;
 if(document.body?.dataset.workspaceView!=='statistics')return;
 const q=new URLSearchParams(location.search);
 const selectedMarket=$('[data-stat-market].active')?.dataset.statMarket||q.get('market')||'all';
 const card=$('#b46-finance-chart-card');
 if(!card)return;
 if(['all',''].includes(selectedMarket)){
   card.classList.remove('b46-v1-market-enhanced');
   card.querySelectorAll('.b46-v1-market-outcomes,.b46-v1-market-detail-grid').forEach(e=>e.remove());
   return;
 }
 const overview=card.querySelector('.f46-overview');
 const nativeMetrics=overview?.querySelector('.f46-metrics');
 const nativeKPIs=[...card.querySelectorAll('.b46-perf-kpi')];
 if(!overview||!nativeMetrics||nativeKPIs.length<5)return;
 const getValue=new Map(nativeKPIs.map(e=>[
   e.querySelector('span')?.textContent?.trim().toUpperCase(),
   e.querySelector('b')?.textContent?.trim()
 ]));
 const wpl=getValue.get('W · P · L'),stake=getValue.get('STAKE'),maxDD=getValue.get('MAX DRAWDOWN');
 const wplValues=(wpl||'').split('·').map(v=>Number(v.trim().replace(/,/g,'')));
 const settledCell=[...nativeMetrics.children].find(e=>e.querySelector('span')?.textContent?.trim().toUpperCase()==='SETTLED');
 const settled=Number(settledCell?.querySelector('b')?.textContent?.replace(/,/g,''));
 if(wplValues.length!==3||wplValues.some(v=>!Number.isSafeInteger(v)||v<0)||
    wplValues.reduce((a,v)=>a+v,0)!==settled||!settled||!stake||!maxDD)return;
 styleOnce();
 const signature=[wpl,settled,stake,maxDD].join('|');
 if(card.dataset.b46V1MarketSignature===signature &&
   overview.querySelector('.b46-v1-market-outcomes')&&
   overview.querySelector('.b46-v1-market-detail-grid'))return;
 overview.querySelectorAll('.b46-v1-market-outcomes,.b46-v1-market-detail-grid').forEach(e=>e.remove());
 const section=document.createElement('section');section.className='b46-v1-market-outcomes';
 section.setAttribute('aria-label','Filtered market outcome distribution');
 const title=document.createElement('div');title.className='b46-v1-market-outcomes-title';
 const heading=document.createElement('strong');heading.textContent='SIGNAL OUTCOMES';
 const period=document.createElement('span');period.textContent='CURRENT MARKET';
 title.append(heading,period);
 const track=document.createElement('div');track.className='b46-v1-market-track';
 const legend=document.createElement('div');legend.className='b46-v1-market-legend';
 for(const [result,count,color] of [['win',wplValues[0],'#3ad39e'],
                                     ['push',wplValues[1],'#e6bc71'],
                                     ['loss',wplValues[2],'#e97881']]){
   const part=document.createElement('span');part.dataset.result=result;
   part.dataset.count=String(count);part.style.flexGrow=String(count);
   part.style.background=color;track.appendChild(part);
   const item=document.createElement('span');item.textContent=result.toUpperCase()+' '+(100*count/settled).toFixed(1)+'%';
   legend.appendChild(item);
 }
 section.append(title,track,legend);
 const details=document.createElement('div');details.className='b46-v1-market-detail-grid';
 for(const [key,label,value] of [['stake','STAKE',stake],['drawdown','MAX DRAWDOWN',maxDD],['wpl','W · P · L',wpl]]){
   const tile=document.createElement('div');tile.className='b46-v1-market-detail';
   tile.dataset.key=key;
   const small=document.createElement('small');small.textContent=label;
   const strong=document.createElement('b');strong.textContent=value;
   tile.append(small,strong);details.appendChild(tile);
 }
 overview.insertBefore(section,nativeMetrics);
 overview.insertBefore(details,nativeMetrics);
 card.classList.add('b46-v1-market-enhanced');
 card.dataset.b46V1MarketSignature=signature;
}
function validRoute(){
 const q=new URLSearchParams(location.search);
 const active=$('[data-stat-market].active')?.dataset.statMarket;
 return document.body?.dataset.workspaceView==='statistics' && (!active||active==='all') &&
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
 document.documentElement.classList.remove('b46-fast-v1-preview');
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
 if($('#b46-fast-v1-style'))return;
 const style=document.createElement('style');
 style.id='b46-fast-v1-style';
 style.textContent=[
 '#b46-fast-v1-preview{box-sizing:border-box;padding:15px;margin:0;color:#e9f5ee;background:#0e1916;border:1px solid #29443b;border-radius:13px;box-shadow:0 10px 25px rgba(0,0,0,.08);font-family:inherit}',
 'html.b46-fast-v1-preview body[data-workspace-view="statistics"] .sp-stats-content{display:block!important;visibility:visible!important}',
 'html.b46-fast-v1-preview body[data-workspace-view="statistics"] .sp-trend.b46-fast-v1-host{display:block!important;visibility:visible!important;height:auto!important;min-height:0!important}',
 'html.b46-fast-v1-preview body[data-workspace-view="statistics"] .b46-stats-loader{display:none!important;visibility:hidden!important}',
 '#b46-fast-v1-preview *{box-sizing:border-box}',
 '#b46-fast-v1-preview .b46-fast-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px}',
 '#b46-fast-v1-preview .b46-fast-kicker{color:#85aa9b;font-size:10px;font-weight:700;letter-spacing:.09em}',
 '#b46-fast-v1-preview .b46-fast-chart{height:185px;min-width:0}',
 '#b46-fast-v1-preview .b46-fast-net{font-size:clamp(22px,2.1vw,29px);font-weight:800;color:#47d49f;margin:10px 0 14px}',
 '#b46-fast-v1-preview .b46-fast-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}',
 '#b46-fast-v1-preview .b46-fast-stat{padding:8px;min-width:0;background:#172b24;border-radius:8px}',
 '#b46-fast-v1-preview .b46-fast-stat small{display:block;color:#92b8a6;font-size:10px}',
 '#b46-fast-v1-preview .b46-fast-stat b{display:block;font-size:14px;margin-top:4px;overflow-wrap:anywhere}',
 '#b46-fast-v1-preview .b46-fast-stat[data-key="wpl"] b{font-size:10px;letter-spacing:-.2px}',
 '#b46-fast-v1-preview .b46-fast-mobile-settled{display:none}',
 '#b46-fast-v1-preview .b46-fast-outcomes{margin-top:13px;padding:12px;background:#152a22;border-radius:10px}',
 '#b46-fast-v1-preview .b46-fast-outcomes-track{display:flex;height:11px;overflow:hidden;border-radius:7px;margin-top:9px}',
 '#b46-fast-v1-preview .b46-fast-outcomes-track span{flex-basis:0;min-width:0}',
 '#b46-fast-v1-preview .b46-fast-outcomes-legend{display:flex;justify-content:space-between;gap:8px;margin-top:7px;color:#aacbb9;font-size:10px}',
 '#b46-fast-v1-preview .b46-fast-foot{font-size:10px;color:#9bb8a9;margin-top:12px}',
 '#b46-fast-v1-preview .b46-fast-details{border:1px solid #336e57;background:#1a3b2e;color:#cff7df;cursor:pointer;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:700;margin-top:12px}',
 '@media(min-width:851px){',
 '#b46-finance-chart-card.b46-v1-market-enhanced .f46-overview{display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:space-between!important;gap:10px!important;padding:14px 18px!important}',
 '#b46-finance-chart-card.b46-v1-market-enhanced .f46-overview>.f46-metrics{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;width:100%!important;margin:0!important}',
 '#b46-finance-chart-card.b46-v1-market-enhanced .f46-overview>.f46-metrics>div{min-width:0;gap:4px!important;padding:8px!important;border-radius:9px;background:rgba(40,92,76,.18)}',
 '#b46-finance-chart-card .b46-v1-market-outcomes{padding:11px 12px 9px;border:1px solid rgba(82,163,136,.16);border-radius:11px;background:rgba(26,68,52,.24)}',
 '#b46-finance-chart-card .b46-v1-market-outcomes-title{display:flex;justify-content:space-between;font-size:9px;font-weight:700;letter-spacing:.055em;color:#91b9a9}',
 '#b46-finance-chart-card .b46-v1-market-track{display:flex;height:10px;margin-top:8px;border-radius:7px;overflow:hidden;background:rgba(0,0,0,.3)}',
 '#b46-finance-chart-card .b46-v1-market-track span{flex-basis:0;min-width:0}',
 '#b46-finance-chart-card .b46-v1-market-legend{display:flex;justify-content:space-between;gap:8px;margin-top:6px;color:#adccba;font-size:10px}',
 '#b46-finance-chart-card .b46-v1-market-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}',
 '#b46-finance-chart-card .b46-v1-market-detail{min-width:0;padding:8px 10px;min-height:45px;border-radius:9px;background:rgba(42,94,77,.18)}',
 '#b46-finance-chart-card .b46-v1-market-detail small{display:block;font-size:9px;font-weight:650;color:#8fb5a4}',
 '#b46-finance-chart-card .b46-v1-market-detail b{display:block;font-size:13px;font-weight:750;margin-top:4px;white-space:nowrap;color:#e6f6ed}',
 '#b46-finance-chart-card .b46-v1-market-detail[data-key="wpl"] b{font-size:11px;letter-spacing:-.25px}',
 '}',
 '@media(min-width:851px) and (max-width:1320px){#b46-fast-v1-preview .b46-fast-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}',
 '@media(max-width:850px){#b46-fast-v1-preview .b46-fast-columns{grid-template-columns:1fr}#b46-fast-v1-preview .b46-fast-chart{height:150px}#b46-fast-v1-preview .b46-fast-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#b46-fast-v1-preview .b46-fast-outcomes{display:none}#b46-fast-v1-preview .b46-fast-stat:not([data-key="roi"]):not([data-key="rate"]):not([data-key="settled"]):not([data-key="drawdown"]){display:none}#b46-fast-v1-preview .b46-fast-mobile-settled{display:block;order:3}#b46-fast-v1-preview .b46-fast-stat[data-key="drawdown"]{order:4}}'
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
 preview.id='b46-fast-v1-preview';
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
 const w=head.win+head.halfWin,p=head.push,l=head.loss+head.halfLoss;
 const days=graph.summary.settledDays;
 const pairs=[
  ['ROI','roi',graph.summary.roi==null?'—':fmt(graph.summary.roi,1)+'%'],
  ['WIN RATE','rate',rate==null?'—':fmt(rate,1)+'%'],
  ['AVG ODDS','odds',graph.summary.avgOdds==null?'—':fmt(graph.summary.avgOdds)],
  ['SETTLED DAYS','days',days==null?'—':String(days)],
  ['UNSETTLED','unsettled',(head.pending+head.unresolved).toLocaleString('en-US')],
  ['W · P · L','wpl',[w,p,l].map(n=>n.toLocaleString('en-US')).join(' · ')],
  ['STAKE','stake',fmt(graph.summary.stake,0)+' U'],
  ['MAX DRAWDOWN','drawdown',graph.summary.maxDD?'-'+fmt(graph.summary.maxDD)+' U':'0.00 U']
 ];
 for(const [name,key,value] of pairs){
   const cell=document.createElement('div');cell.className='b46-fast-stat';
   cell.dataset.key=key;
   const small=document.createElement('small');small.textContent=name;
   const strong=document.createElement('b');strong.textContent=value;
   cell.append(small,strong);stats.appendChild(cell);
 }
 const mobileSettled=document.createElement('div');
 mobileSettled.className='b46-fast-stat b46-fast-mobile-settled';
 mobileSettled.dataset.key='settled';
 const mobileSettledLabel=document.createElement('small');mobileSettledLabel.textContent='SETTLED';
 const mobileSettledNumber=document.createElement('b');mobileSettledNumber.textContent=head.total.toLocaleString('en-US');
 mobileSettled.append(mobileSettledLabel,mobileSettledNumber);
 stats.appendChild(mobileSettled);
 const outcomes=document.createElement('section');outcomes.className='b46-fast-outcomes';
 outcomes.setAttribute('aria-label','Signal Outcomes verified snapshot');
 const heading=document.createElement('div');heading.className='b46-fast-kicker';
 heading.textContent='SIGNAL OUTCOMES · ALL TIME';
 const track=document.createElement('div');track.className='b46-fast-outcomes-track';
 const legend=document.createElement('div');legend.className='b46-fast-outcomes-legend';
 for(const [key,count,color] of [['win',w,'#39d19a'],['push',p,'#e5bc72'],['loss',l,'#ee777f']]){
   const segment=document.createElement('span');
   segment.dataset.result=key;segment.dataset.count=String(count);
   segment.style.flexGrow=String(count);segment.style.backgroundColor=color;
   track.appendChild(segment);
   const item=document.createElement('span');item.textContent=key.toUpperCase()+' '+(count/head.total*100).toFixed(1)+'%';
   legend.appendChild(item);
 }
 outcomes.append(heading,track,legend);
 const details=document.createElement('button');details.className='b46-fast-details';
 details.type='button';details.textContent='Load detailed history';
 details.addEventListener('click',()=>{
   diag.status='details-requested';
   details.disabled=true;details.textContent='Loading detailed history…';
   if(typeof window.__B46_FAST_LOAD_DETAILS==='function')window.__B46_FAST_LOAD_DETAILS();
   else void window.BALL46_STATISTICS_DATA?.load?.();
 });
 right.append(label,net,stats,outcomes,details);
 cols.append(left,right);
 const foot=document.createElement('div');foot.className='b46-fast-foot';
 foot.textContent='Saved verified snapshot · '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',
   day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})
   .format(new Date(head.snapshotSavedAt))+' ICT · Open detailed history when needed';
 preview.append(kicker,cols,foot);
 // Reuse the EXISTING finance/performance card slot. Never add a second card.
 // Native Stats hides .sp-stats-content with an inline important declaration
 // until the entire Ledger arrives. Expose only the VERIFIED fast view.
 const content=panel.querySelector('.sp-stats-content');
 if(!content){diag.status='stats-content-anchor-missing';triggerNativeFallback();return}
 content.style.setProperty('display','block','important');
 const nativeHost=panel.querySelector('.sp-trend');
 if(!nativeHost){diag.status='native-card-anchor-missing';triggerNativeFallback();return}
 nativeHost.id='b46-finance-chart-card';
 nativeHost.dataset.f46Visual='1';
 nativeHost.classList.add('b46-perf-card','b46-fast-v1-host');
 let nativeShell=nativeHost.querySelector('[data-b46-perf-shell]');
 if(!nativeShell){
   nativeShell=document.createElement('div');
   nativeShell.className='b46-perf-shell';
   nativeShell.setAttribute('data-b46-perf-shell','');
   nativeHost.replaceChildren(nativeShell);
 }
 nativeShell.style.setProperty('display','block','important');
 nativeShell.replaceChildren(preview);
 document.documentElement.classList.add('b46-fast-v1-preview');
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
     fetch('/b46-fast-v1/head',{cache:'no-store',signal:AbortSignal.timeout(9000)}),
     fetch('/b46-fast-v1/chart',{cache:'no-store',signal:AbortSignal.timeout(9000)})
   ]);
   if(!h.ok||!g.ok)throw Error('FAST_STAGE_HTTP_'+h.status+'_'+g.status);
   [head,graph]=await Promise.all([h.json(),g.json()]);
   if(!validData(head,graph))throw Error('FAST_STAGE_COUNT_MISMATCH');
   // A direct link to AH/OU/corners or a filtered route cannot use the
   // all-markets graph. Resume the original full renderer immediately.
   if(document.body?.dataset.workspaceView==='statistics'&&!validRoute()){
     diag.status='filtered-deeplink-fallback';
     triggerNativeFallback();
     return;
   }
   mount();
 }catch(e){diag.status='unavailable';diag.error=String(e.message||e).slice(0,120);triggerNativeFallback()}
};
// Finance renderer emits this event after replacing its native card HTML.
// Reconcile immediately to prevent a frame containing an obsolete overlay.
document.addEventListener('ball46:finance-line-ready',()=>{
 // A failed fast snapshot has no preview. Preserve its 'unavailable' status
 // for diagnostics/failover instead of mislabeling the recovered renderer.
 if(nativeReady()&&preview) {
   diag.nativeReadyMs=Math.round(performance.now()-START);
   diag.status='native-ready';
   cleanup();
 }
 enhanceFilteredMarket();
});
document.addEventListener('ball46:workspace-view',()=>{
 // The router can announce an AH deep link before the fast index is fetched.
 // Always resume the native market renderer, even if the helper is not yet loaded.
 if(document.body?.dataset.workspaceView==='statistics'&&!validRoute()){
   triggerNativeFallback();
   if(preview)cleanup();
   return;
 }
 if(preview&&!validRoute())cleanup();
 else mount();
 // Re-run when navigation already has a verified native chart.
 queueMicrotask(enhanceFilteredMarket);
});
document.addEventListener('click',e=>{
 if(e.target?.closest?.('[data-stat-market],[data-sp-filter],[data-sp-variant]')){
   triggerNativeFallback();cleanup();diag.status='filter-selected';
 }
},true);
window.addEventListener('popstate',()=>{if(!validRoute()){triggerNativeFallback();cleanup()}else mount()});
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',()=>{
   begin();queueMicrotask(enhanceFilteredMarket);
 },{once:true});
}else{
 begin();queueMicrotask(enhanceFilteredMarket);
}
})();