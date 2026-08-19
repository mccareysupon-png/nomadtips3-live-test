const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const fmtTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return'—';}};
const fmtLine=v=>{const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${Number.isInteger(n)?n:n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}`:'—';};
const fmtOdds=v=>{const n=Number(v);return Number.isFinite(n)?n.toFixed(2):'—';};
const bangkokDate=v=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v||Date.now()));}catch{return new Date(v||Date.now()).toISOString().slice(0,10);}};
const HISTORY_CACHE_KEY='nomadtips3.car34.history.v1';
const SIGNAL_SEEN_KEY='nomadtips3.car34.public.lastSignal.v1';
const EVENT_SEEN_KEY='nomadtips3.car34.public.events.v1';
let runtime={workerUrl:'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev',refreshSeconds:15};
let firstDetectorRender=true;

async function bootRuntime(){try{runtime={...runtime,...await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json())};}catch{}}
async function api(path,opts){const r=await fetch(`${runtime.workerUrl}${path}`,{cache:'no-store',...opts,headers:{'content-type':'application/json',...(opts?.headers||{})}});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`HTTP ${r.status}`);return p;}
function nav(page){document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===page));}
function resultClass(r){const x=String(r||'PENDING').toUpperCase();return x==='WIN'?'win':x==='LOSS'?'loss':x==='DRAW'?'draw':'pending';}
function setPageError(message=''){const el=$('#pageError');if(!el)return;el.textContent=message;el.hidden=!message;}
function saveHistoryCache(payload){try{localStorage.setItem(HISTORY_CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),payload}));}catch{}}
function readHistoryCache(){try{return JSON.parse(localStorage.getItem(HISTORY_CACHE_KEY)||'null');}catch{return null;}}
async function historyWithCache(limit=100){try{const fresh=await api(`/history?page=1&limit=${limit}`);saveHistoryCache(fresh);return{payload:fresh,cached:false,error:null};}catch(error){const cached=readHistoryCache();return{payload:cached?.payload||{records:[],summary:{}},cached:Boolean(cached?.payload),error};}}
function elText(selector,value,className){const el=$(selector);if(!el)return;if(value!==undefined)el.textContent=value;if(className!==undefined)el.className=className;}
function sourceAgeSeconds(value){const t=Date.parse(value||'');return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/1000)):null;}
function ageText(seconds){if(seconds===null)return'Updated —';if(seconds<5)return'Updated just now';if(seconds<60)return`Updated ${seconds}s ago`;const m=Math.floor(seconds/60);return`Updated ${m}m ago`;}
function minuteLabel(match){const status=String(match?.status||'').toUpperCase();if(status==='HT')return'HT';if(status==='FT')return'FT';const minute=num(match?.minute);return minute===null?'LIVE':`${Math.max(1,Math.round(minute))}'`;}
function decisionState(match){const d=String(match?.engine?.decision||'WATCH').toUpperCase();if(d.includes('SIGNAL'))return'SIGNAL';if(d==='NEAR'||Number(match?.engine?.streak||0)>0)return'CLOSE';return'WATCHING';}
function stateRank(match){const s=decisionState(match);return s==='SIGNAL'?3:s==='CLOSE'?2:1;}
function statPair(match,key){return{home:num(match?.stats?.[key]?.home),away:num(match?.stats?.[key]?.away)};}
function pairText(pair,suffix=''){return pair.home===null||pair.away===null?'—':`${pair.home}${suffix} – ${pair.away}${suffix}`;}
function eventSignature(match,event){if(!event)return'';return`${match?.sourceMatchId||match?.id||''}|${event.minute??''}|${event.type||''}|${event.team||''}|${event.detail||''}`;}
function latestEvent(match){const events=Array.isArray(match?.events)?match.events:[];return events.length?events[events.length-1]:null;}
function readSeenEvents(){try{return JSON.parse(sessionStorage.getItem(EVENT_SEEN_KEY)||'{}');}catch{return{};}}
function writeSeenEvents(value){try{sessionStorage.setItem(EVENT_SEEN_KEY,JSON.stringify(value));}catch{}}

function renderSignals(records,historyUnavailable=false){
  const holder=$('#signals');if(!holder)return;
  if(!records.length){holder.innerHTML=`<div class="empty">${historyUnavailable?'Signal history is temporarily unavailable.':'No locked signals yet. Monitoring continues automatically.'}</div>`;return;}
  const previous=(()=>{try{return sessionStorage.getItem(SIGNAL_SEEN_KEY)||'';}catch{return'';}})();
  const first=records[0];const newestKey=`${first?.selectedAt||''}|${first?.selectedTeam||''}|${first?.selectedLine??first?.line??''}|${first?.odds??''}`;
  const isNew=!firstDetectorRender&&previous&&previous!==newestKey;
  try{sessionStorage.setItem(SIGNAL_SEEN_KEY,newestKey);}catch{}
  holder.innerHTML=records.slice(0,6).map((r,i)=>{
    const result=r.resultGroup||r.result||'PENDING';
    return `<article class="signal-card ${i===0&&isNew?'new-signal':''}">
      <div><small>${esc(r.league||'LIVE SIGNAL')}</small><strong class="signal-team">${esc(r.home)} vs ${esc(r.away)}</strong><div class="signal-meta">Locked ${fmtTime(r.selectedAt)} · entry ${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</div></div>
      <div><small>PICK</small><strong>${esc(r.selectedTeam||r.selectedSide||'—')}</strong></div>
      <div><small>MARKET</small><strong class="signal-market">${fmtLine(r.selectedLine??r.line)}</strong><div class="signal-meta">Asian Handicap</div></div>
      <div><small>LOCKED ODDS</small><strong class="signal-price">${fmtOdds(r.odds)}</strong><span class="status ${resultClass(result)}">${esc(result)}</span></div>
    </article>`;
  }).join('');
}

function evidenceChips(match){
  const e=match?.engine?.evidence||{};
  const items=[['Danger',e.dangerous],['Shots',e.shots],['On target',e.sot],['Corners',e.corners]];
  return items.map(([label,value])=>{const n=num(value);return`<span class="evidence-chip ${n!==null&&n>0?'hot':''}">${esc(label)} ${n===null?'—':n>0?`+${n}`:n}</span>`;}).join('');
}
function detailStats(match){
  const stats=[['Attacks','attacks',''],['Dangerous','dangerous_attacks',''],['Shots','shots',''],['On target','shots_on_target',''],['Corners','corners',''],['Possession','possession','%']];
  return stats.map(([label,key,suffix])=>`<div class="detail-stat"><small>${label}</small><strong>${pairText(statPair(match,key),suffix)}</strong></div>`).join('');
}
function renderCandidateCards(matches){
  const holder=$('#candidateCards');if(!holder)return;
  if(!matches.length){holder.innerHTML='<div class="empty">No current match is close enough to the live AH conditions. The system is still monitoring live matches.</div>';return;}
  const seen=readSeenEvents(),nextSeen={...seen};
  holder.innerHTML=matches.slice(0,16).map(match=>{
    const state=decisionState(match),event=latestEvent(match),sig=eventSignature(match,event),id=String(match?.sourceMatchId||match?.id||`${match?.home}-${match?.away}`),previous=seen[id]||'';
    const newEvent=!firstDetectorRender&&Boolean(sig)&&Boolean(previous)&&previous!==sig;
    if(sig)nextSeen[id]=sig;
    const side=String(match?.engine?.side||'').toUpperCase();
    const selectedTeam=side==='AWAY'?match.away:side==='HOME'?match.home:'';
    const line=match?.engine?.selectedLine??match?.engine?.line;
    const odds=match?.engine?.odds;
    const marketReady=num(line)!==null&&num(odds)!==null;
    const pressure=num(match?.engine?.momentum);
    const evText=event?`${event.minute?`${event.minute}' · `:''}${event.type||'EVENT'}${event.team?` · ${event.team}`:''}`:'';
    return `<article class="match-card ${state.toLowerCase()} ${newEvent?'event-flash':''}">
      <div class="match-top"><div class="match-league">${esc(match.league||'Live football')}</div><span class="state-badge ${state.toLowerCase()}">${state}</span></div>
      <div class="score-line">
        <div class="team">${esc(match.home)}</div>
        <div class="score-box"><strong>${match.score?.home??'—'} – ${match.score?.away??'—'}</strong><span class="minute">${minuteLabel(match)}</span></div>
        <div class="team away">${esc(match.away)}</div>
      </div>
      <div class="match-sub">
        <div class="pressure"><small>${selectedTeam?`${esc(selectedTeam)} PRESSURE`:'MATCH PRESSURE'}</small><strong>${pressure===null?'—':`${Math.round(pressure)}%`}</strong></div>
        <div class="market-box"><small>${marketReady?'REAL AH MARKET':'MARKET CHECK'}</small><div class="market-pick">${marketReady?`${esc(selectedTeam||side||'')}&nbsp; ${fmtLine(line)} <span class="odds-value">@ ${fmtOdds(odds)}</span>`:'Waiting for eligible price'}</div></div>
      </div>
      <div class="evidence-row">${evidenceChips(match)}</div>
      ${event?`<div class="last-event">Latest event: <b>${esc(evText)}</b></div>`:''}
      <details class="match-details"><summary>View live evidence</summary><div class="detail-grid">${detailStats(match)}</div></details>
    </article>`;
  }).join('');
  writeSeenEvents(nextSeen);
}

async function detector(){
  const [healthResult,liveResult,historyResult]=await Promise.allSettled([api('/health'),api('/live'),historyWithCache(25)]);
  const health=healthResult.status==='fulfilled'?healthResult.value:null;
  const live=liveResult.status==='fulfilled'?liveResult.value:null;
  const historyInfo=historyResult.status==='fulfilled'?historyResult.value:{payload:{records:[],summary:{}},cached:false,error:historyResult.reason};
  const history=historyInfo.payload||{records:[]};
  const failures=[];if(!health)failures.push('system status');if(!live)failures.push('live feed');if(historyInfo.error&&!historyInfo.cached)failures.push('signal history');
  setPageError(failures.length?`Temporary data issue: ${failures.join(', ')}.`:'');

  const pipe=health?.realMarketPipe||live?.realMarketPipe||{};
  const liveMatches=Array.isArray(live?.matches)?live.matches:[];
  const active=liveMatches.filter(m=>m.realMarket?.status==='MATCH'||m.engine?.decision==='NEAR'||String(m.engine?.decision||'').toUpperCase().includes('SIGNAL')||Number(m.engine?.streak||0)>0)
    .sort((a,b)=>stateRank(b)-stateRank(a)||(num(b.engine?.momentum)||0)-(num(a.engine?.momentum)||0));
  const closeCount=liveMatches.filter(m=>decisionState(m)==='CLOSE').length;
  const records=history.records||[];const today=bangkokDate();const lockedToday=records.filter(r=>String(r.selectionDate||bangkokDate(r.selectedAt))===today).length;
  const enginePaused=pipe.engineEnabled===false||live?.engineEnabled===false;const engineError=Boolean(health?.lastError)||pipe.status==='ERROR';const engineState=!health&&!live?'OFFLINE':engineError?'ERROR':enginePaused?'PAUSED':'RUNNING';
  const generatedAt=live?.generatedAt||health?.lastCycle||pipe.at;const age=sourceAgeSeconds(generatedAt);const stale=age!==null&&age>Math.max(60,(runtime.refreshSeconds||15)*4);

  elText('#liveCount',live?(pipe.matchCount??liveMatches.length):'—');elText('#watching',live?active.length:'—');elText('#nearSignal',live?closeCount:'—');elText('#lockedToday',historyInfo.error&&!historyInfo.cached?'—':lockedToday);
  elText('#engine',engineState,engineState==='RUNNING'?'good':engineState==='PAUSED'?'warn':'bad');elText('#scanning',live?(pipe.matchCount??liveMatches.length):'—');elText('#cycle',fmtTime(generatedAt));elText('#marketState',pipe.status||(!health&&!live?'UNAVAILABLE':'WAITING'));elText('#matched',`${pipe.ahMatched??0}/${pipe.eligibleMatches??0}`);
  const systemBadge=$('#systemBadge'),systemText=$('#systemText');if(systemBadge&&systemText){systemBadge.className=`live-system ${engineState==='RUNNING'?'':engineState==='PAUSED'?'paused':'offline'}`;systemText.textContent=engineState==='RUNNING'?'SYSTEM ONLINE':engineState;}
  const liveStatus=$('#liveStatusText');if(liveStatus)liveStatus.textContent=stale?'Live data delayed':engineState==='RUNNING'?'Live monitoring active':engineState==='PAUSED'?'Monitoring paused':'Live system unavailable';
  const note=$('#monitorNote');if(note)note.textContent=live?`${pipe.matchCount??liveMatches.length} live matches · ${active.length} active candidates`:'Live counts cannot be confirmed';
  const freshness=$('#freshness');if(freshness){freshness.textContent=ageText(age);freshness.className=`freshness ${stale?'stale':''}`;}
  const sourceInfo=$('#sourceInfo');if(sourceInfo)sourceInfo.innerHTML=`<span class="pill">Price: ${esc(pipe.source||runtime.priceSource||'1xbet')}</span><span class="pill">AH only</span>`;

  renderCandidateCards(active);renderSignals(records,Boolean(historyInfo.error&&!historyInfo.cached));
  const legacyRows=$('#candidates');if(legacyRows)legacyRows.innerHTML='';
  firstDetectorRender=false;
}

function renderStatistics(h){
  const s=h.summary||{};const pairs=[['total',s.total],['settled',s.settled],['win',s.win],['loss',s.loss],['draw',s.draw],['winRate',`${Number(s.winRate||0).toFixed(1)}%`],['avgOdds',Number(s.averageOdds||0).toFixed(2)],['netUnits',Number(s.netUnits||0).toFixed(2)]];
  for(const [id,v] of pairs){const e=$(`#${id}`);if(e)e.textContent=v??0;}
  const records=h.records||[];
  const rows=$('#statsRows');if(rows)rows.innerHTML=records.map(r=>`<tr><td>${fmtTime(r.selectedAt)}<br><span class="muted">${esc(r.selectionDate||'')}</span></td><td>${esc(r.home)}<br><span class="muted">${esc(r.away)}</span></td><td class="pick">${esc(r.selectedTeam)}</td><td>${fmtLine(r.selectedLine??r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</td><td>${r.finalScore?`${r.finalScore.home}-${r.finalScore.away}`:'—'}</td><td><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(r.settlementResult||r.resultGroup||r.result||'PENDING')}</span></td><td>${esc(r.bookmaker||r.pricingSource||runtime.priceSource||'1xbet')}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No statistics yet.</td></tr>';
  const cards=$('#statsCards');if(cards)cards.innerHTML=records.map(r=>{const result=r.settlementResult||r.resultGroup||r.result||'PENDING';return`<article class="stats-card"><div class="stats-card-head"><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(result)}</span><span class="muted">${fmtTime(r.selectedAt)}</span></div><h3>${esc(r.home)} vs ${esc(r.away)}</h3><div class="pick-line">${esc(r.selectedTeam)} ${fmtLine(r.selectedLine??r.line)} @ ${fmtOdds(r.odds)}</div><div class="stats-card-meta"><div><small>ENTRY</small><strong>${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</strong></div><div><small>FINAL</small><strong>${r.finalScore?`${r.finalScore.home}-${r.finalScore.away}`:'—'}</strong></div><div><small>SOURCE</small><strong>${esc(r.bookmaker||r.pricingSource||runtime.priceSource||'1xbet')}</strong></div></div></article>`;}).join('')||'<div class="empty">No statistics yet.</div>';
}
async function statistics(){const info=await historyWithCache(100);renderStatistics(info.payload||{});if(info.error)setPageError(info.cached?'Live history is unavailable; showing the last cached record.':`Statistics unavailable: ${info.error.message||info.error}`);else setPageError('');}

const scalarSettingFields=['side','minuteMin','minuteMax','oddsMin','oddsMax','ahMin','ahMax','momentumMin','attackEvidenceDangerousAttacksMin','attackEvidenceShotsMin','attackEvidenceShotsOnTargetMin','attackEvidenceCornersMin','attackEvidenceRequirement','maxGoalGap','confirmationRounds','realMarketMaxAgeSeconds','sourceFreshnessMaxSeconds','matchConfidenceMin','maxSignalsPerDay','redCardPolicy'];
const booleanSettingFields=['engineEnabled','attackEvidenceEnabled','attackEvidenceDangerousAttacksEnabled','attackEvidenceShotsEnabled','attackEvidenceShotsOnTargetEnabled','attackEvidenceCornersEnabled','goalGapLimited','requireCoreStats','signalLimitEnabled'];
const momentumWeightFields={weightAttacks:'attacks',weightDangerousAttacks:'dangerous_attacks',weightShots:'shots',weightShotsOnTarget:'shots_on_target',weightCorners:'corners',weightPossession:'possession'};
function setInputValue(id,value){const e=$(`#${id}`);if(!e)return;if(e.type==='checkbox')e.checked=Boolean(value);else e.value=value??'';}
function readInputValue(id){const e=$(`#${id}`);if(!e)return undefined;if(e.type==='checkbox')return e.checked;if(e.type==='number')return e.value===''?null:Number(e.value);return e.value;}
async function settings(){
  const p=await api('/config'),c=p.config||{};for(const id of scalarSettingFields)setInputValue(id,c[id]);for(const id of booleanSettingFields)setInputValue(id,c[id]);for(const [id,key] of Object.entries(momentumWeightFields))setInputValue(id,c.momentumWeights?.[key]);
  elText('#marketLocked',p.marketLocked||'AH');elText('#bookmaker',p.realMarketBookmaker||runtime.priceSource||'1xbet');elText('#configUpdated',p.updatedAt?fmtTime(p.updatedAt):'—');
  $('#settingsForm')?.addEventListener('submit',async ev=>{ev.preventDefault();const body={market:'AH'};for(const id of scalarSettingFields)body[id]=readInputValue(id);for(const id of booleanSettingFields)body[id]=readInputValue(id);body.momentumWeights={};for(const [id,key] of Object.entries(momentumWeightFields))body.momentumWeights[key]=readInputValue(id);const state=$('#saveState');if(state){state.textContent='Saving…';state.className='warn';}try{const out=await api('/config',{method:'POST',body:JSON.stringify(body)});if(state){state.textContent=out.ok?'Saved · active next scan':'Error';state.className=out.ok?'good':'bad';}elText('#configUpdated',out.updatedAt?fmtTime(out.updatedAt):fmtTime(new Date().toISOString()));}catch(e){if(state){state.textContent=`Error: ${e.message}`;state.className='bad';}}});
  $('#copy31')?.addEventListener('click',()=>location.reload());
}

async function run(){await bootRuntime();const page=document.body.dataset.page||'detector';nav(page);try{if(page==='detector'){await detector();setInterval(()=>detector().catch(e=>setPageError(`Refresh error: ${e.message}`)),(runtime.refreshSeconds||15)*1000);}else if(page==='statistics'){await statistics();setInterval(()=>statistics().catch(e=>setPageError(`Statistics refresh error: ${e.message}`)),Math.max(15,runtime.refreshSeconds||15)*1000);}else if(page==='settings')await settings();}catch(e){setPageError(e.message);console.error(e);}}
run();
