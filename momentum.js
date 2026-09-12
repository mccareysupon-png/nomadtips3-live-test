(()=>{
'use strict';

const LIVE_STATUSES=new Set(['1H','HT','2H','ET','BT','P','LIVE','INT']);
const KEYS=['attacks','dangerous_attacks','shots','shots_on_target','corners','possession'];
const LIMIT=30;
const memory=new Map();
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const num=value=>{const parsed=Number(String(value??'').replace('%',''));return Number.isFinite(parsed)?parsed:null};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const storageKey=name=>`nomad-momentum-v2:${name}`;

function loadPoints(name){
  if(memory.has(name))return memory.get(name);
  try{
    const parsed=JSON.parse(localStorage.getItem(storageKey(name))||'[]');
    const points=Array.isArray(parsed)?parsed:[];
    memory.set(name,points);
    return points;
  }catch{memory.set(name,[]);return[]}
}
function savePoints(name,points){
  const clean=points.slice(-LIMIT);
  memory.set(name,clean);
  try{localStorage.setItem(storageKey(name),JSON.stringify(clean))}catch{}
  return clean;
}
function snapshot(match,stats,stamp){
  const values={};let available=0;
  for(const key of KEYS){
    const home=num(stats[key]?.home);
    const away=num(stats[key]?.away);
    values[key]={home,away};
    if(home!==null&&away!==null)available++;
  }
  return available>=2?{stamp:stamp||new Date().toISOString(),minute:Number(match.elapsed)||0,values}:null;
}
function activity(current,previous,side){
  const weights=[['attacks',.16],['dangerous_attacks',.52],['shots',2],['shots_on_target',4],['corners',1.25]];
  let total=0,used=0;
  for(const [key,weight] of weights){
    const currentValue=current.values[key]?.[side];
    if(currentValue===null||currentValue===undefined)continue;
    const previousValue=previous?.values?.[key]?.[side];
    const change=previousValue===null||previousValue===undefined?Math.max(0,currentValue):Math.max(0,currentValue-previousValue);
    total+=change*weight;
    used+=weight;
  }
  const possession=current.values.possession?.[side];
  if(possession!==null&&possession!==undefined){total+=Math.max(0,possession)*.07;used+=.7}
  return used?Math.max(0,total):null;
}
function pressure(current,previous,previousPoint){
  const homeRaw=activity(current,previous,'home');
  const awayRaw=activity(current,previous,'away');
  if(homeRaw===null&&awayRaw===null)return null;
  const home=Math.max(0,homeRaw??0),away=Math.max(0,awayRaw??0),total=home+away;
  let homeShare=total>0?home/total*100:50;
  if(Number.isFinite(previousPoint?.home))homeShare=previousPoint.home*.55+homeShare*.45;
  homeShare=Math.round(clamp(homeShare,0,100));
  return{home:homeShare,away:100-homeShare};
}

function eventMinute(event){
  for(const value of [event?.minute,event?.elapsed,event?.time?.elapsed,event?.time?.minute]){
    if(value===null||value===undefined||String(value).trim()==='')continue;
    const minute=Number(value);
    if(Number.isFinite(minute))return minute;
  }
  return null;
}
function eventText(event){
  return [event?.type,event?.detail,event?.event,event?.name,event?.comments,event?.comment]
    .filter(value=>value!==null&&value!==undefined&&value!=='')
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g,' ');
}
function eventKind(event){
  const text=eventText(event);
  if(!text)return null;
  if(/own\s*goal|goal\s*own/.test(text))return'OWN_GOAL';
  if(/penalty/.test(text))return'PENALTY';
  if(/yellow/.test(text)&&/card/.test(text))return'YELLOW_CARD';
  if(/red/.test(text)&&/card/.test(text))return'RED_CARD';
  if(/\bvar\b|video assistant/.test(text))return'VAR';
  if(/substitution|substitute|player in|player out/.test(text))return'SUBSTITUTION';
  if(/corner/.test(text))return'CORNER';
  if(/shot/.test(text)&&/(on target|on goal|saved)/.test(text))return'SHOT_ON_TARGET';
  if(/shot/.test(text)&&/(off target|wide|missed)/.test(text))return'SHOT_OFF_TARGET';
  if(/\bgoal\b/.test(text))return'GOAL';
  return null;
}
function norm(value){return String(value??'').trim().toLowerCase().replace(/\s+/g,' ')}
function eventSide(event,homeTeam,awayTeam){
  const raw=event?.team?.name??event?.team_name??event?.teamName??event?.team??event?.side??'';
  const team=norm(raw),home=norm(homeTeam),away=norm(awayTeam);
  if(team&&home&&(team===home||home.includes(team)||team.includes(home)))return'home';
  if(team&&away&&(team===away||away.includes(team)||team.includes(away)))return'away';
  if(team==='home'||team==='h')return'home';
  if(team==='away'||team==='a')return'away';
  return'neutral';
}
function iconSvg(kind){
  const common='fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"';
  if(kind==='GOAL')return`<circle cx="8" cy="8" r="4.4" ${common}/><path d="M5.8 6.8 8 5.5l2.2 1.3-.8 2.5H6.6zM3.3 3.4 1.8 1.9M12.7 3.4l1.5-1.5M8 2V.8" ${common}/>`;
  if(kind==='CORNER')return`<path d="M4 14V2m0 1h6l-2.1 3H4M2 14h12M4 11c2.8 0 4.5 1 5.5 3" ${common}/>`;
  if(kind==='SHOT_ON_TARGET')return`<circle cx="8" cy="8" r="5.7" ${common}/><circle cx="8" cy="8" r="2.7" ${common}/><circle cx="8" cy="8" r=".9" fill="currentColor"/><path d="M8 .8V3M8 13v2.2M.8 8H3M13 8h2.2" ${common}/>`;
  if(kind==='SHOT_OFF_TARGET')return`<circle cx="7" cy="8" r="4.8" ${common}/><path d="M1 8h2M11 8h1M7 2v1.2M7 12.8V14M10.7 4.4l4-2M11.9 2.6l2.1 1.1" ${common}/>`;
  if(kind==='YELLOW_CARD'||kind==='RED_CARD')return`<path d="M5 2.2h6v10.6H5z" fill="currentColor" stroke="currentColor" stroke-width="1"/><path d="M3.2 4.2 1.5 3M12.8 4.2 14.5 3M8 15v-1.1" ${common}/>`;
  if(kind==='PENALTY')return`<circle cx="8" cy="11.5" r="2.6" ${common}/><circle cx="8" cy="4" r=".8" fill="currentColor"/><path d="M2 1.8h12v12.4M3.2 7.6c1.3-1.4 2.9-2.1 4.8-2.1s3.5.7 4.8 2.1" ${common}/>`;
  if(kind==='OWN_GOAL')return`<path d="M3 3h8.5v10H3zM11.5 6.5H14M13 5.5l1 1-1 1" ${common}/><circle cx="7.3" cy="8.2" r="2.2" ${common}/><path d="M5.7 6.8 8.8 9.6" ${common}/>`;
  if(kind==='VAR')return`<rect x="2" y="3" width="12" height="8.5" rx="1" ${common}/><path d="M5 14h6M8 11.5V14" ${common}/><text x="8" y="8.8" text-anchor="middle" font-size="4.4" font-weight="800" fill="currentColor" stroke="none">VAR</text>`;
  if(kind==='SUBSTITUTION')return`<path d="M2 5h9M9 3l2 2-2 2M14 11H5M7 9l-2 2 2 2" ${common}/><circle cx="2.4" cy="11" r="1.1" fill="currentColor"/><circle cx="13.6" cy="5" r="1.1" fill="currentColor"/>`;
  return'';
}
function eventColor(kind){
  if(kind==='YELLOW_CARD')return'#e8c94d';
  if(kind==='RED_CARD')return'#e55c64';
  if(kind==='SHOT_ON_TARGET')return'#00f0a8';
  if(kind==='SHOT_OFF_TARGET')return'#ff8a68';
  if(kind==='PENALTY'||kind==='OWN_GOAL')return'#d6ac63';
  return'#d7c89b';
}
function normalizeEvents(events,homeTeam,awayTeam,maxMinute){
  if(!Array.isArray(events))return[];
  return events.map((event,index)=>{
    const minute=eventMinute(event),kind=eventKind(event);
    if(minute===null||!kind||minute<0||minute>maxMinute+2)return null;
    const side=eventSide(event,homeTeam,awayTeam);
    const team=String(event?.team?.name??event?.team_name??event?.teamName??event?.team??'').trim();
    const player=String(event?.player?.name??event?.player_name??event?.playerName??event?.player??'').trim();
    const label=kind.split('_').map(word=>word[0]+word.slice(1).toLowerCase()).join(' ');
    return{minute,kind,side,team,player,label,index};
  }).filter(Boolean).sort((a,b)=>a.minute-b.minute||a.index-b.index);
}
function eventMarkers(events,xAtMinute,top,height,bottom){
  const stack=new Map();
  return events.map(event=>{
    const group=`${event.minute}|${event.side}`;
    const level=stack.get(group)||0;stack.set(group,level+1);
    const baseY=event.side==='home'?top+19:event.side==='away'?height-bottom-19:height/2;
    const y=event.side==='home'?baseY+level*18:event.side==='away'?baseY-level*18:baseY+(level%2?1:-1)*Math.ceil(level/2)*18;
    const x=xAtMinute(event.minute),color=eventColor(event.kind);
    const sideStroke=event.side==='home'?'#00f0a8':event.side==='away'?'#ff737d':'#8d917f';
    const title=[`${event.minute}′`,event.label,event.team,event.player].filter(Boolean).join(' · ');
    return`<g class="mom-event-marker" transform="translate(${(x-9).toFixed(1)} ${(y-9).toFixed(1)})" style="color:${color}"><title>${esc(title)}</title><circle cx="9" cy="9" r="8.2" fill="#09100e" stroke="${sideStroke}" stroke-width="1"/><g transform="translate(1 1)">${iconSvg(event.kind)}</g></g>`;
  }).join('');
}

function ensureUI(card){
  if(!card||card.querySelector('[data-tab="momentum"]'))return;
  const tabs=card.querySelector('.tabs');
  const timelineButton=tabs?.querySelector('[data-tab="timeline"]');
  const timelinePanel=card.querySelector('[data-panel="timeline"]');
  if(!tabs||!timelineButton||!timelinePanel)return;
  const button=document.createElement('button');
  button.type='button';button.dataset.tab='momentum';button.textContent='Momentum';
  tabs.insertBefore(button,timelineButton);
  const panel=document.createElement('section');
  panel.className='panel momentum-panel';panel.dataset.panel='momentum';
  panel.innerHTML='<div class="momentum-head"><div><small>ATTACK MOMENTUM · BOTH TEAMS</small><strong data-m="team">Home vs Away</strong></div><b data-m="now" style="display:flex;align-items:flex-end;gap:9px;min-width:118px;justify-content:flex-end"><span style="display:grid;text-align:right"><small style="color:var(--green);font-size:6px;line-height:1">HOME</small><em data-m="home-now" style="font-style:normal;color:var(--green);font-size:18px;line-height:1.15">50</em></span><i style="font-style:normal;color:#6f7773;font-size:11px;padding-bottom:2px">–</i><span style="display:grid;text-align:right"><small style="color:var(--red);font-size:6px;line-height:1">AWAY</small><em data-m="away-now" style="font-style:normal;color:var(--red);font-size:18px;line-height:1.15">50</em></span></b></div><div class="momentum-chart" data-m="chart"><p class="empty">Momentum appears when live attack statistics are available.</p></div><div class="momentum-legend"><span><i class="positive"></i>Home team</span><span><i class="negative"></i>Away team</span><span><i class="baseline"></i>50 balance</span></div><p class="momentum-note" data-m="note">Both teams use the same live-statistics sample. No extra API request is made.</p>';
  timelinePanel.parentNode.insertBefore(panel,timelinePanel);
}
function target(card,key){return card.querySelector(`[data-m="${key}"]`)}

function draw(card,points,homeTeam,awayTeam,name,rawEvents,currentMinute){
  const chart=target(card,'chart'),homeNow=target(card,'home-now'),awayNow=target(card,'away-now'),note=target(card,'note');
  if(!chart||!homeNow||!awayNow||!note)return;
  if(!points.length){chart.innerHTML='<p class="empty">Waiting for the first live momentum sample.</p>';homeNow.textContent='50';awayNow.textContent='50';return}
  const width=620,height=240,left=34,right=18,top=18,bottom=30,usable=width-left-right,plotHeight=height-top-bottom;
  const latest=points.at(-1);
  const maxMinute=Math.max(1,num(currentMinute)??0,...points.map(point=>num(point.minute)??0),...(Array.isArray(rawEvents)?rawEvents.map(event=>eventMinute(event)??0):[]));
  const xAtMinute=minute=>left+clamp((num(minute)??0)/maxMinute,0,1)*usable;
  const yAt=value=>top+(100-clamp(value,0,100))/100*plotHeight;
  const homeLine=points.map(point=>`${xAtMinute(point.minute).toFixed(1)},${yAt(point.home).toFixed(1)}`).join(' ');
  const awayLine=points.map(point=>`${xAtMinute(point.minute).toFixed(1)},${yAt(point.away).toFixed(1)}`).join(' ');
  const tickMinutes=[0];
  for(let minute=15;minute<maxMinute;minute+=15)tickMinutes.push(minute);
  if(tickMinutes.at(-1)!==maxMinute)tickMinutes.push(maxMinute);
  const labels=tickMinutes.map(minute=>`<line class="mom-tick" x1="${xAtMinute(minute).toFixed(1)}" y1="${height-bottom}" x2="${xAtMinute(minute).toFixed(1)}" y2="${height-bottom+4}"/><text x="${xAtMinute(minute).toFixed(1)}" y="231" text-anchor="middle">${esc(Math.round(minute))}′</text>`).join('');
  const grid=[25,50,75].map(value=>`<line class="${value===50?'mom-baseline':'mom-grid'}" x1="${left}" y1="${yAt(value).toFixed(1)}" x2="${width-right}" y2="${yAt(value).toFixed(1)}"/><text x="7" y="${(yAt(value)+3).toFixed(1)}">${value}</text>`).join('');
  const latestX=xAtMinute(latest.minute);
  const events=normalizeEvents(rawEvents,homeTeam,awayTeam,maxMinute);
  const markers=eventMarkers(events,xAtMinute,top,height,bottom);
  homeNow.textContent=String(latest.home);awayNow.textContent=String(latest.away);
  const difference=latest.home-latest.away;
  note.textContent=difference>12?`${homeTeam} is applying stronger attacking pressure.`:difference<-12?`${awayTeam} is applying stronger attacking pressure.`:'Both teams are close to the balance line.';
  chart.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Attack momentum comparison for ${esc(homeTeam)} and ${esc(awayTeam)}"><style>.mom-home-line{fill:none;stroke:#00f0a8;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}.mom-away-line{fill:none;stroke:#ff737d;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}.mom-home-dot{fill:#00f0a8;stroke:#171717;stroke-width:2}.mom-away-dot{fill:#ff737d;stroke:#171717;stroke-width:2}.mom-tick{stroke:#3a4641;stroke-width:1}.mom-event-marker{cursor:help}</style><rect class="mom-zone-up" x="${left}" y="${top}" width="${usable}" height="${plotHeight/2}"/><rect class="mom-zone-down" x="${left}" y="${top+plotHeight/2}" width="${usable}" height="${plotHeight/2}"/>${grid}<text class="mom-axis-label up" x="${left+6}" y="31">HIGH PRESSURE</text><text class="mom-axis-label down" x="${left+6}" y="${height-bottom-8}">LOW PRESSURE</text><polyline class="mom-home-line" points="${homeLine}"/><polyline class="mom-away-line" points="${awayLine}"/>${markers}<circle class="mom-home-dot" cx="${latestX.toFixed(1)}" cy="${yAt(latest.home).toFixed(1)}" r="4"/><circle class="mom-away-dot" cx="${latestX.toFixed(1)}" cy="${yAt(latest.away).toFixed(1)}" r="4"/>${labels}</svg>`;
}

function update(card,name,data){
  ensureUI(card);
  const match=data?.match||{},homeTeam=match.home?.name||'Home',awayTeam=match.away?.name||'Away';
  const teamNode=target(card,'team');if(teamNode)teamNode.textContent=`${homeTeam} vs ${awayTeam}`;
  const current=snapshot(match,match.stats||{},data?.fetched_at_utc);
  if(!current){
    const chart=target(card,'chart'),homeNow=target(card,'home-now'),awayNow=target(card,'away-now');
    if(chart)chart.innerHTML='<p class="empty">Provider has not supplied enough live attack statistics.</p>';
    if(homeNow)homeNow.textContent='—';if(awayNow)awayNow.textContent='—';return;
  }
  let points=loadPoints(name),last=points.at(-1);
  if(!last||last.stamp!==current.stamp){
    const values=pressure(current,last?.snapshot||null,last||null);
    if(values)points=savePoints(name,[...points,{stamp:current.stamp,minute:current.minute,home:values.home,away:values.away,snapshot:current}]);
  }
  if(!LIVE_STATUSES.has(String(match.status||'').toUpperCase())&&!points.length){const chart=target(card,'chart');if(chart)chart.innerHTML='<p class="empty">Momentum starts when the match goes live.</p>';return}
  draw(card,points,homeTeam,awayTeam,name,match.events,match.elapsed);
}

window.addEventListener('nomad:card-added',event=>ensureUI(event.detail?.card));
window.addEventListener('nomad:live-data',event=>{
  const {card,name,data}=event.detail||{};
  if(card&&name&&data)update(card,name,data);
});
document.querySelectorAll('.match-card[data-file]').forEach(ensureUI);
})();
