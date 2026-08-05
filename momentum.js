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

function draw(card,points,homeTeam,awayTeam,name){
  const chart=target(card,'chart'),homeNow=target(card,'home-now'),awayNow=target(card,'away-now'),note=target(card,'note');
  if(!chart||!homeNow||!awayNow||!note)return;
  if(!points.length){chart.innerHTML='<p class="empty">Waiting for the first live momentum sample.</p>';homeNow.textContent='50';awayNow.textContent='50';return}
  const width=620,height=240,left=34,right=18,top=18,bottom=30,usable=width-left-right,plotHeight=height-top-bottom;
  const step=points.length>1?usable/(points.length-1):0;
  const xAt=index=>left+(points.length===1?usable/2:index*step);
  const yAt=value=>top+(100-clamp(value,0,100))/100*plotHeight;
  const homeLine=points.map((point,index)=>`${xAt(index).toFixed(1)},${yAt(point.home).toFixed(1)}`).join(' ');
  const awayLine=points.map((point,index)=>`${xAt(index).toFixed(1)},${yAt(point.away).toFixed(1)}`).join(' ');
  const labels=points.map((point,index)=>{
    if(points.length>8&&index%Math.ceil(points.length/6)!==0&&index!==points.length-1)return'';
    return `<text x="${xAt(index).toFixed(1)}" y="231" text-anchor="middle">${esc(point.minute||'•')}′</text>`;
  }).join('');
  const grid=[25,50,75].map(value=>`<line class="${value===50?'mom-baseline':'mom-grid'}" x1="${left}" y1="${yAt(value).toFixed(1)}" x2="${width-right}" y2="${yAt(value).toFixed(1)}"/><text x="7" y="${(yAt(value)+3).toFixed(1)}">${value}</text>`).join('');
  const latest=points.at(-1),latestX=xAt(points.length-1);
  homeNow.textContent=String(latest.home);awayNow.textContent=String(latest.away);
  const difference=latest.home-latest.away;
  note.textContent=difference>12?`${homeTeam} is applying stronger attacking pressure.`:difference<-12?`${awayTeam} is applying stronger attacking pressure.`:'Both teams are close to the balance line.';
  chart.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Attack momentum comparison for ${esc(homeTeam)} and ${esc(awayTeam)}"><style>.mom-home-line{fill:none;stroke:#00f0a8;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}.mom-away-line{fill:none;stroke:#ff737d;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}.mom-home-dot{fill:#00f0a8;stroke:#171717;stroke-width:2}.mom-away-dot{fill:#ff737d;stroke:#171717;stroke-width:2}</style><rect class="mom-zone-up" x="${left}" y="${top}" width="${usable}" height="${plotHeight/2}"/><rect class="mom-zone-down" x="${left}" y="${top+plotHeight/2}" width="${usable}" height="${plotHeight/2}"/>${grid}<text class="mom-axis-label up" x="${left+6}" y="31">HIGH PRESSURE</text><text class="mom-axis-label down" x="${left+6}" y="${height-bottom-8}">LOW PRESSURE</text><polyline class="mom-home-line" points="${homeLine}"/><polyline class="mom-away-line" points="${awayLine}"/><circle class="mom-home-dot" cx="${latestX.toFixed(1)}" cy="${yAt(latest.home).toFixed(1)}" r="4"/><circle class="mom-away-dot" cx="${latestX.toFixed(1)}" cy="${yAt(latest.away).toFixed(1)}" r="4"/>${labels}</svg>`;
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
  draw(card,points,homeTeam,awayTeam,name);
}

window.addEventListener('nomad:card-added',event=>ensureUI(event.detail?.card));
window.addEventListener('nomad:live-data',event=>{
  const {card,name,data}=event.detail||{};
  if(card&&name&&data)update(card,name,data);
});
document.querySelectorAll('.match-card[data-file]').forEach(ensureUI);
})();
