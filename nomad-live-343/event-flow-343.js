(()=>{'use strict';
const VERSION='343-flow-v1';
const API='/api/engine/history';
const CACHE_MS=20_000;
const cache=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
function fmt(v){const n=num(v);return n===null?'—':`${n.toFixed(1).replace(/\.0$/,'')}%`}
async function fetchHistory(fixtureId){
  const id=String(fixtureId||'').trim();
  if(!id)throw new Error('FIXTURE_ID_REQUIRED');
  const now=Date.now(),hit=cache.get(id);
  if(hit&&now-hit.at<CACHE_MS)return hit.data;
  const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&window=10&_=${now}`,{cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);
  cache.set(id,{at:now,data:j});
  return j;
}
function pointX(point,index,points,w,pad){
  const xs=points.map((p,i)=>num(p.minute)??i),x=num(point.minute)??index;
  let min=Math.min(...xs),max=Math.max(...xs);if(max===min)max=min+1;
  return pad.left+((x-min)/(max-min))*(w-pad.left-pad.right);
}
function pointY(value,h,pad){const v=Math.max(0,Math.min(100,num(value)??50));return pad.top+((100-v)/100)*(h-pad.top-pad.bottom)}
function polyline(points,key,w,h,pad){return points.map((p,i)=>`${pointX(p,i,points,w,pad).toFixed(1)},${pointY(p[key],h,pad).toFixed(1)}`).join(' ')}
function grid(points,w,h,pad){
  const horizontal=[25,50,75].map(v=>{const y=pointY(v,h,pad);return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="nomad-flow-grid-line${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" class="nomad-flow-axis-label" text-anchor="end">${v}</text>`}).join('');
  const mins=points.map(p=>num(p.minute)).filter(v=>v!==null);if(!mins.length)return horizontal;
  const min=Math.min(...mins),max=Math.max(...mins),start=Math.ceil(min/15)*15;let vertical='';
  for(let m=start;m<max;m+=15){const fake={minute:m},x=pointX(fake,0,[{minute:min},{minute:max}],w,pad);vertical+=`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="nomad-flow-grid-line vertical"/><text x="${x}" y="${h-8}" class="nomad-flow-axis-label" text-anchor="middle">${m}'</text>`}
  return horizontal+vertical;
}
function render(el,data){
  const points=Array.isArray(data?.pressure)?data.pressure.filter(p=>num(p.home)!==null&&num(p.away)!==null):[];
  const home=el.dataset.home||'HOME',away=el.dataset.away||'AWAY';
  if(!points.length){el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · PRESSURE %</b><small>Engine history · 10-minute rolling pressure</small></div><span>WAIT</span></div><div class="nomad-flow-empty">กำลังสะสมประวัติแรงบุกของคู่นี้</div>`;return}
  const w=1000,h=220,pad={left:38,right:18,top:18,bottom:28};
  const homeLine=polyline(points,'home',w,h,pad),awayLine=polyline(points,'away',w,h,pad),last=points[points.length-1],li=points.length-1;
  const hx=pointX(last,li,points,w,pad),hy=pointY(last.home,h,pad),ax=pointX(last,li,points,w,pad),ay=pointY(last.away,h,pad);
  const firstMinute=num(points[0]?.minute),lastMinute=num(last?.minute);
  el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · PRESSURE %</b><small>ตั้งแต่ Engine เริ่มมีข้อมูล · Rolling ${esc(data.pressureWindowMinutes||10)} นาที</small></div><span>${points.length} PTS</span></div><div class="nomad-flow-legend"><span class="home"><i></i>${esc(home)} <b>${esc(fmt(last.home))}</b></span><span class="away"><i></i>${esc(away)} <b>${esc(fmt(last.away))}</b></span><small>${firstMinute===null?'—':`${firstMinute}'`} → ${lastMinute===null?'LIVE':`${lastMinute}'`}</small></div><div class="nomad-flow-chart"><svg class="nomad-flow-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Event Flow pressure graph">${grid(points,w,h,pad)}<polyline points="${homeLine}" class="nomad-flow-line home"/><polyline points="${awayLine}" class="nomad-flow-line away"/><circle cx="${hx}" cy="${hy}" r="3.2" class="nomad-flow-end home"/><circle cx="${ax}" cy="${ay}" r="3.2" class="nomad-flow-end away"/></svg></div><div class="nomad-flow-foot"><span>Pressure = DANGER 30 · ATTACK 20 · SOT 20 · OFF 10 · CORNER 10 · POSSESSION 10</span><span>ข้อมูลกลางจาก Engine · หน้า Live และ Signal ใช้ชุดเดียวกัน</span></div>`;
}
async function mount(el){
  if(!el||el.dataset.flowMounted==='1'||el.closest('[hidden]'))return;
  el.dataset.flowMounted='1';
  el.innerHTML='<div class="nomad-flow-loading">กำลังโหลด Event Flow จาก Engine history…</div>';
  try{render(el,await fetchHistory(el.dataset.eventFlowFixture))}catch(error){el.dataset.flowMounted='0';el.innerHTML=`<div class="nomad-flow-empty">Event Flow ยังไม่พร้อม · ${esc(error?.message||'DATA_ERROR')}</div>`}
}
function hydrate(root=document){root.querySelectorAll?.('[data-event-flow-fixture]').forEach(mount)}
window.NOMAD_EVENT_FLOW_343={version:VERSION,fetchHistory,hydrate,render};
})();
