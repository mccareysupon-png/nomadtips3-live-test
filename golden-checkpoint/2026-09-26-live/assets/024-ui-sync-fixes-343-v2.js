(()=>{
'use strict';
const NS='http://www.w3.org/2000/svg';
const HOME='#31b878';
const AWAY='#e2c94c';
const STAT_API='/api/engine/statistics';
let statLoaded=false;
let signalByFixture=new Map();

const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(String(v).match(/-?\d+(?:\.\d+)?/)?.[0]))?null:Number(String(v).match(/-?\d+(?:\.\d+)?/)?.[0]);
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const eventMinute=e=>num(e?.minute??e?.matchMinute??e?.elapsed??e?.time?.elapsed??e?.time?.minute??e?.clock?.minute);
const eventType=e=>String(e?.type??e?.event??e?.detail??e?.name??e?.subType??'Event');
const iconFor=e=>{const t=eventType(e).toLowerCase();if(t.includes('goal')&&!t.includes('kick'))return'⚽';if(t.includes('corner'))return'🚩';if(t.includes('yellow'))return'🟨';if(t.includes('red'))return'🟥';if(t.includes('shot')&&(t.includes('target')||t.includes('sot')))return'🎯';if(t.includes('shot'))return'↗';if(t.includes('sub'))return'↔';if(t.includes('save'))return'🧤';if(t.includes('danger'))return'⚡';return'•'};
function sideOf(e,home,away){
  const teamRaw=typeof e?.team==='string'?String(e.team).toLowerCase():'';
  const raw=String(e?.side??e?.teamSide??e?.homeAway??e?.position??teamRaw??'').toLowerCase();
  if(/(^|\b)home(\b|$)|^h$/.test(raw))return'home';
  if(/(^|\b)away(\b|$)|^a$/.test(raw))return'away';
  const team=e?.team&&typeof e.team==='object'?e.team:{};
  const teamId=String(team?.id??e?.teamId??''),homeId=String(home?.id??''),awayId=String(away?.id??'');
  if(teamId&&homeId&&teamId===homeId)return'home';
  if(teamId&&awayId&&teamId===awayId)return'away';
  const teamName=norm(team?.name??e?.teamName??(typeof e?.team==='string'?e.team:'')),homeName=norm(home?.name??home),awayName=norm(away?.name??away);
  if(teamName&&homeName&&(teamName===homeName||teamName.includes(homeName)||homeName.includes(teamName)))return'home';
  if(teamName&&awayName&&(teamName===awayName||teamName.includes(awayName)||awayName.includes(teamName)))return'away';
  return null;
}
function eventsOf(src){for(const list of [src?.liveEvents,src?.events,src?.eventHistory,src?.matchEvents,src?.timeline,src?.live?.events])if(Array.isArray(list)&&list.length)return list;return[]}
function currentMinute(src){return num(src?.mirrorMinute??src?.minute??src?.currentMinute??src?.elapsed)}
function currentFromSvg(svg){let max=null;svg?.querySelectorAll?.('text').forEach(t=>{const s=String(t.textContent||'').trim();if(!s.includes("'"))return;const m=num(s);if(m!==null&&(max===null||m>max))max=m});return max}
function pointAtX(path,x){try{const len=path.getTotalLength();if(!Number.isFinite(len)||len<=0)return null;let lo=0,hi=len;for(let i=0;i<24;i++){const mid=(lo+hi)/2,p=path.getPointAtLength(mid);if(p.x<x)lo=mid;else hi=mid}return path.getPointAtLength((lo+hi)/2)}catch{return null}}
function addTitle(node,text){const t=document.createElementNS(NS,'title');t.textContent=text;node.appendChild(t)}
function decorateFlow(svg,src){
  if(!svg||!src)return;
  svg.querySelectorAll('[data-b46-event-icon]').forEach(n=>n.remove());
  svg.querySelectorAll('.b46-signal-flow-event-stem,.b46-signal-flow-event-icon').forEach(n=>n.remove());
  const events=eventsOf(src);if(!events.length)return;
  const eventMax=events.reduce((m,e)=>Math.max(m,eventMinute(e)??0),0);
  const current=currentMinute(src)??currentFromSvg(svg)??eventMax;
  if(current===null||current<=0)return;
  const vb=svg.viewBox?.baseVal,w=vb?.width||1000;const left=42,right=18,usable=Math.max(1,w-left-right);
  const home=src?.home,away=src?.away;
  const homePath=svg.querySelector('.expand-flow-line.home,.b46-signal-flow-line-home');
  const awayPath=svg.querySelector('.expand-flow-line.away,.b46-signal-flow-line-away');
  if(!homePath||!awayPath)return;
  const used=new Map();
  events.map((e,i)=>({e,i,m:eventMinute(e),side:sideOf(e,home,away)})).filter(x=>x.m!==null&&x.m>=0&&x.m<=current&&x.side).sort((a,b)=>a.m-b.m||a.i-b.i).forEach(row=>{
    const key=`${row.m}:${row.side}`,n=used.get(key)||0;used.set(key,n+1);
    const baseX=left+(Math.min(current,row.m)/Math.max(1,current))*usable;
    const jitter=n?((n%2?1:-1)*Math.ceil(n/2)*7):0;
    const x=Math.max(left,Math.min(w-right,baseX+jitter)),path=row.side==='home'?homePath:awayPath,p=pointAtX(path,x);if(!p)return;
    const color=row.side==='home'?HOME:AWAY,label=row.side==='home'?(home?.name||home||'HOME'):(away?.name||away||'AWAY');
    const g=document.createElementNS(NS,'g');g.setAttribute('data-b46-event-icon','1');g.setAttribute('transform',`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);g.setAttribute('pointer-events','all');
    const c=document.createElementNS(NS,'circle');c.setAttribute('r','8.2');c.setAttribute('fill','rgba(255,255,255,.98)');c.setAttribute('stroke',color);c.setAttribute('stroke-width','1.8');c.setAttribute('vector-effect','non-scaling-stroke');
    const t=document.createElementNS(NS,'text');t.setAttribute('x','0');t.setAttribute('y','3.8');t.setAttribute('text-anchor','middle');t.setAttribute('font-size','11');t.setAttribute('font-family','Arial,Segoe UI Emoji,Apple Color Emoji,sans-serif');t.textContent=iconFor(row.e);
    addTitle(g,`${row.m}' · ${eventType(row.e)} · ${label}`);g.append(c,t);svg.appendChild(g);
  });
}
function decorateExpanded(root,fixture){const svg=root?.querySelector?.('.expand-flow-chart svg');if(svg)decorateFlow(svg,fixture)}
function decorateSignalFlows(){document.querySelectorAll('.next-signal-card[data-next-card]').forEach(card=>{const svg=card.querySelector('.expand-flow-chart svg,.b46-signal-flow-line-chart svg');if(!svg)return;const s=signalByFixture.get(String(card.dataset.nextCard||''));if(s)decorateFlow(svg,s)})}
function syncSignalCount(rows){const count=Array.isArray(rows)?rows.length:0;const apply=()=>{document.querySelectorAll('[data-signal-count],[data-workspace-signal-count]').forEach(el=>el.textContent=String(count))};apply();queueMicrotask(apply);requestAnimationFrame(apply);setTimeout(apply,50)}
function marketKey(r){const d=window.BALL46_MARKET_REGISTRY?.resolve?.(r);if(d?.family)return d.family;const x=String(r?.marketLabel||r?.market||r?.providerMarket||'').toLowerCase();if(/corner/.test(x))return'corners';if(/card/.test(x))return'cards';if(/btts|both teams/.test(x))return'btts';if(/asian|handicap|\bah\b/.test(x))return'ah';if(/over|under|o\/u|total/.test(x))return'ou';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';return'other'}
function paintStatCounts(rows){const counts={all:rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};rows.forEach(r=>{const k=marketKey(r);if(k in counts)counts[k]++});document.querySelectorAll('[data-stat-market]').forEach(btn=>{const b=btn.querySelector('b'),k=btn.dataset.statMarket;if(b&&k in counts)b.textContent=String(counts[k])})}
async function loadStatCountsOnce(){if(statLoaded)return;statLoaded=true;try{const r=await fetch(`${STAT_API}?menu_count=1`,{cache:'no-store'}),j=await r.json();if(!r.ok||j?.ok!==true||!Array.isArray(j?.rows))throw new Error('statistics unavailable');paintStatCounts(j.rows)}catch(err){statLoaded=false;console.warn('Statistics menu count preload failed',err)}}
window.addEventListener('ball46:signals-snapshot',e=>{const rows=Array.isArray(e.detail?.signals)?e.detail.signals:[];signalByFixture=new Map(rows.map(s=>[String(s?.fixtureId??s?.id??''),s]));syncSignalCount(rows);requestAnimationFrame(()=>requestAnimationFrame(decorateSignalFlows))});
document.addEventListener('nomad343:fixture-ready',e=>{const root=e.target?.closest?.('.match-expanded')||e.target;requestAnimationFrame(()=>decorateExpanded(root,e.detail?.fixture))});
document.addEventListener('click',e=>{if(e.target?.closest?.('[data-next-toggle]'))requestAnimationFrame(()=>requestAnimationFrame(decorateSignalFlows))});
document.addEventListener('ball46:workspace-view',e=>{if(e.detail?.view==='signal')requestAnimationFrame(()=>requestAnimationFrame(decorateSignalFlows))});
function init(){loadStatCountsOnce();const rows=window.NOMAD343_DASHBOARD_V2?.getSignals?.();if(Array.isArray(rows)){signalByFixture=new Map(rows.map(s=>[String(s?.fixtureId??s?.id??''),s]));syncSignalCount(rows);requestAnimationFrame(()=>requestAnimationFrame(decorateSignalFlows))}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
