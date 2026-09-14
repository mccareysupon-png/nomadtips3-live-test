(()=>{'use strict';
const VERSION='343-flow-v4-standard-match-events';
const API='/api/engine/history';
const CACHE_MS=20_000;
const RATE_WINDOW_MINUTES=5;
const EMA_ALPHA=.48;
const MIN_AVAILABLE_WEIGHT=40;
const cache=new Map();
const MOMENTUM_WEIGHTS={dangerousAttacks:30,shotsOnTarget:25,attacks:20,shotsOffTarget:10,corners:10,possession:5};
const MOMENTUM_CAPS_5={dangerousAttacks:8,shotsOnTarget:2,attacks:14,shotsOffTarget:3,corners:2};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function fmt(v){const n=num(v);return n===null?'—':`${Math.round(n)}%`}
function sideValue(row,key,side){return num(row?.[key]?.[side])}
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
function cleanRows(rows){
  const sorted=(Array.isArray(rows)?rows:[]).filter(r=>num(r?.at)!==null).slice().sort((a,b)=>Number(a.at)-Number(b.at));
  const out=[];
  for(const row of sorted){
    const last=out[out.length-1];
    if(last&&Number(last.at)===Number(row.at))out[out.length-1]=row;else out.push(row);
  }
  return out;
}
function metricIntensity(cur,prev,key,side,elapsedMinutes){
  const c=sideValue(cur,key,side),p=sideValue(prev,key,side);
  if(c===null||p===null||c<p)return null;
  const cap5=Number(MOMENTUM_CAPS_5[key]||1),cap=Math.max(cap5*.1,cap5*(Math.max(.5,elapsedMinutes)/RATE_WINDOW_MINUTES));
  return clamp((c-p)/cap,0,1);
}
function possessionIntensity(cur,side){
  const p=sideValue(cur,'possession',side);
  if(p===null)return null;
  return clamp((p-35)/30,0,1);
}
function rawMomentum(cur,prev,side){
  if(!cur||!prev)return null;
  const elapsed=Math.max(.5,(Number(cur.at)-Number(prev.at))/60_000);
  const metrics=[
    ['dangerousAttacks',metricIntensity(cur,prev,'dangerousAttacks',side,elapsed)],
    ['shotsOnTarget',metricIntensity(cur,prev,'shotsOnTarget',side,elapsed)],
    ['attacks',metricIntensity(cur,prev,'attacks',side,elapsed)],
    ['shotsOffTarget',metricIntensity(cur,prev,'shotsOffTarget',side,elapsed)],
    ['corners',metricIntensity(cur,prev,'corners',side,elapsed)],
    ['possession',possessionIntensity(cur,side)]
  ];
  let weighted=0,available=0;
  for(const [key,intensity] of metrics){
    if(intensity===null)continue;
    const weight=MOMENTUM_WEIGHTS[key]||0;
    weighted+=intensity*weight;
    available+=weight;
  }
  if(available<MIN_AVAILABLE_WEIGHT)return null;
  return clamp(weighted/available*100,1,100);
}
function momentumSeries(rows){
  const src=cleanRows(rows),out=[];
  let homeSmooth=null,awaySmooth=null;
  for(let i=0;i<src.length;i++){
    const cur=src[i],prev=i>0?src[i-1]:null;
    const homeRaw=rawMomentum(cur,prev,'home'),awayRaw=rawMomentum(cur,prev,'away');
    if(homeRaw!==null)homeSmooth=homeSmooth===null?homeRaw:(homeRaw*EMA_ALPHA+homeSmooth*(1-EMA_ALPHA));
    if(awayRaw!==null)awaySmooth=awaySmooth===null?awayRaw:(awayRaw*EMA_ALPHA+awaySmooth*(1-EMA_ALPHA));
    const home=homeSmooth===null?null:Math.round(clamp(homeSmooth,1,100)*10)/10;
    const away=awaySmooth===null?null:Math.round(clamp(awaySmooth,1,100)*10)/10;
    out.push({at:num(cur.at),minute:num(cur.minute),home,away,homeRaw:homeRaw===null?null:Math.round(homeRaw*10)/10,awayRaw:awayRaw===null?null:Math.round(awayRaw*10)/10});
  }
  return out;
}
function pointX(point,index,points,w,pad){
  const xs=points.map((p,i)=>num(p.at)??i),x=num(point.at)??index;
  let min=Math.min(...xs),max=Math.max(...xs);if(max===min)max=min+1;
  return pad.left+((x-min)/(max-min))*(w-pad.left-pad.right);
}
function pointY(value,h,pad){const v=clamp(num(value)??0,0,100);return pad.top+((100-v)/100)*(h-pad.top-pad.bottom)}
function coords(points,key,w,h,pad){return points.map((p,i)=>({x:pointX(p,i,points,w,pad),y:pointY(p[key],h,pad)}))}
function polyline(points,key,w,h,pad){return coords(points,key,w,h,pad).map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
function areaPath(points,key,w,h,pad){
  const c=coords(points,key,w,h,pad);if(!c.length)return '';
  const base=pointY(0,h,pad),body=c.map(p=>`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return `M ${c[0].x.toFixed(1)} ${base.toFixed(1)} ${body} L ${c[c.length-1].x.toFixed(1)} ${base.toFixed(1)} Z`;
}
function nearestMinutePoint(points,minute){
  let best=null,dist=Infinity;
  for(const p of points){const m=num(p.minute);if(m===null)continue;const d=Math.abs(m-minute);if(d<dist){best=p;dist=d}}
  return best;
}
function grid(points,w,h,pad){
  const horizontal=[25,50,75,100].map(v=>{const y=pointY(v,h,pad);return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="nomad-flow-grid-line${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" class="nomad-flow-axis-label" text-anchor="end">${v}</text>`}).join('');
  const mins=points.map(p=>num(p.minute)).filter(v=>v!==null);if(!mins.length)return horizontal;
  const min=Math.min(...mins),max=Math.max(...mins),start=Math.ceil(min/15)*15;let vertical='',used=new Set();
  for(let m=start;m<=max;m+=15){
    const p=nearestMinutePoint(points,m);if(!p)continue;const x=pointX(p,points.indexOf(p),points,w,pad),key=Math.round(x);if(used.has(key))continue;used.add(key);
    vertical+=`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="nomad-flow-grid-line vertical"/><text x="${x}" y="${h-8}" class="nomad-flow-axis-label" text-anchor="middle">${m}'</text>`;
  }
  return horizontal+vertical;
}
function eventRows(el){try{return JSON.parse(decodeURIComponent(el.dataset.events||'%5B%5D'))}catch{return[]}}
function eventMinute(e){const t=e?.time;const base=num(e?.minute??e?.elapsed??e?.match_minute??e?.min??(t&&typeof t==='object'?(t.elapsed??t.minute):t));if(base===null)return null;const extra=num(e?.extra??e?.stoppage??(t&&typeof t==='object'?t.extra:null));return{minute:base,extra:extra??0,total:base+(extra??0)/100}}
function eventSide(e,el){const raw=String(e?.side??e?.team_side??e?.home_away??'').toLowerCase();if(/home|local|host/.test(raw))return'home';if(/away|visitor|guest/.test(raw))return'away';const team=e?.team??e?.club??{},id=String(team?.id??e?.team_id??e?.teamId??''),name=String(team?.name??e?.team_name??e?.teamName??'').trim().toLowerCase();if(id&&id===String(el.dataset.homeId||''))return'home';if(id&&id===String(el.dataset.awayId||''))return'away';if(name&&name===String(el.dataset.home||'').trim().toLowerCase())return'home';if(name&&name===String(el.dataset.away||'').trim().toLowerCase())return'away';return'neutral'}
function eventKind(e){const txt=[e?.type,e?.event_type,e?.category,e?.detail,e?.name,e?.event].filter(Boolean).join(' ').toLowerCase();if(/penalt/.test(txt)&&/miss|saved|fail/.test(txt))return'penalty-miss';if(/own\s*goal|og\b/.test(txt))return'own-goal';if(/penalt/.test(txt)&&/goal|scor/.test(txt))return'penalty-goal';if(/goal/.test(txt))return'goal';if(/second\s*yellow|yellow.*red|2nd.*yellow/.test(txt))return'second-yellow';if(/yellow/.test(txt))return'yellow';if(/red/.test(txt))return'red';if(/sub|substitution|change/.test(txt))return'sub';if(/var|video assistant/.test(txt))return'var';if(/penalt/.test(txt))return'penalty';return null}
function eventPlayer(e){return String(e?.player?.name??e?.player_name??e?.playerName??e?.participant?.name??'').trim()}
function normalizeMatchEvents(el){const out=[];for(const e of eventRows(el)){const tm=eventMinute(e),kind=eventKind(e);if(!tm||!kind)continue;out.push({minute:tm.minute,extra:tm.extra,total:tm.total,side:eventSide(e,el),kind,player:eventPlayer(e),raw:e})}return out.sort((a,b)=>a.total-b.total)}
function eventIcon(kind){if(kind==='goal')return'⚽';if(kind==='own-goal')return'OG';if(kind==='yellow')return'';if(kind==='red')return'';if(kind==='second-yellow')return'2Y';if(kind==='sub')return'↕';if(kind==='var')return'VAR';if(kind==='penalty-goal')return'⚽P';if(kind==='penalty-miss')return'P×';if(kind==='penalty')return'P';return'•'}
function eventName(kind){return({'goal':'Goal','own-goal':'Own Goal','yellow':'Yellow Card','red':'Red Card','second-yellow':'Second Yellow / Red','sub':'Substitution','var':'VAR','penalty-goal':'Penalty Goal','penalty-miss':'Penalty Miss','penalty':'Penalty'})[kind]||'Event'}
function matchEventRail(el,events,lastMinute){if(!events.length)return'<div class="nomad-event-rail-empty">MATCH EVENTS · no timeline events yet</div>';const max=Math.max(90,Number(lastMinute||0),...events.map(e=>e.minute+(e.extra?1:0))),ticks=[];for(let m=0;m<=max;m+=15)ticks.push(m);if(ticks[ticks.length-1]<max)ticks.push(Math.ceil(max/15)*15);const groups=new Map();for(const e of events){const k=`${e.side}:${e.minute}:${e.extra}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}const tickHtml=ticks.map(m=>`<span class="nomad-event-tick" style="left:${clamp(m/max*100,0,100)}%"><i></i><small>${m}'</small></span>`).join('');const markerHtml=[...groups.values()].map(g=>{const e=g[0],left=clamp((e.minute+(e.extra||0)/100)/max*100,1,99),minute=`${e.minute}${e.extra?`+${e.extra}`:''}'`,title=g.map(x=>`${minute} · ${eventName(x.kind)}${x.player?` · ${x.player}`:''}`).join(' | '),icons=g.map(x=>`<b class="nomad-event-icon ${x.kind}" aria-hidden="true">${eventIcon(x.kind)}</b>`).join('');return`<span class="nomad-match-event ${e.side}" style="left:${left}%" title="${esc(title)}" aria-label="${esc(title)}"><span class="nomad-event-icons">${icons}</span><small>${minute}</small></span>`}).join('');return`<div class="nomad-event-rail"><div class="nomad-event-rail-head"><b>MATCH EVENTS</b><span>GOAL · CARDS · SUB · VAR · PENALTY</span></div><div class="nomad-event-track"><div class="nomad-event-line"></div>${tickHtml}${markerHtml}</div></div>`}
function render(el,data){
  const points=momentumSeries(data?.rows).filter(p=>num(p.home)!==null&&num(p.away)!==null);
  const home=el.dataset.home||'HOME',away=el.dataset.away||'AWAY';
  if(!points.length){el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · ATTACK MOMENTUM</b><small>Engine history · independent 1–100 attack intensity</small></div><span>WAIT</span></div><div class="nomad-flow-empty">กำลังสะสมประวัติการบุกของคู่นี้</div>`;return}
  const w=1000,h=220,pad={left:38,right:18,top:18,bottom:28};
  const homeLine=polyline(points,'home',w,h,pad),awayLine=polyline(points,'away',w,h,pad),homeArea=areaPath(points,'home',w,h,pad),awayArea=areaPath(points,'away',w,h,pad),last=points[points.length-1],li=points.length-1;
  const hx=pointX(last,li,points,w,pad),hy=pointY(last.home,h,pad),ax=hx,ay=pointY(last.away,h,pad);
  const firstMinute=num(points[0]?.minute),lastMinute=num(last?.minute),events=normalizeMatchEvents(el),eventRail=matchEventRail(el,events,lastMinute),safeId=String(el.dataset.eventFlowFixture||'flow').replace(/[^a-zA-Z0-9_-]/g,'_'),gh=`flow-home-${safeId}`,ga=`flow-away-${safeId}`;
  el.innerHTML=`<div class="nomad-flow-head"><div><b>EVENT FLOW · ATTACK MOMENTUM</b><small>เทียบการบุกจากช่วงข้อมูลใหม่ต่อช่วง · ปรับเป็นอัตรา ${RATE_WINDOW_MINUTES} นาที · Smooth EMA</small></div><span>${points.length} PTS</span></div><div class="nomad-flow-legend"><span class="home"><i></i>${esc(home)} <b>${esc(fmt(last.home))}</b></span><span class="away"><i></i>${esc(away)} <b>${esc(fmt(last.away))}</b></span><small>${firstMinute===null?'—':`${firstMinute}'`} → ${lastMinute===null?'LIVE':`${lastMinute}'`}</small></div><div class="nomad-flow-chart"><svg class="nomad-flow-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Attack Momentum graph"><defs><linearGradient id="${gh}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#52d985" stop-opacity=".22"/><stop offset="100%" stop-color="#52d985" stop-opacity="0"/></linearGradient><linearGradient id="${ga}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e08d5f" stop-opacity=".20"/><stop offset="100%" stop-color="#e08d5f" stop-opacity="0"/></linearGradient></defs>${grid(points,w,h,pad)}<path d="${homeArea}" class="nomad-flow-area home" fill="url(#${gh})"/><path d="${awayArea}" class="nomad-flow-area away" fill="url(#${ga})"/><polyline points="${homeLine}" class="nomad-flow-line home"/><polyline points="${awayLine}" class="nomad-flow-line away"/><circle cx="${hx}" cy="${hy}" r="2.4" class="nomad-flow-end home"/><circle cx="${ax}" cy="${ay}" r="2.4" class="nomad-flow-end away"/></svg></div>${eventRail}<div class="nomad-flow-foot"><span>Momentum = DANGER 30 · SOT 25 · ATTACK 20 · OFF 10 · CORNER 10 · POSSESSION 5</span><span>แกนเวลาใช้ timestamp จริง · ไม่ย้อนจากนาทีซ้ำ/นาทีหาย · สองทีมวัดอิสระ</span></div>`;
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