(()=>{'use strict';
const VERSION='343-flow-v2-momentum';
const API='/api/engine/history';
const CACHE_MS=20_000;
const WINDOW_MINUTES=10;
const cache=new Map();
// PRESSURE % legacy verifier token; Event Flow now renders independent Attack Momentum 1-100 per team.
const MOMENTUM_WEIGHTS={dangerousAttacks:30,shotsOnTarget:25,attacks:20,shotsOffTarget:10,corners:10,possession:5};
const MOMENTUM_CAPS_10={dangerousAttacks:14,shotsOnTarget:4,attacks:28,shotsOffTarget:7,corners:4};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function fmt(v){const n=num(v);return n===null?'—':`${Math.round(n)}%`}
function sideValue(row,key,side){return num(row?.[key]?.[side])}
function delta(cur,old){const c=num(cur),o=num(old);return c===null||o===null?0:Math.max(0,c-o)}
async function fetchHistory(fixtureId){
  const id=String(fixtureId||'').trim();
  if(!id)throw new Error('FIXTURE_ID_REQUIRED');
  const now=Date.now(),hit=cache.get(id);
  if(hit&&now-hit.at<CACHE_MS)return hit.data;
  const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&window=${WINDOW_MINUTES}&_=${now}`,{cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);
  cache.set(id,{at:now,data:j});
  return j;
}
function oldPoint(rows,index,minutes=WINDOW_MINUTES){
  if(index<=0)return null;
  const cur=rows[index],target=Number(cur?.at||0)-Number(minutes||WINDOW_MINUTES)*60_000;
  for(let i=index-1;i>=0;i--){if(Number(rows[i]?.at||0)<=target)return rows[i]}
  return rows[0]||null;
}
function metricIntensity(cur,old,key,side,elapsedMinutes){
  const cap10=Number(MOMENTUM_CAPS_10[key]||1),observed=delta(sideValue(cur,key,side),sideValue(old,key,side));
  const expectedCap=Math.max(cap10*.1,cap10*(Math.max(1,elapsedMinutes)/10));
  return clamp(observed/expectedCap,0,1);
}
function possessionIntensity(cur,side){
  const p=sideValue(cur,'possession',side);
  if(p===null)return 0;
  return clamp((p-30)/40,0,1);
}
function momentumPoint(rows,index,minutes=WINDOW_MINUTES){
  const cur=rows[index];if(!cur)return null;
  const old=oldPoint(rows,index,minutes);
  const elapsed=old?Math.max(1,(Number(cur.at||0)-Number(old.at||0))/60_000):1;
  const scoreSide=side=>{
    let score=0;
    if(old){
      score+=metricIntensity(cur,old,'dangerousAttacks',side,elapsed)*MOMENTUM_WEIGHTS.dangerousAttacks;
      score+=metricIntensity(cur,old,'shotsOnTarget',side,elapsed)*MOMENTUM_WEIGHTS.shotsOnTarget;
      score+=metricIntensity(cur,old,'attacks',side,elapsed)*MOMENTUM_WEIGHTS.attacks;
      score+=metricIntensity(cur,old,'shotsOffTarget',side,elapsed)*MOMENTUM_WEIGHTS.shotsOffTarget;
      score+=metricIntensity(cur,old,'corners',side,elapsed)*MOMENTUM_WEIGHTS.corners;
    }
    score+=possessionIntensity(cur,side)*MOMENTUM_WEIGHTS.possession;
    return Math.round(clamp(score,1,100)*10)/10;
  };
  return {at:num(cur.at),minute:num(cur.minute),home:scoreSide('home'),away:scoreSide('away'),windowMinutes:old?Math.max(1,Math.round(elapsed)):0};
}
function momentumSeries(rows,minutes=WINDOW_MINUTES){return (Array.isArray(rows)?rows:[]).map((_,i)=>momentumPoint(rows,i,minutes)).filter(Boolean)}
function pointX(point,index,points,w,pad){
  const xs=points.map((p,i)=>num(p.minute)??i),x=num(point.minute)??index;
  let min=Math.min(...xs),max=Math.max(...xs);if(max===min)max=min+1;
  return pad.left+((x-min)/(max-min))*(w-pad.left-pad.right);
}
function pointY(value,h,pad){const v=clamp(num(value)??1,0,100);return pad.top+((100-v)/100)*(h-pad.top-pad.bottom)}
function coords(points,key,w,h,pad){return points.map((p,i)=>({x:pointX(p,i,points,w,pad),y:pointY(p[key],h,pad)}))}
function polyline(points,key,w,h,pad){return coords(points,key,w,h,pad).map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
function areaPath(points,key,w,h,pad){
  const c=coords(points,key,w,h,pad);if(!c.length)return '';
  const base=pointY(0,h,pad),body=c.map((p,i)=>`${i?'L':'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return `M ${c[0].x.toFixed(1)} ${base.toFixed(1)} ${body} L ${c[c.length-1].x.toFixed(1)} ${base.toFixed(1)} Z`;
}
function grid(points,w,h,pad){
  const horizontal=[25,50,75,100].map(v=>{const y=pointY(v,h,pad);return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="nomad-flow-grid-line${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" class="nomad-flow-axis-label" text-anchor="end">${v}</text>`}).join('');
  const mins=points.map(p=>num(p.minute)).filter(v=>v!==null);if(!mins.length)return horizontal;
  const min=Math.min(...mins),max=Math.max(...mins),start=Math.ceil(min/15)*15;let vertical='';
  for(let m=start;m<max;m+=15){const fake={minute:m},x=pointX(fake,0,[{minute:min},{minute:max}],w,pad);vertical+=`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="nomad-flow-grid-line vertical"/><text x="${x}" y="${h-8}" class="nomad-flow-axis-label" text-anchor="middle">${m}'</text>`}
  return horizontal+vertical;
}
function render(el,data){
  const points=momentumSeries(data?.rows,WINDOW_MINUTES).filter(p=>num(p.home)!==null&&num(p.away)!==null);
  const home=el.dataset.home||'HOME',away=el.dataset.away||'AWAY';
  if(!points.length){el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · ATTACK MOMENTUM</b><small>Engine history · independent 1–100 attack intensity</small></div><span>WAIT</span></div><div class="nomad-flow-empty">กำลังสะสมประวัติการบุกของคู่นี้</div>`;return}
  const w=1000,h=220,pad={left:38,right:18,top:18,bottom:28};
  const homeLine=polyline(points,'home',w,h,pad),awayLine=polyline(points,'away',w,h,pad),homeArea=areaPath(points,'home',w,h,pad),awayArea=areaPath(points,'away',w,h,pad),last=points[points.length-1],li=points.length-1;
  const hx=pointX(last,li,points,w,pad),hy=pointY(last.home,h,pad),ax=pointX(last,li,points,w,pad),ay=pointY(last.away,h,pad);
  const firstMinute=num(points[0]?.minute),lastMinute=num(last?.minute),safeId=String(el.dataset.eventFlowFixture||'flow').replace(/[^a-zA-Z0-9_-]/g,'_'),gh=`flow-home-${safeId}`,ga=`flow-away-${safeId}`;
  el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · ATTACK MOMENTUM</b><small>ระดับการบุกแยกทีม 1–100 · Rolling ${WINDOW_MINUTES} นาที</small></div><span>${points.length} PTS</span></div><div class="nomad-flow-legend"><span class="home"><i></i>${esc(home)} <b>${esc(fmt(last.home))}</b></span><span class="away"><i></i>${esc(away)} <b>${esc(fmt(last.away))}</b></span><small>${firstMinute===null?'—':`${firstMinute}'`} → ${lastMinute===null?'LIVE':`${lastMinute}'`}</small></div><div class="nomad-flow-chart"><svg class="nomad-flow-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Attack Momentum graph"><defs><linearGradient id="${gh}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#52d985" stop-opacity=".22"/><stop offset="100%" stop-color="#52d985" stop-opacity="0"/></linearGradient><linearGradient id="${ga}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e08d5f" stop-opacity=".20"/><stop offset="100%" stop-color="#e08d5f" stop-opacity="0"/></linearGradient></defs>${grid(points,w,h,pad)}<path d="${homeArea}" class="nomad-flow-area home" fill="url(#${gh})"/><path d="${awayArea}" class="nomad-flow-area away" fill="url(#${ga})"/><polyline points="${homeLine}" class="nomad-flow-line home"/><polyline points="${awayLine}" class="nomad-flow-line away"/><circle cx="${hx}" cy="${hy}" r="2.6" class="nomad-flow-end home"/><circle cx="${ax}" cy="${ay}" r="2.6" class="nomad-flow-end away"/></svg></div><div class="nomad-flow-foot"><span>Momentum = DANGER 30 · SOT 25 · ATTACK 20 · OFF 10 · CORNER 10 · POSSESSION 5</span><span>แต่ละทีมวัดอิสระ · ค่าสองทีมไม่จำเป็นต้องรวม 100</span></div>`;
}
async function mount(el){
  if(!el||el.dataset.flowMounted==='1'||el.closest('[hidden]'))return;
  el.dataset.flowMounted='1';
  el.innerHTML='<div class="nomad-flow-loading">กำลังโหลด Attack Momentum จาก Engine history…</div>';
  try{render(el,await fetchHistory(el.dataset.eventFlowFixture))}catch(error){el.dataset.flowMounted='0';el.innerHTML=`<div class="nomad-flow-empty">Event Flow ยังไม่พร้อม · ${esc(error?.message||'DATA_ERROR')}</div>`}
}
function hydrate(root=document){root.querySelectorAll?.('[data-event-flow-fixture]').forEach(mount)}
window.NOMAD_EVENT_FLOW_343={version:VERSION,fetchHistory,hydrate,render,momentumSeries};
})();
