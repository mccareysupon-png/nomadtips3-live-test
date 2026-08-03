const MANUAL_SET_2_STANDARD = Object.freeze({
  name: 'Manual Set 2 Standard',
  minimumOdds: 1.70,
  minimumConfidence: 55,
  recentGames: 5,
  maximumMatches: null,
  includeAllPassing: true,
  enabledChecks: Object.freeze({
    recentForm: true,
    homeAwayForm: true,
    standings: true,
    goalsForAgainst: true,
    h2h: true,
    commonOpponents: true,
    injuriesSuspensions: true,
    fatigue: true,
    motivation: true
  })
});

const TERMINAL_VOID_STATUSES = new Set(['POSTPONED', 'CANCELLED', 'ABANDONED']);
const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
const initialState = { mode:'DRAFT', ruleVersions:[], candidates:[], reviewItems:[], publishedPicks:[], auditLog:[], analysisRun:null, updatedAt:null };
const allChecksPass = { recentForm:true, homeAwayForm:true, standings:true, goalsForAgainst:true, h2h:true, commonOpponents:true, injuriesSuspensions:true, fatigue:true, motivation:true };
const TEST_CANDIDATES = [
  { fixtureId:'TEST-1001', date:'2026-08-10', league:'Test League A', home:'Test Home Alpha', away:'Test Away Alpha', kickoffUtc:'2026-08-10T12:00:00.000Z', pick:'HOME', odds:1.82, confidence:63, predictedScore:'2-0', reason:'Synthetic fixture used only to validate the Manual Set 2 workflow.', abcResult:'PASS', source:'TEST FIXTURE', status:'DRAFT', apiCoverage:false, checks:{...allChecksPass} },
  { fixtureId:'TEST-1002', date:'2026-08-10', league:'Test League B', home:'Test Home Beta', away:'Test Away Beta', kickoffUtc:'2026-08-10T15:00:00.000Z', pick:'AWAY', odds:1.76, confidence:57, predictedScore:'0-1', reason:'Synthetic fixture verifies that missing API coverage is not a selection filter.', abcResult:'PASS', source:'TEST FIXTURE', status:'DRAFT', apiCoverage:false, checks:{...allChecksPass} },
  { fixtureId:'TEST-1003', date:'2026-08-10', league:'Test League A', home:'Test Home Gamma', away:'Test Away Gamma', kickoffUtc:'2026-08-10T18:00:00.000Z', pick:'DRAW', odds:1.68, confidence:61, predictedScore:'1-1', reason:'Synthetic rejection case for odds below 1.70.', abcResult:'PASS', source:'TEST FIXTURE', status:'DRAFT', apiCoverage:true, checks:{...allChecksPass} },
  { fixtureId:'TEST-1004', date:'2026-08-11', league:'Test League C', home:'Test Home Delta', away:'Test Away Delta', kickoffUtc:'2026-08-11T12:30:00.000Z', pick:'HOME', odds:1.91, confidence:54, predictedScore:'2-1', reason:'Synthetic rejection case for confidence below 55%.', abcResult:'PASS', source:'TEST FIXTURE', status:'DRAFT', apiCoverage:true, checks:{...allChecksPass} },
  { fixtureId:'TEST-1005', date:'2026-08-11', league:'Test League C', home:'Test Home Epsilon', away:'Test Away Epsilon', kickoffUtc:'2026-08-11T16:00:00.000Z', pick:'AWAY', odds:2.05, confidence:59, predictedScore:'1-2', reason:'Synthetic rejection case for a failed fatigue check.', abcResult:'PASS', source:'TEST FIXTURE', status:'DRAFT', apiCoverage:true, checks:{...allChecksPass,fatigue:false} }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const ownerContext = new URLSearchParams(location.search).get('draft-owner') === '1' ? { authenticated:true, role:'owner', displayName:'Draft Owner' } : null;
let state = loadState();
let running = false;

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function newId(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function loadState(){ try{ const stored=localStorage.getItem(STORAGE_KEY); return stored ? {...clone(initialState),...JSON.parse(stored)} : clone(initialState); }catch{return clone(initialState);} }
function saveState(next){ const value={...next,updatedAt:new Date().toISOString()}; localStorage.setItem(STORAGE_KEY,JSON.stringify(value)); return value; }
function resetState(){ localStorage.removeItem(STORAGE_KEY); return clone(initialState); }
function appendAudit(current,event){ return {...current,auditLog:[{id:newId(),createdAt:new Date().toISOString(),actor:'draft-owner',...event},...current.auditLog]}; }
function escapeHtml(value){ return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
function formatLocal(iso){ if(!iso)return '—'; return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)); }

function createRuleVersion(input={},now=new Date()){
  const enabledChecks={...MANUAL_SET_2_STANDARD.enabledChecks,...(input.enabledChecks??{})};
  const isCustom=Number(input.minimumOdds??1.70)!==1.70||Number(input.minimumConfidence??55)!==55||Number(input.recentGames??5)!==5||input.maximumMatches!=null||Object.values(enabledChecks).some(v=>v===false)||Boolean(input.includeLeagues?.length)||Boolean(input.excludeLeagues?.length)||Boolean(input.startAt)||Boolean(input.endAt);
  return { id:`rule-${now.toISOString()}`, name:isCustom?'Manual Set 2 — Custom Version':MANUAL_SET_2_STANDARD.name, createdAt:now.toISOString(), minimumOdds:Number(input.minimumOdds??1.70), minimumConfidence:Number(input.minimumConfidence??55), recentGames:Number(input.recentGames??5), maximumMatches:input.maximumMatches==null||input.maximumMatches===''?null:Number(input.maximumMatches), includeAllPassing:input.maximumMatches==null||input.maximumMatches==='', includeLeagues:input.includeLeagues??[], excludeLeagues:input.excludeLeagues??[], startAt:input.startAt||null, endAt:input.endAt||null, enabledChecks };
}
function evaluateCandidate(candidate,rules){
  const failures=[];
  if(Number(candidate.odds)<Number(rules.minimumOdds))failures.push('ODDS_BELOW_MINIMUM');
  if(Number(candidate.confidence)<Number(rules.minimumConfidence))failures.push('CONFIDENCE_BELOW_MINIMUM');
  if(rules.includeLeagues?.length&&!rules.includeLeagues.includes(candidate.league))failures.push('LEAGUE_NOT_INCLUDED');
  if(rules.excludeLeagues?.includes(candidate.league))failures.push('LEAGUE_EXCLUDED');
  const kickoff=new Date(candidate.kickoffUtc).getTime();
  if(rules.startAt&&kickoff<new Date(rules.startAt).getTime())failures.push('BEFORE_TIME_WINDOW');
  if(rules.endAt&&kickoff>new Date(rules.endAt).getTime())failures.push('AFTER_TIME_WINDOW');
  for(const [key,enabled] of Object.entries(rules.enabledChecks??{})){ if(enabled&&candidate.checks?.[key]!==true)failures.push(`CHECK_FAILED:${key}`); }
  return {...candidate,passed:failures.length===0,failures,apiCoverage:candidate.apiCoverage??'unknown'};
}
function selectCandidates(candidates,rules){ const evaluated=candidates.map(c=>evaluateCandidate(c,rules)); const passing=evaluated.filter(c=>c.passed); const maximum=rules.maximumMatches==null?null:Math.max(0,Number(rules.maximumMatches)); return {evaluated,selected:maximum==null?passing:passing.slice(0,maximum)}; }
function settle1X2(pick,result){ const status=String(result?.status??'').toUpperCase(); if(TERMINAL_VOID_STATUSES.has(status))return 'void'; if(status!=='FT'&&status!=='FULL_TIME')return 'pending'; const home=Number(result.homeScore),away=Number(result.awayScore); if(!Number.isFinite(home)||!Number.isFinite(away))return 'pending'; const actual=home>away?'HOME':home<away?'AWAY':'DRAW'; return actual===String(pick).toUpperCase()?'correct':'incorrect'; }
function buildSummary(records){ const s={total:records.length,apiFound:0,manualRequired:0,confirmed:0,waiting:0,correct:0,incorrect:0,void:0,settled:0,accuracy:0}; for(const r of records){if(r.resultSource==='API')s.apiFound++;if(r.status==='MANUAL_RESULT_REQUIRED')s.manualRequired++;if(r.resultConfirmed)s.confirmed++;else s.waiting++;if(r.outcome==='correct')s.correct++;if(r.outcome==='incorrect')s.incorrect++;if(r.outcome==='void')s.void++;} s.settled=s.correct+s.incorrect;s.accuracy=s.settled?Number(((s.correct/s.settled)*100).toFixed(2)):0;return s; }
function activeRule(){ return state.ruleVersions[0]??createRuleVersion(); }
function setBusy(busy,label=''){ running=busy;document.body.classList.toggle('is-busy',busy);$('#progressText').textContent=label||(busy?'Working…':'Ready');$('#progressBar').style.width=busy?'72%':'0%';$$('button[data-action]').forEach(b=>b.disabled=busy); }
function toast(message,tone='info'){const node=$('#toast');node.textContent=message;node.dataset.tone=tone;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2800);}
function persist(next){ state=saveState(next);render(); }

function renderSummary(){const s=buildSummary(state.publishedPicks);const values={totalToday:s.total,apiFound:s.apiFound,manualRequired:s.manualRequired,confirmed:s.confirmed,waiting:s.waiting,accuracy:`${s.accuracy.toFixed(2)}%`};for(const [id,value] of Object.entries(values))$(`#${id}`).textContent=value;}
function renderReview(){const tbody=$('#reviewRows');if(!state.reviewItems.length){tbody.innerHTML='<tr><td colspan="10" class="empty-cell">No analysis results in Draft Mode.</td></tr>';return;}tbody.innerHTML=state.reviewItems.map((item,index)=>`<tr class="${item.passed?'':'failed'}"><td><input type="checkbox" data-include="${index}" ${item.include&&item.passed?'checked':''} ${item.passed?'':'disabled'}></td><td>${escapeHtml(item.league)}</td><td><strong>${escapeHtml(item.home)}</strong><small>${escapeHtml(item.away)}</small></td><td>${formatLocal(item.kickoffUtc)}</td><td><select data-field="pick" data-index="${index}" ${item.passed?'':'disabled'}><option ${item.pick==='HOME'?'selected':''}>HOME</option><option ${item.pick==='DRAW'?'selected':''}>DRAW</option><option ${item.pick==='AWAY'?'selected':''}>AWAY</option></select></td><td><input data-field="odds" data-index="${index}" type="number" min="1" step="0.01" value="${item.odds}" ${item.passed?'':'disabled'}></td><td><input data-field="confidence" data-index="${index}" type="number" min="0" max="100" value="${item.confidence}" ${item.passed?'':'disabled'}></td><td><input data-field="predictedScore" data-index="${index}" value="${escapeHtml(item.predictedScore)}" ${item.passed?'':'disabled'}></td><td><span class="pill ${item.passed?'pass':'fail'}">${item.passed?'PASS':'NOT PASSED'}</span></td><td><details><summary>Details</summary><p>${escapeHtml(item.reason)}</p><p><b>A–B–C:</b> ${escapeHtml(item.abcResult)}</p><p><b>Source:</b> ${escapeHtml(item.source)}</p>${item.failures.length?`<p><b>Failed:</b> ${escapeHtml(item.failures.join(', '))}</p>`:''}</details></td></tr>`).join('');}
function renderResults(){const c=$('#resultList');if(!state.publishedPicks.length){c.innerHTML='<div class="empty-state">No locked Draft picks.</div>';return;}c.innerHTML=state.publishedPicks.map((pick,index)=>`<article class="result-card"><header><div><small>${escapeHtml(pick.league)}</small><strong>${escapeHtml(pick.home)} vs ${escapeHtml(pick.away)}</strong></div><span class="pill">${escapeHtml(pick.status)}</span></header><div class="result-grid"><label>Home score<input type="number" min="0" data-result-field="homeScore" value="${pick.homeScore??''}"></label><label>Away score<input type="number" min="0" data-result-field="awayScore" value="${pick.awayScore??''}"></label><label>Match status<select data-result-field="matchStatus"><option value="FT">Full Time</option><option value="POSTPONED">Postponed</option><option value="CANCELLED">Cancelled</option><option value="ABANDONED">Abandoned</option></select></label><label>Verification source<input data-result-field="verificationSource" placeholder="Link or source" value="${escapeHtml(pick.verificationSource??'')}"></label><label class="wide">Note<textarea data-result-field="note">${escapeHtml(pick.note??'')}</textarea></label></div><footer><span>Pick: ${escapeHtml(pick.pick)} · Odds ${pick.odds} · ${pick.confidence}%</span><div class="result-actions"><button class="ghost" data-unlock-pick="${index}">Unlock Pick</button><button data-confirm-result="${index}">${pick.resultConfirmed?'Edit Confirmed Result':'Confirm Manual Result'}</button></div></footer></article>`).join('');}
function renderAudit(){$('#auditRows').innerHTML=state.auditLog.length?state.auditLog.map(e=>`<tr><td>${formatLocal(e.createdAt)}</td><td>${escapeHtml(e.actor)}</td><td>${escapeHtml(e.action)}</td><td>${escapeHtml(e.entity??'—')}</td><td><pre>${escapeHtml(JSON.stringify(e.details??{},null,2))}</pre></td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">No audit events.</td></tr>';}
function render(){$('#modeBadge').textContent=`${state.mode} MODE`;$('#ruleName').textContent=activeRule().name;$('#ruleVersion').textContent=activeRule().id;$('#updatedAt').textContent=state.updatedAt?formatLocal(state.updatedAt):'Not saved';renderSummary();renderReview();renderResults();renderAudit();}

async function runAnalysis(ruleInput){if(running)return;setBusy(true,'Loading test fixtures and validating rules…');await new Promise(r=>setTimeout(r,350));const rule=createRuleVersion(ruleInput);const {evaluated,selected}=selectCandidates(TEST_CANDIDATES,rule);const reviewItems=evaluated.map(item=>({...item,include:item.passed&&selected.some(s=>s.fixtureId===item.fixtureId)}));let next={...state,ruleVersions:[rule,...state.ruleVersions],candidates:evaluated,reviewItems,analysisRun:{id:newId(),status:'COMPLETED',ruleVersionId:rule.id,createdAt:new Date().toISOString()}};next=appendAudit(next,{action:'ANALYSIS_COMPLETED',entity:next.analysisRun.id,details:{ruleVersionId:rule.id,candidates:evaluated.length,passed:selected.length,productionWrite:false}});persist(next);setBusy(false,'Ready');toast(`${selected.length} synthetic test fixtures passed. Nothing was published.`,'success');}
function readCustomRules(){const enabledChecks={};$$('[data-rule-check]').forEach(i=>enabledChecks[i.dataset.ruleCheck]=i.checked);return{minimumOdds:$('#minimumOdds').value,minimumConfidence:$('#minimumConfidence').value,recentGames:$('#recentGames').value,maximumMatches:$('#maximumMatches').value,includeLeagues:$('#includeLeagues').value.split(',').map(v=>v.trim()).filter(Boolean),excludeLeagues:$('#excludeLeagues').value.split(',').map(v=>v.trim()).filter(Boolean),startAt:$('#startAt').value?new Date($('#startAt').value).toISOString():null,endAt:$('#endAt').value?new Date($('#endAt').value).toISOString():null,enabledChecks};}
function lockDraftPicks(){const included=state.reviewItems.filter(i=>i.include&&i.passed);if(!included.length)return toast('Select at least one passing fixture.','error');const existing=new Set(state.publishedPicks.map(p=>p.fixtureId));if(included.some(i=>existing.has(i.fixtureId)))return toast('Duplicate Draft pick prevented.','error');if(!confirm(`Lock ${included.length} Draft picks? This does not update the live website.`))return;const now=new Date().toISOString();const newPicks=included.map(item=>({...item,ruleVersionId:activeRule().id,lockedAt:now,status:'WAITING_FOR_RESULT',resultSource:null,resultConfirmed:false,outcome:'pending'}));let next={...state,publishedPicks:[...state.publishedPicks,...newPicks]};next=appendAudit(next,{action:'DRAFT_LOCK',entity:'draft-picks',details:{count:newPicks.length,liveWebsiteUpdated:false}});persist(next);toast('Draft picks locked. Live website remains unchanged.','success');}
function unlockDraftPick(index){const pick=state.publishedPicks[index];const reason=prompt('Reason for unlocking this pick:')?.trim();if(!reason)return toast('Unlock reason is required.','error');if(!confirm(`Unlock ${pick.home} vs ${pick.away}?`))return;const publishedPicks=state.publishedPicks.filter((_,i)=>i!==index);const reviewItems=state.reviewItems.map(item=>item.fixtureId===pick.fixtureId?{...item,include:true,pick:pick.pick,odds:pick.odds,confidence:pick.confidence,predictedScore:pick.predictedScore}:item);let next={...state,publishedPicks,reviewItems};next=appendAudit(next,{action:'PICK_UNLOCKED',entity:pick.fixtureId,details:{reason,oldValue:pick,newValue:{status:'DRAFT_REVIEW'}}});persist(next);toast('Pick unlocked and returned to review.','success');}
function confirmManualResult(index){const pick=state.publishedPicks[index];const card=$(`[data-confirm-result="${index}"]`).closest('.result-card');const read=field=>card.querySelector(`[data-result-field="${field}"]`).value;const incoming={source:'manual',status:read('matchStatus'),homeScore:read('homeScore')===''?null:Number(read('homeScore')),awayScore:read('awayScore')===''?null:Number(read('awayScore')),verificationSource:read('verificationSource'),note:read('note'),confirmedAt:new Date().toISOString()};if(!incoming.verificationSource.trim())return toast('Verification source is required.','error');const editReason=pick.resultConfirmed?prompt('Reason for editing the confirmed result:')?.trim():null;if(pick.resultConfirmed&&!editReason)return toast('Edit reason is required.','error');if(!confirm(`Confirm ${pick.home} ${incoming.homeScore??'—'}–${incoming.awayScore??'—'} ${pick.away} as ${incoming.status}?`))return;const outcome=settle1X2(pick.pick,incoming);const updated={...pick,result:incoming,homeScore:incoming.homeScore,awayScore:incoming.awayScore,verificationSource:incoming.verificationSource,note:incoming.note,resultSource:'MANUAL',resultConfirmed:outcome!=='pending',outcome,status:outcome==='pending'?'WAITING_FOR_RESULT':'RESULT_CONFIRMED',updatedAt:new Date().toISOString()};const picks=[...state.publishedPicks];picks[index]=updated;let next={...state,publishedPicks:picks};next=appendAudit(next,{action:'MANUAL_RESULT_CONFIRMED',entity:pick.fixtureId,details:{reason:editReason,oldValue:pick.result??null,newValue:incoming,outcome}});persist(next);toast(`Result confirmed as ${outcome.toUpperCase()}.`,'success');}

function bindEvents(){
  $('[data-action="standard-analysis"]').addEventListener('click',()=>runAnalysis(MANUAL_SET_2_STANDARD));
  $('[data-action="custom-analysis"]').addEventListener('click',()=>runAnalysis(readCustomRules()));
  $('[data-action="review"]').addEventListener('click',()=>$('#review').scrollIntoView({behavior:'smooth'}));
  $('[data-action="publish"]').addEventListener('click',lockDraftPicks);
  $('[data-action="results"]').addEventListener('click',()=>$('#manual-results').scrollIntoView({behavior:'smooth'}));
  $('[data-action="audit"]').addEventListener('click',()=>$('#audit').scrollIntoView({behavior:'smooth'}));
  $('[data-action="reset"]').addEventListener('click',()=>{if(!confirm('Reset all Draft Mode data?'))return;state=resetState();render();toast('Draft Mode reset to Manual Set 2 Standard.','success');});
  $('[data-action="open-custom"]').addEventListener('click',()=>$('#customPanel').classList.toggle('open'));
  $('#reviewRows').addEventListener('input',event=>{const index=Number(event.target.dataset.index??event.target.dataset.include);if(!Number.isInteger(index))return;const reviewItems=[...state.reviewItems];if(event.target.dataset.include!=null)reviewItems[index]={...reviewItems[index],include:event.target.checked};if(event.target.dataset.field)reviewItems[index]={...reviewItems[index],[event.target.dataset.field]:event.target.type==='number'?Number(event.target.value):event.target.value};state=saveState({...state,reviewItems});});
  $('#resultList').addEventListener('click',event=>{if(event.target.dataset.confirmResult!=null)confirmManualResult(Number(event.target.dataset.confirmResult));if(event.target.dataset.unlockPick!=null)unlockDraftPick(Number(event.target.dataset.unlockPick));});
}
function boot(){if(!ownerContext?.authenticated||ownerContext.role!=='owner'){$('#accessDenied').hidden=false;$('#app').hidden=true;return;}$('#ownerName').textContent=ownerContext.displayName;$('#accessDenied').hidden=true;$('#app').hidden=false;bindEvents();render();}
boot();
