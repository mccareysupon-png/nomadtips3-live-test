(()=>{
'use strict';
const HOME='#31b878';
const AWAY='#e2c94c';
const STAT_API='/api/engine/statistics';
const HISTORY_API='/api/engine/history';
const signalByFixture=new Map();
const historyCache=new Map();
let statLoaded=false;

const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const eventMinute=e=>num(e?.minute??e?.matchMinute??e?.elapsed??e?.time?.elapsed??e?.time?.minute??e?.clock?.minute);
const eventType=e=>String(e?.type??e?.event??e?.detail??e?.name??e?.subType??'Event');
const iconFor=e=>{const t=eventType(e).toLowerCase();if(t.includes('goal')&&!t.includes('kick'))return'⚽';if(t.includes('corner'))return'🚩';if(t.includes('yellow'))return'🟨';if(t.includes('red'))return'🟥';if(t.includes('shot')&&(t.includes('target')||t.includes('sot')))return'🎯';if(t.includes('shot'))return'↗';if(t.includes('sub'))return'↔';if(t.includes('save'))return'🧤';if(t.includes('danger'))return'⚡';return'•'};
function sideOf(e,home,away){const raw=String(e?.side??e?.teamSide??e?.homeAway??e?.position??'').toLowerCase();if(/(^|\b)home(\b|$)|^h$/.test(raw))return'home';if(/(^|\b)away(\b|$)|^a$/.test(raw))return'away';const team=e?.team&&typeof e.team==='object'?e.team:{};const teamId=String(team?.id??e?.teamId??''),homeId=String(home?.id??''),awayId=String(away?.id??'');if(teamId&&homeId&&teamId===homeId)return'home';if(teamId&&awayId&&teamId===awayId)return'away';const teamName=norm(team?.name??e?.teamName??(typeof e?.team==='string'?e.team:'')),homeName=norm(home?.name??home),awayName=norm(away?.name??away);if(teamName&&homeName&&(teamName===homeName||teamName.includes(homeName)||homeName.includes(teamName)))return'home';if(teamName&&awayName&&(teamName===awayName||teamName.includes(awayName)||awayName.includes(teamName)))return'away';return null}

function syncSignalCount(rows){
  const count=Array.isArray(rows)?rows.length:0;
  const apply=()=>{
    const source=document.querySelector('[data-signal-count]');
    const target=document.querySelector('[data-workspace-signal-count]');
    if(source)source.textContent=String(count);
    if(target)target.textContent=String(count);
  };
  apply();
  setTimeout(apply,0);
  requestAnimationFrame(apply);
}

function marketKey(r){
  const d=window.BALL46_MARKET_REGISTRY?.resolve?.(r);
  if(d?.family)return d.family;
  const x=String(r?.marketLabel||r?.market||r?.providerMarket||'').toLowerCase();
  if(/corner/.test(x))return'corners';
  if(/card/.test(x))return'cards';
  if(/btts|both teams/.test(x))return'btts';
  if(/asian|handicap|\bah\b/.test(x))return'ah';
  if(/over|under|o\/u|total/.test(x))return'ou';
  if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';
  return'other';
}
function paintStatCounts(rows){
  const counts={all:rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};
  rows.forEach(r=>{const k=marketKey(r);if(Object.prototype.hasOwnProperty.call(counts,k))counts[k]++});
  document.querySelectorAll('[data-stat-market]').forEach(btn=>{const b=btn.querySelector('b'),k=btn.dataset.statMarket;if(b&&Object.prototype.hasOwnProperty.call(counts,k))b.textContent=String(counts[k])});
}
async function loadStatCountsOnce(){
  if(statLoaded)return;
  statLoaded=true;
  try{
    const r=await fetch(`${STAT_API}?menu_count=1`,{cache:'no-store'}),j=await r.json();
    if(!r.ok||j?.ok!==true||!Array.isArray(j?.rows))throw new Error('statistics unavailable');
    paintStatCounts(j.rows);
  }catch(err){
    statLoaded=false;
    console.warn('Statistics menu count preload failed',err);
  }
}

function xFor(minute,w,pad,current){return pad.left+(clamp(minute,0,current)/Math.max(1,current))*(w-pad.left-pad.right)}
function yFor(value,h,pad){const v=clamp(value,1,100);return pad.top+((100-v)/99)*(h-pad.top-pad.bottom)}
function flowGrid(w,h,pad,current){
  const ys=[100,75,50,25,1].map(v=>{const y=yFor(v,h,pad);return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="expand-flow-grid${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" text-anchor="end" class="expand-flow-axis">${v}%</text>`}).join('');
  const step=current<=30?5:current<=60?10:15,marks=[0];for(let m=step;m<current;m+=step)marks.push(m);if(!marks.includes(current))marks.push(current);
  return ys+marks.map(m=>{const x=xFor(m,w,pad,current);return `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="expand-flow-grid v"/><text x="${x}" y="${h-7}" text-anchor="middle" class="expand-flow-axis">${m}'</text>`}).join('');
}
function pathLine(points,key,w,h,pad,current){return points.map((p,i)=>`${i?'L':'M'} ${xFor(p.minute,w,pad,current).toFixed(1)} ${yFor(p[key],h,pad).toFixed(1)}`).join(' ')}
function eventMarkers(events,current,home,away,w,h,pad){
  const stacks=new Map();
  return (Array.isArray(events)?events:[]).map((e,i)=>({e,i,m:eventMinute(e),side:sideOf(e,home,away)})).filter(x=>x.m!==null&&x.m>=0&&x.m<=current&&x.side).sort((a,b)=>a.m-b.m||a.i-b.i).map(row=>{
    const key=`${Math.round(row.m*10)/10}:${row.side}`,level=stacks.get(key)||0;stacks.set(key,level+1);
    const x=xFor(row.m,w,pad,current),y=row.side==='home'?pad.top+12+level*15:h-pad.bottom-17-level*15,color=row.side==='home'?HOME:AWAY,label=row.side==='home'?(home?.name||home||'HOME'):(away?.name||away||'AWAY');
    return `<g data-b46-event-icon="1" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><title>${esc(`${row.m}' · ${eventType(row.e)} · ${label}`)}</title><circle r="7.4" fill="rgba(255,255,255,.96)" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/><text x="0" y="3.6" text-anchor="middle" font-size="11" font-family="Arial,Segoe UI Emoji,Apple Color Emoji,sans-serif">${iconFor(row.e)}</text></g>`;
  }).join('');
}
async function getHistory(id){
  if(historyCache.has(id))return historyCache.get(id);
  const p=fetch(`${HISTORY_API}?fixtureId=${encodeURIComponent(id)}&window=10`,{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);return j}).catch(err=>{historyCache.delete(id);throw err});
  historyCache.set(id,p);
  return p;
}
function renderSignalFlow(host,s,history){
  if(!host||!s||!history)return;
  const current=Math.max(1,Math.round(Math.max(num(s?.mirrorMinute??s?.minute)??0,...(Array.isArray(history?.pressure)?history.pressure:[]).map(p=>num(p?.minute)??0))));
  const points=(Array.isArray(history?.pressure)?history.pressure:[]).map(p=>({minute:num(p?.minute),home:num(p?.home),away:num(p?.away)})).filter(p=>p.minute!==null&&p.home!==null&&p.away!==null&&p.minute>=0&&p.minute<=current+3).sort((a,b)=>a.minute-b.minute);
  const w=1000,h=232,pad={left:42,right:18,top:14,bottom:30};
  const home=s?.home,away=s?.away;
  if(!points.length){host.innerHTML=`<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'</b></div></div><div class="expand-empty">กำลังสะสม Event Flow ของคู่นี้</div>`;return}
  host.innerHTML=`<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'</b></div><small>Attack pressure · 1–100%</small></div><div class="expand-flow-legend"><span class="home"><i></i>${esc(home?.name||'HOME')} <b>${Math.round(points.at(-1).home)}%</b></span><span class="away"><i></i>${esc(away?.name||'AWAY')} <b>${Math.round(points.at(-1).away)}%</b></span></div><div class="expand-flow-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Event flow from minute zero to current minute">${flowGrid(w,h,pad,current)}<path d="${pathLine(points,'home',w,h,pad,current)}" class="expand-flow-line home"/><path d="${pathLine(points,'away',w,h,pad,current)}" class="expand-flow-line away"/>${eventMarkers(Array.isArray(s?.liveEvents)?s.liveEvents:(Array.isArray(s?.events)?s.events:[]),current,home,away,w,h,pad)}</svg></div>`;
}
async function ensureSignalFlows(){
  const jobs=[];
  document.querySelectorAll('.next-signal-card.open[data-next-card]').forEach(card=>{
    const id=String(card.dataset.nextCard||''),s=signalByFixture.get(id),detail=card.querySelector('.next-signal-detail');
    if(!s||!detail)return;
    let host=detail.querySelector('[data-b46-signal-flow]');
    if(!host){host=document.createElement('section');host.className='expand-card b46-signal-flow-card';host.dataset.b46SignalFlow='1';host.innerHTML='<div class="expand-loading">Loading Event Flow…</div>';const grid=detail.querySelector('.next-detail-grid');if(grid)grid.insertAdjacentElement('afterend',host);else detail.prepend(host)}
    jobs.push(getHistory(id).then(h=>renderSignalFlow(host,s,h)).catch(()=>{host.innerHTML='<div class="expand-card-head"><div><span>EVENT FLOW</span><b>Unavailable</b></div></div><div class="expand-empty">Event Flow unavailable</div>'}));
  });
  await Promise.allSettled(jobs);
}

window.addEventListener('ball46:signals-snapshot',e=>{
  const rows=Array.isArray(e.detail?.signals)?e.detail.signals:[];
  signalByFixture.clear();
  rows.forEach(s=>signalByFixture.set(String(s?.fixtureId??s?.id??''),s));
  syncSignalCount(rows);
  requestAnimationFrame(ensureSignalFlows);
});
document.addEventListener('click',e=>{if(e.target?.closest?.('[data-next-toggle]'))setTimeout(ensureSignalFlows,0)});
document.addEventListener('ball46:workspace-view',e=>{if(e.detail?.view==='signal')requestAnimationFrame(ensureSignalFlows)});

function init(){loadStatCountsOnce();const rows=window.NOMAD343_DASHBOARD_V2?.getSignals?.();if(Array.isArray(rows)){rows.forEach(s=>signalByFixture.set(String(s?.fixtureId??s?.id??''),s));syncSignalCount(rows)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
