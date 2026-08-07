import { loadCumulativeRecords } from '../stats/cumulative.js?v=202608061015';

const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value){
  return String(value ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function number(value){const n=Number(value);return Number.isFinite(n)?n:null}
function odds(value){const n=number(value);return n&&n>0?n.toFixed(2):'N/A'}
function dateTime(value){
  if(!value)return '—';
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return '—';
  return new Intl.DateTimeFormat('th-TH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
}
async function getJson(url){
  const response=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload)throw new Error(payload?.error||`HTTP ${response.status}`);
  return payload;
}
function openTab(name){
  $$('.tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
  $$('.view').forEach(view=>view.classList.toggle('active',view.dataset.view===name));
  if(history.replaceState)history.replaceState(null,'',`#${name}`);
}
$$('.tab').forEach(button=>button.addEventListener('click',()=>openTab(button.dataset.tab)));
const initialTab=location.hash.replace('#','');
if(['overview','ball-teng','live','stats','notifications'].includes(initialTab))openTab(initialTab);

function renderBallTeng(payload){
  const matches=Array.isArray(payload?.matches)?payload.matches:[];
  const avg=matches.length?matches.reduce((sum,m)=>sum+(number(m.confidence)||0),0)/matches.length:0;
  $('#metricPicks').textContent=matches.length;
  $('#metricConfidence').textContent=matches.length?`${avg.toFixed(1)}%`:'—';
  $('#overviewPicksState').textContent=matches.length?`${matches.length} selections · avg ${avg.toFixed(1)}%`:'ยังไม่มีชุดปัจจุบัน';
  $('#ballTengMeta').textContent=`${payload?.selection_date||'—'} · ${matches.length} selections · ${payload?.environment||'TEST'}`;
  if(!matches.length){$('#ballTengGrid').innerHTML='<div class="empty">ยังไม่มีบอลเต็งในชุดปัจจุบัน</div>';return}
  $('#ballTengGrid').innerHTML=matches.map((m,index)=>{
    const btts=m.markets?.btts||{},dc=m.markets?.doubleChance||{},ah=m.markets?.asianHandicap||{};
    return `<article class="pick-card">
      <div class="card-top"><div class="league">#${String(index+1).padStart(2,'0')} · ${escapeHtml(m.country)} · ${escapeHtml(m.league)}<br>${escapeHtml(dateTime(m.kickoff_utc))}</div><div class="confidence">${escapeHtml(m.confidence??'—')}%</div></div>
      <div class="match">${escapeHtml(m.home)} <span style="color:#89918c">vs</span> ${escapeHtml(m.away)}</div>
      <div class="pick">Main Pick · <b>${escapeHtml(m.pick)}</b></div>
      <div class="details"><div><small>1X2 Odds</small><strong>${odds(m.odds)}</strong></div><div><small>BTTS</small><strong>${escapeHtml(btts.pick||'N/A')} · ${odds(btts.odds)}</strong></div><div><small>Double Chance</small><strong>${escapeHtml(dc.code||dc.pick||'N/A')} · ${odds(dc.odds)}</strong></div><div><small>Asian Handicap</small><strong>${escapeHtml(ah.pick||'N/A')} · ${odds(ah.odds)}</strong></div></div>
    </article>`;
  }).join('');
}

function renderLive(payload){
  const active=Array.isArray(payload?.active)?payload.active:[];
  const triggered=active.filter(item=>Number(item.triggered)===1);
  const counts=payload?.counts||{};
  const candidates=number(counts.serverCandidates)??active.length;
  const signals=number(counts.triggered)??triggered.length;
  $('#metricLive').textContent=candidates;
  $('#metricSignals').textContent=signals;
  $('#overviewWorkerDot').className=`dot ${payload.online?'good':'bad'}`;
  $('#overviewWorkerText').textContent=payload.online?`Worker online · ${dateTime(payload.generatedAt)}`:`Worker offline / stale · ${dateTime(payload.generatedAt)}`;
  $('#overviewLiveState').textContent=payload.online?`${candidates} active candidate(s)`:'Scanner unavailable';
  $('#overviewNotifyState').textContent=`${signals} triggered signal(s)`;
  $('#liveOnline').textContent=payload.online?'ONLINE':'OFFLINE';
  $('#liveOnline').className=payload.online?'good-text':'bad-text';
  $('#liveGenerated').textContent=`ล่าสุด ${dateTime(payload.generatedAt)}`;
  $('#liveCandidateCount').textContent=candidates;
  $('#livePassing').textContent=number(counts.passing)??0;
  $('#liveTriggered').textContent=signals;
  $('#liveMeta').textContent=`Momentum ≥ ${payload.config?.momentumMin??'—'}% · Confirm ${payload.config?.confirmationRounds??'—'} rounds · Member #0001`;
  $('#notifyScanner').textContent=payload.online?'ONLINE':'OFFLINE';
  $('#notifyScanner').className=payload.online?'good-text':'bad-text';
  $('#notifyCount').textContent=triggered.length;
  $('#notifyMeta').textContent=`${triggered.length} triggered state(s) จากสถานะล่าสุด`;

  if(!active.length){$('#liveGrid').innerHTML='<div class="empty">ตอนนี้ยังไม่มีคู่ที่อยู่ใน Active Candidate State</div>'}
  else $('#liveGrid').innerHTML=active.map(item=>{
    const mom=number(item.last_home_percent),isTriggered=Number(item.triggered)===1;
    return `<article class="live-card ${isTriggered?'triggered':''}">
      <div class="card-top"><div class="league">Fixture ${escapeHtml(item.fixture_id)} · ${escapeHtml(item.selected_side||'SIDE')}<br>Minute ${escapeHtml(item.last_minute??'—')}</div><div class="confidence">Streak ${escapeHtml(item.streak??0)}</div></div>
      <div class="match">${escapeHtml(item.home)} <span style="color:#89918c">vs</span> ${escapeHtml(item.away)}</div>
      <div class="momentum">${mom===null?'—':Math.round(mom)}<small>% momentum</small></div>
      <div class="live-meta"><span>Score ${escapeHtml(item.home_score??0)}–${escapeHtml(item.away_score??0)}</span><span>Config v${escapeHtml(item.config_version??'—')}</span><span class="${isTriggered?'signal':''}">${isTriggered?'SIGNAL TRIGGERED':'MONITORING'}</span></div>
    </article>`;
  }).join('');

  if(!triggered.length)$('#noticeList').innerHTML='<div class="empty">ยังไม่มี Signal ที่ Trigger สำหรับ Member #0001 ใน Active State ล่าสุด</div>';
  else $('#noticeList').innerHTML=triggered.map(item=>`<article class="notice-card"><div class="notice-mark"></div><div><h3>Live Signal · ${escapeHtml(item.home)} vs ${escapeHtml(item.away)}</h3><p>Member #0001 · นาที ${escapeHtml(item.last_minute)} · Momentum ${escapeHtml(Math.round(number(item.last_home_percent)||0))}% · Streak ${escapeHtml(item.streak)} · Score ${escapeHtml(item.home_score)}–${escapeHtml(item.away_score)}</p></div><div class="notice-time">${escapeHtml(dateTime(item.updated_at))}</div></article>`).join('');
}

function outcome(record){return String(record?.outcome||record?.result||'pending').toLowerCase()}
function renderStats(){
  const all=loadCumulativeRecords();
  const records=all.filter(record=>!record.memberId||String(record.memberId).padStart(4,'0')===MEMBER_ID);
  const settled=records.filter(r=>['correct','incorrect','void'].includes(outcome(r)));
  const correct=settled.filter(r=>outcome(r)==='correct').length;
  const incorrect=settled.filter(r=>outcome(r)==='incorrect').length;
  const decisions=correct+incorrect,accuracy=decisions?(correct/decisions)*100:0;
  $('#statTotal').textContent=records.length;$('#statSettled').textContent=settled.length;$('#statCorrect').textContent=correct;$('#statIncorrect').textContent=incorrect;$('#statAccuracy').textContent=decisions?`${accuracy.toFixed(2)}%`:'—';
  $('#statsMeta').textContent=`${records.length} personal record(s) · Member namespace ${MEMBER_ID}`;
  $('#overviewStatsState').textContent=decisions?`${accuracy.toFixed(2)}% · ${decisions} decisions`:`${records.length} records · waiting`;
  const recent=[...records].sort((a,b)=>new Date(b.kickoffUtc??b.pickDate??0)-new Date(a.kickoffUtc??a.pickDate??0)).slice(0,12);
  if(!recent.length){$('#historyTable').innerHTML='<div class="empty">ยังไม่มีประวัติสำหรับ Member #0001</div>';return}
  $('#historyTable').innerHTML=`<div class="history-row head"><span>Date</span><span>Match</span><span>Pick</span><span>Odds</span><span>Result</span></div>${recent.map(r=>{const result=outcome(r),cls=['correct','incorrect'].includes(result)?result:'pending',match=`${r.home??r.homeTeam??'—'} vs ${r.away??r.awayTeam??'—'}`;return `<div class="history-row"><span>${escapeHtml(dateTime(r.kickoffUtc??r.pickDate))}</span><b>${escapeHtml(match)}</b><span>${escapeHtml(r.pickLabel??r.pick??'—')}</span><span>${odds(r.odds)}</span><span class="outcome ${cls}">${escapeHtml(result.toUpperCase())}</span></div>`}).join('')}`;
}

async function loadLineStatus(){
  try{
    const payload=await getJson(`${WORKER}/line-status`);const configured=Boolean(payload.configured??payload.ok);
    $('#lineConfigured').textContent=configured?'LINE · CONNECTED':'LINE · NOT CONFIGURED';
    $('#lineConfigured').className=configured?'good-text':'';
    $('#overviewChannelState').textContent=configured?'LINE connected':'LINE not configured';
  }catch{$('#lineConfigured').textContent='LINE · STATUS UNAVAILABLE';$('#overviewChannelState').textContent='Channel unavailable'}
}

async function loadAll(){
  try{renderBallTeng(await getJson('../../selected-live-matches.json'))}
  catch(error){$('#ballTengGrid').innerHTML=`<div class="empty">โหลดบอลเต็งไม่สำเร็จ · ${escapeHtml(error.message)}</div>`;$('#ballTengMeta').textContent='Data unavailable';$('#overviewPicksState').textContent='Data unavailable'}
  try{renderLive(await getJson(`${WORKER}/auto-scan-status`))}
  catch(error){$('#liveGrid').innerHTML=`<div class="empty">โหลด Worker ไม่สำเร็จ · ${escapeHtml(error.message)}</div>`;$('#noticeList').innerHTML='<div class="empty">ยังอ่านสถานะการแจ้งเตือนไม่ได้</div>';$('#overviewWorkerDot').className='dot bad';$('#overviewWorkerText').textContent='Worker status unavailable';$('#overviewLiveState').textContent='Scanner unavailable'}
  try{renderStats()}catch(error){$('#historyTable').innerHTML=`<div class="empty">โหลดสถิติไม่สำเร็จ · ${escapeHtml(error.message)}</div>`;$('#overviewStatsState').textContent='Statistics unavailable'}
  loadLineStatus();
}

loadAll();
window.setInterval(async()=>{try{renderLive(await getJson(`${WORKER}/auto-scan-status`))}catch{}},30000);
