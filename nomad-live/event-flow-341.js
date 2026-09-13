(()=>{'use strict';
const VERSION='341-5usd-event-flow-ui-v1';
const REFRESH_MS=3_000;
const CACHE_MS=2_500;
const cache=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const engineBase=()=>window.NOMAD_RUNTIME?.fiveUsdBase||window.NOMAD_RUNTIME?.engineBase||null;
const endpoint=id=>`${engineBase()}/fiveusd-event-flow?fixtureId=${encodeURIComponent(id)}&_=${Date.now()}`;

function teamNames(row){
  const raw=String(row?.querySelector('.teams')?.textContent||'').trim();
  const parts=raw.split(/\s+—\s+/);
  return {home:parts[0]||'HOME',away:parts[1]||'AWAY'};
}

async function fetchFlow(fixtureId,{force=false}={}){
  const id=String(fixtureId||'').trim();
  const base=engineBase();
  if(!id) throw new Error('FIXTURE_ID_REQUIRED');
  if(!base) throw new Error('ENGINE_BASE_UNAVAILABLE');
  const at=Date.now(),hit=cache.get(id);
  if(!force&&hit&&at-hit.at<CACHE_MS) return hit.data;
  const response=await fetch(endpoint(id),{cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok!==true) throw new Error(data?.error||`HTTP_${response.status}`);
  cache.set(id,{at,data});
  return data;
}

function xMaxFor(points){
  const maxMinute=Math.max(0,...points.map(p=>num(p.minute)??0));
  if(maxMinute>105) return 120;
  if(maxMinute>90) return 105;
  return 90;
}
function pointX(minute,w,pad,xMax){
  return pad.left+(clamp(num(minute)??0,0,xMax)/xMax)*(w-pad.left-pad.right);
}
function pointY(value,h,pad){
  return pad.top+((100-clamp(num(value)??0,0,100))/100)*(h-pad.top-pad.bottom);
}
function polyline(points,key,w,h,pad,xMax){
  return points.filter(p=>num(p[key])!==null&&num(p.minute)!==null).map(p=>`${pointX(p.minute,w,pad,xMax).toFixed(1)},${pointY(p[key],h,pad).toFixed(1)}`).join(' ');
}
function areaPath(points,key,w,h,pad,xMax){
  const rows=points.filter(p=>num(p[key])!==null&&num(p.minute)!==null);
  if(!rows.length) return '';
  const base=pointY(0,h,pad);
  const body=rows.map(p=>`L ${pointX(p.minute,w,pad,xMax).toFixed(1)} ${pointY(p[key],h,pad).toFixed(1)}`).join(' ');
  return `M ${pointX(rows[0].minute,w,pad,xMax).toFixed(1)} ${base.toFixed(1)} ${body} L ${pointX(rows.at(-1).minute,w,pad,xMax).toFixed(1)} ${base.toFixed(1)} Z`;
}
function grid(w,h,pad,xMax){
  const horizontal=[0,25,50,75,100].map(v=>{
    const y=pointY(v,h,pad);
    return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="nomad-flow-grid-line${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" class="nomad-flow-axis-label" text-anchor="end">${v}</text>`;
  }).join('');
  let vertical='';
  for(let minute=0;minute<=xMax;minute+=15){
    const x=pointX(minute,w,pad,xMax);
    vertical+=`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="nomad-flow-grid-line vertical"/><text x="${x}" y="${h-7}" class="nomad-flow-axis-label" text-anchor="middle">${minute}'</text>`;
  }
  return horizontal+vertical;
}

function render(el,payload){
  const flow=payload?.flow||{};
  const points=(Array.isArray(flow.series)?flow.series:[]).filter(p=>num(p.minute)!==null&&(num(p.home)!==null||num(p.away)!==null));
  const row=el.closest('.match-wrap');
  const names=teamNames(row);
  if(!points.length){
    el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · ATTACK MOMENTUM</b><small>5USD live history · vertical scale 0–100%</small></div><span>WAIT</span></div><div class="nomad-flow-empty">กำลังสะสมประวัติ Event Flow ของคู่นี้</div>`;
    return;
  }
  const w=1000,h=210,pad={left:40,right:18,top:16,bottom:27},xMax=xMaxFor(points);
  const homeLine=polyline(points,'home',w,h,pad,xMax),awayLine=polyline(points,'away',w,h,pad,xMax);
  const homeArea=areaPath(points,'home',w,h,pad,xMax),awayArea=areaPath(points,'away',w,h,pad,xMax);
  const last=points.at(-1),safeId=String(flow.fixtureId||el.dataset.eventFlowFixture||'flow').replace(/[^a-zA-Z0-9_-]/g,'_');
  const gh=`flow341-home-${safeId}`,ga=`flow341-away-${safeId}`;
  const lastHome=num(last.home),lastAway=num(last.away),lastMinute=num(last.minute);
  const endHome=lastHome===null?'':`<circle cx="${pointX(last.minute,w,pad,xMax)}" cy="${pointY(lastHome,h,pad)}" r="2.4" class="nomad-flow-end home"/>`;
  const endAway=lastAway===null?'':`<circle cx="${pointX(last.minute,w,pad,xMax)}" cy="${pointY(lastAway,h,pad)}" r="2.4" class="nomad-flow-end away"/>`;
  el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · ATTACK MOMENTUM</b><small>5USD · DANGER 30 · SOT 25 · ATTACK 20 · OFF 10 · CORNER 10 · POSSESSION 5</small></div><span>${points.length} PTS</span></div><div class="nomad-flow-legend"><span class="home"><i></i>${esc(names.home)} <b>${lastHome===null?'—':`${Math.round(lastHome)}%`}</b></span><span class="away"><i></i>${esc(names.away)} <b>${lastAway===null?'—':`${Math.round(lastAway)}%`}</b></span><small>0' → ${lastMinute===null?'LIVE':`${lastMinute}'`} · Y 0–100%</small></div><div class="nomad-flow-chart"><svg class="nomad-flow-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Event Flow 0 to 100 percent"><defs><linearGradient id="${gh}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#52d985" stop-opacity=".22"/><stop offset="100%" stop-color="#52d985" stop-opacity="0"/></linearGradient><linearGradient id="${ga}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e08d5f" stop-opacity=".20"/><stop offset="100%" stop-color="#e08d5f" stop-opacity="0"/></linearGradient></defs>${grid(w,h,pad,xMax)}${homeArea?`<path d="${homeArea}" class="nomad-flow-area home" fill="url(#${gh})"/>`:''}${awayArea?`<path d="${awayArea}" class="nomad-flow-area away" fill="url(#${ga})"/>`:''}${homeLine?`<polyline points="${homeLine}" class="nomad-flow-line home"/>`:''}${awayLine?`<polyline points="${awayLine}" class="nomad-flow-line away"/>`:''}${endHome}${endAway}</svg></div><div class="nomad-flow-foot"><span>แกนตั้ง 0–100% · HOME/AWAY วัดอิสระ</span><span>Engine 3s · กราฟอ่านจาก storage เท่านั้น ไม่เพิ่ม 5USD request</span></div>`;
}

function cardFor(row){
  if(!row?.matches?.('.match-wrap')) return null;
  const detail=row.querySelector('.match-detail');
  if(!detail) return null;
  let card=detail.querySelector(':scope > .nomad-event-flow-card[data-event-flow-341]');
  if(card) return card;
  card=document.createElement('section');
  card.className='nomad-event-flow-card';
  card.dataset.eventFlow341='1';
  card.dataset.eventFlowFixture=String(row.dataset.matchId||'');
  card.innerHTML='<div class="nomad-flow-loading">Event Flow · 5USD history</div>';
  detail.prepend(card);
  return card;
}

async function mount(row,{force=false}={}){
  if(!row?.open) return;
  const card=cardFor(row);
  if(!card) return;
  const id=String(row.dataset.matchId||'').trim();
  if(!id){card.innerHTML='<div class="nomad-flow-empty">Event Flow ยังไม่พร้อม · FIXTURE_ID_REQUIRED</div>';return;}
  if(card.dataset.flowLoading==='1') return;
  card.dataset.flowLoading='1';
  try{
    render(card,await fetchFlow(id,{force}));
    card.dataset.flowReady='1';
  }catch(error){
    card.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · ATTACK MOMENTUM</b><small>5USD live history · vertical scale 0–100%</small></div><span>WAIT</span></div><div class="nomad-flow-empty">Event Flow ยังไม่พร้อม · ${esc(error?.message||'DATA_ERROR')}</div>`;
  }finally{card.dataset.flowLoading='0';}
}

function hydrate(root=document,{force=false}={}){
  root.querySelectorAll?.('.match-wrap').forEach(row=>{
    cardFor(row);
    if(row.open) mount(row,{force});
  });
}

const observer=new MutationObserver(mutations=>{
  let needsHydrate=false;
  for(const mutation of mutations){
    if(mutation.type==='childList'){needsHydrate=true;break;}
    if(mutation.type==='attributes'&&mutation.attributeName==='open'){
      mount(mutation.target,{force:true});
    }
  }
  if(needsHydrate) hydrate(document);
});

function start(){
  const list=document.querySelector('.match-list');
  if(!list) return;
  observer.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  hydrate(list);
  setInterval(()=>hydrate(list,{force:true}),REFRESH_MS);
}

window.NOMAD_EVENT_FLOW_341={version:VERSION,fetchFlow,hydrate,render};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();