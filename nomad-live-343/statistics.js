(()=>{
'use strict';

const STORE='nomad343.statistics.snapshot.v1';
const NS='http://www.w3.org/2000/svg';
const BOOK_COLORS=['#f0c95b','#e68a55','#b889f2','#63d4c8','#f279a6','#9fcf63','#72a7ff','#d89a63'];
const METRICS=[
  {key:'attacks',label:'ATTACKS',aliases:['attacks','attack']},
  {key:'dangerousAttacks',label:'DANGEROUS',aliases:['dangerousAttacks','dangerous_attacks','dangerous','dangerousAttack']},
  {key:'shotsOnTarget',label:'SOT',aliases:['shotsOnTarget','shots_on_target','sot','shotOnTarget']},
  {key:'shotsOffTarget',label:'SHOT OFF',aliases:['shotsOffTarget','shots_off_target','off','shotOff','shotsOff']},
  {key:'corners',label:'CORNERS',aliases:['corners','corner']},
  {key:'possession',label:'POSSESSION',aliases:['possession','possessionPct','possession_percent'],percent:true}
];

const $=id=>document.getElementById(id);
function num(v){
  if(v===null||v===undefined||v===''||typeof v==='boolean')return null;
  if(typeof v==='string')v=v.replace('%','').trim();
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function get(obj,path){return path.split('.').reduce((a,k)=>a&&a[k]!==undefined?a[k]:undefined,obj)}
function first(...values){return values.find(v=>v!==undefined&&v!==null&&v!=='')}
function pickNumber(obj,aliases){for(const key of aliases){const n=num(obj?.[key]);if(n!==null)return n}return null}
function sideStats(payload,side){
  const stats=payload?.stats||payload?.statistics||payload?.matchStats||{};
  const direct=stats?.[side]||stats?.[side==='home'?0:1]||{};
  const out={};
  for(const m of METRICS){
    let v=pickNumber(direct,m.aliases);
    if(v===null){
      for(const alias of m.aliases){
        const pair=stats?.[alias];
        if(Array.isArray(pair)){v=num(pair[side==='home'?0:1]);if(v!==null)break}
        if(pair&&typeof pair==='object'){v=num(pair[side]);if(v!==null)break}
      }
    }
    out[m.key]=v;
  }
  return out;
}
function fmt(v,percent=false){return v===null||v===undefined?'—':`${Number.isInteger(v)?v:Number(v).toFixed(1)}${percent?'%':''}`}
function scoreParts(payload,entry=false){
  const src=entry?(payload?.entry?.score||payload?.signal?.entryScore):(payload?.match?.score||payload?.score);
  if(Array.isArray(src))return [first(src[0],'—'),first(src[1],'—')];
  if(src&&typeof src==='object')return [first(src.home,src.h,'—'),first(src.away,src.a,'—')];
  if(typeof src==='string'){
    const m=src.match(/(\d+)\s*[-:]\s*(\d+)/);if(m)return [m[1],m[2]];
  }
  return ['—','—'];
}
function minuteText(v){const n=num(v);return n===null?'—':`${Math.round(n)}'`}

function renderHeader(payload){
  const match=payload?.match||{};
  $('leagueName').textContent=first(match.league,payload?.league,'—');
  $('homeName').textContent=first(match.home,match.homeName,payload?.home,'HOME');
  $('awayName').textContent=first(match.away,match.awayName,payload?.away,'AWAY');
  const [h,a]=scoreParts(payload,false);$('scoreNow').textContent=`${h} : ${a}`;
  $('minuteNow').textContent=minuteText(first(match.minute,payload?.minute));
  const entry=payload?.entry||payload?.signal||{};
  $('entryMarket').textContent=first(entry.market,payload?.market,'—');
  $('entryMinute').textContent=minuteText(first(entry.minute,entry.entryMinute));
  const [eh,ea]=scoreParts(payload,true);$('entryScore').textContent=`${eh} - ${ea}`;
  $('entryLine').textContent=first(entry.line,entry.selection,entry.pick,'—');
  const odds=num(first(entry.odds,entry.price,entry.entryOdds));$('entryOdds').textContent=odds===null?'—':odds.toFixed(2);
  const live=Boolean(payload&&Object.keys(payload).length);
  $('feedState').classList.toggle('is-live',live);
  $('feedState').querySelector('span').textContent=live?'LIVE DATA':'WAITING DATA';
}

function renderBars(payload){
  const home=sideStats(payload,'home'),away=sideStats(payload,'away');
  $('battleBars').innerHTML=METRICS.map((m,index)=>{
    const h=home[m.key],a=away[m.key];
    const scale=m.percent?100:Math.max(1,h||0,a||0);
    const hw=h===null?0:Math.max(0,Math.min(100,h/scale*100));
    const aw=a===null?0:Math.max(0,Math.min(100,a/scale*100));
    return `<div class="battle-row" data-index="${index}"><strong class="value">${esc(fmt(h,m.percent))}</strong><div class="bar-half home"><i style="width:${hw.toFixed(2)}%"></i></div><span class="battle-label">${esc(m.label)}</span><div class="bar-half away"><i style="width:${aw.toFixed(2)}%"></i></div><strong class="value">${esc(fmt(a,m.percent))}</strong></div>`;
  }).join('');
}

function svg(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n}
function clear(node){while(node.firstChild)node.removeChild(node.firstChild)}
function chartFrame(svgEl,w,h,pad,minX,maxX,minY,maxY,xLabel,yLabel){
  const plot={x:pad.l,y:pad.t,w:w-pad.l-pad.r,h:h-pad.t-pad.b};
  for(let i=0;i<=5;i++){
    const y=plot.y+plot.h*i/5;svgEl.appendChild(svg('line',{x1:plot.x,y1:y,x2:plot.x+plot.w,y2:y,class:'chart-grid'}));
    const value=maxY-(maxY-minY)*i/5;const t=svg('text',{x:plot.x-8,y:y+3,'text-anchor':'end',class:'chart-axis-text'});t.textContent=yLabel(value);svgEl.appendChild(t);
  }
  for(let i=0;i<=6;i++){
    const x=plot.x+plot.w*i/6;svgEl.appendChild(svg('line',{x1:x,y1:plot.y,x2:x,y2:plot.y+plot.h,class:'chart-grid'}));
    const value=minX+(maxX-minX)*i/6;const t=svg('text',{x,y:plot.y+plot.h+18,'text-anchor':'middle',class:'chart-axis-text'});t.textContent=xLabel(value);svgEl.appendChild(t);
  }
  return {
    plot,
    x:v=>plot.x+(v-minX)/Math.max(.000001,maxX-minX)*plot.w,
    y:v=>plot.y+plot.h-(v-minY)/Math.max(.000001,maxY-minY)*plot.h
  };
}
function pointsAttr(rows,x,y,key){return rows.map(r=>`${x(r.minute).toFixed(2)},${y(r[key]).toFixed(2)}`).join(' ')}
function addEntryMarker(svgEl,entryMinute,frame,minX,maxX,height){
  const e=num(entryMinute);if(e===null||e<minX||e>maxX)return;
  const x=frame.x(e);svgEl.appendChild(svg('line',{x1:x,y1:frame.plot.y,x2:x,y2:frame.plot.y+frame.plot.h,class:'entry-marker'}));
  const t=svg('text',{x:x+5,y:frame.plot.y+11,class:'entry-marker-label'});t.textContent=`ENTRY ${Math.round(e)}'`;svgEl.appendChild(t);
}

function normalizeEventRows(payload){
  const raw=payload?.eventHistory||payload?.eventFlow||payload?.events||[];
  if(!Array.isArray(raw))return [];
  return raw.map(r=>({
    minute:num(first(r?.minute,r?.min,r?.time)),
    home:num(first(r?.home,r?.homeValue,r?.homeScore,r?.h)),
    away:num(first(r?.away,r?.awayValue,r?.awayScore,r?.a))
  })).filter(r=>r.minute!==null&&r.home!==null&&r.away!==null).sort((a,b)=>a.minute-b.minute);
}
function renderEventChart(payload){
  const rows=normalizeEventRows(payload),el=$('eventChart'),empty=$('eventEmpty');clear(el);
  if(rows.length<2){empty.hidden=false;return}empty.hidden=true;
  const w=720,h=260,pad={l:42,r:16,t:15,b:30};
  let minX=Math.min(...rows.map(r=>r.minute)),maxX=Math.max(...rows.map(r=>r.minute));if(minX===maxX)maxX=minX+1;
  const maxY=Math.max(1,...rows.flatMap(r=>[r.home,r.away]));
  const f=chartFrame(el,w,h,pad,minX,maxX,0,maxY,v=>`${Math.round(v)}'`,v=>Number(v).toFixed(0));
  el.appendChild(svg('polyline',{points:pointsAttr(rows,f.x,f.y,'home'),class:'chart-home'}));
  el.appendChild(svg('polyline',{points:pointsAttr(rows,f.x,f.y,'away'),class:'chart-away'}));
  for(const r of rows){el.appendChild(svg('circle',{cx:f.x(r.minute),cy:f.y(r.home),r:2.6,class:'chart-point-home'}));el.appendChild(svg('circle',{cx:f.x(r.minute),cy:f.y(r.away),r:2.6,class:'chart-point-away'}))}
  addEntryMarker(el,first(payload?.entry?.minute,payload?.signal?.entryMinute),f,minX,maxX,h);
}

function normalizeBooks(payload){
  const direct=payload?.bookmakers||payload?.books;
  if(Array.isArray(direct)){
    return direct.map(b=>({name:first(b?.name,b?.bookmaker,b?.book),points:(b?.history||b?.points||b?.oddsHistory||[]).map(p=>({minute:num(first(p?.minute,p?.min,p?.time)),odds:num(first(p?.odds,p?.price,p?.value))})).filter(p=>p.minute!==null&&p.odds!==null).sort((a,b)=>a.minute-b.minute)})).filter(b=>b.name&&b.points.length);
  }
  const flat=payload?.oddsHistory;
  if(!Array.isArray(flat))return [];
  const map=new Map();
  for(const r of flat){
    const name=first(r?.bookmaker,r?.book,r?.name),minute=num(first(r?.minute,r?.min,r?.time)),odds=num(first(r?.odds,r?.price,r?.value));
    if(!name||minute===null||odds===null)continue;
    if(!map.has(name))map.set(name,[]);map.get(name).push({minute,odds});
  }
  return [...map].map(([name,points])=>({name,points:points.sort((a,b)=>a.minute-b.minute)}));
}
function renderBookChart(payload){
  const books=normalizeBooks(payload),el=$('bookmakerChart'),empty=$('bookmakerEmpty'),legend=$('bookmakerLegend');clear(el);legend.innerHTML='';
  if(!books.length){empty.hidden=false;return}empty.hidden=true;
  books.forEach((b,i)=>{const color=BOOK_COLORS[i%BOOK_COLORS.length];const span=document.createElement('span');span.innerHTML=`<i style="background:${color}"></i>${esc(b.name)}`;legend.appendChild(span)});
  const all=books.flatMap(b=>b.points);let minX=Math.min(...all.map(p=>p.minute)),maxX=Math.max(...all.map(p=>p.minute));if(minX===maxX)maxX=minX+1;
  let minY=Math.min(...all.map(p=>p.odds)),maxY=Math.max(...all.map(p=>p.odds));
  const spread=Math.max(.05,maxY-minY);minY=Math.max(1,minY-spread*.16);maxY=maxY+spread*.16;
  const w=1040,h=320,pad={l:52,r:18,t:18,b:32};
  const f=chartFrame(el,w,h,pad,minX,maxX,minY,maxY,v=>`${Math.round(v)}'`,v=>Number(v).toFixed(2));
  books.forEach((b,i)=>{
    const color=BOOK_COLORS[i%BOOK_COLORS.length];
    const p=svg('polyline',{points:b.points.map(r=>`${f.x(r.minute).toFixed(2)},${f.y(r.odds).toFixed(2)}`).join(' '),class:'bookmaker-line',stroke:color});el.appendChild(p);
    b.points.forEach(r=>el.appendChild(svg('circle',{cx:f.x(r.minute),cy:f.y(r.odds),r:2.7,class:'bookmaker-dot',fill:color})));
  });
  addEntryMarker(el,first(payload?.entry?.minute,payload?.signal?.entryMinute),f,minX,maxX,h);
}

function render(payload){payload=payload&&typeof payload==='object'?payload:{};renderHeader(payload);renderBars(payload);renderEventChart(payload);renderBookChart(payload)}
function update(payload,{persist=true}={}){
  if(!payload||typeof payload!=='object')return;
  if(persist){try{localStorage.setItem(STORE,JSON.stringify(payload))}catch{}}
  render(payload);
}
function read(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function start(){
  window.NOMAD343Statistics={update,read};
  window.addEventListener('nomad343:statistics',e=>update(e.detail?.payload||e.detail||{}, {persist:true}));
  const boot=window.NOMAD343_STATS||read()||{};render(boot);
  let last='';setInterval(()=>{try{const now=localStorage.getItem(STORE)||'';if(now&&now!==last){last=now;render(JSON.parse(now))}}catch{}},2000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();