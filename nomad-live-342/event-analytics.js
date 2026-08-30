(()=>{
'use strict';

function finite(v){
  if(v===null||v===undefined||v===''||typeof v==='boolean')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function at(pair,index){return Array.isArray(pair)?finite(pair[index]):null}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function delta(first,last,key,index){
  const a=at(first?.[key],index),b=at(last?.[key],index);
  return a===null||b===null?null:b-a;
}
function pairKnown(pair){return Array.isArray(pair)&&pair.length>=2&&pair[0]!==null&&pair[1]!==null}
function sumKnown(a,b){return a===null||b===null?null:a+b}
function fmt(v){return v===null||v===undefined?'—':String(v)}
function fmtDelta(v){return v===null||v===undefined?'—':`${v>=0?'+':''}${v}`}
function sortedSnapshots(m){
  return [...(m?.event?.snapshots||[])]
    .filter(s=>Number.isFinite(Number(s?.minute)))
    .sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
}
function latestTotals(m){
  const rows=sortedSnapshots(m),s=rows[rows.length-1]||null;
  return {
    attacks:[at(s?.attacks,0),at(s?.attacks,1)],
    dangerous:[at(s?.dangerous,0),at(s?.dangerous,1)],
    sot:[at(s?.sot,0),at(s?.sot,1)],
    off:[at(s?.off,0),at(s?.off,1)],
    corner:[at(s?.corner,0),at(s?.corner,1)]
  };
}
function rollingPairs(em){
  if(!em)return [];
  return [
    {key:'ATTACKS',short:'ATTACK',pair:[em.hA,em.aA]},
    {key:'DANGEROUS ATTACKS',short:'DANGER',pair:[em.hD,em.aD]},
    {key:'SHOTS ON TARGET',short:'SOT',pair:[em.hSot,em.aSot]},
    {key:'SHOTS OFF TARGET',short:'OFF',pair:[em.hOff,em.aOff]},
    {key:'CORNERS',short:'CORNER',pair:[em.hCorner,em.aCorner]}
  ];
}
function pulseSeries(m,c){
  const rows=sortedSnapshots(m).slice(-14),out=[];
  for(let i=1;i<rows.length;i++){
    const first=rows[i-1],last=rows[i];
    const hA=delta(first,last,'attacks',0),aA=delta(first,last,'attacks',1),hD=delta(first,last,'dangerous',0),aD=delta(first,last,'dangerous',1);
    if([hA,aA,hD,aD].some(v=>v===null))continue;
    const home=Math.max(0,hA)*(Number(c?.attackWeight)||1)+Math.max(0,hD)*(Number(c?.dangerousAttackWeight)||2);
    const away=Math.max(0,aA)*(Number(c?.attackWeight)||1)+Math.max(0,aD)*(Number(c?.dangerousAttackWeight)||2);
    out.push({from:Number(first.minute),to:Number(last.minute),home,away});
  }
  return out.slice(-10);
}
function pressureDonut(r){
  const em=r.event?.metrics,share=em?Math.max(0,Math.min(100,Number(em.pressureShare)||0)):0,away=100-share;
  return `<div class="na-pressure-wrap"><div class="na-pressure-ring" style="--na-home:${share.toFixed(1)}%" role="img" aria-label="HOME pressure ${share.toFixed(1)} percent"><div><strong>${em?`${share.toFixed(1)}%`:'—'}</strong><span>HOME PRESSURE</span></div></div><div class="na-pressure-split"><span><b>HOME</b>${em?share.toFixed(1):'—'}%</span><span><b>AWAY</b>${em?away.toFixed(1):'—'}%</span></div></div>`;
}
function matchPulse(r){
  const em=r.event?.metrics,window=em?`${em.from}'–${em.to}'`:`${Math.max(0,Number(r.m?.minute||0)-Number(r.c?.rollingWindowMinutes||5))}'–${r.m?.minute||'—'}'`;
  return `<section class="na-section na-match-pulse"><div class="na-section-head"><div><span>MATCH PULSE</span><small>live analytical layer</small></div><span class="na-section-tag">GREEN = HOME · GRAY = AWAY</span></div><div class="na-pulse-grid">${pressureDonut(r)}<div class="na-pulse-summary"><div><span>TREND</span><strong>${em?`${em.trendPass}/3`:'—'}</strong></div><div><span>ROLLING WINDOW</span><strong>${esc(window)}</strong></div><div><span>EVENT GATE</span><strong class="${r.event?.pass?'na-positive':'na-neutral'}">${r.event?.pass?'PASS':'WAIT'}</strong></div><div><span>FEED</span><strong class="${r.m?.freshness?.stale?'na-neutral':'na-positive'}">${r.m?.freshness?.stale?'STALE':'LIVE'}</strong></div></div></div></section>`;
}
function momentumPulse(r){
  const series=pulseSeries(r.m,r.c);
  if(!series.length)return `<section class="na-section"><div class="na-section-head"><div><span>MOMENTUM PULSE</span><small>weighted ATTACK + DANGEROUS ATTACK</small></div></div><div class="na-empty">Building minute-to-minute momentum…</div></section>`;
  const max=Math.max(1,...series.flatMap(x=>[x.home,x.away]));
  const columns=series.map(x=>{
    const hh=Math.max(3,Math.round((x.home/max)*38)),ah=Math.max(3,Math.round((x.away/max)*38));
    return `<div class="na-momentum-col" title="${esc(`${x.from}'–${x.to}' · HOME ${x.home} · AWAY ${x.away}`)}"><div class="na-momentum-half na-momentum-home"><i style="height:${hh}px"></i></div><div class="na-momentum-half na-momentum-away"><i style="height:${ah}px"></i></div><span>${esc(x.to)}'</span></div>`;
  }).join('');
  return `<section class="na-section"><div class="na-section-head"><div><span>MOMENTUM PULSE</span><small>recent weighted pressure by interval</small></div><div class="na-legend"><span><i class="na-dot-home"></i>HOME</span><span><i class="na-dot-away"></i>AWAY</span></div></div><div class="na-momentum"><div class="na-momentum-label na-home-label">HOME</div><div class="na-momentum-columns">${columns}</div><div class="na-momentum-label na-away-label">AWAY</div></div></section>`;
}
function pressureShift(r){
  const em=r.event?.metrics;
  if(!em)return `<section class="na-section na-shift"><div class="na-section-head"><div><span>PRESSURE SHIFT</span><small>current rolling balance</small></div></div><div class="na-empty">Waiting for rolling pressure…</div></section>`;
  const home=Math.max(0,Math.min(100,Number(em.pressureShare)||0)),away=100-home;
  const state=home>=58?'HOME CONTROL':home<=42?'AWAY CONTROL':'BALANCED';
  return `<section class="na-section na-shift"><div class="na-section-head"><div><span>PRESSURE SHIFT</span><small>current rolling balance</small></div><strong class="${home>=58?'na-positive':'na-neutral'}">${state}</strong></div><div class="na-shift-bar" role="img" aria-label="HOME ${home.toFixed(1)} percent, AWAY ${away.toFixed(1)} percent"><i class="na-shift-home" style="width:${home.toFixed(1)}%"></i><i class="na-shift-away" style="width:${away.toFixed(1)}%"></i></div><div class="na-shift-values"><span>HOME <b>${home.toFixed(1)}</b></span><span><b>${away.toFixed(1)}</b> AWAY</span></div></section>`;
}
function eventTimeline(r){
  const rows=sortedSnapshots(r.m).slice(-14),events=[];
  const defs=[['sot','SOT'],['off','SHOT OFF'],['corner','CORNER']];
  for(let i=1;i<rows.length;i++){
    const first=rows[i-1],last=rows[i];
    for(const [key,label] of defs){
      for(const side of [0,1]){
        const d=delta(first,last,key,side);
        if(d!==null&&d>0)events.push({minute:Number(last.minute),side:side===0?'HOME':'AWAY',label,count:d});
      }
    }
  }
  const recent=events.slice(-10);
  const body=recent.length?recent.map(e=>`<div class="na-timeline-event ${e.side==='HOME'?'home':'away'}"><span>${esc(e.minute)}'</span><i></i><strong>${esc(e.label)}${e.count>1?` ×${esc(e.count)}`:''}</strong><small>${e.side}</small></div>`).join(''):`<div class="na-empty">No recent SOT / SHOT OFF / CORNER change stored yet.</div>`;
  return `<section class="na-section"><div class="na-section-head"><div><span>EVENT TIMELINE</span><small>recent stored event changes</small></div></div><div class="na-timeline">${body}</div></section>`;
}
function battleMetric(label,pair){
  const home=pair?.[0]??null,away=pair?.[1]??null,max=Math.max(1,finite(home)||0,finite(away)||0);
  const hw=home===null?0:Math.max(0,Math.min(100,(home/max)*100)),aw=away===null?0:Math.max(0,Math.min(100,(away/max)*100));
  return `<div class="na-battle-item"><span class="na-battle-title">${esc(label)}</span><div class="na-battle-row"><b>HOME</b><div><i class="home" style="width:${hw.toFixed(1)}%"></i></div><strong>${esc(fmtDelta(home))}</strong></div><div class="na-battle-row"><b>AWAY</b><div><i class="away" style="width:${aw.toFixed(1)}%"></i></div><strong>${esc(fmtDelta(away))}</strong></div></div>`;
}
function battleBars(r){
  const em=r.event?.metrics;
  if(!em)return `<section class="na-section"><div class="na-section-head"><div><span>LAST ${esc(r.c?.rollingWindowMinutes||5)} MINUTES</span><small>rolling battle bars</small></div></div><div class="na-empty">Rolling comparison is still building…</div></section>`;
  const shots=[sumKnown(em.hSot,em.hOff),sumKnown(em.aSot,em.aOff)];
  const rows=[['ATTACKS',[em.hA,em.aA]],['DANGEROUS',[em.hD,em.aD]],['SHOTS',shots],['SOT',[em.hSot,em.aSot]],['CORNERS',[em.hCorner,em.aCorner]]];
  return `<section class="na-section"><div class="na-section-head"><div><span>LAST ${esc(r.c?.rollingWindowMinutes||5)} MINUTES</span><small>HOME vs AWAY rolling changes</small></div></div><div class="na-battle-grid">${rows.map(x=>battleMetric(x[0],x[1])).join('')}</div></section>`;
}
function radarPoint(cx,cy,radius,index,count,ratio){
  const angle=(-Math.PI/2)+(index/count)*Math.PI*2;
  return [cx+Math.cos(angle)*radius*ratio,cy+Math.sin(angle)*radius*ratio];
}
function radar(r){
  const axes=rollingPairs(r.event?.metrics).filter(x=>pairKnown(x.pair));
  if(axes.length<3)return `<section class="na-section"><div class="na-section-head"><div><span>RADAR COMPARISON</span><small>normalized rolling profile</small></div></div><div class="na-empty">Radar needs at least 3 comparable rolling metrics.</div></section>`;
  const count=axes.length,cx=50,cy=50,radius=36;
  const outer=axes.map((_,i)=>radarPoint(cx,cy,radius,i,count,1).map(n=>n.toFixed(2)).join(',')).join(' ');
  const mid=axes.map((_,i)=>radarPoint(cx,cy,radius,i,count,.55).map(n=>n.toFixed(2)).join(',')).join(' ');
  const home=[],away=[];
  for(let i=0;i<count;i++){
    const h=Math.max(0,finite(axes[i].pair[0])||0),a=Math.max(0,finite(axes[i].pair[1])||0),max=Math.max(1,h,a);
    home.push(radarPoint(cx,cy,radius,i,count,h/max).map(n=>n.toFixed(2)).join(','));
    away.push(radarPoint(cx,cy,radius,i,count,a/max).map(n=>n.toFixed(2)).join(','));
  }
  const labels=axes.map((axis,i)=>{
    const [x,y]=radarPoint(cx,cy,44,i,count,1);
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle">${esc(axis.short)}</text>`;
  }).join('');
  return `<section class="na-section"><div class="na-section-head"><div><span>RADAR COMPARISON</span><small>normalized per available metric · ${count}/5 axes</small></div><div class="na-legend"><span><i class="na-dot-home"></i>HOME</span><span><i class="na-dot-away"></i>AWAY</span></div></div><div class="na-radar"><svg viewBox="0 0 100 100" role="img" aria-label="HOME and AWAY rolling radar comparison"><polygon class="na-radar-grid" points="${outer}"/><polygon class="na-radar-grid na-radar-mid" points="${mid}"/><polygon class="na-radar-away" points="${away.join(' ')}"/><polygon class="na-radar-home" points="${home.join(' ')}"/>${labels}</svg><div class="na-radar-values">${axes.map(a=>`<span>${esc(a.short)} <b>${esc(fmtDelta(a.pair[0]))}</b> / ${esc(fmtDelta(a.pair[1]))}</span>`).join('')}</div></div></section>`;
}
function streak(r){
  const series=pulseSeries(r.m,r.c);
  if(!series.length)return {leader:'BUILDING',cycles:0,minutes:0};
  const last=series[series.length-1],leader=last.home>last.away?'HOME':last.away>last.home?'AWAY':'BALANCED';
  if(leader==='BALANCED')return {leader,cycles:1,minutes:Math.max(0,last.to-last.from)};
  let cycles=0,start=last.to,end=last.to;
  for(let i=series.length-1;i>=0;i--){
    const row=series[i],rowLeader=row.home>row.away?'HOME':row.away>row.home?'AWAY':'BALANCED';
    if(rowLeader!==leader)break;
    cycles++;start=row.from;
  }
  return {leader,cycles,minutes:Math.max(0,end-start)};
}
function quality(r){
  const rows=sortedSnapshots(r.m),totals=latestTotals(r.m),checks=[
    !r.m?.freshness?.stale,
    rows.length>=2,
    Boolean(r.event?.metrics),
    pairKnown(totals.sot),
    pairKnown(totals.off),
    pairKnown(totals.corner)
  ];
  const score=Math.round((checks.filter(Boolean).length/checks.length)*100);
  const label=score>=80?'STRONG':score>=60?'MODERATE':'LIMITED';
  return {score,label};
}
function streakQuality(r){
  const s=streak(r),q=quality(r),leaderClass=s.leader==='HOME'?'na-positive':'na-neutral';
  return `<section class="na-section"><div class="na-section-head"><div><span>PRESSURE STREAK & DATA QUALITY</span><small>descriptive live evidence · not win probability</small></div></div><div class="na-quality-grid"><div class="na-streak-card"><span>PRESSURE STREAK</span><strong class="${leaderClass}">${esc(s.leader)}</strong><div><b>${esc(s.cycles)}</b> CYCLES <i></i> <b>${esc(s.minutes)}</b> MIN</div></div><div class="na-quality-card"><div><span>LIVE DATA QUALITY</span><strong>${esc(q.label)}</strong></div><div class="na-quality-track"><i class="${q.label==='LIMITED'?'limited':''}" style="width:${q.score}%"></i></div><small>${q.score}% DATA COVERAGE</small></div></div></section>`;
}
function buildTop(r){return `${matchPulse(r)}${momentumPulse(r)}${pressureShift(r)}${eventTimeline(r)}`}
function buildBottom(r){return `${battleBars(r)}${radar(r)}${streakQuality(r)}`}
function hydrateCard(card,r){
  if(!card||!r||card.dataset.analyticsReady==='1'||!card.classList.contains('expanded'))return;
  const details=card.querySelector('.event-details');
  if(!details)return;
  const top=document.createElement('div');
  top.className='nomad-analytics-layer nomad-analytics-top';
  top.innerHTML=buildTop(r);
  details.prepend(top);
  const bottom=document.createElement('div');
  bottom.className='nomad-analytics-layer nomad-analytics-bottom';
  bottom.innerHTML=buildBottom(r);
  const reason=details.querySelector('.event-reason');
  if(reason)details.insertBefore(bottom,reason);else details.append(bottom);
  card.dataset.analyticsReady='1';
}
function hydrateAll(){
  const results=window.__nomad342EventResults;
  if(!Array.isArray(results))return;
  const byId=new Map(results.map(r=>[String(r?.m?.id),r]));
  document.querySelectorAll('.event-compact.expanded').forEach(card=>hydrateCard(card,byId.get(String(card.dataset.matchId))));
}
function start(){
  if(document.body?.dataset?.page!=='live')return;
  const list=document.getElementById('matchList');
  if(!list)return;
  let queued=false;
  const queue=()=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;hydrateAll()});
  };
  new MutationObserver(queue).observe(list,{childList:true});
  list.addEventListener('click',()=>setTimeout(queue,0));
  list.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')setTimeout(queue,0)});
  queue();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
