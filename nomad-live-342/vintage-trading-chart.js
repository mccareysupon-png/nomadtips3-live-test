(()=>{
'use strict';
const NS='http://www.w3.org/2000/svg';
const STORAGE_KEY='nomad342ChartUiV1';
const DEFAULT_MODE='glow';
const MODES=new Set(['normal','glow','candle']);
let state=loadState();
let chartSerial=0;
let frame=0;

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    return {mode:MODES.has(saved.mode)?saved.mode:DEFAULT_MODE};
  }catch{return {mode:DEFAULT_MODE}}
}
function saveState(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({mode:state.mode}))}catch{}}
function svgNode(tag,attrs={}){
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}
function parsePoints(poly){
  return String(poly?.getAttribute('points')||'').trim().split(/\s+/).map(pair=>{
    const [x,y]=pair.split(',').map(Number);
    return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null
  }).filter(Boolean);
}
function areaPath(points){
  if(points.length<2)return '';
  const first=points[0],last=points[points.length-1];
  return `M ${first.x} 37 L ${points.map(p=>`${p.x} ${p.y}`).join(' L ')} L ${last.x} 37 Z`;
}
function cardPalette(card){
  const style=getComputedStyle(card);
  const home=String(style.getPropertyValue('--vt-home')||'').trim();
  const away=String(style.getPropertyValue('--vt-away')||'').trim();
  return home&&away?{home,away}:null;
}
function addStop(gradient,offset,color,opacity){
  gradient.appendChild(svgNode('stop',{offset,'stop-color':color,'stop-opacity':opacity}));
}
function ensureDefs(svg,uid,palette){
  let defs=svg.querySelector('.vtc-defs');
  if(defs)return defs;
  defs=svgNode('defs',{class:'vtc-defs'});
  const home=svgNode('linearGradient',{id:`${uid}-home-gradient`,x1:'0',y1:'0',x2:'0',y2:'1'});
  const away=svgNode('linearGradient',{id:`${uid}-away-gradient`,x1:'0',y1:'0',x2:'0',y2:'1'});
  addStop(home,'0%',palette.home,.34);addStop(home,'62%',palette.home,.10);addStop(home,'100%',palette.home,0);
  addStop(away,'0%',palette.away,.28);addStop(away,'62%',palette.away,.08);addStop(away,'100%',palette.away,0);
  defs.append(home,away);svg.insertBefore(defs,svg.firstChild);
  return defs;
}
function syncGradient(defs,uid,palette){
  const sync=(id,color,top,mid)=>{
    const stops=defs.querySelectorAll(`#${CSS.escape(id)} stop`);
    if(stops[0]){stops[0].setAttribute('stop-color',color);stops[0].setAttribute('stop-opacity',String(top))}
    if(stops[1]){stops[1].setAttribute('stop-color',color);stops[1].setAttribute('stop-opacity',String(mid))}
    if(stops[2])stops[2].setAttribute('stop-color',color);
  };
  sync(`${uid}-home-gradient`,palette.home,.34,.10);
  sync(`${uid}-away-gradient`,palette.away,.28,.08);
}
function ensureGrid(svg){
  let group=svg.querySelector('.vtc-grid-extra');
  if(group)return group;
  group=svgNode('g',{class:'vtc-grid-extra','aria-hidden':'true'});
  const vertical=8;
  for(let i=1;i<vertical;i++){
    const x=4+(92/vertical)*i;
    group.appendChild(svgNode('line',{x1:x.toFixed(2),y1:'8',x2:x.toFixed(2),y2:'37',class:i===4?'vtc-grid-major':''}));
  }
  [8,12.8,17.6,22.4,27.2,32,36.8].forEach((y,i)=>group.appendChild(svgNode('line',{x1:'4',y1:y,x2:'96',y2:y,class:i===3?'vtc-grid-major':''})));
  const firstNonDefs=[...svg.children].find(node=>node.tagName.toLowerCase()!=='defs');
  svg.insertBefore(group,firstNonDefs||null);
  return group;
}
function ensureAreas(svg,uid,homePoints,awayPoints){
  let group=svg.querySelector('.vtc-areas');
  if(!group){
    group=svgNode('g',{class:'vtc-areas','aria-hidden':'true'});
    const grid=svg.querySelector('.vtc-grid-extra');
    if(grid?.nextSibling)svg.insertBefore(group,grid.nextSibling);else svg.appendChild(group);
  }
  let home=group.querySelector('.vtc-area-home'),away=group.querySelector('.vtc-area-away');
  if(!home){home=svgNode('path',{class:'vtc-area vtc-area-home'});group.appendChild(home)}
  if(!away){away=svgNode('path',{class:'vtc-area vtc-area-away'});group.appendChild(away)}
  home.setAttribute('d',areaPath(homePoints));
  away.setAttribute('d',areaPath(awayPoints));
  home.setAttribute('fill',`url(#${uid}-home-gradient)`);
  away.setAttribute('fill',`url(#${uid}-away-gradient)`);
}
function addCandleSeries(group,points,color,offset){
  for(let i=1;i<points.length;i++){
    const open=points[i-1],close=points[i],x=close.x+offset,rise=close.y<open.y;
    const top=Math.min(open.y,close.y),bottom=Math.max(open.y,close.y);
    group.appendChild(svgNode('line',{class:'vtc-candle-wick',x1:x.toFixed(2),x2:x.toFixed(2),y1:top.toFixed(2),y2:bottom.toFixed(2),stroke:color}));
    group.appendChild(svgNode('rect',{class:`vtc-candle-body ${rise?'is-rise':'is-fall'}`,x:(x-.42).toFixed(2),y:top.toFixed(2),width:'.84',height:Math.max(.52,bottom-top).toFixed(2),fill:color,stroke:color}));
  }
}
function ensureCandles(svg,homePoints,awayPoints,palette){
  let group=svg.querySelector('.vtc-candles');
  if(!group){group=svgNode('g',{class:'vtc-candles','aria-hidden':'true'});svg.appendChild(group)}
  group.replaceChildren();
  addCandleSeries(group,homePoints,palette.home,-.52);
  addCandleSeries(group,awayPoints,palette.away,.52);
}
function controlMarkup(){
  return `<button class="vtc-settings-toggle" type="button" aria-label="Chart settings" aria-expanded="false">⚙</button><div class="vtc-settings-panel" hidden><div class="vtc-mode-row"><button class="vtc-mode-button" type="button" data-mode="normal">NORMAL</button><button class="vtc-mode-button" type="button" data-mode="glow">GLOW</button><button class="vtc-mode-button" type="button" data-mode="candle">CANDLE</button></div><div class="vtc-settings-note">Colors follow match palette</div></div>`;
}
function positionControl(card,chart,control){
  const cardRect=card.getBoundingClientRect(),chartRect=chart.getBoundingClientRect();
  if(!cardRect.width||!chartRect.width)return;
  control.style.top=`${Math.max(4,chartRect.top-cardRect.top+5).toFixed(1)}px`;
  control.style.right=`${Math.max(4,cardRect.right-chartRect.right+5).toFixed(1)}px`;
}
function ensureControl(card,chart){
  let control=card.querySelector(':scope > .vtc-control');
  if(!control){
    control=document.createElement('div');
    control.className='vtc-control';
    control.innerHTML=controlMarkup();
    card.appendChild(control);
    control.addEventListener('click',event=>{
      event.stopPropagation();
      const toggle=event.target.closest('.vtc-settings-toggle');
      if(toggle){
        const panel=control.querySelector('.vtc-settings-panel'),open=panel.hidden;
        panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));return;
      }
      const modeButton=event.target.closest('[data-mode]');
      if(modeButton){
        const next=modeButton.dataset.mode;
        if(MODES.has(next)){state={mode:next};saveState();applyAll()}
      }
    });
  }
  control.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('is-active',button.dataset.mode===state.mode));
  positionControl(card,chart,control);
  return control;
}
function applyChart(chart,palette){
  const svg=chart.querySelector('svg'),home=chart.querySelector('.attack-home'),away=chart.querySelector('.attack-away');
  if(!svg||!home||!away)return;
  const uid=chart.dataset.vtcUid,defs=svg.querySelector('.vtc-defs');
  if(defs&&uid)syncGradient(defs,uid,palette);
  chart.classList.remove('vtc-mode-normal','vtc-mode-glow','vtc-mode-candle');
  chart.classList.add(`vtc-mode-${state.mode}`);
  chart.style.setProperty('--vtc-home',palette.home);
  chart.style.setProperty('--vtc-away',palette.away);
  if(state.mode==='normal'){
    home.style.removeProperty('stroke');away.style.removeProperty('stroke');
    home.style.removeProperty('filter');away.style.removeProperty('filter');
  }else{
    home.style.setProperty('stroke',palette.home,'important');
    away.style.setProperty('stroke',palette.away,'important');
  }
}
function enhanceChart(chart){
  const card=chart.closest('.event-compact.vintage-theme-ready');
  const svg=chart.querySelector('svg'),home=chart.querySelector('.attack-home'),away=chart.querySelector('.attack-away');
  if(!card||!svg||!home||!away)return;
  const palette=cardPalette(card);
  if(!palette)return;
  card.classList.add('vtc-host');
  const homePoints=parsePoints(home),awayPoints=parsePoints(away);
  if(homePoints.length<2||awayPoints.length<2)return;

  if(!chart.dataset.vtcReady){
    const uid=`vtc-${++chartSerial}`;
    chart.dataset.vtcUid=uid;
    const defs=ensureDefs(svg,uid,palette);
    syncGradient(defs,uid,palette);
    ensureGrid(svg);
    ensureAreas(svg,uid,homePoints,awayPoints);
    ensureCandles(svg,homePoints,awayPoints,palette);
    chart.dataset.vtcReady='1';
  }else{
    const uid=chart.dataset.vtcUid,defs=svg.querySelector('.vtc-defs');
    if(defs&&uid)syncGradient(defs,uid,palette);
    if(state.mode==='candle')ensureCandles(svg,homePoints,awayPoints,palette);
  }
  ensureControl(card,chart);
  applyChart(chart,palette);
}
function applyAll(){
  document.querySelectorAll('.event-compact.vintage-theme-ready.expanded .attack-chart').forEach(enhanceChart);
}
function schedule(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;applyAll()});
}
function start(){
  if(document.body?.dataset?.vintageChartPage!=='page2')return;
  const list=document.getElementById('matchList');
  if(!list)return;
  new MutationObserver(schedule).observe(list,{childList:true,subtree:true});
  window.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('click',event=>{
    if(event.target.closest('.vtc-control'))return;
    document.querySelectorAll('.vtc-settings-panel:not([hidden])').forEach(panel=>{
      panel.hidden=true;
      panel.parentElement?.querySelector('.vtc-settings-toggle')?.setAttribute('aria-expanded','false');
    });
  });
  schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
