const $=(id)=>document.getElementById(id);
const page=document.body.dataset.page;
const DEFAULT_WORKER='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
let runtime={liveUrl:`${DEFAULT_WORKER}/live`,healthUrl:`${DEFAULT_WORKER}/health`,refreshSeconds:15};
let snapshots=[];

const esc=(v)=>String(v??'—').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const pair=(v)=>[num(v?.home),num(v?.away)];
const fmtMinute=(m)=>{
  const s=String(m?.status||'LIVE').toUpperCase();
  if(s==='FT'||s.includes('FINISH'))return'FT';
  if(s==='HT'||s.includes('HALF'))return'HT';
  return Number.isFinite(Number(m?.minute))?`${Math.round(Number(m.minute))}'`:'Live';
};
const unwrapMatches=(data)=>Array.isArray(data)?data:Array.isArray(data?.matches)?data.matches:Array.isArray(data?.data)?data.data:[];
const workerBase=()=>String(runtime.workerUrl||runtime.liveUrl||DEFAULT_WORKER).replace(/\/live(?:\?.*)?$/,'');

async function json(url,timeout=12000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{clearTimeout(timer);}
}

async function loadRuntime(){
  try{runtime={...runtime,...await json(`./runtime.json?t=${Date.now()}`,5000)};}catch{}
  return runtime;
}

function pressure(row){
  const s=row.stats||{};
  const h=num(s.attacks?.home)*.16+num(s.dangerous_attacks?.home)*.32+num(s.shots?.home)*.18+num(s.shots_on_target?.home)*.22+num(s.corners?.home)*.12;
  const a=num(s.attacks?.away)*.16+num(s.dangerous_attacks?.away)*.32+num(s.shots?.away)*.18+num(s.shots_on_target?.away)*.22+num(s.corners?.away)*.12;
  const t=Math.max(.01,h+a);
  return[Math.round(h/t*100),Math.round(a/t*100)];
}

function pressureTimeline(id,current){
  const points=[];
  for(const snap of snapshots){
    const row=(snap.matches||[]).find(x=>String(x.sourceMatchId??x.id)===String(id));
    if(!row||!Number.isFinite(Number(row.minute)))continue;
    const p=pressure(row);
    points.push([Number(row.minute),p[0],p[1]]);
  }
  const byMinute=new Map(points.map(p=>[p[0],p]));
  const rows=[...byMinute.values()].sort((a,b)=>a[0]-b[0]).slice(-45);
  if(!rows.length&&Number.isFinite(Number(current.minute)))rows.push([Number(current.minute),current.pressure[0],current.pressure[1]]);
  return rows;
}

function decision(row){
  const raw=String(row?.engine?.decision||row?.decision||row?.state||'WATCH').toUpperCase();
  if(raw.includes('SIGNAL'))return'SIGNAL';
  if(raw.includes('NEAR'))return'NEAR';
  return'WATCH';
}

function signalInfo(row){
  const e=row.engine||{};
  const market=e.market||e.selectedMarket||row.market||'Live selection';
  const selected=e.selectedTeam||e.pick||e.selection||row.selectedTeam||row.pick||'Monitoring';
  let odds=e.odds??e.lockedOdds??row.lockedOdds??row.oddsAtSignal;
  if(!Number.isFinite(Number(odds))&&String(market).toUpperCase().includes('WIN')){
    const one=row.odds?.oneXtwo;
    const side=String(e.selectedSide||row.selectedSide||'').toUpperCase();
    odds=side==='AWAY'?one?.away:side==='HOME'?one?.home:null;
  }
  const detected=e.detectedMinute??e.entryMinute??row.detectedMinute??row.entryMinute??row.minute;
  let confidence=e.confidence??row.confidence??row.matchConfidence;
  if(Number(confidence)<=1&&Number(confidence)>0)confidence=Number(confidence)*100;
  return{
    market,
    selected,
    odds:Number.isFinite(Number(odds))?Number(odds):null,
    detected,
    confidence:Number.isFinite(Number(confidence))?Math.round(Number(confidence)):null
  };
}

function normalize(row){
  const p=pressure(row),sig=signalInfo(row);
  return{
    id:String(row.sourceMatchId??row.id??`${row.home}-${row.away}-${row.minute}`),
    league:row.league||'Live match',home:row.home||'Home',away:row.away||'Away',score:pair(row.score),
    homeId:row.homeId??row.home_id??row.homeTeamId??row.home?.id??null,
    awayId:row.awayId??row.away_id??row.awayTeamId??row.away?.id??null,
    minute:row.minute,status:row.status||'LIVE',
    stats:{
      possession:pair(row.stats?.possession),attacks:pair(row.stats?.attacks),dangerous:pair(row.stats?.dangerous_attacks),
      shots:pair(row.stats?.shots),sot:pair(row.stats?.shots_on_target),corners:pair(row.stats?.corners),red:pair(row.stats?.red_cards)
    },
    events:Array.isArray(row.events)?row.events:[],pressure:p,state:decision(row),signal:sig,
    freshness:num(row.sourceFreshnessSeconds,0),collectedAt:row.collectedAt||new Date().toISOString()
  };
}

let matches=[],selectedId=null,liveRefreshing=false,liveTimer=null;
function setFeed(ok,text){
  const el=document.querySelector('.feed-state');
  if(el)el.classList.toggle('offline',!ok);
  if($('feedState'))$('feedState').textContent=text;
}
function liveCounts(){
  if(!$('liveCount'))return;
  $('liveCount').textContent=matches.length;
  $('watchCount').textContent=matches.filter(m=>m.state!=='SIGNAL').length;
  $('signalCount').textContent=matches.filter(m=>m.state==='SIGNAL').length;
  const f=matches.length?Math.max(...matches.map(m=>m.freshness)):null;
  $('freshness').textContent=f===null?'—':`${f}s`;
}
function candidate(m){
  const sig=m.signal,odds=sig.odds?sig.odds.toFixed(2):'—';
  return`<button class="signal-item ${m.id===selectedId?'active':''}" data-id="${esc(m.id)}"><div class="signal-top"><span class="minute">${fmtMinute(m)}</span><span class="state-pill ${m.state.toLowerCase()}">${m.state==='SIGNAL'?'Signal':m.state==='NEAR'?'Near signal':'Watch'}</span></div><div class="teams-line"><span>${esc(m.home)}</span><b>${m.score[0]}–${m.score[1]}</b><span>${esc(m.away)}</span></div><div class="pick-line">${esc(sig.selected)}</div><div class="signal-bottom"><span>${esc(sig.market)} · Odds <strong>${odds}</strong></span><span>Detected ${esc(sig.detected)}'</span></div></button>`;
}
function renderSignalList(){
  liveCounts();
  const list=$('signalList');
  if(!list)return;
  if(!matches.length){list.innerHTML='<div class="soft-card empty-state"><p>No live records are ready in this scan.</p></div>';return;}
  const order={SIGNAL:0,NEAR:1,WATCH:2};
  const rows=[...matches].sort((a,b)=>order[a.state]-order[b.state]||num(b.minute)-num(a.minute));
  list.innerHTML=rows.map(candidate).join('');
  list.querySelectorAll('.signal-item').forEach(btn=>btn.onclick=()=>selectMatch(btn.dataset.id,true));
}

const normText=(v)=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9\p{L}]+/gu,' ' ).replace(/\s+/g,' ').trim();
function eventSide(event,m){
  const rawSide=String(event?.side??event?.teamSide??event?.team_side??event?.homeAway??event?.home_away??event?.position??'').trim().toLowerCase();
  if(['home','h','1','local'].includes(rawSide))return'home';
  if(['away','a','2','visitor'].includes(rawSide))return'away';

  const eventTeamId=event?.teamId??event?.team_id??event?.team?.id??null;
  if(eventTeamId!==null&&eventTeamId!==undefined){
    if(m.homeId!==null&&String(eventTeamId)===String(m.homeId))return'home';
    if(m.awayId!==null&&String(eventTeamId)===String(m.awayId))return'away';
  }

  const teamName=normText(typeof event?.team==='object'?(event.team?.name??event.team?.shortName):event?.team);
  if(teamName){
    const home=normText(m.home),away=normText(m.away);
    if(teamName===home)return'home';
    if(teamName===away)return'away';
  }
  return'unknown';
}
function eventTimestamp(event){
  const raw=event?.timestamp??event?.eventTimestamp??event?.event_timestamp??event?.createdAt??event?.created_at??event?.updatedAt??event?.updated_at;
  if(raw===null||raw===undefined||raw==='')return null;
  if(Number.isFinite(Number(raw)))return Number(raw);
  const t=Date.parse(String(raw));
  return Number.isFinite(t)?t:null;
}
function eventSequence(event){
  const raw=event?.sequence??event?.seq??event?.eventId??event?.event_id??event?.id;
  return Number.isFinite(Number(raw))?Number(raw):null;
}
function compareEventsDesc(a,b){
  const minuteDiff=num(b.event?.minute,-1)-num(a.event?.minute,-1);
  if(minuteDiff)return minuteDiff;
  const ta=eventTimestamp(a.event),tb=eventTimestamp(b.event);
  if(ta!==null||tb!==null){const diff=(tb??-Infinity)-(ta??-Infinity);if(diff)return diff;}
  const sa=eventSequence(a.event),sb=eventSequence(b.event);
  if(sa!==null||sb!==null){const diff=(sb??-Infinity)-(sa??-Infinity);if(diff)return diff;}
  return b.index-a.index;
}
function sortedEvents(events){return events.map((event,index)=>({event,index})).sort(compareEventsDesc).map(x=>x.event);}
function latestEvent(m){return m.events.length?sortedEvents(m.events)[0]:null;}
function eventZone(event,m){
  if(!event)return{x:50,y:50,side:'unknown',trackable:false,label:'Waiting for event'};

  const type=String(event?.type||event?.event||'').toLowerCase();
  const side=eventSide(event,m);
  const label=`${event.minute??m.minute}' · ${event.type||event.event||'Live event'}`;
  if(side==='unknown')return{x:50,y:50,side,trackable:false,label:`${label} · team unknown`};
  if(type.includes('card')||type.includes('sub'))return{x:50,y:50,side,trackable:false,label};

  let x=50,y=50,trackable=true;
  if(type.includes('goal kick'))x=side==='home'?12:88;
  else if(type.includes('corner')){
    x=side==='home'?94:6;
    if(type.includes('left'))y=12;
    else if(type.includes('right'))y=88;
  }
  else if(type.includes('danger'))x=side==='home'?84:16;
  else if(type.includes('shot'))x=side==='home'?88:12;
  else if(type.includes('attack'))x=side==='home'?72:28;
  else if(type.includes('goal'))x=side==='home'?94:6;
  else trackable=false;

  return{x:trackable?x:50,y:trackable?y:50,side,trackable,label};
}
function moveBall(m){
  const event=latestEvent(m),z=eventZone(event,m),ball=$('ball'),glow=$('zoneGlow');
  if(ball){ball.style.left=`${z.x}%`;ball.style.top=`${z.y}%`;}
  if(glow){
    glow.style.transform=z.side==='home'?'translateX(115%)':'translateX(0)';
    glow.style.opacity=z.trackable?'.58':'0';
  }
  if($('pitchEvent'))$('pitchEvent').textContent=z.label;
}
function statRow(label,v){
  const total=Math.max(1,num(v[0])+num(v[1])),left=Math.round(num(v[0])/total*100);
  return`<div class="stat-row"><div class="stat-values"><b>${esc(v[0])}</b><span>${esc(label)}</span><b>${esc(v[1])}</b></div><div class="stat-bar"><i style="width:${left}%"></i><i style="width:${100-left}%"></i></div></div>`;
}
function drawMomentum(m){
  const svg=$('momentumChart');if(!svg)return;
  const data=pressureTimeline(m.id,m),w=800,h=220,p=28;
  if(data.length<2){
    const yH=h-p-num(data[0]?.[1]??m.pressure[0])*(h-p*2)/100,yA=h-p-num(data[0]?.[2]??m.pressure[1])*(h-p*2)/100;
    svg.innerHTML=`<line x1="${p}" y1="${h/2}" x2="${w-p}" y2="${h/2}" stroke="rgba(255,255,255,.07)"/><circle cx="${w/2}" cy="${yH}" r="5" fill="#f3c623"/><circle cx="${w/2}" cy="${yA}" r="5" fill="#7b838c"/><text x="${w/2}" y="${h-12}" text-anchor="middle" fill="#969da6" font-size="12">Awaiting timeline snapshots</text>`;
    return;
  }
  const minX=Math.min(...data.map(d=>d[0])),maxX=Math.max(...data.map(d=>d[0])),range=Math.max(1,maxX-minX);
  const x=v=>p+(v-minX)*(w-p*2)/range,y=v=>h-p-num(v)*(h-p*2)/100,path=k=>data.map((d,i)=>`${i?'L':'M'} ${x(d[0]).toFixed(1)} ${y(d[k]).toFixed(1)}`).join(' ');
  let grid='';for(let i=0;i<=4;i++){const yy=p+i*(h-p*2)/4;grid+=`<line x1="${p}" y1="${yy}" x2="${w-p}" y2="${yy}" stroke="rgba(255,255,255,.07)"/>`;}
  svg.innerHTML=`${grid}<path d="${path(1)}" fill="none" stroke="#f3c623" stroke-width="3" vector-effect="non-scaling-stroke"/><path d="${path(2)}" fill="none" stroke="#7b838c" stroke-width="2.4" vector-effect="non-scaling-stroke"/>`;
}
function renderMatch(m){
  $('emptyState').hidden=true;$('matchContent').hidden=false;
  $('leagueName').textContent=m.league;$('matchClock').textContent=fmtMinute(m);$('homeName').textContent=m.home;$('awayName').textContent=m.away;
  $('scoreText').textContent=`${m.score[0]}–${m.score[1]}`;$('matchStatus').textContent=String(m.status).replaceAll('_',' ');
  const s=m.signal,st=$('decisionState');
  st.textContent=m.state==='SIGNAL'?'Signal active':m.state==='NEAR'?'Near signal':'Watch';st.className=`state-pill ${m.state.toLowerCase()}`;
  $('pickValue').textContent=s.selected;$('lockedOdds').textContent=s.odds?s.odds.toFixed(2):'—';$('confidence').textContent=s.confidence!==null?`${s.confidence}%`:'—';
  $('detectedMinute').textContent=s.detected!==null?`${s.detected}'`:'—';if($('marketName'))$('marketName').textContent=s.market||'Live';
  $('statsRows').innerHTML=[['Possession %',m.stats.possession],['Attacks',m.stats.attacks],['Dangerous attacks',m.stats.dangerous],['Shots',m.stats.shots],['Shots on target',m.stats.sot],['Corners',m.stats.corners],['Red cards',m.stats.red]].map(([l,v])=>statRow(l,v)).join('');
  const events=sortedEvents(m.events).slice(0,20);
  $('eventCount').textContent=`${events.length} events`;
  $('eventList').innerHTML=events.length?events.map(e=>`<div class="event"><time>${esc(e.minute??'—')}'</time><span>${esc(e.type||e.event||'Event')}</span><small>${esc(typeof e.team==='object'?(e.team?.name??e.team?.shortName??''):e.team||'')}</small></div>`).join(''):'<div class="event"><time>—</time><span>Waiting for live event data</span><small>Live feed</small></div>';
  moveBall(m);drawMomentum(m);
}
function selectMatch(id,openMobile=false){
  selectedId=String(id);renderSignalList();
  const m=matches.find(x=>x.id===selectedId)||matches[0];if(m)renderMatch(m);
  if(openMobile&&window.matchMedia('(max-width:1023px)').matches)$('liveLayout')?.classList.add('match-open');
}

async function refreshLive(){
  if(liveRefreshing)return;
  liveRefreshing=true;
  try{
    const base=workerBase();
    const [live,snap]=await Promise.all([
      json(`${runtime.liveUrl}${runtime.liveUrl.includes('?')?'&':'?'}t=${Date.now()}`),
      json(`${base}/snapshots?t=${Date.now()}`).catch(()=>({snapshots:[]}))
    ]);
    snapshots=Array.isArray(snap?.snapshots)?snap.snapshots:[];
    const rows=unwrapMatches(live).filter(row=>{const s=String(row?.status||'').toUpperCase();return s!=='FT'&&!s.includes('FINISH')&&s!=='NS'&&s!=='SCHEDULED';});
    matches=rows.map(normalize);
    if(selectedId&&!matches.some(m=>m.id===selectedId))selectedId=null;
    if(!selectedId&&matches.length)selectedId=matches.find(m=>m.state==='SIGNAL')?.id||matches[0].id;
    renderSignalList();if(selectedId)renderMatch(matches.find(m=>m.id===selectedId));
    if($('lastUpdated'))$('lastUpdated').textContent=`Updated ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    setFeed(true,'Online');
  }catch(err){
    setFeed(false,'Reconnecting');
    if($('lastUpdated'))$('lastUpdated').textContent='Live feed connection issue';
    console.warn('Live refresh failed',err);
  }finally{liveRefreshing=false;}
}
function scheduleLive(){
  clearTimeout(liveTimer);
  liveTimer=setTimeout(async()=>{await refreshLive();scheduleLive();},Math.max(10,num(runtime.refreshSeconds,15))*1000);
}
async function initLive(){
  await loadRuntime();
  $('mobileBack').onclick=()=>$('liveLayout').classList.remove('match-open');
  await refreshLive();scheduleLive();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLive();});
  window.addEventListener('online',()=>refreshLive());
}

let historyPage=1,historyPages=1,trend=[],historyRefreshing=false;
function drawHistory(){
  const svg=$('historyChart');if(!svg)return;
  const data=trend.length?trend:[{index:0,win:0,loss:0,draw:0}],w=800,h=240,p=28,max=Math.max(1,...data.flatMap(d=>[num(d.win),num(d.loss),num(d.draw)]));
  const x=i=>p+(data.length<=1?0:i*(w-p*2)/(data.length-1)),y=v=>h-p-num(v)*(h-p*2)/max,path=k=>data.map((d,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(d[k]).toFixed(1)}`).join(' ');
  let grid='';for(let i=0;i<=4;i++){const yy=p+i*(h-p*2)/4;grid+=`<line x1="${p}" y1="${yy}" x2="${w-p}" y2="${yy}" stroke="rgba(255,255,255,.07)"/>`;}
  svg.innerHTML=`${grid}<path d="${path('win')}" fill="none" stroke="#33d17a" stroke-width="3"/><path d="${path('loss')}" fill="none" stroke="#ff5c5c" stroke-width="3"/><path d="${path('draw')}" fill="none" stroke="#8b929b" stroke-width="2.5"/>`;
}
function resultName(r){let v=String(r.resultGroup||r.result||'PENDING').toUpperCase();if(v==='CORRECT')v='WIN';if(v==='INCORRECT')v='LOSS';if(v==='PUSH')v='DRAW';return v;}
function renderHistory(data){
  const s=data.summary||{},win=num(s.win??s.correct),loss=num(s.loss??s.incorrect),draw=num(s.draw??s.push),avg=num(s.averageOdds),rate=Number.isFinite(Number(s.winRate))?num(s.winRate):(win+loss?win/(win+loss)*100:0);
  $('statWin').textContent=win;$('statLoss').textContent=loss;$('statDraw').textContent=draw;$('statRate').textContent=`${rate.toFixed(2)}%`;$('statOdds').textContent=avg.toFixed(2);
  trend=Array.isArray(s.trend)?s.trend:[];
  const rows=Array.isArray(data.records)?data.records:[];
  $('historyBody').innerHTML=rows.length?rows.map(r=>{
    const result=resultName(r),cls=`result-${result.toLowerCase()}`;
    return`<tr><td>${esc(r.selectionDate||'—')}</td><td>${esc(r.home||'—')} vs ${esc(r.away||'—')}</td><td>${esc(r.selectedTeam||r.selectedSide||'—')}</td><td>${esc(r.market||'—')}</td><td>${esc(r.odds??'—')}</td><td>${esc(r.entryMinute??'—')}'</td><td class="${cls}">${esc(result)}</td></tr>`;
  }).join(''):'<tr><td colspan="7">No settled signals yet.</td></tr>';
  historyPage=num(data.page,historyPage);historyPages=Math.max(1,num(data.pages,1));
  $('pageInfo').textContent=`Page ${historyPage} / ${historyPages} · 25 rows/page`;$('prevPage').disabled=historyPage<=1;$('nextPage').disabled=historyPage>=historyPages;
  requestAnimationFrame(drawHistory);setFeed(true,'Online');
}
async function refreshHistory(){
  if(historyRefreshing)return;historyRefreshing=true;
  try{
    const data=await json(`${workerBase()}/history?page=${historyPage}&limit=25&t=${Date.now()}`);
    if(data.ok===false)throw new Error(data.error||'History unavailable');renderHistory(data);
  }catch{
    setFeed(false,'Reconnecting');$('historyBody').innerHTML='<tr><td colspan="7">Statistics are temporarily unavailable. Automatic retry is active.</td></tr>';
  }finally{historyRefreshing=false;}
}
async function initStatistics(){
  await loadRuntime();
  $('prevPage').onclick=()=>{if(historyPage>1){historyPage--;refreshHistory();}};
  $('nextPage').onclick=()=>{if(historyPage<historyPages){historyPage++;refreshHistory();}};
  await refreshHistory();setInterval(refreshHistory,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHistory();});
}

function initAlerts(){
  setFeed(true,'Plans ready');
  document.querySelectorAll('[data-integration="preorder"]').forEach(btn=>btn.addEventListener('click',e=>{
    e.preventDefault();alert('Custom live engine pre-order is not open yet.');
  }));
}

if(page==='live')initLive();
if(page==='statistics')initStatistics();
if(page==='alerts')initAlerts();
