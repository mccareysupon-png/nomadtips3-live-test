(()=>{
'use strict';
const NS='http://www.w3.org/2000/svg';
const HOME='#31b878';
const AWAY='#e2c94c';

const num=v=>{
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  const m=String(v).match(/\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
};
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const eventMinute=e=>num(e?.minute??e?.matchMinute??e?.elapsed??e?.time?.elapsed??e?.time?.minute??e?.clock?.minute);
const eventType=e=>String(e?.type??e?.event??e?.detail??e?.name??e?.subType??'Event');
const iconFor=e=>{
  const t=eventType(e).toLowerCase();
  if(t.includes('goal')&&!t.includes('kick'))return'⚽';
  if(t.includes('corner'))return'🚩';
  if(t.includes('yellow'))return'🟨';
  if(t.includes('red'))return'🟥';
  if(t.includes('shot')&&(t.includes('target')||t.includes('sot')))return'🎯';
  if(t.includes('shot'))return'↗';
  if(t.includes('sub'))return'↔';
  if(t.includes('save'))return'🧤';
  if(t.includes('danger'))return'⚡';
  return'•';
};

function sideOf(e,home,away){
  const raw=String(e?.side??e?.teamSide??e?.homeAway??e?.position??'').toLowerCase();
  if(/(^|\b)home(\b|$)|^h$/.test(raw))return'home';
  if(/(^|\b)away(\b|$)|^a$/.test(raw))return'away';
  const team=e?.team&&typeof e.team==='object'?e.team:{};
  const teamId=String(team?.id??e?.teamId??'');
  const homeId=String(home?.id??'');
  const awayId=String(away?.id??'');
  if(teamId&&homeId&&teamId===homeId)return'home';
  if(teamId&&awayId&&teamId===awayId)return'away';
  const teamName=norm(team?.name??e?.teamName??(typeof e?.team==='string'?e.team:''));
  const homeName=norm(home?.name??home);
  const awayName=norm(away?.name??away);
  if(teamName&&homeName&&(teamName===homeName||teamName.includes(homeName)||homeName.includes(teamName)))return'home';
  if(teamName&&awayName&&(teamName===awayName||teamName.includes(awayName)||awayName.includes(teamName)))return'away';
  return null;
}

function eventList(fixture){
  if(Array.isArray(fixture?.events))return fixture.events;
  if(Array.isArray(fixture?.liveEvents))return fixture.liveEvents;
  if(Array.isArray(fixture?.timelineEvents))return fixture.timelineEvents;
  return [];
}

function appendTitle(node,text){
  const t=document.createElementNS(NS,'title');
  t.textContent=text;
  node.appendChild(t);
}

function addMarkers(svg,events,current,home,away){
  if(!svg||!Array.isArray(events))return;
  svg.querySelectorAll('[data-b46-event-icon]').forEach(n=>n.remove());
  current=num(current);
  if(current===null||current<=0)return;
  const vb=svg.viewBox?.baseVal;
  const w=vb?.width||1000,h=vb?.height||232;
  const left=42,right=18,top=14,bottom=30;
  const usable=Math.max(1,w-left-right);
  const stack=new Map();
  const rows=events
    .map((e,i)=>({e,i,m:eventMinute(e),side:sideOf(e,home,away)}))
    .filter(x=>x.m!==null&&x.m>=0&&x.m<=current&&x.side)
    .sort((a,b)=>a.m-b.m||a.i-b.i);

  for(const row of rows){
    const key=`${Math.round(row.m*10)/10}:${row.side}`;
    const level=stack.get(key)||0;
    stack.set(key,level+1);
    const x=left+(Math.min(current,row.m)/Math.max(1,current))*usable;
    const y=row.side==='home'?top+12+level*15:h-bottom-17-level*15;
    const color=row.side==='home'?HOME:AWAY;
    const g=document.createElementNS(NS,'g');
    g.setAttribute('data-b46-event-icon','1');
    g.setAttribute('transform',`translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    g.setAttribute('pointer-events','all');
    const c=document.createElementNS(NS,'circle');
    c.setAttribute('r','7.4');
    c.setAttribute('fill','rgba(255,255,255,.96)');
    c.setAttribute('stroke',color);
    c.setAttribute('stroke-width','1.5');
    c.setAttribute('vector-effect','non-scaling-stroke');
    const t=document.createElementNS(NS,'text');
    t.setAttribute('x','0');
    t.setAttribute('y','3.6');
    t.setAttribute('text-anchor','middle');
    t.setAttribute('font-size','11');
    t.setAttribute('font-family','Arial,Segoe UI Emoji,Apple Color Emoji,sans-serif');
    t.textContent=iconFor(row.e);
    appendTitle(g,`${row.m}' · ${eventType(row.e)} · ${row.side==='home'?(home?.name||home||'HOME'):(away?.name||away||'AWAY')}`);
    g.append(c,t);
    svg.appendChild(g);
  }
}

function decorateExpanded(root,fixture){
  if(!root||!fixture)return;
  const svg=root.querySelector?.('.expand-flow-chart svg');
  if(!svg)return;
  addMarkers(svg,eventList(fixture),fixture?.minute,fixture?.home,fixture?.away);
}

document.addEventListener('nomad343:fixture-ready',e=>{
  const root=e.target?.closest?.('.match-expanded')||e.target;
  requestAnimationFrame(()=>decorateExpanded(root,e.detail?.fixture));
});
})();
