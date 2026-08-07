const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let liveConfigState = null;
let ballConfigState = null;

function escapeHtml(value){return String(value ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])}
function number(value){const n=Number(value);return Number.isFinite(n)?n:null}
function odds(value){const n=number(value);return n&&n>0?n.toFixed(2):'N/A'}
function dateTime(value){if(!value)return '—';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '—';return new Intl.DateTimeFormat('th-TH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function memberUrl(path){return `${WORKER}${path}${path.includes('?')?'&':'?'}member=${encodeURIComponent(MEMBER_ID)}`}
async function requestJson(url,options={}){const response=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||`HTTP ${response.status}`);return payload}

function openTab(name){$$('.tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));$$('.view').forEach(view=>view.classList.toggle('active',view.dataset.view===name));if(history.replaceState)history.replaceState(null,'',`#${name}`)}
$$('.tab').forEach(button=>button.addEventListener('click',()=>openTab(button.dataset.tab)));
const initialTab=location.hash.replace('#','');if(['overview','ball-teng','live','stats','notifications','settings'].includes(initialTab))openTab(initialTab);

function renderProfile(payload){
  $('#memberStatus').textContent=payload.status||'ACTIVE';
  $('#profileStatus').textContent=payload.status||'ACTIVE';
  $('#memberRole').textContent=payload.role||'MEMBER';
  const notification=payload.notification||{};
  $('#lineConfigured').textContent=notification.recipientConfigured?`${notification.channel||'LINE'} · READY`:`${notification.channel||'LINE'} · RECIPIENT NOT SET`;
  $('#lineConfigured').className=notification.recipientConfigured?'good-text':'';
  $('#overviewChannelState').textContent=notification.recipientConfigured?`${notification.channel||'LINE'} ready`:'Recipient not configured';
}

function renderBallTeng(payload){
  const set=payload.payload||null;
  const matches=Array.isArray(set?.matches)?set.matches:[];
  const avg=matches.length?matches.reduce((sum,m)=>sum+(number(m.confidence)||0),0)/matches.length:0;
  $('#metricPicks').textContent=matches.length;
  $('#metricConfidence').textContent=matches.length?`${avg.toFixed(1)}%`:'—';
  $('#overviewPicksState').textContent=matches.length?`${matches.length} member selection(s) · avg ${avg.toFixed(1)}%`:(payload.engine?.status||'WAITING_FOR_MEMBER_SELECTOR');
  $('#ballTengMeta').textContent=`Member #${MEMBER_ID} · ${payload.setId||'no set'} · config v${payload.config?.version||payload.config?.activatedAt||'—'}`;
  if(!matches.length){
    $('#ballTengGrid').innerHTML='<div class="empty">ยังไม่มีชุดบอลเต็งที่สร้างจากเงื่อนไขของ Member #0001 · จะไม่ดึงชุด Owner/System มาแสดงแทน</div>';
    return;
  }
  $('#ballTengGrid').innerHTML=matches.map((m,index)=>{
    const btts=m.markets?.btts||{},dc=m.markets?.doubleChance||{},ah=m.markets?.asianHandicap||{};
    return `<article class="pick-card"><div class="card-top"><div class="league">#${String(index+1).padStart(2,'0')} · ${escapeHtml(m.country)} · ${escapeHtml(m.league)}<br>${escapeHtml(dateTime(m.kickoff_utc))}</div><div class="confidence">${escapeHtml(m.confidence??'—')}%</div></div><div class="match">${escapeHtml(m.home)} <span style="color:#89918c">vs</span> ${escapeHtml(m.away)}</div><div class="pick">Main Pick · <b>${escapeHtml(m.pick)}</b></div><div class="details"><div><small>1X2 Odds</small><strong>${odds(m.odds)}</strong></div><div><small>BTTS</small><strong>${escapeHtml(btts.pick||'N/A')} · ${odds(btts.odds)}</strong></div><div><small>Double Chance</small><strong>${escapeHtml(dc.code||dc.pick||'N/A')} · ${odds(dc.odds)}</strong></div><div><small>Asian Handicap</small><strong>${escapeHtml(ah.pick||'N/A')} · ${odds(ah.odds)}</strong></div></div></article>`;
  }).join('');
}

function renderLive(payload){
  const active=Array.isArray(payload.active)?payload.active:[];
  const signals=Array.isArray(payload.signals)?payload.signals:[];
  const counts=payload.counts||{};
  const activeCount=number(counts.active)??active.length;
  const triggeredCount=number(counts.triggered)??active.filter(row=>Number(row.triggered)===1).length;
  const signalCount=number(counts.signals)??signals.length;
  $('#metricLive').textContent=activeCount;
  $('#metricSignals').textContent=signalCount;
  $('#overviewLiveState').textContent=payload.engine?.status||`${activeCount} active`;
  $('#overviewNotifyState').textContent=`${signalCount} personal signal(s)`;
  $('#liveOnline').textContent=payload.engine?.status==='READY_FOR_MEMBER_EVALUATOR'?'READY':'ACTIVE';
  $('#liveOnline').className='good-text';
  $('#liveGenerated').textContent=`Config v${payload.config?.version||'—'}`;
  $('#liveCandidateCount').textContent=activeCount;
  $('#livePassing').textContent=triggeredCount;
  $('#liveTriggered').textContent=signalCount;
  $('#liveMeta').textContent=`Member #${MEMBER_ID} · Momentum ≥ ${payload.config?.momentumMin??'—'}% · ${payload.engine?.status||'MEMBER_ONLY'}`;
  $('#notifyScanner').textContent=payload.engine?.status||'MEMBER_ONLY';
  $('#notifyCount').textContent=signalCount;
  $('#notifyMeta').textContent=`${signalCount} member notification candidate(s)`;

  if(!active.length){$('#liveGrid').innerHTML='<div class="empty">ยังไม่มี live state ของ Member #0001 · ระบบจะไม่ใช้ state ของ Owner/System มาปน</div>'}
  else $('#liveGrid').innerHTML=active.map(row=>`<article class="live-card ${Number(row.triggered)===1?'triggered':''}"><div class="card-top"><div class="league">Fixture ${escapeHtml(row.fixture_id)} · ${escapeHtml(row.selected_side)}<br>Minute ${escapeHtml(row.minute)}</div><div class="confidence">Streak ${escapeHtml(row.streak||0)}</div></div><div class="match">${escapeHtml(row.selected_team)} <span style="color:#89918c">vs</span> ${escapeHtml(row.opponent)}</div><div class="momentum">${row.momentum==null?'—':Math.round(Number(row.momentum))}<small>% momentum</small></div><div class="live-meta"><span>Score ${escapeHtml(row.selected_score)}–${escapeHtml(row.opponent_score)}</span><span>Config v${escapeHtml(row.config_version)}</span><span class="${Number(row.triggered)===1?'signal':''}">${Number(row.triggered)===1?'SIGNAL TRIGGERED':'MONITORING'}</span></div></article>`).join('');
}

function renderStats(payload){
  const summary=payload.summary||{};
  const records=Array.isArray(payload.records)?payload.records:[];
  $('#statTotal').textContent=summary.total??0;$('#statSettled').textContent=summary.settled??0;$('#statCorrect').textContent=summary.correct??0;$('#statIncorrect').textContent=summary.incorrect??0;$('#statAccuracy').textContent=summary.accuracy==null?'—':`${Number(summary.accuracy).toFixed(2)}%`;
  $('#statsMeta').textContent=`${records.length} record(s) · scope MEMBER_ONLY · ${MEMBER_ID}`;
  $('#overviewStatsState').textContent=summary.accuracy==null?`${records.length} personal record(s)`:`${Number(summary.accuracy).toFixed(2)}% · ${summary.settled||0} settled`;
  if(!records.length){$('#historyTable').innerHTML='<div class="empty">ยังไม่มีสถิติ Member #0001 · record ของ Owner/System ที่ไม่มี member_id จะไม่ถูกนำมานับ</div>';return}
  $('#historyTable').innerHTML=`<div class="history-row head"><span>Date</span><span>Type / Fixture</span><span>Pick</span><span>Odds</span><span>Result</span></div>${records.slice(0,20).map(r=>{const result=String(r.outcome||'PENDING').toLowerCase(),cls=['correct','win','half-win'].includes(result)?'correct':['incorrect','loss','half-loss'].includes(result)?'incorrect':'pending';return `<div class="history-row"><span>${escapeHtml(dateTime(r.created_at))}</span><b>${escapeHtml(r.source_type||'—')} · ${escapeHtml(r.fixture_id||'—')}</b><span>${escapeHtml(r.pick||'—')}</span><span>${odds(r.odds)}</span><span class="outcome ${cls}">${escapeHtml(String(r.outcome||'PENDING').toUpperCase())}</span></div>`}).join('')}`;
}

function renderNotifications(payload){
  const rows=Array.isArray(payload.notifications)?payload.notifications:[];
  $('#notifyCount').textContent=rows.length;
  $('#notifyMeta').textContent=`${rows.length} notification log item(s) · Member #${MEMBER_ID}`;
  $('#overviewNotifyState').textContent=`${rows.length} notification log item(s)`;
  if(!rows.length){$('#noticeList').innerHTML='<div class="empty">ยังไม่มี notification log ของ Member #0001</div>';return}
  $('#noticeList').innerHTML=rows.map(row=>`<article class="notice-card"><div class="notice-mark"></div><div><h3>${escapeHtml(row.channel)} · ${escapeHtml(row.event_key)}</h3><p>Status ${escapeHtml(row.status)} · Member #${MEMBER_ID}</p></div><div class="notice-time">${escapeHtml(dateTime(row.created_at))}</div></article>`).join('');
}

function setInfraHealth(payload){
  const online=Boolean(payload?.online);
  $('#overviewWorkerDot').className=`dot ${online?'good':'bad'}`;
  $('#overviewWorkerText').textContent=online?`Shared data scanner online · ${dateTime(payload.generatedAt)} · member results remain isolated`:`Shared data scanner offline/stale · member namespace remains separate`;
}

function formObject(form){return Object.fromEntries(new FormData(form).entries())}
function boolValue(value){return String(value)==='true'}
function nullableNumber(value){return value===''?null:Number(value)}
function fillForm(form,config,map={}){for(const element of form.elements){if(!element.name)continue;const source=map[element.name]||element.name;let value=config?.[source];if(element.name.endsWith('Pct'))value=Math.round(Number(value||0)*10000)/100;if(typeof value==='boolean')value=String(value);if(value==null)value='';element.value=value}}

function liveFormConfig(){const raw=formObject($('#liveConfigForm'));return {side:raw.side,market:raw.market,minuteMin:Number(raw.minuteMin),minuteMax:Number(raw.minuteMax),oddsMin:Number(raw.oddsMin),oddsMax:nullableNumber(raw.oddsMax),ahMin:Number(raw.ahMin),ahMax:nullableNumber(raw.ahMax),momentumMin:Number(raw.momentumMin),confirmationRounds:Number(raw.confirmationRounds),goalGapLimited:boolValue(raw.goalGapLimited),maxGoalGap:Number(raw.maxGoalGap),signalLimitEnabled:boolValue(raw.signalLimitEnabled),maxSignalsPerDay:Number(raw.maxSignalsPerDay)}}
function ballFormConfig(){const raw=formObject($('#ballConfigForm'));return {enabled:boolValue(raw.enabled),cutoffHourLocal:Number(raw.cutoffHourLocal),minimumLeadMinutes:Number(raw.minimumLeadMinutes),minimumMainOdds:Number(raw.minimumMainOdds),minimumConfidence:Number(raw.minimumConfidence),maximumConfidence:Number(raw.maximumConfidence),overallSample:Number(raw.overallSample),venueSample:Number(raw.venueSample),historyFetch:Number(raw.historyFetch),minimumSample:Number(raw.minimumSample),minimumStrengthScore:Number(raw.minimumStrengthScore),minimumOverallPpgEdge:Number(raw.minimumOverallPpgEdge),minimumVenuePpgEdge:Number(raw.minimumVenuePpgEdge),maximumFixturesToAnalyze:Number(raw.maximumFixturesToAnalyze),maximumSelections:Number(raw.maximumSelections),overallPpgWeight:Number(raw.overallPpgWeightPct)/100,venuePpgWeight:Number(raw.venuePpgWeightPct)/100,goalDifferenceWeight:Number(raw.goalDifferenceWeightPct)/100,useStandingsContext:true,standingsStrengthWeight:Number(raw.standingsStrengthWeightPct)/100,standingsAdjustmentCap:Number(raw.standingsStrengthWeightPct)/100,standingsDirectRankMix:Number(raw.standingsDirectRankMixPct)/100,standingsRankedCommonMix:Number(raw.standingsRankedCommonMixPct)/100,confidenceStrengthScale:15}}

function configMessage(id,text,good=true){const node=$(id);node.textContent=text;node.className=`config-message ${good?'good':'bad'}`}
async function loadConfigs(){
  try{liveConfigState=await requestJson(memberUrl('/member-live-config'));fillForm($('#liveConfigForm'),liveConfigState.draft);$('#liveConfigVersion').textContent=`v${liveConfigState.version||0}`;configMessage('#liveConfigMessage',`โหลดค่า Member #${MEMBER_ID} แล้ว · Active แยกจาก Owner/System`)}catch(error){configMessage('#liveConfigMessage',error.message,false)}
  try{ballConfigState=await requestJson(memberUrl('/member-ball-teng-config'));fillForm($('#ballConfigForm'),ballConfigState.draft);$('#ballConfigVersion').textContent=`v${ballConfigState.version||0}`;configMessage('#ballConfigMessage',`โหลดค่า Member #${MEMBER_ID} แล้ว · Active แยกจาก Owner/System`)}catch(error){configMessage('#ballConfigMessage',error.message,false)}
}
async function submitConfig(kind,action){
  const isLive=kind==='live';const url=memberUrl(isLive?'/member-live-config':'/member-ball-teng-config');const config=isLive?liveFormConfig():ballFormConfig();const messageId=isLive?'#liveConfigMessage':'#ballConfigMessage';
  try{configMessage(messageId,action==='run'?'กำลังเปิดใช้ค่าของสมาชิก…':'กำลังเซฟ Draft…');const payload=await requestJson(url,{method:'POST',body:JSON.stringify({action,config})});if(isLive){liveConfigState=payload;fillForm($('#liveConfigForm'),payload.draft);$('#liveConfigVersion').textContent=`v${payload.version||0}`}else{ballConfigState=payload;fillForm($('#ballConfigForm'),payload.draft);$('#ballConfigVersion').textContent=`v${payload.version||0}`}configMessage(messageId,payload.message||'บันทึกแล้ว');await loadMemberData()}catch(error){configMessage(messageId,error.message,false)}
}

document.querySelectorAll('[data-config-action]').forEach(button=>button.addEventListener('click',()=>{const [kind,action]=button.dataset.configAction.split('-');if(action==='default'){const state=kind==='live'?liveConfigState:ballConfigState;if(state){fillForm($(kind==='live'?'#liveConfigForm':'#ballConfigForm'),state.defaults);configMessage(kind==='live'?'#liveConfigMessage':'#ballConfigMessage','ใส่ค่าดีฟอลท์ในฟอร์มแล้ว · ยังไม่บันทึก')}}else submitConfig(kind,action)}));

async function loadMemberData(){
  await Promise.allSettled([
    requestJson(memberUrl('/member-profile')).then(renderProfile),
    requestJson(memberUrl('/member-ball-teng-results')).then(renderBallTeng),
    requestJson(memberUrl('/member-live-status')).then(renderLive),
    requestJson(memberUrl('/member-stats')).then(renderStats),
    requestJson(memberUrl('/member-notifications')).then(renderNotifications),
    requestJson(`${WORKER}/auto-scan-status`).then(setInfraHealth)
  ]);
}

loadMemberData();
loadConfigs();
window.setInterval(loadMemberData,30000);
