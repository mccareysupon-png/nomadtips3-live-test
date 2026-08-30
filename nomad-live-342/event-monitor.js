(()=>{
'use strict';
const config=window.NOMAD342_CONFIG;
if(!config?.defaults)throw new Error('NOMAD342_CONFIG missing');
const SETTINGS_KEY=config.settingsKey;
const DEFAULTS=config.defaults;
const runtime=window.NOMAD342_RUNTIME||{};
const browserHistory=new Map();
let timer=null;
let running=false;

function settings(){
  try{
    const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
    return {...DEFAULTS,...saved,allowedSelectionLines:Array.isArray(saved.allowedSelectionLines)?saved.allowedSelectionLines:[...(DEFAULTS.allowedSelectionLines||[])]};
  }catch{return {...DEFAULTS,allowedSelectionLines:[...(DEFAULTS.allowedSelectionLines||[])]}}
}
function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function at(pair,index){return Array.isArray(pair)?finite(pair[index]):null}
function delta(first,last,key,index){const a=at(first?.[key],index),b=at(last?.[key],index);return a===null||b===null?null:b-a}
function addKnown(...values){return values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null}
function fmtDelta(v){return v===null?'—':`${v>=0?'+':''}${v}`}

function mergeFeedHistory(match){
  const id=String(match.id),incoming=Array.isArray(match.event?.snapshots)?match.event.snapshots:[],previous=browserHistory.get(id)||[],byMinute=new Map();
  for(const snapshot of [...previous,...incoming]){
    const minute=finite(snapshot?.minute);if(minute===null)continue;
    const next={...snapshot,minute,observedAt:finite(snapshot?.observedAt)||Date.now()},current=byMinute.get(minute);
    if(!current||next.observedAt>=current.observedAt)byMinute.set(minute,next);
  }
  const cutoff=Date.now()-15*60*1000;
  const rows=[...byMinute.values()].filter(s=>s.observedAt>=cutoff).sort((a,b)=>a.minute-b.minute||a.observedAt-b.observedAt).slice(-40);
  browserHistory.set(id,rows);
  return {...match,event:{...match.event,snapshots:rows}};
}

function eventMetrics(m,c){
  const snaps=[...(m.event?.snapshots||[])].filter(s=>Number.isFinite(Number(s.minute))).sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
  const eligible=snaps.filter(s=>s.minute>=m.minute-c.rollingWindowMinutes&&s.minute<=m.minute),first=eligible[0],last=eligible[eligible.length-1];
  if(!first||!last||first===last||Number(first.minute)>=Number(last.minute))return null;
  const hA=delta(first,last,'attacks',0),aA=delta(first,last,'attacks',1),hD=delta(first,last,'dangerous',0),aD=delta(first,last,'dangerous',1);
  if([hA,aA,hD,aD].some(v=>v===null))return null;
  const hWeighted=hA*c.attackWeight+hD*c.dangerousAttackWeight,aWeighted=aA*c.attackWeight+aD*c.dangerousAttackWeight,total=Math.max(0,hWeighted)+Math.max(0,aWeighted),pressureShare=total>0?(Math.max(0,hWeighted)/total)*100:0;
  const hSot=delta(first,last,'sot',0),aSot=delta(first,last,'sot',1),hOff=delta(first,last,'off',0),aOff=delta(first,last,'off',1),hCorner=delta(first,last,'corner',0),aCorner=delta(first,last,'corner',1),homeShots=addKnown(hSot,hOff),awayShots=addKnown(aSot,aOff),trend=[hWeighted>aWeighted,hD>aD,homeShots!==null&&awayShots!==null&&homeShots>awayShots];
  return {from:first.minute,to:last.minute,pressureShare:Number(pressureShare.toFixed(1)),trendPass:trend.filter(Boolean).length,hA,aA,hD,aD,hSot,aSot,hOff,aOff,hCorner,aCorner};
}

function eventCheck(m,c){
  const reasons=[];let pass=true;const metrics=eventMetrics(m,c);
  if(m.freshness?.stale){pass=false;reasons.push('source stale')}
  if(m.minute<c.minuteFrom||m.minute>c.minuteTo){pass=false;reasons.push(`outside ${c.minuteFrom}–${c.minuteTo}'`)}else reasons.push('minute window pass');
  if(c.scoreDifferenceFilterEnabled&&Math.abs(Number(m.score?.[0])-Number(m.score?.[1]))>c.maxScoreDifference){pass=false;reasons.push('score gap rejected')}
  if(!metrics){pass=false;reasons.push('rolling window building');return {pass,reasons,metrics:null}}
  if(metrics.pressureShare<c.homePressureShareMinimum){pass=false;reasons.push(`HOME pressure ${metrics.pressureShare}%`)}else reasons.push(`HOME pressure ${metrics.pressureShare}% pass`);
  if(metrics.trendPass<c.trendConditionsRequired){pass=false;reasons.push(`trend ${metrics.trendPass}/3`)}else reasons.push(`trend ${metrics.trendPass}/3 pass`);
  const evidence=[];
  if(c.sotEvidenceEnabled)evidence.push(metrics.hSot!==null&&metrics.hSot>=c.sotDeltaMinimum);
  if(c.shotOffEvidenceEnabled)evidence.push(metrics.hOff!==null&&metrics.hOff>=c.shotOffDeltaMinimum);
  if(c.cornerEvidenceEnabled)evidence.push(metrics.hCorner!==null&&metrics.hCorner>=c.cornerDeltaMinimum);
  if(c.homeEventRequired){const ok=c.evidenceMode==='ALL'?evidence.length>0&&evidence.every(Boolean):evidence.some(Boolean);if(!ok){pass=false;reasons.push(`HOME event ${c.evidenceMode} wait`)}else reasons.push(`HOME event ${c.evidenceMode} pass`)}
  return {pass,reasons,metrics};
}

function graphSeries(m){
  const rows=[...(m.event?.snapshots||[])].filter(s=>Number.isFinite(Number(s.minute))&&at(s.attacks,0)!==null&&at(s.attacks,1)!==null).sort((a,b)=>a.minute-b.minute||Number(a.observedAt||0)-Number(b.observedAt||0)).slice(-12);
  if(rows.length<2)return null;
  const h0=at(rows[0].attacks,0),a0=at(rows[0].attacks,1);
  const home=rows.map(s=>Math.max(0,(at(s.attacks,0)??h0)-h0)),away=rows.map(s=>Math.max(0,(at(s.attacks,1)??a0)-a0));
  const max=Math.max(1,...home,...away);
  const pts=values=>values.map((v,i)=>{const x=4+(i/(values.length-1))*92,y=37-(v/max)*29;return `${x.toFixed(1)},${y.toFixed(1)}`}).join(' ');
  return {home:pts(home),away:pts(away),from:rows[0].minute,to:rows[rows.length-1].minute,homeDelta:home[home.length-1],awayDelta:away[away.length-1]};
}

function attackGraph(m){
  const g=graphSeries(m);
  if(!g)return '<div class="attack-empty">Building attack history…</div>';
  return `<div class="attack-chart"><svg viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Recent attack flow"><line class="chart-grid" x1="4" y1="37" x2="96" y2="37"/><line class="chart-grid chart-grid-mid" x1="4" y1="22" x2="96" y2="22"/><polyline class="attack-line attack-home" points="${g.home}"/><polyline class="attack-line attack-away" points="${g.away}"/></svg><div class="chart-axis"><span>${esc(g.from)}'</span><span>ATTACK Δ ${esc(g.homeDelta)} / ${esc(g.awayDelta)}</span><span>${esc(g.to)}'</span></div></div>`;
}

function stat(label,home,away){return `<div class="event-stat"><span>${label}</span><div><b>${esc(home)}</b><i>H / A</i><b>${esc(away)}</b></div></div>`}
function matchCard(r){
  const m=r.m,em=r.event.metrics,stale=Boolean(m.freshness?.stale),state=stale?'STALE':r.event.pass?'EVENT':em?'READY':'WATCH';
  const cls=stale?'event-stale':r.event.pass?'event-hot':em?'event-ready':'event-watch';
  const pressure=em?`${em.pressureShare}%`:'—',window=em?`${em.from}'–${em.to}'`:`${Math.max(0,m.minute-r.c.rollingWindowMinutes)}'–${m.minute}'`;
  return `<article class="event-card ${cls}"><div class="event-top"><span class="event-league">${esc(m.league||'—')}</span><span class="live-minute">${esc(m.minute)}'</span><span class="live-score">${esc((m.score||[]).join('–'))}</span><span class="event-badge">${state}</span></div><div class="event-teams"><strong>${esc(m.home)}</strong><span>vs</span><strong>${esc(m.away)}</strong></div><div class="attack-head"><div><span>ATTACK FLOW</span><small>${esc(window)} rolling view</small></div><div class="attack-legend"><span class="home-dot"></span>${esc(m.home)}<span class="away-dot"></span>${esc(m.away)}</div></div>${attackGraph(m)}<div class="event-overview"><div><span>HOME PRESSURE</span><strong>${esc(pressure)}</strong></div><div><span>TREND</span><strong>${em?`${em.trendPass}/3`:'—'}</strong></div><div><span>EVENT GATE</span><strong class="${r.event.pass?'oktxt':'waittxt'}">${r.event.pass?'PASS':'WATCH'}</strong></div><div><span>FEED</span><strong class="${stale?'redtxt':'oktxt'}">${stale?'STALE':'LIVE'}</strong></div></div><div class="event-stats">${stat('ATTACK',em?fmtDelta(em.hA):'—',em?fmtDelta(em.aA):'—')}${stat('DANGEROUS',em?fmtDelta(em.hD):'—',em?fmtDelta(em.aD):'—')}${stat('SOT',em?fmtDelta(em.hSot):'—',em?fmtDelta(em.aSot):'—')}${stat('SHOT OFF',em?fmtDelta(em.hOff):'—',em?fmtDelta(em.aOff):'—')}${stat('CORNER',em?fmtDelta(em.hCorner):'—',em?fmtDelta(em.aCorner):'—')}</div><div class="event-reason">${r.event.reasons.map(esc).join(' · ')}</div></article>`;
}

function setMetric(id,value){const el=document.getElementById(id);if(el)el.textContent=value}
function clearOutput(message){['liveCount','freshCount','windowCount','eventCount'].forEach(id=>setMetric(id,'—'));const list=document.getElementById('matchList');if(list)list.innerHTML=`<div class="note">${esc(message)}</div>`}
async function getFeed(){
  if(!runtime.engineBase)throw new Error('3.42 engine base not configured');
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.requestTimeoutMs)||9000);
  try{const response=await fetch(`${runtime.engineBase}${runtime.feedPath||'/feed'}`,{cache:'no-store',signal:ac.signal});if(!response.ok)throw new Error(`engine_http_${response.status}`);const data=await response.json();if(String(data.version)!=='3.42'||!Array.isArray(data.matches))throw new Error('invalid_342_feed_contract');if(data.ok===false)throw new Error(data.lastError||'342_feed_not_ok');return data}finally{clearTimeout(timeout)}
}
async function cycle(){
  if(running)return;running=true;const runStatus=document.getElementById('runStatus');
  try{
    const feed=await getFeed(),c=settings(),matches=feed.matches.map(mergeFeedHistory),results=matches.map(m=>({m,event:eventCheck(m,c),c}));
    results.sort((a,b)=>Number(b.event.pass)-Number(a.event.pass)||Number(Boolean(a.m.freshness?.stale))-Number(Boolean(b.m.freshness?.stale))||Number(b.event.metrics?.pressureShare||0)-Number(a.event.metrics?.pressureShare||0)||Number(b.m.minute||0)-Number(a.m.minute||0));
    window.__nomad342EventResults=results;window.__nomad342Feed=feed;
    const list=document.getElementById('matchList');if(list)list.innerHTML=results.length?results.map(matchCard).join(''):'<div class="note">No live TotalCorner matches right now.</div>';
    setMetric('liveCount',results.length);setMetric('freshCount',results.filter(x=>!x.m.freshness?.stale).length);setMetric('windowCount',results.filter(x=>x.event.metrics).length);setMetric('eventCount',results.filter(x=>x.event.pass).length);
    if(runStatus)runStatus.textContent=`TotalCorner LIVE · cycle ${feed.cycle??'—'} · ${results.length} matches · ${results.filter(r=>r.event.pass).length} event pass · ${new Date().toLocaleTimeString()}`;
  }catch(error){clearOutput('Waiting for isolated 3.42 TotalCorner event engine.');if(runStatus)runStatus.textContent=`3.42 EVENT FEED WAIT · ${String(error?.message||error)}`}finally{running=false}
}
function start(){
  if(document.body?.dataset?.page!=='live')return;
  clearOutput('Connecting to TotalCorner live score and event feed…');cycle();timer=setInterval(cycle,Math.max(5000,Number(runtime.pollMs)||10000));window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
