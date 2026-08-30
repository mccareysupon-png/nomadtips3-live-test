(()=>{
'use strict';
const config=window.NOMAD342_CONFIG;
if(!config?.defaults)throw new Error('NOMAD342_CONFIG missing');
const SETTINGS_KEY=config.settingsKey;
const DEFAULTS=config.defaults;
const runtime=window.NOMAD342_RUNTIME||{};
const browserHistory=new Map();
const expandedMatches=new Set();
const leagueCountryCache=new Map();
let regionCodeByName=null;
let regionPrefixes=null;
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
function fmtValue(v){return v===null||v===undefined?'—':String(v)}
function countryKey(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim()}
function regionIndex(){
  if(regionCodeByName)return regionCodeByName;
  const map=new Map([
    ['england','GB'],['scotland','GB'],['wales','GB'],['northern ireland','GB'],['uk','GB'],['great britain','GB'],
    ['usa','US'],['united states of america','US'],['south korea','KR'],['korea republic','KR'],['republic of korea','KR'],['north korea','KP'],
    ['czech republic','CZ'],['ivory coast','CI'],['cote d ivoire','CI'],['uae','AE'],['viet nam','VN'],['vietnam','VN'],
    ['russia','RU'],['iran','IR'],['syria','SY'],['palestine','PS'],['moldova','MD'],['bolivia','BO'],['venezuela','VE'],['tanzania','TZ'],
    ['macao','MO'],['macau','MO'],['kosovo','XK']
  ]);
  try{
    const names=new Intl.DisplayNames(['en'],{type:'region'});
    for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){
      const code=String.fromCharCode(a,b),name=names.of(code);
      if(name&&name!==code)map.set(countryKey(name),code);
    }
  }catch{}
  regionCodeByName=map;
  regionPrefixes=[...map.entries()].filter(([name])=>name.length>2).sort((a,b)=>b[0].length-a[0].length);
  return map;
}
function countryCode(raw){
  if(raw===null||raw===undefined||raw==='')return '';
  if(typeof raw==='object'){
    const values=[raw.code,raw.countryCode,raw.country_code,raw.iso2,raw.iso_2,raw.alpha2,raw.alpha_2,raw.iso,raw.name,raw.country];
    for(const value of values){const code=countryCode(value);if(code)return code}
    return '';
  }
  const value=String(raw).trim(),key=countryKey(value),mapped=regionIndex().get(key);
  if(mapped)return mapped;
  if(/^[A-Za-z]{2}$/.test(value))return value.toUpperCase();
  return '';
}
function leagueName(m){
  if(m?.league&&typeof m.league==='object')return String(m.league.name??m.league.title??m.league.label??'—');
  return String(m?.league??m?.competition??m?.tournament??'—');
}
function leagueId(m){
  let value=m?.leagueId??m?.league_id??m?.l_id??null;
  if((value===null||value===undefined||value==='')&&m?.league&&typeof m.league==='object')value=m.league.id??m.league.leagueId??m.league.league_id??null;
  return value===null||value===undefined||value===''?'':String(value);
}
function countryFromLeagueName(name){
  const key=countryKey(name);
  if(!key||/^(world|international|esoccer|e soccer|friendly|club friendly)(\s|$)/.test(key))return '';
  regionIndex();
  for(const [country,code] of regionPrefixes||[]){
    if(key===country||key.startsWith(`${country} `))return code;
  }
  return '';
}
function leagueCountryCode(m){
  const id=leagueId(m);
  const candidates=[
    m?.countryCode,m?.country_code,m?.country,m?.leagueCountryCode,m?.league_country_code,m?.leagueCountry,m?.league_country,
    m?.league&&typeof m.league==='object'?m.league.countryCode:null,
    m?.league&&typeof m.league==='object'?m.league.country_code:null,
    m?.league&&typeof m.league==='object'?m.league.country:null,
    m?.competition&&typeof m.competition==='object'?m.competition.country:null,
    m?.tournament&&typeof m.tournament==='object'?m.tournament.country:null
  ];
  for(const candidate of candidates){
    const code=countryCode(candidate);
    if(code){if(id)leagueCountryCache.set(id,code);return code}
  }
  if(id&&leagueCountryCache.has(id))return leagueCountryCache.get(id);
  const fallback=countryFromLeagueName(leagueName(m));
  if(fallback&&id)leagueCountryCache.set(id,fallback);
  return fallback;
}
function flagEmoji(code){
  const value=String(code||'').toUpperCase();
  if(!/^[A-Z]{2}$/.test(value))return '';
  return [...value].map(ch=>String.fromCodePoint(127397+ch.charCodeAt(0))).join('');
}
function leagueLabel(m){
  const name=leagueName(m),flag=flagEmoji(leagueCountryCode(m));
  return `${flag?`${flag} `:''}${esc(name)}`;
}

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

function latestSnapshot(m){
  const rows=[...(m.event?.snapshots||[])].filter(s=>Number.isFinite(Number(s.minute))).sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
  return rows[rows.length-1]||null;
}
function eventTotals(m){
  const s=latestSnapshot(m);
  return {
    attacks:[at(s?.attacks,0),at(s?.attacks,1)],
    dangerous:[at(s?.dangerous,0),at(s?.dangerous,1)],
    sot:[at(s?.sot,0),at(s?.sot,1)],
    off:[at(s?.off,0),at(s?.off,1)],
    corner:[at(s?.corner,0),at(s?.corner,1)]
  };
}
function matchPhase(m){
  const s=latestSnapshot(m);
  const candidates=[m.status,m.matchStatus,m.match_status,m.fixtureStatus,m.fixture_status,m.phase,m.period,m.state,m.event?.status,m.event?.phase,m.event?.period,s?.status,s?.phase,s?.period,typeof m.minute==='string'?m.minute:null];
  for(const raw of candidates){
    if(raw===null||raw===undefined||raw==='')continue;
    const value=String(raw).trim().toUpperCase().replace(/_/g,' ').replace(/\s+/g,' ');
    if(value==='HT'||value==='HALF TIME'||value==='HALFTIME'||value==='HALF-TIME')return 'HT';
    if(value==='FT'||value==='FULL TIME'||value==='FULLTIME'||value==='FULL-TIME'||value==='FINISHED'||value==='FINAL'||value==='ENDED'||value==='MATCH ENDED')return 'FT';
  }
  return '';
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
  return `<div class="attack-chart"><svg viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Recent attack flow"><line class="chart-grid" x1="4" y1="37" x2="96" y2="37"/><line class="chart-grid chart-grid-mid" x1="4" y1="22" x2="96" y2="22"/><polyline class="attack-line attack-home" points="${g.home}"/><polyline class="attack-line attack-away" points="${g.away}"/></svg><div class="chart-axis"><span>${esc(g.from)}'</span><span>ATTACK CHANGE · HOME ${esc(g.homeDelta)} · AWAY ${esc(g.awayDelta)}</span><span>${esc(g.to)}'</span></div></div>`;
}

function barWidth(value,max){
  const n=finite(value);if(n===null||max<=0)return 0;return Math.max(0,Math.min(100,(n/max)*100));
}
function stat(label,totals,deltaPair){
  const home=totals?.[0]??null,away=totals?.[1]??null,hd=deltaPair?.[0]??null,ad=deltaPair?.[1]??null;
  const max=Math.max(1,finite(home)||0,finite(away)||0),homeWidth=barWidth(home,max),awayWidth=barWidth(away,max);
  return `<div class="event-stat"><span class="event-stat-title">${label}</span><div class="event-stat-row"><span>HOME</span><div class="event-bar-track"><i class="event-bar event-bar-home" style="width:${homeWidth.toFixed(1)}%"></i></div><b>${esc(fmtValue(home))}</b></div><div class="event-stat-row"><span>AWAY</span><div class="event-bar-track"><i class="event-bar event-bar-away" style="width:${awayWidth.toFixed(1)}%"></i></div><b>${esc(fmtValue(away))}</b></div><small>ROLLING CHANGE · HOME ${esc(fmtDelta(hd))} · AWAY ${esc(fmtDelta(ad))}</small></div>`;
}
function matchCard(r){
  const m=r.m,em=r.event.metrics,id=String(m.id),expanded=expandedMatches.has(id),stale=Boolean(m.freshness?.stale),phase=matchPhase(m);
  const cls=stale?'signal-card-watch':r.event.pass?'signal-card-pass':em?'signal-card-wait':'signal-card-watch';
  const pressure=em?`${em.pressureShare}%`:'—',window=em?`${em.from}'–${em.to}'`:`${Math.max(0,m.minute-r.c.rollingWindowMinutes)}'–${m.minute}'`,totals=eventTotals(m),minuteLabel=phase||`${m.minute}'`;
  const deltas={attacks:em?[em.hA,em.aA]:null,dangerous:em?[em.hD,em.aD]:null,sot:em?[em.hSot,em.aSot]:null,off:em?[em.hOff,em.aOff]:null,corner:em?[em.hCorner,em.aCorner]:null};
  return `<article class="signal-card event-compact ${cls}${expanded?' expanded':''}" data-match-id="${esc(id)}" tabindex="0" role="button" aria-expanded="${expanded?'true':'false'}"><div class="card-topline"><span class="event-league">${leagueLabel(m)}</span><span class="live-minute">${esc(minuteLabel)}</span><span class="live-score">${esc((m.score||[]).join('–'))}</span></div><div class="teams-line"><strong>${esc(m.home)}</strong><span>VS</span><strong>${esc(m.away)}</strong></div><div class="event-details" aria-hidden="${expanded?'false':'true'}"><div class="attack-head"><div><span>ATTACK FLOW</span><small>${esc(window)} rolling view</small></div><div class="attack-legend"><span class="legend-team"><span class="home-dot"></span><b>HOME</b> · ${esc(m.home)}</span><span class="legend-team"><span class="away-dot"></span><b>AWAY</b> · ${esc(m.away)}</span></div></div><div class="attack-color-note">GREEN = HOME · GRAY = AWAY</div>${attackGraph(m)}<div class="event-overview"><div><span>HOME PRESSURE</span><strong>${esc(pressure)}</strong></div><div><span>TREND</span><strong>${em?`${em.trendPass}/3`:'—'}</strong></div><div><span>EVENT GATE</span><strong class="${r.event.pass?'oktxt':'waittxt'}">${r.event.pass?'PASS':'WAIT'}</strong></div><div><span>FEED</span><strong class="${stale?'redtxt':'oktxt'}">${stale?'STALE':'LIVE'}</strong></div></div><div class="event-stats">${stat('ATTACKS',totals.attacks,deltas.attacks)}${stat('DANGEROUS ATTACKS',totals.dangerous,deltas.dangerous)}${stat('SHOTS ON TARGET',totals.sot,deltas.sot)}${stat('SHOTS OFF TARGET',totals.off,deltas.off)}${stat('CORNERS',totals.corner,deltas.corner)}</div><div class="event-reason">${r.event.reasons.map(esc).join(' · ')}</div></div></article>`;
}

function setMetric(id,value){const el=document.getElementById(id);if(el)el.textContent=value}
function clearOutput(message){['liveCount','freshCount','windowCount','eventCount'].forEach(id=>setMetric(id,'—'));const list=document.getElementById('matchList');if(list)list.innerHTML=`<div class="note">${esc(message)}</div>`}
async function getFeed(){
  if(!runtime.engineBase)throw new Error('3.42 engine base not configured');
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.requestTimeoutMs)||9000);
  try{const response=await fetch(`${runtime.engineBase}${runtime.feedPath||'/feed'}`,{cache:'no-store',signal:ac.signal});if(!response.ok)throw new Error(`engine_http_${response.status}`);const data=await response.json();if(String(data.version)!=='3.42'||!Array.isArray(data.matches))throw new Error('invalid_342_feed_contract');if(data.ok===false)throw new Error(data.lastError||'342_feed_not_ok');return data}finally{clearTimeout(timeout)}
}
function renderResults(results){
  const list=document.getElementById('matchList');
  if(list)list.innerHTML=results.length?results.map(matchCard).join(''):'<div class="note">No live TotalCorner matches right now.</div>';
}
async function cycle(){
  if(running)return;running=true;const runStatus=document.getElementById('runStatus');
  try{
    const feed=await getFeed(),c=settings(),matches=feed.matches.map(mergeFeedHistory),results=matches.map(m=>({m,event:eventCheck(m,c),c}));
    results.sort((a,b)=>Number(b.event.pass)-Number(a.event.pass)||Number(Boolean(a.m.freshness?.stale))-Number(Boolean(b.m.freshness?.stale))||Number(b.event.metrics?.pressureShare||0)-Number(a.event.metrics?.pressureShare||0)||Number(b.m.minute||0)-Number(a.m.minute||0));
    window.__nomad342EventResults=results;window.__nomad342Feed=feed;
    renderResults(results);
    setMetric('liveCount',results.length);setMetric('freshCount',results.filter(x=>!x.m.freshness?.stale).length);setMetric('windowCount',results.filter(x=>x.event.metrics).length);setMetric('eventCount',results.filter(x=>x.event.pass).length);
    if(runStatus)runStatus.textContent=`TotalCorner LIVE · cycle ${feed.cycle??'—'} · ${results.length} matches · ${results.filter(r=>r.event.pass).length} event pass · ${new Date().toLocaleTimeString()}`;
  }catch(error){clearOutput('Waiting for isolated 3.42 TotalCorner event engine.');if(runStatus)runStatus.textContent=`3.42 EVENT FEED WAIT · ${String(error?.message||error)}`}finally{running=false}
}
function toggleCard(card){
  const id=card?.dataset?.matchId;if(!id)return;
  if(expandedMatches.has(id))expandedMatches.delete(id);else expandedMatches.add(id);
  const results=window.__nomad342EventResults;if(Array.isArray(results))renderResults(results);
  requestAnimationFrame(()=>document.querySelector(`.event-compact[data-match-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true}));
}
function bindCardToggle(){
  const list=document.getElementById('matchList');if(!list)return;
  list.addEventListener('click',event=>{const card=event.target.closest('.event-compact');if(card)toggleCard(card)});
  list.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const card=event.target.closest('.event-compact');if(!card)return;event.preventDefault();toggleCard(card)});
}
function start(){
  if(document.body?.dataset?.page!=='live')return;
  bindCardToggle();clearOutput('Connecting to TotalCorner live score and event feed…');cycle();timer=setInterval(cycle,Math.max(5000,Number(runtime.pollMs)||10000));window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();