(()=>{
'use strict';
const pointFromPolyline=poly=>{
  const raw=String(poly?.getAttribute('points')||'').trim();
  if(!raw)return null;
  const last=raw.split(/\s+/).at(-1)?.split(',');
  if(!last||last.length<2)return null;
  const x=Number(last[0]),y=Number(last[1]);
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
};

function positionDot(chart,polySelector,className){
  const svg=chart.querySelector('svg'),poly=chart.querySelector(polySelector),point=pointFromPolyline(poly);
  if(!svg||!poly||!point)return;
  const svgBox=svg.getBoundingClientRect(),chartBox=chart.getBoundingClientRect();
  if(!svgBox.width||!svgBox.height)return;
  let dot=chart.querySelector(`.${className}`);
  if(!dot){
    dot=document.createElement('span');
    dot.className=`attack-endpoint ${className}`;
    dot.setAttribute('aria-hidden','true');
    chart.appendChild(dot);
  }
  const left=(svgBox.left-chartBox.left)+(point.x/100)*svgBox.width;
  const top=(svgBox.top-chartBox.top)+(point.y/42)*svgBox.height;
  dot.style.left=`${left.toFixed(2)}px`;
  dot.style.top=`${top.toFixed(2)}px`;
}

function enhanceAll(){
  document.querySelectorAll('.event-compact.expanded .attack-chart').forEach(chart=>{
    positionDot(chart,'.attack-home','attack-endpoint-home');
    positionDot(chart,'.attack-away','attack-endpoint-away');
  });
}

let frame=0;
const schedule=()=>{
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;enhanceAll()});
};

function start(){
  if(document.body?.dataset?.page!=='live')return;
  const list=document.getElementById('matchList');
  if(list)new MutationObserver(schedule).observe(list,{childList:true,subtree:true});
  window.addEventListener('resize',schedule,{passive:true});
  schedule();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
