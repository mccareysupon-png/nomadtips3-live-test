(()=>{
'use strict';
const EVENT_NAME='nomad:statistics-records';
const STORAGE_KEY='nomadStatisticsChartStyleV1';
const MODES=new Set(['glow','normal','candle']);
const DEFAULTS=Object.freeze({mode:'glow',color:'#b8a46b'});
let state=readState();
let rawRecords=[];
let chart=null,surface=null,baseCanvas=null,overlay=null,control=null,panel=null,button=null,colorInput=null;
let resizeObserver=null,mountObserver=null,frame=0,lastView='';
function validHex(value){return /^#[0-9a-f]{6}$/i.test(String(value||''));}
function readState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    return {mode:MODES.has(saved.mode)?saved.mode:DEFAULTS.mode,color:validHex(saved.color)?saved.color:DEFAULTS.color};
  }catch{return {...DEFAULTS};}
}
function saveState(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}}
function rgba(hex,alpha){
  const value=String(hex||DEFAULTS.color).replace('#','');
  const n=parseInt(value,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
}
function formatAxis(value){const abs=Math.abs(value),digits=abs>=100?0:abs>=10?1:2;return Number(value).toFixed(digits);}
function formatUnit(value){
  const api=window.NOMAD_UNIT_CHART;
  if(api?.formatUnit)return api.formatUnit(value);
  const number=Number(value)||0;
  return `${number>=0?'+':''}${number.toFixed(2)}u`;
}
function formatDate(value){return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'}).format(new Date(value));}
function buildSeries(){
  const api=window.NOMAD_UNIT_CHART;
  if(!api?.buildSeries)return [];
  const built=api.buildSeries(rawRecords);
  return built?.invalid?[]:(Array.isArray(built?.points)?built.points:[]);
}
function visibleSeries(){
  const series=buildSeries();
  const view=window.NOMAD_STATISTICS_VIEWPORT?.get?.();
  if(!view||!series.length)return {series,view:{start:0,end:series.length,count:series.length}};
  const start=Math.max(0,Math.min(series.length,Number(view.start)||0));
  const end=Math.max(start,Math.min(series.length,Number(view.end)||series.length));
  return {series:series.slice(start,end),view:{...view,start,end,count:end-start}};
}
function setupCanvas(){
  if(!overlay)return null;
  const rect=overlay.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),dpr=Math.min(2.5,Math.max(1,window.devicePixelRatio||1));
  overlay.width=Math.round(width*dpr);overlay.height=Math.round(height*dpr);
  const ctx=overlay.getContext('2d');if(!ctx)return null;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  return {ctx,width,height};
}
function geometry(points,width,height){
  if(!points.length)return null;
  const plot={left:48,right:Math.max(58,width-10),top:9,bottom:Math.max(20,height-22)};
  const plotWidth=Math.max(1,plot.right-plot.left),plotHeight=Math.max(1,plot.bottom-plot.top);
  const values=[0,...points.flatMap(point=>[Number(point.open),Number(point.close)]).filter(Number.isFinite)];
  let low=Math.min(...values),high=Math.max(...values),span=high-low;if(span===0)span=2;
  const padding=Math.max(.15,span*.12);low=Math.min(0,low-padding);high=Math.max(0,high+padding);
  const range=Math.max(.000001,high-low),y=value=>plot.top+(high-value)/range*plotHeight,slot=plotWidth/points.length;
  return {plot,plotWidth,plotHeight,low,high,range,y,slot};
}
function drawGrid(ctx,g){
  const {plot,plotWidth,plotHeight,high,range}=g;
  ctx.save();ctx.lineWidth=1;
  for(let i=0;i<=8;i++){
    const ratio=i/8,y=plot.top+plotHeight*ratio;
    ctx.beginPath();ctx.moveTo(plot.left,y);ctx.lineTo(plot.right,y);
    ctx.strokeStyle=i===4?'rgba(137,143,139,.19)':'rgba(128,136,131,.105)';ctx.stroke();
  }
  for(let i=1;i<12;i++){
    const x=plot.left+plotWidth*(i/12);
    ctx.beginPath();ctx.moveTo(x,plot.top);ctx.lineTo(x,plot.bottom);
    ctx.strokeStyle=i===6?'rgba(137,143,139,.17)':'rgba(128,136,131,.085)';ctx.stroke();
  }
  if(state.mode!=='normal'){
    ctx.font='8px Arial, sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';
    for(let i=0;i<5;i++){
      const ratio=i/4,value=high-range*ratio,y=plot.top+plotHeight*ratio;
      ctx.fillStyle='rgba(148,156,151,.66)';ctx.fillText(formatAxis(value),plot.left-7,y);
    }
  }
  ctx.restore();
}
function drawReferences(ctx,g,points,width,height){
  if(state.mode==='normal')return;
  const {plot,y}=g,current=points.at(-1).close,currentY=y(current);
  ctx.save();
  const zeroY=y(0);ctx.beginPath();ctx.moveTo(plot.left,zeroY);ctx.lineTo(plot.right,zeroY);ctx.strokeStyle='rgba(176,185,179,.25)';ctx.lineWidth=1.1;ctx.stroke();
  ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(plot.left,currentY);ctx.lineTo(plot.right,currentY);ctx.strokeStyle=rgba(state.color,.48);ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
  const label=formatUnit(current);ctx.font='700 8px Arial, sans-serif';const lw=Math.ceil(ctx.measureText(label).width)+8,lh=14,lx=Math.max(plot.left,plot.right-lw),ly=Math.min(plot.bottom-lh,Math.max(plot.top,currentY-lh/2));
  ctx.fillStyle='rgba(15,17,16,.92)';ctx.fillRect(lx,ly,lw,lh);ctx.fillStyle=state.color;ctx.textBaseline='middle';ctx.textAlign='right';ctx.fillText(label,plot.right-4,ly+lh/2);
  ctx.fillStyle='rgba(152,160,145,.72)';ctx.textBaseline='bottom';ctx.textAlign='left';ctx.fillText(formatDate(points[0].settledAt),plot.left,height-4);ctx.textAlign='right';ctx.fillText(formatDate(points.at(-1).settledAt),plot.right,height-4);
  ctx.restore();
}
function drawGlow(ctx,g,points){
  const {plot,y,slot}=g;
  const coords=points.map((point,index)=>({x:plot.left+slot*(index+.5),y:y(point.close)}));
  if(coords.length<1)return;
  ctx.save();
  const gradient=ctx.createLinearGradient(0,plot.top,0,plot.bottom);
  gradient.addColorStop(0,rgba(state.color,.30));gradient.addColorStop(.58,rgba(state.color,.11));gradient.addColorStop(1,rgba(state.color,0));
  ctx.beginPath();ctx.moveTo(coords[0].x,plot.bottom);coords.forEach(p=>ctx.lineTo(p.x,p.y));ctx.lineTo(coords.at(-1).x,plot.bottom);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
  ctx.beginPath();coords.forEach((p,index)=>index?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.strokeStyle=state.color;ctx.lineWidth=1.15;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor=rgba(state.color,.52);ctx.shadowBlur=5;ctx.stroke();
  ctx.shadowBlur=0;ctx.globalAlpha=.42;ctx.lineWidth=.55;ctx.stroke();
  ctx.restore();
}
function drawCandle(ctx,g,points){
  const {plot,y,slot}=g,bodyWidth=Math.max(1,Math.min(9,slot*.56));
  ctx.save();
  points.forEach((point,index)=>{
    const x=plot.left+slot*(index+.5),openY=y(point.open),closeY=y(point.close),top=Math.min(openY,closeY),bottom=Math.max(openY,closeY);
    if(point.delta===0){ctx.beginPath();ctx.moveTo(x-bodyWidth/2,openY);ctx.lineTo(x+bodyWidth/2,openY);ctx.strokeStyle='rgba(169,177,172,.82)';ctx.lineWidth=1;ctx.stroke();return;}
    const rising=point.close>=point.open,color=rising?'#789b74':'#a06f66';
    ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.strokeStyle=rgba(color,.92);ctx.lineWidth=.8;ctx.stroke();
    ctx.fillStyle=rising?rgba(color,.64):rgba(color,.18);ctx.strokeStyle=rgba(color,.92);ctx.lineWidth=.8;
    const h=Math.max(1,bottom-top);ctx.fillRect(x-bodyWidth/2,top,bodyWidth,h);ctx.strokeRect(x-bodyWidth/2+.4,top+.4,Math.max(.2,bodyWidth-.8),Math.max(.2,h-.8));
  });
  ctx.restore();
}
function draw(){
  frame=0;if(!overlay||!baseCanvas)return;
  const ready=setupCanvas();if(!ready)return;
  const {ctx,width,height}=ready,{series:points,view}=visibleSeries();
  lastView=`${view.start}:${view.end}:${points.length}:${state.mode}:${state.color}:${Math.round(width)}:${Math.round(height)}`;
  if(!points.length)return;
  const g=geometry(points,width,height);if(!g)return;
  drawGrid(ctx,g);
  if(state.mode==='glow')drawGlow(ctx,g,points);
  else if(state.mode==='candle')drawCandle(ctx,g,points);
  drawReferences(ctx,g,points,width,height);
}
function schedule(){if(frame)return;frame=requestAnimationFrame(draw);}
function syncMode(){
  if(!chart)return;
  chart.dataset.statisticsChartMode=state.mode;
  chart.style.setProperty('--statistics-chart-vintage-color',state.color);
  panel?.querySelectorAll('[data-chart-style-mode]').forEach(node=>node.classList.toggle('is-active',node.dataset.chartStyleMode===state.mode));
  if(colorInput)colorInput.value=state.color;
  schedule();
}
function panelHtml(){
  return `<div class="statistics-chart-style-panel-head"><strong>CHART</strong><button type="button" data-chart-style-close aria-label="Close chart settings">×</button></div>
  <div class="statistics-chart-style-modes" role="group" aria-label="Chart type">
    <button type="button" data-chart-style-mode="glow">GLOW LINE</button>
    <button type="button" data-chart-style-mode="normal">NORMAL</button>
    <button type="button" data-chart-style-mode="candle">CANDLE</button>
  </div>
  <label class="statistics-chart-style-color"><span>LINE COLOR</span><input type="color" data-chart-style-color value="${state.color}" aria-label="Glow line color"></label>
  <p>Default: vintage glow line · Candle uses settled-result open → close.</p>`;
}
function setOpen(open){if(!panel||!button)return;panel.hidden=!open;button.setAttribute('aria-expanded',open?'true':'false');}
function mount(){
  if(chart?.isConnected&&overlay?.isConnected)return true;
  chart=document.querySelector('.cumulative-unit-chart');surface=chart?.querySelector('.cumulative-unit-surface')||null;baseCanvas=surface?.querySelector('.cumulative-unit-canvas')||null;
  const head=chart?.querySelector('.cumulative-unit-head')||null,total=head?.querySelector('[data-unit-total]')||null;
  if(!chart||!surface||!baseCanvas||!head||!total||!window.NOMAD_UNIT_CHART?.buildSeries)return false;
  chart.classList.add('has-statistics-chart-style');
  overlay=document.createElement('canvas');overlay.className='statistics-chart-style-overlay';overlay.setAttribute('aria-hidden','true');surface.appendChild(overlay);
  control=document.createElement('div');control.className='statistics-chart-style-control';
  button=document.createElement('button');button.type='button';button.className='statistics-chart-style-button';button.textContent='CHART';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Chart style settings');control.appendChild(button);total.insertAdjacentElement('beforebegin',control);
  panel=document.createElement('div');panel.className='statistics-chart-style-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Chart style settings');panel.hidden=true;panel.innerHTML=panelHtml();chart.appendChild(panel);colorInput=panel.querySelector('[data-chart-style-color]');
  button.addEventListener('click',event=>{event.stopPropagation();setOpen(panel.hidden);});
  panel.addEventListener('click',event=>{event.stopPropagation();const mode=event.target.closest('[data-chart-style-mode]')?.dataset?.chartStyleMode;if(MODES.has(mode)){state={...state,mode};saveState();syncMode();}if(event.target.closest('[data-chart-style-close]'))setOpen(false);});
  panel.addEventListener('input',event=>{if(event.target.matches('[data-chart-style-color]')&&validHex(event.target.value)){state={...state,color:event.target.value};saveState();syncMode();}});
  document.addEventListener('click',()=>setOpen(false));document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});
  const resync=()=>requestAnimationFrame(schedule);
  surface.addEventListener('wheel',resync,{passive:true});surface.addEventListener('pointermove',event=>{if(event.buttons===1)resync();},{passive:true});
  document.addEventListener('change',event=>{if(event.target?.closest?.('.statistics-chart-viewport-control'))resync();},true);
  document.addEventListener('click',event=>{if(event.target?.closest?.('.statistics-chart-viewport-control'))resync();},true);
  if('ResizeObserver'in window){resizeObserver=new ResizeObserver(schedule);resizeObserver.observe(surface);}else window.addEventListener('resize',schedule,{passive:true});
  syncMode();return true;
}
function ensureMount(){
  if(mount())return;
  if(mountObserver)return;
  mountObserver=new MutationObserver(()=>{if(mount()){mountObserver.disconnect();mountObserver=null;schedule();}});
  mountObserver.observe(document.documentElement,{childList:true,subtree:true});
}
window.addEventListener(EVENT_NAME,event=>{rawRecords=Array.isArray(event?.detail?.records)?event.detail.records:[];schedule();});
function start(){ensureMount();setInterval(()=>{if(!overlay?.isConnected)return;const view=window.NOMAD_STATISTICS_VIEWPORT?.get?.();const sig=view?`${view.start}:${view.end}:${view.total}`:'';if(sig&&!lastView.startsWith(`${view.start}:${view.end}:`))schedule();},400);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
