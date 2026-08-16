const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let runtime=null,latest=null,selectedId=null,currentMatch=null,lastSourceOk=0,lastFallbackKey='',playing=false,queue=[],ball={x:.5,y:.5},seen=new Set(),sourceEvents=[];

function loadCss(){if(document.querySelector('link[data-animation-v3]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./animation-v3.css?v=20260816';l.dataset.animationV3='1';document.head.appendChild(l);}
function ensureUi(){
  loadCss();const pitch=$('#pitch');if(!pitch)return false;
  if(!pitch.dataset.v3){
    pitch.dataset.v3='1';pitch.classList.remove('v2');pitch.classList.add('v3');
    if(!$('#liveMarketStrip')){const market=document.createElement('div');market.id='liveMarketStrip';market.className='live-market-strip';pitch.parentElement.insertBefore(market,pitch);}
    if(!$('#pitchSelected'))pitch.insertAdjacentHTML('beforeend','<div id="pitchSelected" class="pitch-team pitch-team-selected"><small>SELECTED</small><b>—</b></div><div id="pitchOpponent" class="pitch-team pitch-team-opponent"><small>OPPONENT</small><b>—</b></div><div id="liveEventBadge" class="live-event-badge"><small>LIVE ACTIVITY</small><b>POSSESSION</b></div><div id="v3Trail" class="v3-ball-trail"></div><div id="v3CoordinateNote" class="v3-coordinate-note">LIVE ACTIVITY VISUALIZATION</div>');
    if(!$('#pitchTimeline')){const timeline=document.createElement('div');timeline.id='pitchTimeline';timeline.className='match-timeline';pitch.parentElement.appendChild(timeline);}
    const head=document.querySelector('.animation-head>div');if(head&&!$('#v3SourceBadge'))head.insertAdjacentHTML('beforeend',' <span id="v3SourceBadge" class="v3-source-badge"><i></i><span>SOURCE ACTIVITY</span></span>');
  }
  return true;
}

function selectedMatch(){
  if(!latest?.matches?.length)return null;
  const active=document.querySelector('.candidate.active'),text=active?.querySelector('.teams')?.textContent||'';
  if(text){const hit=latest.matches.find(m=>text.includes(m.home)&&text.includes(m.away));if(hit)return hit;}
  if(selectedId){const hit=latest.matches.find(m=>String(m.sourceMatchId)===String(selectedId));if(hit)return hit;}
  return latest.matches[0];
}
function orientation(m){const shown=$('#homeTeam')?.textContent?.trim(),flip=Boolean(shown&&shown===m.away);return{flip,selected:flip?m.away:m.home,opponent:flip?m.home:m.away,team:t=>flip?(t==='HOME'?'OPPONENT':'SELECTED'):(t==='HOME'?'SELECTED':'OPPONENT')};}
function icon(type){const t=String(type||'').toUpperCase();if(t.includes('GOAL'))return'⚽';if(t.includes('RED'))return'🟥';if(t.includes('YELLOW'))return'🟨';if(t.includes('CORNER'))return'⚑';if(t.includes('SHOT'))return'◎';if(t.includes('PENALTY'))return'●';if(t.includes('SUB'))return'↔';if(t.includes('OFFSIDE'))return'◇';return'•';}
function cls(type){const t=String(type||'').toUpperCase();if(t.includes('GOAL'))return'goal';if(t.includes('DANGEROUS ATTACK'))return'danger';if(t.includes('SHOT'))return'shot';if(t.includes('CORNER'))return'corner';if(t.includes('RED'))return'red';if(t.includes('YELLOW'))return'yellow';if(t==='ATTACK')return'attack';return'possession';}
function fallbackCoord(type,selected=true,location=null){
  const t=String(type||'POSSESSION').toUpperCase();let x=selected?.58:.42,y=.5;
  if(t==='ATTACK'){x=selected?.68:.32;y=.48}else if(t.includes('DANGEROUS ATTACK')){x=selected?.80:.20;y=.48}else if(t.includes('SHOT')){x=selected?.89:.11;y=.5}else if(t.includes('GOAL')){x=selected?.95:.05;y=.5}else if(t.includes('CORNER')){x=selected?.96:.04;y=Number(location)===2||Number(location)===3?.82:.18}else if(t.includes('PENALTY')){x=selected?.88:.12;y=.5}else if(t.includes('FREE KICK')){x=selected?.76:.24;y=.5}else if(t.includes('THROW')){x=selected?.72:.28;y=.12}
  return{x,y,source:'EVENT_ZONE'};
}
function orientEvent(e,m){
  const o=orientation(m),team=o.team(e.team),selected=team==='SELECTED',flip=o.flip;
  const points=(e.points||[]).map(p=>({x:flip?1-clamp(p.x):clamp(p.x),y:flip?1-clamp(p.y):clamp(p.y),source:'SOURCE_XY'}));
  let x=e.x===null||e.x===undefined?null:clamp(e.x),y=e.y===null||e.y===undefined?null:clamp(e.y);
  if(x!==null&&flip)x=1-x;if(y!==null&&flip)y=1-y;
  const fallback=fallbackCoord(e.type,selected,e.location);
  return{...e,team,selected,points,x:x??fallback.x,y:y??fallback.y,coordinateSource:x!==null&&y!==null?'SOURCE_XY':'EVENT_ZONE'};
}
function activityFromCar31(m){
  const o=orientation(m),a=m.activity||{type:'POSSESSION',team:'HOME'},team=o.team(a.team),selected=team==='SELECTED',p=fallbackCoord(a.type,selected,a.location);
  return{id:`fallback:${m.sourceMatchId}:${a.type}:${a.team}:${m.minute}`,type:a.type||'POSSESSION',team,selected,x:p.x,y:p.y,points:[],coordinateSource:'CAR31_ACTIVITY',minute:m.minute,location:a.location};
}

function renderMarket(m){const o=orientation(m),odds=m.odds||{},one=odds.oneXtwo||{},ah=odds.asianHandicap||{},ou=odds.overUnder||{},line=ah.line===null||ah.line===undefined?null:(o.flip?-Number(ah.line):Number(ah.line));$('#liveMarketStrip').innerHTML=`<span><small>1X2 SELECTED</small><b>${fmt(o.flip?one.away:one.home)}</b></span><span><small>DRAW</small><b>${fmt(one.draw)}</b></span><span><small>AH ${line===null?'—':`${line>=0?'+':''}${line}`}</small><b>${fmt(o.flip?ah.away:ah.home)} / ${fmt(o.flip?ah.home:ah.away)}</b></span><span><small>O/U ${ou.line??'—'}</small><b>${fmt(ou.over)} / ${fmt(ou.under)}</b></span>`;$('#pitchSelected b').textContent=o.selected;$('#pitchOpponent b').textContent=o.opponent;}
function renderTimeline(m){const o=orientation(m),ev=sourceEvents.slice(-18),markers=ev.map(e=>{const left=Math.max(0,Math.min(100,(Number(e.minute)||0)/90*100)),team=o.team(e.rawTeam||e.team);return `<span class="timeline-event ${String(team).toLowerCase()}" style="left:${left}%" title="${esc(e.minute)}' ${esc(e.type)}"><i>${icon(e.type)}</i><small>${esc(e.minute??'—')}'</small></span>`}).join('');$('#pitchTimeline').innerHTML=`<div class="timeline-labels"><span>0'</span><span>15'</span><span>30'</span><span>HT</span><span>60'</span><span>75'</span><span>90'</span></div><div class="timeline-track"><i class="timeline-now" style="left:${Math.max(0,Math.min(100,(Number(m.minute)||0)/90*100))}%"></i>${markers}</div>`;}
function renderEvent(e,m,sourceState='live'){
  const pitch=$('#pitch'),kind=cls(e.type);pitch.className=`pitch v3 ${e.selected?'selected-control':'opponent-control'} event-${kind}${sourceState==='waiting'?' waiting':''}`;pitch.style.setProperty('--source-x',`${e.x*100}%`);pitch.style.setProperty('--source-y',`${e.y*100}%`);pitch.style.setProperty('--zone-x',e.selected?'62%':'6%');
  const o=orientation(m),tag=$('#possessionTag');if(tag)tag.textContent=`${e.selected?o.selected:o.opponent} · ${String(e.type||'LIVE').replaceAll('_',' ')}`;
  const badge=$('#liveEventBadge');badge.className=`live-event-badge ${kind} ${e.coordinateSource==='SOURCE_XY'?'source-xy':'event-only'}`;badge.querySelector('small').textContent=`${e.minute??m.minute??'LIVE'}' · ${e.team}`;badge.querySelector('b').textContent=`${icon(e.type)} ${e.type||'LIVE ACTIVITY'}`;
  const note=$('#v3CoordinateNote');note.textContent=e.coordinateSource==='SOURCE_XY'?'SOURCE X/Y · LIVE ACTIVITY':'LIVE ACTIVITY VISUALIZATION';
  const sb=$('#v3SourceBadge');sb.className=`v3-source-badge ${sourceState==='fallback'?'fallback':sourceState==='waiting'?'waiting':''}`;sb.querySelector('span').textContent=sourceState==='fallback'?'CAR 3.1 ACTIVITY FALLBACK':sourceState==='waiting'?'LIVE DATA WAITING':'SOURCE ACTIVITY · ~1.5s';
  renderMarket(m);renderTimeline(m);
}
function setBall(x,y,from=ball){
  const pitch=$('#pitch'),el=pitch?.querySelector('.pitch-ball'),trail=$('#v3Trail');if(!pitch||!el)return;const r=pitch.getBoundingClientRect(),px=x*r.width,py=y*r.height;el.style.transform=`translate3d(${px}px,${py}px,0) translate(-50%,-50%)`;
  if(trail){const fx=from.x*r.width,fy=from.y*r.height,dx=px-fx,dy=py-fy,len=Math.min(70,Math.hypot(dx,dy)),ang=Math.atan2(dy,dx)*180/Math.PI;trail.style.left=`${px}px`;trail.style.top=`${py}px`;trail.style.width=`${Math.max(18,len)}px`;trail.style.transform=`translate(-100%,-50%) rotate(${ang}deg)`;}
}
function ease(t){return 1-Math.pow(1-t,3)}
function moveBall(target,duration=520){return new Promise(resolve=>{const start={...ball},end={x:clamp(target.x),y:clamp(target.y)};if(reduceMotion){ball=end;setBall(ball.x,ball.y,start);return resolve();}const begun=performance.now();function tick(now){const p=Math.min(1,(now-begun)/duration),e=ease(p);ball={x:start.x+(end.x-start.x)*e,y:start.y+(end.y-start.y)*e};setBall(ball.x,ball.y,start);if(p<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});}
async function animateEvent(e,m,sourceState='live'){
  renderEvent(e,m,sourceState);const path=e.points?.length?e.points.map(p=>({x:p.x,y:p.y})):[];if(!path.length)path.push({x:e.x,y:e.y});const each=Math.max(220,Math.min(620,700/path.length));for(const p of path)await moveBall(p,each);
}
async function drain(){if(playing)return;playing=true;while(queue.length){const item=queue.shift();if(!currentMatch||String(item.matchId)!==String(currentMatch.sourceMatchId))continue;await animateEvent(item.event,currentMatch,item.sourceState);}playing=false;}
function resetForMatch(id){selectedId=id;seen=new Set();queue=[];sourceEvents=[];lastFallbackKey='';playing=false;}
function ingest(payload,m){
  const id=String(m.sourceMatchId);if(selectedId!==id)resetForMatch(id);lastSourceOk=Date.now();const incoming=(payload.events||[]).map(e=>({...e,rawTeam:e.team}));sourceEvents=incoming;
  if(!seen.size&&incoming.length>1)for(const e of incoming.slice(0,-1))seen.add(String(e.id));
  const fresh=incoming.filter(e=>!seen.has(String(e.id)));for(const raw of fresh){seen.add(String(raw.id));queue.push({matchId:id,event:orientEvent(raw,m),sourceState:'live'});}if(!fresh.length&&payload.current&&!seen.has(String(payload.current.id))){const raw={...payload.current,rawTeam:payload.current.team};seen.add(String(raw.id));queue.push({matchId:id,event:orientEvent(raw,m),sourceState:'live'});}drain();
}
function fallback(m,waiting=false){const e=activityFromCar31(m),key=String(e.id);if(key===lastFallbackKey){if(waiting)renderEvent(e,m,'waiting');return;}lastFallbackKey=key;queue.push({matchId:String(m.sourceMatchId),event:e,sourceState:waiting?'waiting':'fallback'});drain();}

async function pollLive(){
  try{runtime=runtime||await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());latest=await fetch(`${runtime.workerUrl}/live?t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json());if(!ensureUi())return;const m=selectedMatch();if(!m)return;currentMatch=m;if(selectedId!==String(m.sourceMatchId))resetForMatch(String(m.sourceMatchId));renderMarket(m);renderTimeline(m);}catch(e){console.warn('CAR 3.1 animation v3 live',e);}
}
async function pollAnimation(){
  if(!runtime||!currentMatch)return;const m=selectedMatch()||currentMatch;if(String(m.sourceMatchId)!==String(currentMatch.sourceMatchId)){currentMatch=m;resetForMatch(String(m.sourceMatchId));}
  try{const r=await fetch(`${runtime.workerUrl}/animation?id=${encodeURIComponent(m.sourceMatchId)}&t=${Date.now()}`,{cache:'no-store'}),p=await r.json();if(p.ok&&String(p.matchId)===String(m.sourceMatchId)){ingest(p,m);return;}fallback(m,Date.now()-lastSourceOk>6000);}catch(e){if(Date.now()-lastSourceOk>6000)fallback(m,true);}
}

ensureUi();document.addEventListener('click',e=>{if(e.target.closest('.candidate'))setTimeout(()=>{const m=selectedMatch();if(m){currentMatch=m;resetForMatch(String(m.sourceMatchId));pollAnimation();}},100)});window.addEventListener('resize',()=>setBall(ball.x,ball.y,ball));pollLive();setInterval(pollLive,15000);setInterval(pollAnimation,1500);setTimeout(pollAnimation,400);
