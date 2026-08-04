(()=>{
'use strict';

const LIVE_STATUSES=new Set(['1H','HT','2H','ET','BT','P','LIVE','INT']);
const KEYS=['attacks','dangerous_attacks','shots','shots_on_target','corners','possession'];
const LIMIT=30;
const memory=new Map();
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const num=value=>{const parsed=Number(String(value??'').replace('%',''));return Number.isFinite(parsed)?parsed:null};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const storageKey=name=>`nomad-momentum-v1:${name}`;

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
function sideOf(match){
  const explicit=String(match.pick_side||'').toLowerCase();
  if(explicit==='home'||explicit==='away')return explicit;
  const pick=String(match.pick||'').toLowerCase();
  const home=String(match.home?.name||'').toLowerCase();
  const away=String(match.away?.name||'').toLowerCase();
  if(home&&pick.includes(home))return'home';
  if(away&&pick.includes(away))return'away';
  return null;
}
function snapshot(match,stats,stamp){
  const side=sideOf(match);if(!side)return null;
  const opponent=side==='home'?'away':'home';
  const values={};let available=0;
  for(const key of KEYS){
    const mine=num(stats[key]?.[side]);
    const theirs=num(stats[key]?.[opponent]);
    values[key]={mine,theirs};
    if(mine!==null&&theirs!==null)available++;
  }
  return available>=2?{stamp:stamp||new Date().toISOString(),minute:Number(match.elapsed)||0,values}:null;
}
function delta(current,previous,key){
  const currentValue=current.values[key],previousValue=previous?.values?.[key];
  if(!currentValue||currentValue.mine===null||currentValue.theirs===null)return null;
  if(!previousValue||previousValue.mine===null||previousValue.theirs===null)return currentValue.mine-currentValue.theirs;
  return Math.max(0,currentValue.mine-previousValue.mine)-Math.max(0,currentValue.theirs-previousValue.theirs);
}
function score(current,previous){
  const weights=[['attacks',.16],['dangerous_attacks',.52],['shots',2],['shots_on_target',4],['corners',1.25]];
  let total=0,used=0;
  for(const [key,weight] of weights){const value=delta(current,previous,key);if(value===null)continue;total+=value*weight;used+=weight}
  const possession=current.values.possession;
  if(possession?.mine!==null&&possession?.theirs!==null){total+=(possession.mine-possession.theirs)*.07;used+=.7}
  return used?Math.round(clamp(total*4,-100,100)):null;
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
  panel.innerHTML='<div class="momentum-head"><div><small>ATTACK MOMENTUM · CORE PICK</small><strong data-m="team">Waiting for pick</strong></div><b data-m="now">0</b></div><div class="momentum-chart" data-m="chart"><p class="empty">Momentum appears when live attack statistics are available.</p></div><div class="momentum-legend"><span><i class="positive"></i>Attacking pressure</span><span><i class="baseline"></i>Standard line</span><span><i class="negative"></i>Under pressure</span></div><p class="momentum-note" data-m="note">Green rises above the standard line; red falls below it.</p>';
  timelinePanel.parentNode.insertBefore(panel,timelinePanel);
}
function target(card,key){return card.querySelector(`[data-m="${key}"]`)}

function draw(card,points,team,name){
  const chart=target(card,'chart'),now=target(card,'now'),note=target(card,'note');
  if(!chart||!now||!note)return;
  if(!points.length){chart.innerHTML='<p class="empty">Waiting for the first live momentum sample.</p>';now.textContent='0';return}
  const width=620,height=230,mid=112,padX=28,maxBar=88,usable=width-padX*2;
  const step=points.length>1?usable/(points.length-1):0;
  const barWidth=clamp(usable/Math.max(points.length,8)*.55,5,20);
  const safeId=String(name).replace(/[^a-z0-9]/gi,'').slice(-18)||'match';
  const greenId=`momGreen${safeId}`,redId=`momRed${safeId}`;
  const bars=points.map((point,index)=>{
    const x=padX+(points.length===1?usable/2:index*step),barHeight=Math.max(3,Math.abs(point.value)/100*maxBar),y=point.value>=0?mid-barHeight:mid,cls=point.value>=0?'mom-positive':'mom-negative';
    return `<rect class="${cls}" x="${(x-barWidth/2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2"/>`;
  }).join('');
  const line=points.map((point,index)=>`${(padX+(points.length===1?usable/2:index*step)).toFixed(1)},${(mid-(point.value/100*maxBar)).toFixed(1)}`).join(' ');
  const labels=points.map((point,index)=>{
    if(points.length>8&&index%Math.ceil(points.length/6)!==0&&index!==points.length-1)return'';
    const x=padX+(points.length===1?usable/2:index*step);
    return `<text x="${x.toFixed(1)}" y="218" text-anchor="middle">${esc(point.minute||'•')}′</text>`;
  }).join('');
  const latest=points.at(-1)?.value??0;
  now.textContent=`${latest>0?'+':''}${latest}`;now.className=latest>0?'positive':latest<0?'negative':'';
  note.textContent=latest>12?`${team} is applying stronger attacking pressure.`:latest<-12?`${team} is under sustained pressure.`:'The match is near the standard balance line.';
  chart.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Attack momentum graph for ${esc(team)}"><defs><linearGradient id="${greenId}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#087f5b"/><stop offset="1" stop-color="#00f0a8"/></linearGradient><linearGradient id="${redId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a83d47"/><stop offset="1" stop-color="#ff737d"/></linearGradient></defs><style>.mom-positive{fill:url(#${greenId})}.mom-negative{fill:url(#${redId})}</style><rect class="mom-zone-up" x="0" y="18" width="${width}" height="${mid-18}"/><rect class="mom-zone-down" x="0" y="${mid}" width="${width}" height="${height-mid-24}"/><line class="mom-grid" x1="0" y1="${mid-maxBar}" x2="${width}" y2="${mid-maxBar}"/><line class="mom-grid" x1="0" y1="${mid+maxBar}" x2="${width}" y2="${mid+maxBar}"/><line class="mom-baseline" x1="0" y1="${mid}" x2="${width}" y2="${mid}"/><text class="mom-axis-label up" x="10" y="31">ATTACKING</text><text class="mom-axis-label down" x="10" y="${height-30}">UNDER PRESSURE</text>${bars}<polyline class="mom-line" points="${line}"/>${labels}</svg>`;
}

function update(card,name,data){
  ensureUI(card);
  const match=data?.match||{},side=sideOf(match),team=side==='home'?match.home?.name:side==='away'?match.away?.name:'Core pick';
  const teamNode=target(card,'team');if(teamNode)teamNode.textContent=team||'Core pick';
  const current=snapshot(match,match.stats||{},data?.fetched_at_utc);
  if(!current){const chart=target(card,'chart'),now=target(card,'now');if(chart)chart.innerHTML='<p class="empty">Provider has not supplied enough live attack statistics.</p>';if(now)now.textContent='—';return}
  let points=loadPoints(name),last=points.at(-1);
  if(!last||last.stamp!==current.stamp){const value=score(current,last?.snapshot||null);if(value!==null)points=savePoints(name,[...points,{stamp:current.stamp,minute:current.minute,value,snapshot:current}])}
  if(!LIVE_STATUSES.has(String(match.status||'').toUpperCase())&&!points.length){const chart=target(card,'chart');if(chart)chart.innerHTML='<p class="empty">Momentum starts when the match goes live.</p>';return}
  draw(card,points,team||'Core pick',name);
}

window.addEventListener('nomad:card-added',event=>ensureUI(event.detail?.card));
window.addEventListener('nomad:live-data',event=>{
  const {card,name,data}=event.detail||{};
  if(card&&name&&data)update(card,name,data);
});
document.querySelectorAll('.match-card[data-file]').forEach(ensureUI);
})();
