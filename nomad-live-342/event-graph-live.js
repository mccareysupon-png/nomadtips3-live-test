(()=>{
'use strict';

const finite=value=>{
  if(value===null||value===undefined||value===''||typeof value==='boolean')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
};
const at=(pair,index)=>Array.isArray(pair)?finite(pair[index]):null;
const delta=(first,last,key,index)=>{
  const a=at(first?.[key],index),b=at(last?.[key],index);
  return a===null||b===null?null:b-a;
};
const clamp=value=>Math.max(0,Math.min(100,Number(value)||0));
const PRESSURE_TOP=6;
const PRESSURE_BOTTOM=36;
const PRESSURE_LEFT=11;
const PRESSURE_RIGHT=96;
const Y_VALUES=[100,75,50,25,0];

function sortedSnapshots(match){
  return [...(match?.event?.snapshots||[])]
    .filter(snapshot=>Number.isFinite(Number(snapshot?.minute)))
    .sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
}

function pressureShare(first,last,config){
  const hA=delta(first,last,'attacks',0),aA=delta(first,last,'attacks',1);
  const hD=delta(first,last,'dangerous',0),aD=delta(first,last,'dangerous',1);
  if([hA,aA,hD,aD].some(value=>value===null))return null;
  const attackWeight=finite(config?.attackWeight)??1;
  const dangerousWeight=finite(config?.dangerousAttackWeight)??2;
  const homeWeighted=hA*attackWeight+hD*dangerousWeight;
  const awayWeighted=aA*attackWeight+aD*dangerousWeight;
  const total=Math.max(0,homeWeighted)+Math.max(0,awayWeighted);
  return total>0?clamp((Math.max(0,homeWeighted)/total)*100):0;
}

function pressureSeries(result){
  const rows=sortedSnapshots(result?.m);
  const windowMinutes=Math.max(1,finite(result?.c?.rollingWindowMinutes)??5);
  const points=[];
  for(let i=1;i<rows.length;i++){
    const last=rows[i],minute=Number(last.minute);
    const eligible=rows.slice(0,i+1).filter(row=>Number(row.minute)>=minute-windowMinutes&&Number(row.minute)<=minute);
    const first=eligible[0];
    if(!first||first===last||Number(first.minute)>=minute)continue;
    const home=pressureShare(first,last,result?.c);
    if(home===null)continue;
    points.push({minute,home:Number(home.toFixed(1)),away:Number((100-home).toFixed(1))});
  }
  return points.slice(-12);
}

function pressureY(value){
  return PRESSURE_BOTTOM-(clamp(value)/100)*(PRESSURE_BOTTOM-PRESSURE_TOP);
}

function pointsAttribute(series,key){
  return series.map((row,index)=>{
    const x=series.length===1?(PRESSURE_LEFT+PRESSURE_RIGHT)/2:PRESSURE_LEFT+(index/(series.length-1))*(PRESSURE_RIGHT-PRESSURE_LEFT);
    return `${x.toFixed(1)},${pressureY(row[key]).toFixed(1)}`;
  }).join(' ');
}

function ensureGrid(svg){
  svg.querySelectorAll('.pressure-grid-layer').forEach(node=>node.remove());
  const ns='http://www.w3.org/2000/svg';
  const group=document.createElementNS(ns,'g');
  group.setAttribute('class','pressure-grid-layer');
  for(const value of Y_VALUES){
    const line=document.createElementNS(ns,'line');
    line.setAttribute('class',`pressure-grid-line${value===50?' pressure-grid-balance':''}`);
    line.setAttribute('x1',String(PRESSURE_LEFT));
    line.setAttribute('x2',String(PRESSURE_RIGHT));
    line.setAttribute('y1',pressureY(value).toFixed(1));
    line.setAttribute('y2',pressureY(value).toFixed(1));
    group.appendChild(line);
  }
  svg.insertBefore(group,svg.firstChild);
}

function ensureYAxisLabels(chart,svg){
  const svgBox=svg.getBoundingClientRect(),chartBox=chart.getBoundingClientRect();
  if(!svgBox.width||!svgBox.height)return;
  let layer=chart.querySelector('.pressure-y-axis');
  if(!layer){
    layer=document.createElement('div');
    layer.className='pressure-y-axis';
    layer.setAttribute('aria-hidden','true');
    chart.appendChild(layer);
  }
  const existing=new Map([...layer.querySelectorAll('.pressure-y-label')].map(node=>[node.dataset.value,node]));
  for(const value of Y_VALUES){
    let label=existing.get(String(value));
    if(!label){
      label=document.createElement('span');
      label.className=`pressure-y-label${value===50?' pressure-y-label-balance':''}`;
      label.dataset.value=String(value);
      label.textContent=`${value}%`;
      layer.appendChild(label);
    }
    const left=(svgBox.left-chartBox.left)+1;
    const top=(svgBox.top-chartBox.top)+(pressureY(value)/42)*svgBox.height;
    label.style.left=`${left.toFixed(2)}px`;
    label.style.top=`${top.toFixed(2)}px`;
  }
}

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

function resultForCard(card){
  const id=String(card?.dataset?.matchId||'');
  const results=window.__nomad342EventResults;
  if(!id||!Array.isArray(results))return null;
  return results.find(result=>String(result?.m?.id)===id)||null;
}

function applyPressureGraph(card,chart){
  const result=resultForCard(card),svg=chart.querySelector('svg');
  const homeLine=chart.querySelector('.attack-home'),awayLine=chart.querySelector('.attack-away');
  if(!result||!svg||!homeLine||!awayLine)return false;
  const series=pressureSeries(result);
  if(series.length<2)return false;

  ensureGrid(svg);
  ensureYAxisLabels(chart,svg);
  homeLine.setAttribute('points',pointsAttribute(series,'home'));
  awayLine.setAttribute('points',pointsAttribute(series,'away'));
  svg.setAttribute('aria-label','Rolling pressure share from 0 to 100 percent');

  const axis=chart.querySelector('.chart-axis');
  const labels=axis?.querySelectorAll('span')||[];
  const first=series[0],last=series[series.length-1];
  if(labels[0])labels[0].textContent=`${first.minute}'`;
  if(labels[1])labels[1].textContent=`PRESSURE SHARE · HOME ${last.home.toFixed(1)}% · AWAY ${last.away.toFixed(1)}%`;
  if(labels[2])labels[2].textContent=`${last.minute}'`;
  chart.dataset.pressureScale='0-100';
  return true;
}

function enhanceAll(){
  document.querySelectorAll('.event-compact.expanded').forEach(card=>{
    const chart=card.querySelector('.attack-chart');
    if(!chart)return;
    applyPressureGraph(card,chart);
    positionDot(chart,'.attack-home','attack-endpoint-home');
    positionDot(chart,'.attack-away','attack-endpoint-away');
  });
}

function bindExpandedCardClickGuard(list){
  let replaying=false;
  let suppressUntil=0;

  list.addEventListener('click',event=>{
    if(replaying)return;

    const now=performance.now();
    if(now<suppressUntil){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const card=event.target.closest('.event-compact.expanded');
    const details=event.target.closest('.event-details');
    if(!card||!details||!list.contains(card))return;

    const id=String(card.dataset.matchId||'');
    if(!id)return;

    // Consume the user's click before the expanded card collapses and the
    // following card moves underneath the pointer. Replay one synthetic click
    // after this native interaction has finished so event-monitor.js updates
    // its private expandedMatches state without a click-through.
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressUntil=performance.now()+420;

    requestAnimationFrame(()=>{
      const current=list.querySelector(`.event-compact[data-match-id="${CSS.escape(id)}"]`);
      if(!current)return;
      replaying=true;
      try{
        current.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      }finally{
        replaying=false;
      }
    });
  },true);
}

let frame=0;
const schedule=()=>{
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;enhanceAll()});
};

function start(){
  if(document.body?.dataset?.page!=='live')return;
  const list=document.getElementById('matchList');
  if(list){
    bindExpandedCardClickGuard(list);
    new MutationObserver(schedule).observe(list,{childList:true,subtree:true});
  }
  window.addEventListener('resize',schedule,{passive:true});
  schedule();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();