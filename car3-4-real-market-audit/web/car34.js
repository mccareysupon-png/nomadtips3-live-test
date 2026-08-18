const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const fmtTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return'—'}};
const fmtLine=v=>{const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${n}`:'—'};
const fmtOdds=v=>{const n=Number(v);return Number.isFinite(n)?n.toFixed(2):'—'};
const bangkokDate=v=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v||Date.now()));}catch{return new Date(v||Date.now()).toISOString().slice(0,10);}};
const HISTORY_CACHE_KEY='nomadtips3.car34.history.v1';
let runtime={workerUrl:'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev',refreshSeconds:15};
async function bootRuntime(){try{runtime={...runtime,...await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json())};}catch{}}
async function api(path,opts){const r=await fetch(`${runtime.workerUrl}${path}`,{cache:'no-store',...opts,headers:{'content-type':'application/json',...(opts?.headers||{})}});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`HTTP ${r.status}`);return p;}
function nav(page){document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===page));}
function resultClass(r){const x=String(r||'PENDING').toUpperCase();return x==='WIN'?'win':x==='LOSS'?'loss':x==='DRAW'?'draw':'pending'}
function setPageError(message=''){const el=$('#pageError');if(!el)return;el.textContent=message;el.hidden=!message;}
function saveHistoryCache(payload){try{localStorage.setItem(HISTORY_CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),payload}));}catch{}}
function readHistoryCache(){try{return JSON.parse(localStorage.getItem(HISTORY_CACHE_KEY)||'null');}catch{return null;}}
async function historyWithCache(limit=100){
  try{const fresh=await api(`/history?page=1&limit=${limit}`);saveHistoryCache(fresh);return{payload:fresh,cached:false,error:null};}
  catch(error){const cached=readHistoryCache();return{payload:cached?.payload||{records:[],summary:{}},cached:Boolean(cached?.payload),error};}
}
function renderSignals(records,historyUnavailable=false){
  $('#signals').innerHTML=records.length?records.slice(0,10).map(r=>`<div class="signal-card"><div><small>${esc(r.league||'')}</small><strong>${esc(r.home)} vs ${esc(r.away)}</strong><small>${fmtTime(r.selectedAt)} · score ${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</small></div><div><small>Pick</small><strong class="pick">${esc(r.selectedTeam)}</strong></div><div><small>AH</small><strong>${fmtLine(r.selectedLine??r.line)}</strong></div><div><small>Odds</small><strong class="odds">${fmtOdds(r.odds)}</strong></div><div><small>Result</small><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(r.resultGroup||r.result||'PENDING')}</span></div></div>`).join(''):`<div class="empty">${historyUnavailable?'Signal history unavailable.':'No locked signals yet.'}</div>`;
}
async function detector(){
  const [healthResult,liveResult,historyResult]=await Promise.allSettled([api('/health'),api('/live'),historyWithCache(25)]);
  const health=healthResult.status==='fulfilled'?healthResult.value:null;
  const live=liveResult.status==='fulfilled'?liveResult.value:null;
  const historyInfo=historyResult.status==='fulfilled'?historyResult.value:{payload:{records:[],summary:{}},cached:false,error:historyResult.reason};
  const history=historyInfo.payload||{records:[]};
  const failures=[];
  if(!health)failures.push('health');
  if(!live)failures.push('live');
  if(historyInfo.error)failures.push(historyInfo.cached?'history live (cached copy shown)':'history');
  setPageError(failures.length?`Worker data issue: ${failures.join(', ')}`:'');

  const pipe=health?.realMarketPipe||live?.realMarketPipe||{};
  const liveMatches=live?.matches||[];
  const active=liveMatches.filter(m=>m.realMarket?.status==='MATCH'||m.engine?.decision==='NEAR'||(m.engine?.streak||0)>0).sort((a,b)=>(b.engine?.momentum||0)-(a.engine?.momentum||0));
  const nearCount=liveMatches.filter(m=>String(m.engine?.decision||'').toUpperCase()==='NEAR').length;
  const records=history.records||[];
  const today=bangkokDate();
  const lockedToday=records.filter(r=>String(r.selectionDate||bangkokDate(r.selectedAt))===today).length;
  const enginePaused=pipe.engineEnabled===false||live?.engineEnabled===false;
  const engineError=Boolean(health?.lastError)||pipe.status==='ERROR';
  const engineState=!health&&!live?'OFFLINE':engineError?'ERROR':enginePaused?'PAUSED':'RUNNING';

  $('#engine').textContent=engineState;
  $('#engine').className=engineState==='RUNNING'?'good':engineState==='PAUSED'?'warn':'bad';
  $('#scanning').textContent=live?(pipe.matchCount??liveMatches.length):'—';
  $('#watching').textContent=live?active.length:'—';
  $('#nearSignal').textContent=live?nearCount:'—';
  $('#nearSignal').className=nearCount>0?'warn':'';
  $('#lockedToday').textContent=historyInfo.error&&!historyInfo.cached?'—':lockedToday;
  $('#lockedToday').className=lockedToday>0?'good':'';
  $('#cycle').textContent=fmtTime(health?.lastCycle||live?.generatedAt||pipe.at);
  $('#marketState').textContent=pipe.status||(!health&&!live?'UNAVAILABLE':'WAITING');
  $('#marketState').className=pipe.status==='OK'?'good':pipe.status==='KEY_MISSING'||pipe.status==='ERROR'||(!health&&!live)?'bad':'warn';
  $('#matched').textContent=`${pipe.ahMatched??0}/${pipe.eligibleMatches??0}`;
  const note=$('#monitorNote');
  if(note){
    if(!health&&!live)note.textContent='Worker unavailable · live counts cannot be confirmed';
    else if(enginePaused)note.textContent='Engine paused · counts reflect the latest available cycle';
    else note.textContent=`Live monitor · refresh every ${runtime.refreshSeconds||15}s · cycle ${fmtTime(health?.lastCycle||live?.generatedAt||pipe.at)}`;
  }
  $('#sourceInfo').innerHTML=`<span class="pill">Price: ${esc(pipe.source||runtime.priceSource||'1xbet')}</span><span class="pill">Market: AH only</span><span class="pill">Mapped: ${pipe.mappedMatches??0}</span><span class="pill">API key: ${pipe.keyConfigured?'ready':'missing / unavailable'}</span>${pipe.error?`<span class="pill bad">${esc(pipe.error)}</span>`:''}`;

  renderSignals(records,Boolean(historyInfo.error&&!historyInfo.cached));
  $('#candidates').innerHTML=active.length?active.slice(0,20).map(m=>`<tr><td>${esc(m.home)}<br><span class="muted">${esc(m.away)}</span></td><td>${m.score?.home??'—'}-${m.score?.away??'—'}</td><td>${esc(m.engine?.side||'—')}</td><td class="pick">${fmtLine(m.engine?.line)}</td><td class="odds">${fmtOdds(m.engine?.odds)}</td><td>${m.engine?.momentum??'—'}%</td><td>${esc(m.realMarket?.status||'NOT FOUND')}<br><span class="muted">map ${m.realMarket?.mappingConfidence?Math.round(m.realMarket.mappingConfidence*100)+'%':'—'}</span></td><td>${esc(m.engine?.decision||'WATCH')} · ${m.engine?.streak??0}</td></tr>`).join(''):`<tr><td colspan="8" class="empty">${live?'No current AH candidates with a real-market match.':'Live feed unavailable. History and statistics remain available.'}</td></tr>`;
}
function renderStatistics(h){
  const s=h.summary||{};
  const pairs=[['total',s.total],['settled',s.settled],['win',s.win],['loss',s.loss],['draw',s.draw],['winRate',`${Number(s.winRate||0).toFixed(1)}%`],['avgOdds',Number(s.averageOdds||0).toFixed(2)],['netUnits',Number(s.netUnits||0).toFixed(2)]];
  for(const [id,v] of pairs){const e=$(`#${id}`);if(e)e.textContent=v??0;}
  $('#statsRows').innerHTML=(h.records||[]).map(r=>`<tr><td>${fmtTime(r.selectedAt)}<br><span class="muted">${esc(r.selectionDate||'')}</span></td><td>${esc(r.home)}<br><span class="muted">${esc(r.away)}</span></td><td class="pick">${esc(r.selectedTeam)}</td><td>${fmtLine(r.selectedLine??r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</td><td>${r.finalScore?`${r.finalScore.home}-${r.finalScore.away}`:'—'}</td><td><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(r.settlementResult||r.resultGroup||r.result||'PENDING')}</span></td><td>${esc(r.bookmaker||r.pricingSource||runtime.priceSource||'1xbet')}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No statistics yet.</td></tr>';
}
async function statistics(){
  const info=await historyWithCache(100);
  renderStatistics(info.payload||{});
  if(info.error)setPageError(info.cached?'Live history unavailable · showing last cached statistics.':`Statistics unavailable: ${info.error.message||info.error}`);
  else setPageError('');
}
const scalarSettingFields=['side','minuteMin','minuteMax','oddsMin','oddsMax','ahMin','ahMax','momentumMin','attackEvidenceDangerousAttacksMin','attackEvidenceShotsMin','attackEvidenceShotsOnTargetMin','attackEvidenceCornersMin','attackEvidenceRequirement','maxGoalGap','confirmationRounds','realMarketMaxAgeSeconds','sourceFreshnessMaxSeconds','matchConfidenceMin','maxSignalsPerDay','redCardPolicy'];
const booleanSettingFields=['engineEnabled','attackEvidenceEnabled','attackEvidenceDangerousAttacksEnabled','attackEvidenceShotsEnabled','attackEvidenceShotsOnTargetEnabled','attackEvidenceCornersEnabled','goalGapLimited','requireCoreStats','signalLimitEnabled'];
const momentumWeightFields={weightAttacks:'attacks',weightDangerousAttacks:'dangerous_attacks',weightShots:'shots',weightShotsOnTarget:'shots_on_target',weightCorners:'corners',weightPossession:'possession'};
function setInputValue(id,value){const e=$(`#${id}`);if(!e)return;if(e.type==='checkbox')e.checked=Boolean(value);else e.value=value??'';}
function readInputValue(id){const e=$(`#${id}`);if(!e)return undefined;if(e.type==='checkbox')return e.checked;if(e.type==='number')return e.value===''?null:Number(e.value);return e.value;}
async function settings(){
  const p=await api('/config'),c=p.config||{};
  for(const id of scalarSettingFields)setInputValue(id,c[id]);
  for(const id of booleanSettingFields)setInputValue(id,c[id]);
  for(const [id,key] of Object.entries(momentumWeightFields))setInputValue(id,c.momentumWeights?.[key]);
  $('#marketLocked').textContent=p.marketLocked||'AH';$('#bookmaker').textContent=p.realMarketBookmaker||runtime.priceSource||'1xbet';
  $('#configUpdated').textContent=p.updatedAt?fmtTime(p.updatedAt):'—';
  $('#settingsForm').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const body={market:'AH'};
    for(const id of scalarSettingFields)body[id]=readInputValue(id);
    for(const id of booleanSettingFields)body[id]=readInputValue(id);
    body.momentumWeights={};for(const [id,key] of Object.entries(momentumWeightFields))body.momentumWeights[key]=readInputValue(id);
    const state=$('#saveState');state.textContent='Saving…';state.className='warn';
    try{const out=await api('/config',{method:'POST',body:JSON.stringify(body)});state.textContent=out.ok?'Saved · active next scan':'Error';state.className=out.ok?'good':'bad';$('#configUpdated').textContent=out.updatedAt?fmtTime(out.updatedAt):fmtTime(new Date().toISOString());}
    catch(e){state.textContent=`Error: ${e.message}`;state.className='bad';}
  });
  $('#copy31').addEventListener('click',()=>location.reload());
}
async function run(){
  await bootRuntime();const page=document.body.dataset.page||'detector';nav(page);
  try{
    if(page==='detector'){
      await detector();
      setInterval(()=>detector().catch(e=>setPageError(`Refresh error: ${e.message}`)),(runtime.refreshSeconds||15)*1000);
    }else if(page==='statistics'){
      await statistics();
      setInterval(()=>statistics().catch(e=>setPageError(`Statistics refresh error: ${e.message}`)),Math.max(15,runtime.refreshSeconds||15)*1000);
    }else if(page==='settings')await settings();
  }catch(e){setPageError(e.message);console.error(e);}
}
run();
