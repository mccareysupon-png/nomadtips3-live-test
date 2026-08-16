const WORKER='https://nomadtips3-car33-live.mccarey-supon.workers.dev';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let live={matches:[],candidates:[],activeSignals:[]},selectedId=null,selectedSignal=false,anchors=new Map(),config=null,seen=new Set(),activeMetric='dangerous_attacks';
const seriesByMatch=new Map(),animationByMatch=new Map();
let animationPollBusy=false;
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const odds=v=>n(v)===null?'—':n(v).toFixed(2),line=v=>n(v)===null?'—':`${n(v)>0?'+':''}${Number.isInteger(n(v))?n(v).toFixed(1):n(v)}`;
const METRICS=[
  ['Attacks','attacks'],['Dangerous Attacks','dangerous_attacks'],['Shots','shots'],['Shots on Target','shots_on_target'],['Shots off Target','shots_off_target'],['Corners','corners'],['Possession','possession']
];
function recordById(id){return live.activeSignals.find(x=>String(x.id)===String(id));}
function matchById(id){return live.matches.find(x=>String(x.id)===String(id));}
function candidateById(id){return live.candidates.find(x=>String(x.id)===String(id));}
function lockText(r){if(!r)return'—';if(r.market==='AH')return `${r.selectedTeam} ${line(r.selectedLine)} @ ${odds(r.lockedOdds)}`;if(r.market==='OU')return `${r.ouDirection} ${line(r.selectedLine)} @ ${odds(r.lockedOdds)}`;return `${r.selectedTeam} · WIN @ ${odds(r.lockedOdds)}`;}
function currentMarket(r,m){if(!r||!m)return'—';const away=r.selectedSide==='AWAY';if(r.market==='AH'){const raw=n(m.odds?.asianHandicap?.line),l=raw===null?null:(away?-raw:raw),o=m.odds?.asianHandicap?.[away?'away':'home'];return `${r.selectedTeam} ${line(l)} @ ${odds(o)}`;}if(r.market==='OU'){const d=r.ouDirection==='UNDER'?'under':'over';return `${r.ouDirection} ${line(m.odds?.overUnder?.line)} @ ${odds(m.odds?.overUnder?.[d])}`;}return `${r.selectedTeam} · WIN @ ${odds(m.odds?.oneXtwo?.[away?'away':'home'])}`;}
function orientedScore(r,m){if(!m)return'—';if(!r)return`${m.score.home}–${m.score.away}`;return r.selectedSide==='AWAY'?`${m.score.away}–${m.score.home}`:`${m.score.home}–${m.score.away}`;}
function entryScore(r){if(!r?.entryScore)return'—';return r.selectedSide==='AWAY'?`${r.entryScore.away}–${r.entryScore.home}`:`${r.entryScore.home}–${r.entryScore.away}`;}
function anchorSnapshot(m){if(n(m.elapsedSeconds)===null)return;const old=anchors.get(String(m.id));if(!old||old.sourceClock!==m.sourceClock)anchors.set(String(m.id),{elapsed:n(m.elapsedSeconds),perf:performance.now(),sourceClock:m.sourceClock,status:m.status});}
function clockText(id){const m=matchById(id);if(!m)return'—';if(m.status==='FT')return'FT';if(m.status==='HT')return'HT';const a=anchors.get(String(id));if(!a)return m.minute===null?'LIVE':`${m.minute}'`;const sec=Math.max(0,a.elapsed+(performance.now()-a.perf)/1000),whole=Math.floor(sec);return`${Math.floor(whole/60)}:${String(whole%60).padStart(2,'0')}`;}
function signalClock(r){const s=n(r?.signalElapsedSeconds);if(s===null)return`${r?.entryMinute??'—'}'`;return`${Math.floor(s/60)}:${String(Math.floor(s)%60).padStart(2,'0')}`;}
function updateClocks(){document.querySelectorAll('[data-clock]').forEach(el=>el.textContent=clockText(el.dataset.clock));}
function reasonChips(r){if(!r)return'';const e=r.evidence||{};return[[`Momentum`,`${Math.round(n(r.momentum)||0)}%`],[`Dangerous`,`${n(e.dangerous)>=0?'+':''}${n(e.dangerous)??'—'}`],[`SOT`,`${n(e.sot)>=0?'+':''}${n(e.sot)??'—'}`],[`Shots`,`${n(e.shots)>=0?'+':''}${n(e.shots)??'—'}`],[`Corners`,`${n(e.corners)>=0?'+':''}${n(e.corners)??'—'}`]].map(([k,v])=>`<span class="chip">${k} <strong>${v}</strong></span>`).join('');}
function statPair(m,key){if(key==='shots_off_target'){const hs=n(m.stats?.shots?.home),as=n(m.stats?.shots?.away),ht=n(m.stats?.shots_on_target?.home),at=n(m.stats?.shots_on_target?.away);return{home:hs===null||ht===null?null:Math.max(0,hs-ht),away:as===null||at===null?null:Math.max(0,as-at)};}return{home:n(m.stats?.[key]?.home),away:n(m.stats?.[key]?.away)};}
function rememberSeries(m){const id=String(m.id),pairMap={};for(const [,key] of METRICS)pairMap[key]=statPair(m,key);const stamp=String(m.observedAt||m.sourceClock||Date.now()),list=seriesByMatch.get(id)||[];if(list.at(-1)?.stamp===stamp)return;list.push({stamp,clock:n(m.elapsedSeconds),values:pairMap});if(list.length>120)list.splice(0,list.length-120);seriesByMatch.set(id,list);}

function animationState(id){
  const key=String(id);
  if(!animationByMatch.has(key))animationByMatch.set(key,{initialized:false,seen:new Set(),queue:[],playing:false,x:.5,y:.5,hasSourcePosition:false,current:null,sourceStatus:'WAITING FOR SOURCE',lastSourceAt:0});
  return animationByMatch.get(key);
}
function activePitch(id){return [...document.querySelectorAll('.digital-pitch[data-pitch-id]')].find(x=>String(x.dataset.pitchId)===String(id))||null;}
function applyPitchState(id){
  const a=animationState(id),root=activePitch(id);if(!root)return;
  const ball=root.querySelector('.source-ball'),status=root.querySelector('.source-status'),event=root.querySelector('.source-event');
  root.classList.toggle('source-ready',a.hasSourcePosition);root.classList.toggle('source-waiting',!a.hasSourcePosition);
  if(ball){ball.style.left=`${(a.x*100).toFixed(2)}%`;ball.style.top=`${(a.y*100).toFixed(2)}%`;}
  if(status){status.className=`source-status ${a.hasSourcePosition?'ready':'waiting'}`;status.innerHTML=`<i></i><span>${esc(a.sourceStatus)}</span>`;}
  if(event)event.textContent=a.current?`${a.current.team} · ${a.current.type}`:'NO SOURCE EVENT YET';
}
function moveSourcePoint(id,point,duration=300){
  const x=n(point?.x),y=n(point?.y);if(x===null||y===null)return Promise.resolve();
  const a=animationState(id),tx=Math.max(0,Math.min(1,x)),ty=Math.max(0,Math.min(1,y));
  if(reduceMotion||!a.hasSourcePosition){a.x=tx;a.y=ty;a.hasSourcePosition=true;applyPitchState(id);return Promise.resolve();}
  const sx=a.x,sy=a.y,start=performance.now(),ms=Math.max(100,duration);
  return new Promise(resolve=>{
    const step=now=>{const p=Math.min(1,(now-start)/ms),e=1-Math.pow(1-p,3);a.x=sx+(tx-sx)*e;a.y=sy+(ty-sy)*e;applyPitchState(id);if(p<1)requestAnimationFrame(step);else{a.x=tx;a.y=ty;a.hasSourcePosition=true;applyPitchState(id);resolve();}};
    requestAnimationFrame(step);
  });
}
async function playAnimationQueue(id){
  const a=animationState(id);if(a.playing)return;a.playing=true;
  try{
    while(a.queue.length){
      const evt=a.queue.shift();a.current=evt;a.sourceStatus='LIVE SOURCE XY';applyPitchState(id);
      const points=Array.isArray(evt.points)?evt.points.filter(p=>n(p.x)!==null&&n(p.y)!==null):[];
      if(!points.length){applyPitchState(id);continue;}
      for(const point of points)await moveSourcePoint(id,point,points.length>1?220:320);
    }
  }finally{a.playing=false;}
}
function ingestAnimation(id,payload){
  const a=animationState(id);
  if(!payload?.ok){a.sourceStatus=a.hasSourcePosition?'SOURCE HOLD':'WAITING FOR SOURCE';applyPitchState(id);return;}
  a.lastSourceAt=Date.now();
  const events=(payload.events||[]).slice().sort((x,y)=>(n(x.id)||0)-(n(y.id)||0));
  if(!a.initialized){
    a.initialized=true;
    events.forEach(e=>a.seen.add(String(e.id)));
    a.current=payload.current||events.at(-1)||null;
    const anchor=[...events].reverse().find(e=>Array.isArray(e.points)&&e.points.some(p=>n(p.x)!==null&&n(p.y)!==null));
    if(anchor){const pts=anchor.points.filter(p=>n(p.x)!==null&&n(p.y)!==null),last=pts.at(-1);a.x=Math.max(0,Math.min(1,n(last.x)));a.y=Math.max(0,Math.min(1,n(last.y)));a.hasSourcePosition=true;}
    a.sourceStatus=a.hasSourcePosition?'LIVE SOURCE XY':'WAITING FOR SOURCE';applyPitchState(id);return;
  }
  for(const evt of events){const key=String(evt.id);if(a.seen.has(key))continue;a.seen.add(key);a.queue.push(evt);}
  if(payload.current)a.current=payload.current;
  a.sourceStatus=a.hasSourcePosition||a.queue.some(e=>(e.points||[]).length)?'LIVE SOURCE XY':'WAITING FOR SOURCE';
  applyPitchState(id);playAnimationQueue(id);
}
async function refreshAnimation(){
  if(animationPollBusy||!selectedId||!matchById(selectedId))return;
  const id=String(selectedId);animationPollBusy=true;
  try{
    const response=await fetch(`${WORKER}/animation?id=${encodeURIComponent(id)}&t=${Date.now()}`,{cache:'no-store'});
    const payload=await response.json().catch(()=>null);
    if(String(selectedId)===id||animationByMatch.has(id))ingestAnimation(id,payload);
  }catch{const a=animationState(id);a.sourceStatus=a.hasSourcePosition?'SOURCE HOLD':'WAITING FOR SOURCE';applyPitchState(id);}
  finally{animationPollBusy=false;}
}

function renderScorebar(){const bar=$('#scorebar'),signals=[...live.activeSignals].sort((a,b)=>Date.parse(b.selectedAt)-Date.parse(a.selectedAt));$('#activeCount').textContent=`${signals.length} ACTIVE`;if(!signals.length){bar.innerHTML='<div class="empty">Waiting for confirmed signals…</div>';return;}bar.innerHTML=signals.map(r=>{const m=matchById(r.id),isNew=!seen.has(String(r.id))&&Date.now()-Date.parse(r.selectedAt)<60000;return`<button class="scorecard ${String(r.id)===String(selectedId)&&selectedSignal?'active':''} ${isNew?'new':''}" data-signal="${esc(r.id)}"><div class="score-top"><small>⚡ SIGNAL ${esc(signalClock(r))}</small><b>LIVE</b></div><strong class="pick">${esc(lockText(r))}</strong><div class="score-bottom"><span>ENTRY ${esc(entryScore(r))}</span><span>NOW ${esc(orientedScore(r,m))}</span></div></button>`;}).join('');bar.querySelectorAll('[data-signal]').forEach(b=>b.onclick=()=>{selectedId=b.dataset.signal;selectedSignal=true;seen.add(String(selectedId));render();refreshAnimation();});}
function renderCandidates(){const box=$('#candidates');$('#liveCount').textContent=live.matches.length;box.innerHTML=live.matches.map(m=>{const c=candidateById(m.id),r=recordById(m.id),decision=r?'CONFIRMED':c?.decision||'WATCH';return`<button class="candidate ${String(m.id)===String(selectedId)&&!selectedSignal?'active':''}" data-match="${esc(m.id)}"><small>${esc(m.league)}</small><strong>${esc(m.home)} ${esc(m.score.home)}–${esc(m.score.away)} ${esc(m.away)}</strong><div class="row"><span>${esc(decision)}</span><span>${c?.momentum??'—'}%</span></div></button>`;}).join('')||'<div class="empty">No live matches.</div>';box.querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>{selectedId=b.dataset.match;selectedSignal=false;render();refreshAnimation();});}
function renderSummary(){const box=$('#summary'),r=selectedSignal?recordById(selectedId):null,m=matchById(selectedId);if(!r){box.className='signal-summary monitoring';box.innerHTML='<div class="status"><span class="dot"></span><b>MONITORING</b><small>No confirmed signal selected.</small></div>';return;}box.className='signal-summary';box.innerHTML=`<div class="status"><span class="dot"></span><b>CONFIRMED SIGNAL</b><small>Detection data locked · live match continues</small></div><div class="signal-grid"><div class="cell primary"><small>SELECTION</small><b>${esc(lockText(r))}</b></div><div class="cell signal"><small>DETECTED / ENTRY</small><b>${esc(signalClock(r))} · ${esc(entryScore(r))}</b></div><div class="cell live"><small>CURRENT SCORE</small><b>${esc(orientedScore(r,m))}</b></div><div class="cell"><small>CURRENT MARKET</small><b>${esc(currentMarket(r,m))}</b></div></div><div class="chips">${reasonChips(r)}</div>`;}
function graphPoints(values,width,height,pad,max){if(!values.length)return'';const span=Math.max(1,values.length-1);return values.map((v,i)=>{const x=pad+(width-pad*2)*(i/span),y=height-pad-(height-pad*2)*(Math.max(0,v)/max);return`${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');}
function renderChart(m){const list=seriesByMatch.get(String(m.id))||[],metric=activeMetric,home=list.map(x=>n(x.values?.[metric]?.home)).filter(v=>v!==null),away=list.map(x=>n(x.values?.[metric]?.away)).filter(v=>v!==null),all=[...home,...away],max=Math.max(1,...all),w=760,h=230,pad=20;const homePoints=graphPoints(home,w,h,pad,max),awayPoints=graphPoints(away,w,h,pad,max),metricLabel=METRICS.find(([,k])=>k===metric)?.[0]||metric;return`<section class="live-chart"><div class="chart-head"><div><small>LIVE TREND</small><b>${esc(metricLabel)}</b></div><div class="legend"><span class="home-key">HOME · ${esc(m.home)}</span><span class="away-key">AWAY · ${esc(m.away)}</span></div></div><div class="metric-tabs">${METRICS.map(([label,key])=>`<button class="metric-btn ${metric===key?'active':''}" data-metric="${esc(key)}">${esc(label)}</button>`).join('')}</div><div class="chart-stage"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="${esc(metricLabel)} live trend"><g class="chart-grid"><line x1="20" y1="57" x2="740" y2="57"/><line x1="20" y1="115" x2="740" y2="115"/><line x1="20" y1="172" x2="740" y2="172"/></g>${homePoints?`<polyline class="home-line" points="${homePoints}"/>`:''}${awayPoints?`<polyline class="away-line" points="${awayPoints}"/>`:''}</svg>${list.length<2?'<div class="chart-wait">Collecting live trend…</div>':''}</div></section>`;}
function renderPitch(m){const a=animationState(m.id),event=a.current,pos=`left:${(a.x*100).toFixed(2)}%;top:${(a.y*100).toFixed(2)}%`;return`<section class="digital-pitch source-driven ${a.hasSourcePosition?'source-ready':'source-waiting'}" data-pitch-id="${esc(m.id)}"><div class="pitch-grid"></div><div class="half-line"></div><div class="center-ring"></div><div class="box home-box"></div><div class="box away-box"></div><div class="goal home-goal"></div><div class="goal away-goal"></div><div class="scanner"></div><div class="source-status ${a.hasSourcePosition?'ready':'waiting'}"><i></i><span>${esc(a.sourceStatus)}</span></div><div class="source-event">${event?`${esc(event.team)} · ${esc(event.type)}`:'NO SOURCE EVENT YET'}</div><div class="source-ball" style="${pos}"></div><div class="pitch-readout home-readout"><small>HOME</small><b>${esc(m.home)}</b></div><div class="pitch-readout away-readout"><small>AWAY</small><b>${esc(m.away)}</b></div><div class="pitch-live"><span>LIVE DIGITAL FIELD</span><b>${esc(m.score.home)}–${esc(m.score.away)}</b></div></section>`;}
function renderStats(m){return`<div class="section-label">LIVE STATS</div><div class="stats">${METRICS.map(([label,key])=>{const p=statPair(m,key),suffix=key==='possession'?'%':'';return`<div class="stat"><small>${esc(label)}</small><div class="stat-duel"><b class="home-value">${p.home??'—'}${p.home===null?'':suffix}</b><span>HOME / AWAY</span><b class="away-value">${p.away??'—'}${p.away===null?'':suffix}</b></div></div>`;}).join('')}</div>`;}
function renderEvents(m){return'<div class="section-label">RECENT EVENTS</div><div class="events">'+((m.events||[]).slice(0,8).map(e=>`<div class="event ${e.team==='AWAY'?'away-event':'home-event'}"><span>${esc(e.minute??'—')}' · ${esc(e.type)}</span><span>${esc(e.team)}</span></div>`).join('')||'<div class="empty">No recent events.</div>')+'</div>';}
function renderMatch(){const m=matchById(selectedId);if(!m){$('#match').innerHTML='<div class="empty">Select a live match.</div>';$('#stats').innerHTML='';$('#events').innerHTML='';return;}const r=selectedSignal?recordById(selectedId):null,sel=r?.selectedSide;$('#match').innerHTML=`<div class="match-card"><div class="team home-team ${sel==='HOME'?'selected':''}"><small>HOME</small><b>${esc(m.home)}</b></div><div class="score"><b>${esc(m.score.home)}–${esc(m.score.away)}</b></div><div class="team away-team ${sel==='AWAY'?'selected':''}"><small>AWAY</small><b>${esc(m.away)}</b></div></div>${renderPitch(m)}${renderChart(m)}`;$('#stats').innerHTML=renderStats(m);$('#events').innerHTML=renderEvents(m);document.querySelectorAll('[data-metric]').forEach(btn=>btn.onclick=()=>{activeMetric=btn.dataset.metric;renderMatch();updateClocks();applyPitchState(m.id);});applyPitchState(m.id);}
function render(){renderScorebar();renderCandidates();renderSummary();renderMatch();updateClocks();}
async function refresh(){try{const [l,c]=await Promise.all([fetch(`${WORKER}/live?t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()),config?Promise.resolve({config}):fetch(`${WORKER}/config`,{cache:'no-store'}).then(r=>r.json())]);live=l;config=c.config||config;live.matches.forEach(m=>{anchorSnapshot(m);rememberSeries(m);});if(selectedId&&!matchById(selectedId))selectedId=null;if(!selectedId&&live.activeSignals.length){selectedId=live.activeSignals[0].id;selectedSignal=true;}else if(!selectedId&&live.matches.length){selectedId=live.matches[0].id;selectedSignal=false;}render();refreshAnimation();}catch(e){console.error(e);}}
$('#prev').onclick=()=>$('#scorebar').scrollBy({left:-470,behavior:'smooth'});$('#next').onclick=()=>$('#scorebar').scrollBy({left:470,behavior:'smooth'});$('#scorebar').addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();$('#scorebar').scrollLeft+=e.deltaY;}},{passive:false});
setInterval(updateClocks,250);setInterval(refreshAnimation,1500);setInterval(refresh,5000);refresh();