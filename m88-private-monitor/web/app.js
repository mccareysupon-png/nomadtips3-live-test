const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const SETTINGS_KEY = 'm88-monitor-settings-v2';
const SIGNALS_KEY = 'm88-monitor-signals-v1';
const BASELINE_KEY = 'm88-monitor-baselines-v1';
const CONFIRM_KEY = 'm88-monitor-confirm-v1';

const DEFAULTS = {
  enabled: true,
  side: 'HOME',
  minuteMin: 60,
  minuteMax: 80,
  market: 'WIN',
  oddsMin: 1.70,
  oddsMax: null,
  ahMin: 0.25,
  ahMax: null,
  ouDirection: 'OVER',
  ouLine: 2.5,
  momentumMin: 60,
  confirmationRounds: 2,
  attackEvidenceEnabled: true,
  attackEvidenceDangerousAttacksEnabled: true,
  attackEvidenceDangerousAttacksMin: 1,
  attackEvidenceShotsEnabled: true,
  attackEvidenceShotsMin: 1,
  attackEvidenceShotsOnTargetEnabled: true,
  attackEvidenceShotsOnTargetMin: 1,
  attackEvidenceCornersEnabled: true,
  attackEvidenceCornersMin: 1,
  attackEvidenceRequirement: '1',
  goalGapLimited: false,
  maxGoalGap: 1,
  redCardPolicy: 'ALLOW',
  sourceFreshnessMaxSeconds: 90,
  matchConfidenceMin: 85,
  requireCoreStats: true,
  signalLimitEnabled: false,
  maxSignalsPerDay: 10,
  scanSeconds: 15,
  cooldownMinutes: 20,
  leagueInclude: '',
  leagueExclude: '',
  momentumWeights: {
    attacks: 0.16,
    dangerous_attacks: 0.52,
    shots: 2,
    shots_on_target: 4,
    corners: 1.25,
    possession: 0.07
  }
};

function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {...cloneDefaults(), ...saved, momentumWeights:{...DEFAULTS.momentumWeights, ...(saved.momentumWeights || {})}};
  } catch { return cloneDefaults(); }
}
function saveSettings(value) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); return value; }
function loadSignals() { try { return JSON.parse(localStorage.getItem(SIGNALS_KEY) || '[]'); } catch { return []; } }
function saveSignals(value) { localStorage.setItem(SIGNALS_KEY, JSON.stringify(value.slice(0, 3000))); return value; }
function loadMap(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function saveMap(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value; }
function fmt(value, digits=2) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'; }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nowLocal() { return new Date().toLocaleString(); }
function toast(message) { const old=$('.toast'); if(old)old.remove(); const el=document.createElement('div'); el.className='toast'; el.textContent=message; document.body.append(el); setTimeout(()=>el.remove(),2800); }

async function api(path, options={}) {
  const token=sessionStorage.getItem('m88-private-token') || '';
  const headers={...(options.headers || {})};
  if(token)headers['x-private-token']=token;
  const response=await fetch(path,{cache:'no-store',...options,headers});
  if(response.status===401){const value=prompt('Private token'); if(value){sessionStorage.setItem('m88-private-token',value); return api(path,options);}}
  const data=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
  if(!response.ok&&data.error)throw new Error(data.error);
  return data;
}

function finite(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function statusText(match){return String(match.status||'').toLowerCase();}
function isLive(match){return !/(finished|final|\bft\b|ended|cancel|postpon)/.test(statusText(match));}
function textList(value){return String(value||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);}
function signalFingerprint(match){return [match.sourceId,match.market,match.selection,match.home,match.away].join('|');}
function selectionSide(match){const s=String(match.selection||'').trim().toLowerCase(),home=String(match.home||'').toLowerCase(),away=String(match.away||'').toLowerCase();if(!s)return '';if(['home','1','h'].includes(s)||(home&&s.includes(home)))return 'HOME';if(['away','2','a'].includes(s)||(away&&s.includes(away)))return 'AWAY';return '';}
function marketMatches(market,wanted){const s=String(market||'').toLowerCase();if(!s)return null;if(wanted==='WIN')return /(1x2|winner|moneyline|match result|full time result)/.test(s);if(wanted==='AH')return /(asian|handicap|\bah\b)/.test(s);if(wanted==='OU')return /(over.?under|total|o\/u|goals)/.test(s);return false;}
function statsFor(match,side){const p=side==='AWAY'?'away':'home';return {attacks:finite(match[`${p}Attacks`]),dangerous_attacks:finite(match[`${p}DangerousAttacks`]),shots:finite(match[`${p}Shots`]),shots_on_target:finite(match[`${p}ShotsOnTarget`]),corners:finite(match[`${p}Corners`]),possession:finite(match[`${p}Possession`])};}
function coreComplete(stats){return ['dangerous_attacks','shots','shots_on_target','corners'].every(k=>stats[k]!=null);}
function momentumScore(stats,weights){const caps={attacks:80,dangerous_attacks:45,shots:25,shots_on_target:12,corners:12,possession:100};let points=0,maximum=0;for(const [key,weightValue] of Object.entries(weights||{})){const value=stats[key],weight=Number(weightValue||0);if(value==null||!weight)continue;points+=Math.max(0,value)*weight;maximum+=caps[key]*weight;}return maximum>0?Math.min(100,points/maximum*100):null;}
function inferredConfidence(match,stats){const fields=[Boolean(match.home),Boolean(match.away),finite(match.minute)!=null,finite(match.homeScore)!=null,finite(match.awayScore)!=null,Boolean(match.market),finite(match.odds)!=null,coreComplete(stats)];return Math.round(fields.filter(Boolean).length/fields.length*100);}
function baselineDeltas(match,side){const key=`${match.sourceId}|${side}`,all=loadMap(BASELINE_KEY),current=statsFor(match,side);let baseline=all[key];if(!baseline){baseline={at:Date.now(),minute:finite(match.minute),stats:current};all[key]=baseline;saveMap(BASELINE_KEY,all);}const deltas={};for(const keyName of Object.keys(current)){deltas[keyName]=current[keyName]!=null&&baseline.stats?.[keyName]!=null?current[keyName]-baseline.stats[keyName]:null;}return {baseline,deltas,current};}
function evidenceCheck(match,side,settings){if(!settings.attackEvidenceEnabled)return {ok:true,reason:'evidence off'};const {deltas}=baselineDeltas(match,side);const rules=[['dangerous_attacks','attackEvidenceDangerousAttacksEnabled','attackEvidenceDangerousAttacksMin'],['shots','attackEvidenceShotsEnabled','attackEvidenceShotsMin'],['shots_on_target','attackEvidenceShotsOnTargetEnabled','attackEvidenceShotsOnTargetMin'],['corners','attackEvidenceCornersEnabled','attackEvidenceCornersMin']].filter(([,enabledKey])=>settings[enabledKey]);if(!rules.length)return {ok:false,watch:true,reason:'no evidence rule enabled'};let known=0,passed=0;for(const [statKey,,minKey] of rules){if(deltas[statKey]!=null){known+=1;if(deltas[statKey]>=Number(settings[minKey]||0))passed+=1;}}if(known<rules.length)return {ok:false,watch:true,reason:`evidence data ${known}/${rules.length}`};const needed=settings.attackEvidenceRequirement==='ALL'?rules.length:Number(settings.attackEvidenceRequirement||1);return {ok:passed>=needed,reason:`evidence ${passed}/${needed}`};}
function resetConfirm(fingerprint){const map=loadMap(CONFIRM_KEY);if(!map[fingerprint])return;delete map[fingerprint];saveMap(CONFIRM_KEY,map);}
function confirmRound(fingerprint){const map=loadMap(CONFIRM_KEY),now=Date.now(),previous=map[fingerprint];const count=previous&&now-Number(previous.at||0)<120000?Number(previous.count||0)+1:1;map[fingerprint]={count,at:now};saveMap(CONFIRM_KEY,map);return count;}

function baseRules(match,settings,feedCheckedAt){
  const fp=signalFingerprint(match);
  if(!settings.enabled){resetConfirm(fp);return {state:'PASS',reason:'engine disabled'};}
  if(!isLive(match)){resetConfirm(fp);return {state:'PASS',reason:'not live'};}
  const minute=finite(match.minute);if(minute==null)return {state:'WATCH',reason:'missing minute'};if(minute<Number(settings.minuteMin)||minute>Number(settings.minuteMax)){resetConfirm(fp);return {state:'PASS',reason:'minute'};}
  const marketOk=marketMatches(match.market,settings.market);if(marketOk==null)return {state:'WATCH',reason:'missing market'};if(!marketOk){resetConfirm(fp);return {state:'PASS',reason:'market'};}
  const odds=finite(match.odds);if(odds==null)return {state:'WATCH',reason:'missing odds'};if(odds<Number(settings.oddsMin)||(settings.oddsMax!=null&&settings.oddsMax!==''&&odds>Number(settings.oddsMax))){resetConfirm(fp);return {state:'PASS',reason:'odds'};}
  const league=String(match.league||'').toLowerCase(),includes=textList(settings.leagueInclude),excludes=textList(settings.leagueExclude);if(includes.length&&!includes.some(x=>league.includes(x))){resetConfirm(fp);return {state:'PASS',reason:'league include'};}if(excludes.some(x=>league.includes(x))){resetConfirm(fp);return {state:'PASS',reason:'league exclude'};}
  let side=settings.side;if(side==='BOTH'){const homeMomentum=momentumScore(statsFor(match,'HOME'),settings.momentumWeights),awayMomentum=momentumScore(statsFor(match,'AWAY'),settings.momentumWeights);if(homeMomentum==null&&awayMomentum==null)return {state:'WATCH',reason:'missing momentum'};side=(awayMomentum??-1)>(homeMomentum??-1)?'AWAY':'HOME';}
  const actualSide=selectionSide(match);if(actualSide&&actualSide!==side){resetConfirm(fp);return {state:'PASS',reason:'side'};}if(!actualSide&&settings.market==='WIN')return {state:'WATCH',reason:'selection side unknown'};
  if(settings.market==='AH'){const line=finite(match.handicapLine);if(line==null)return {state:'WATCH',reason:'missing AH line'};if(settings.ahMin!=null&&line<Number(settings.ahMin)){resetConfirm(fp);return {state:'PASS',reason:'AH line'};}if(settings.ahMax!=null&&settings.ahMax!==''&&line>Number(settings.ahMax)){resetConfirm(fp);return {state:'PASS',reason:'AH line'};}}
  if(settings.market==='OU'){const line=finite(match.goalLine);if(line==null)return {state:'WATCH',reason:'missing O/U line'};if(Math.abs(line-Number(settings.ouLine))>0.001){resetConfirm(fp);return {state:'PASS',reason:'O/U line'};}const selection=String(match.selection||'').toUpperCase();if(selection&&settings.ouDirection&&!selection.includes(settings.ouDirection)){resetConfirm(fp);return {state:'PASS',reason:'O/U side'};}}
  const homeScore=finite(match.homeScore),awayScore=finite(match.awayScore);if(settings.goalGapLimited&&(homeScore==null||awayScore==null))return {state:'WATCH',reason:'missing score'};if(settings.goalGapLimited&&Math.abs(homeScore-awayScore)>Number(settings.maxGoalGap)){resetConfirm(fp);return {state:'PASS',reason:'goal gap'};}
  if(settings.redCardPolicy!=='ALLOW'){const homeRed=finite(match.homeRedCards),awayRed=finite(match.awayRedCards);if(homeRed==null||awayRed==null)return {state:'WATCH',reason:'missing red cards'};if(settings.redCardPolicy==='REJECT_ANY'&&(homeRed>0||awayRed>0)){resetConfirm(fp);return {state:'PASS',reason:'red card'};}if(settings.redCardPolicy==='REJECT_SELECTED'&&((side==='HOME'&&homeRed>0)||(side==='AWAY'&&awayRed>0))){resetConfirm(fp);return {state:'PASS',reason:'selected red card'};}}
  const checked=new Date(feedCheckedAt||Date.now()).getTime();if(Number.isFinite(checked)&&(Date.now()-checked)/1000>Number(settings.sourceFreshnessMaxSeconds))return {state:'WATCH',reason:'stale source'};
  const stats=statsFor(match,side);if(settings.requireCoreStats&&!coreComplete(stats))return {state:'WATCH',reason:'core stats incomplete'};
  const confidence=finite(match.matchConfidence)??inferredConfidence(match,stats);if(confidence<Number(settings.matchConfidenceMin))return {state:'WATCH',reason:`confidence ${confidence}%`};
  const sourceMomentum=finite(match[side==='HOME'?'homeMomentum':'awayMomentum']),momentum=sourceMomentum??momentumScore(stats,settings.momentumWeights);if(momentum==null)return {state:'WATCH',reason:'missing momentum'};if(momentum<Number(settings.momentumMin)){resetConfirm(fp);return {state:'PASS',reason:`momentum ${fmt(momentum,0)}%`};}
  const evidence=evidenceCheck(match,side,settings);if(!evidence.ok)return {state:evidence.watch?'WATCH':'PASS',reason:evidence.reason};
  return {state:'READY',reason:`${side} · momentum ${fmt(momentum,0)}% · ${evidence.reason}`,side,momentum,confidence};
}

function evaluateMatch(match,settings,feedCheckedAt){const base=baseRules(match,settings,feedCheckedAt);if(base.state!=='READY')return base;const fp=signalFingerprint(match),needed=Math.max(1,Number(settings.confirmationRounds)||1),count=confirmRound(fp);if(count<needed)return {state:'WATCH',reason:`confirm ${count}/${needed}`};return {state:'PICK',reason:base.reason,side:base.side,momentum:base.momentum,confidence:base.confidence};}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function maybeRecordSignal(match,decision,settings){if(decision.state!=='PICK')return false;const signals=loadSignals(),fp=signalFingerprint(match),now=Date.now();const recent=signals.find(s=>s.fingerprint===fp&&now-new Date(s.detectedAt).getTime()<Number(settings.cooldownMinutes)*60000);if(recent)return false;const today=signals.filter(s=>String(s.detectedAt||'').slice(0,10)===new Date().toISOString().slice(0,10));if(settings.signalLimitEnabled&&today.length>=Number(settings.maxSignalsPerDay))return false;signals.unshift({id:crypto.randomUUID?.()||`${now}-${Math.random()}`,fingerprint:fp,detectedAt:new Date().toISOString(),detectedLocal:nowLocal(),result:'PENDING',ftScore:'',decisionReason:decision.reason,decisionSide:decision.side,momentum:decision.momentum,matchConfidence:decision.confidence,...match,rawSnapshot:match.raw});saveSignals(signals);return true;}

async function initDetection(){
  const tbody=$('#matchRows'),feedState=$('#feedState'),lastScan=$('#lastScan'),picks=$('#pickCount'),total=$('#matchCount'),avgOdds=$('#avgOdds'),sourceStatus=$('#sourceStatus');let timer=null,working=false;
  async function scan(){if(working)return;working=true;$('#scanBtn').disabled=true;feedState.textContent='Scanning M88…';try{const data=await api('/api/feed');lastScan.textContent=new Date(data.checkedAt||Date.now()).toLocaleTimeString();sourceStatus.textContent=data.mode||'—';const settings=loadSettings(),matches=data.matches||[];let pickCount=0,oddsSum=0,oddsCount=0,newSignals=0;const rows=matches.map(match=>{const decision=evaluateMatch(match,settings,data.checkedAt);if(decision.state==='PICK'){pickCount+=1;if(Number.isFinite(Number(match.odds))){oddsSum+=Number(match.odds);oddsCount+=1;}if(maybeRecordSignal(match,decision,settings))newSignals+=1;}return `<tr><td>${esc(match.league||'—')}</td><td><b>${esc(match.home)}</b> vs ${esc(match.away)}</td><td>${esc(match.minute??'—')}′</td><td class="score">${esc(match.homeScore??'—')}–${esc(match.awayScore??'—')}</td><td>${esc(match.market||'—')}</td><td>${esc(match.selection||'—')}</td><td class="odds">${fmt(match.odds)}</td><td><span class="badge ${decision.state.toLowerCase()}">${decision.state}</span></td><td class="muted">${esc(decision.reason)}</td></tr>`;}).join('');tbody.innerHTML=rows||`<tr><td colspan="9"><div class="empty">${esc(data.message||'No public-feed matches returned yet.')}</div></td></tr>`;total.textContent=matches.length;picks.textContent=pickCount;avgOdds.textContent=oddsCount?fmt(oddsSum/oddsCount):'—';feedState.textContent=data.ok?'M88 public feed online':(data.mode==='probe-required'?'Feed discovery required':'Feed unavailable');if(newSignals)toast(`${newSignals} new signal${newSignals>1?'s':''} recorded`);}catch(error){feedState.textContent='Source error';tbody.innerHTML=`<tr><td colspan="9"><div class="empty bad">${esc(error.message)}</div></td></tr>`;}finally{working=false;$('#scanBtn').disabled=false;}}
  $('#scanBtn').addEventListener('click',scan);$('#probeBtn').addEventListener('click',async()=>{const box=$('#probeOutput');box.textContent='Deep probing public M88 app…';try{box.textContent=JSON.stringify(await api('/api/source/probe?deep=1'),null,2);}catch(error){box.textContent=error.message;}});
  function arm(){clearInterval(timer);const seconds=Math.max(5,Number(loadSettings().scanSeconds)||15);timer=setInterval(scan,seconds*1000);$('#intervalValue').textContent=`${seconds}s`;}
  arm();scan();window.addEventListener('storage',arm);
}

function initStatistics(){
  const signals=loadSignals(),settled=signals.filter(s=>['WIN','LOSS','DRAW','PUSH'].includes(String(s.result).toUpperCase())),wins=settled.filter(s=>String(s.result).toUpperCase()==='WIN').length,losses=settled.filter(s=>String(s.result).toUpperCase()==='LOSS').length,odds=signals.map(s=>Number(s.odds)).filter(Number.isFinite);
  $('#statTotal').textContent=signals.length;$('#statWins').textContent=wins;$('#statLosses').textContent=losses;$('#statPending').textContent=signals.filter(s=>String(s.result).toUpperCase()==='PENDING').length;$('#statWinRate').textContent=settled.length?`${fmt(wins/settled.length*100,1)}%`:'—';$('#statAvgOdds').textContent=odds.length?fmt(odds.reduce((a,b)=>a+b,0)/odds.length):'—';
  $('#signalRows').innerHTML=signals.map(s=>`<tr data-id="${esc(s.id)}"><td>${esc(new Date(s.detectedAt).toLocaleString())}</td><td>${esc(s.league||'—')}</td><td><b>${esc(s.home)}</b> vs ${esc(s.away)}</td><td>${esc(s.minute??'—')}′</td><td class="score">${esc(s.homeScore??'—')}–${esc(s.awayScore??'—')}</td><td>${esc(s.ftScore||'—')}</td><td>${esc(s.market||'—')}</td><td>${esc(s.selection||'—')}</td><td class="odds">${fmt(s.odds)}</td><td><select class="result-select"><option ${s.result==='PENDING'?'selected':''}>PENDING</option><option ${s.result==='WIN'?'selected':''}>WIN</option><option ${s.result==='LOSS'?'selected':''}>LOSS</option><option ${s.result==='DRAW'?'selected':''}>DRAW</option><option ${s.result==='PUSH'?'selected':''}>PUSH</option></select></td><td><input class="ft-input" value="${esc(s.ftScore||'')}" placeholder="4-0"></td><td><button class="btn raw-btn">Raw</button></td></tr>`).join('')||`<tr><td colspan="12"><div class="empty">No signals recorded yet.</div></td></tr>`;
  function saveRow(event){const row=event.target.closest('tr'),items=loadSignals(),signal=items.find(x=>x.id===row.dataset.id);if(!signal)return;signal.result=$('.result-select',row).value;signal.ftScore=$('.ft-input',row).value.trim();saveSignals(items);toast('Statistics record updated');}
  $$('.result-select').forEach(el=>el.addEventListener('change',saveRow));$$('.ft-input').forEach(el=>el.addEventListener('change',saveRow));$$('.raw-btn').forEach(el=>el.addEventListener('click',event=>{const row=event.target.closest('tr'),signal=loadSignals().find(x=>x.id===row.dataset.id);alert(JSON.stringify(signal?.rawSnapshot||{},null,2));}));
  $('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(loadSignals(),null,2)],{type:'application/json'}),anchor=document.createElement('a');anchor.href=URL.createObjectURL(blob);anchor.download=`m88-signals-${todayKey()}.json`;anchor.click();URL.revokeObjectURL(anchor.href);});
  $('#clearBtn').addEventListener('click',()=>{if(confirm('Clear all local M88 signal history on this browser?')){localStorage.removeItem(SIGNALS_KEY);location.reload();}});
}

function ahText(value){const v=Number(value),abs=Math.abs(v),sign=v>0?'+':v<0?'-':'',fraction=Math.round((abs-Math.floor(abs))*100);let thai;if(fraction===25)thai='ปป';else if(fraction===50)thai='ครึ่งลูก';else if(fraction===75)thai='ครึ่งควบลูก';else if(fraction===0&&abs===0)thai='เสมอ';else if(fraction===0)thai=`${Math.floor(abs)} ลูก`;else thai=`${abs.toFixed(2)} ลูก`;return `${sign}${abs.toFixed(2)} · ${v<0?'ต่อ ':v>0?'รอง ':''}${thai}`;}

function initSettings(){
  const form=$('#settingsForm');if(!form)return;const ahMin=$('#ahMin'),ahMax=$('#ahMax');if(ahMin&&ahMax){ahMax.innerHTML='<option value="">ไม่จำกัด</option>';for(let quarter=-20;quarter<=20;quarter+=1){const value=quarter/4;for(const element of [ahMin,ahMax]){const option=document.createElement('option');option.value=String(value);option.textContent=ahText(value);element.appendChild(option);}}}
  function fill(settings){for(const [key,value] of Object.entries(settings)){if(key==='momentumWeights')continue;const element=form.elements[key];if(!element)continue;if(element.type==='checkbox')element.checked=Boolean(value);else element.value=value??'';}for(const [key,value] of Object.entries(settings.momentumWeights||{})){const element=form.elements[`w_${key}`];if(element)element.value=value;}update();}
  function body(){const value=cloneDefaults(),data=new FormData(form);for(const [key,entry] of data)value[key]=entry;for(const element of $$('input[type=checkbox]',form))value[element.name]=element.checked;const numericKeys=['minuteMin','minuteMax','oddsMin','oddsMax','ahMin','ahMax','ouLine','momentumMin','confirmationRounds','attackEvidenceDangerousAttacksMin','attackEvidenceShotsMin','attackEvidenceShotsOnTargetMin','attackEvidenceCornersMin','maxGoalGap','sourceFreshnessMaxSeconds','matchConfidenceMin','maxSignalsPerDay','scanSeconds','cooldownMinutes'];for(const key of numericKeys)value[key]=value[key]===''?null:Number(value[key]);value.momentumWeights={};for(const key of ['attacks','dangerous_attacks','shots','shots_on_target','corners','possession'])value.momentumWeights[key]=Number(form.elements[`w_${key}`].value)||0;return value;}
  function update(){const settings=body(),market=settings.market;$('#ahCard')?.classList.toggle('inactive',market!=='AH');$('#ouCard')?.classList.toggle('inactive',market!=='OU');const marketLabel=market==='AH'?`AH ${settings.ahMin==null?'—':ahText(settings.ahMin)}${settings.ahMax!=null?' ถึง '+ahText(settings.ahMax):' ขึ้นไป'}`:market==='OU'?`${settings.ouDirection} ${settings.ouLine}`:'WIN · 1X2';$('#ruleSummary').innerHTML=`<strong>M88</strong> · <strong>${settings.side}</strong> · ${settings.minuteMin}'–${settings.minuteMax}' · <strong>${marketLabel}</strong> · Odds ${settings.oddsMin??'—'}${settings.oddsMax!=null?'–'+settings.oddsMax:'+'} · Momentum ≥${settings.momentumMin}% · Confirm ${settings.confirmationRounds} รอบ`;if($('#ahPreview'))$('#ahPreview').textContent=`ช่วงที่ตั้ง: ${settings.ahMin==null?'—':ahText(settings.ahMin)} ${settings.ahMax==null?'ถึงไม่จำกัด':'ถึง '+ahText(settings.ahMax)}`;}
  fill(loadSettings());form.addEventListener('input',update);form.addEventListener('submit',event=>{event.preventDefault();saveSettings(body());toast('บันทึกเงื่อนไข M88 แล้ว');update();});$('#resetSettings')?.addEventListener('click',()=>{saveSettings(cloneDefaults());location.reload();});$('#saveRun')?.addEventListener('click',()=>{saveSettings(body());toast('บันทึกแล้ว · ไปหน้า Detection');setTimeout(()=>{location.href='./index.html';},450);});$('#healthBtn')?.addEventListener('click',async()=>{const box=$('#healthOutput');box.textContent='Checking…';try{const health=await api('/api/health');box.textContent=JSON.stringify(health,null,2);if($('#workerState'))$('#workerState').textContent=health.ok?'ONLINE':'ERROR';}catch(error){box.textContent=error.message;if($('#workerState'))$('#workerState').textContent='ERROR';}});
}

const page=document.body.dataset.page;
if(page==='detection')initDetection();
if(page==='statistics')initStatistics();
if(page==='settings')initSettings();
