const FALLBACK_WORKER='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
const OWNER_KEY_STORAGE='nomadtips3_car31_owner_key_session';
const DEFAULT={
  bookmakerCompanyId:8,side:'HOME',minuteMin:60,minuteMax:80,market:'WIN',oddsMin:1.70,oddsMax:null,
  ahMin:.25,ahMax:null,ouDirection:'OVER',ouLine:2.5,momentumMin:60,confirmationRounds:2,
  attackEvidenceEnabled:true,attackEvidenceDangerousAttacksEnabled:true,attackEvidenceDangerousAttacksMin:1,
  attackEvidenceShotsEnabled:true,attackEvidenceShotsMin:1,attackEvidenceShotsOnTargetEnabled:true,attackEvidenceShotsOnTargetMin:1,
  attackEvidenceCornersEnabled:true,attackEvidenceCornersMin:1,attackEvidenceRequirement:'1',goalGapLimited:false,maxGoalGap:1,
  signalLimitEnabled:false,maxSignalsPerDay:10,matchConfidenceMin:85,requireCoreStats:true,redCardPolicy:'ALLOW',
  momentumWeights:{attacks:.16,dangerous_attacks:.52,shots:2,shots_on_target:4,corners:1.25,possession:.07}
};
const BOOLS=['attackEvidenceEnabled','attackEvidenceDangerousAttacksEnabled','attackEvidenceShotsEnabled','attackEvidenceShotsOnTargetEnabled','attackEvidenceCornersEnabled','goalGapLimited','signalLimitEnabled','requireCoreStats'];
const NUMBERS=['bookmakerCompanyId','minuteMin','minuteMax','oddsMin','oddsMax','ahMin','ahMax','ouLine','momentumMin','confirmationRounds','attackEvidenceDangerousAttacksMin','attackEvidenceShotsMin','attackEvidenceShotsOnTargetMin','attackEvidenceCornersMin','maxGoalGap','maxSignalsPerDay','matchConfidenceMin'];
const WEIGHTS={w_attacks:'attacks',w_dangerous_attacks:'dangerous_attacks',w_shots:'shots',w_shots_on_target:'shots_on_target',w_corners:'corners',w_possession:'possession'};
const ACTIVE_KEYS=['bookmakerCompanyId','side','minuteMin','minuteMax','market','oddsMin','oddsMax','ahMin','ahMax','ouDirection','ouLine','momentumMin','confirmationRounds','attackEvidenceEnabled','attackEvidenceDangerousAttacksEnabled','attackEvidenceDangerousAttacksMin','attackEvidenceShotsEnabled','attackEvidenceShotsMin','attackEvidenceShotsOnTargetEnabled','attackEvidenceShotsOnTargetMin','attackEvidenceCornersEnabled','attackEvidenceCornersMin','attackEvidenceRequirement','goalGapLimited','maxGoalGap','signalLimitEnabled','maxSignalsPerDay','matchConfidenceMin','requireCoreStats','redCardPolicy'];
const $=selector=>document.querySelector(selector);
const form=$('#settingsForm');
let workerUrl=FALLBACK_WORKER;
let cfg=structuredClone(DEFAULT);
let busy=false;

function n(value){if(value===null||value===undefined||value==='')return null;const x=Number(value);return Number.isFinite(x)?x:null;}
function setValue(name,value){const el=form.elements[name];if(!el)return;if(el.type==='checkbox')el.checked=Boolean(value);else el.value=value??'';}
function field(name){return form.elements[name];}
function bookLabel(v){return Number(v)===50?'1xBet · Goaloo company 50':'Bet365 · Goaloo company 8';}
function sideLabel(v){return v==='AWAY'?'ทีมเยือน':v==='BOTH'?'ทั้งสองฝั่ง · Momentum เลือก':'เจ้าบ้าน';}
function ahText(v){const x=Number(v),abs=Math.abs(x),sign=x>0?'+':x<0?'-':'';const q=Math.round((abs-Math.floor(abs))*100);let th='';if(abs===0)th='เสมอ';else if(q===25)th=`${Math.floor(abs)||''}${Math.floor(abs)?' ':''}ปป.`;else if(q===50)th=`${Math.floor(abs)||''}${Math.floor(abs)?' ':''}ครึ่งลูก`;else if(q===75)th=`${Math.floor(abs)||''}${Math.floor(abs)?' ':''}ครึ่งควบลูก`;else th=`${abs.toFixed(2)} ลูก`;return `${sign}${abs.toFixed(2)} · ${x<0?'ต่อ ':x>0?'รอง ':''}${th}`;}
function buildAh(){const min=$('#ahMin'),max=$('#ahMax');min.innerHTML='';max.innerHTML='<option value="">ไม่จำกัด</option>';for(let q=-20;q<=20;q++){const v=q/4,label=ahText(v);for(const el of [min,max]){const o=document.createElement('option');o.value=String(v);o.textContent=label;el.appendChild(o);}}}
function mergeConfig(input){return {...structuredClone(DEFAULT),...(input||{}),momentumWeights:{...DEFAULT.momentumWeights,...(input?.momentumWeights||{})}};}
function fill(input){cfg=mergeConfig(input);for(const key of NUMBERS)setValue(key,cfg[key]);for(const key of BOOLS)setValue(key,cfg[key]);for(const key of ['side','market','ouDirection','attackEvidenceRequirement','redCardPolicy'])setValue(key,cfg[key]);for(const [inputName,key] of Object.entries(WEIGHTS))setValue(inputName,cfg.momentumWeights[key]);render();}
function body(){const out={...cfg,momentumWeights:{...cfg.momentumWeights}};for(const key of NUMBERS)out[key]=n(field(key)?.value);for(const key of BOOLS)out[key]=Boolean(field(key)?.checked);for(const key of ['side','market','ouDirection','attackEvidenceRequirement','redCardPolicy'])out[key]=field(key)?.value;for(const [inputName,key] of Object.entries(WEIGHTS))out.momentumWeights[key]=n(field(inputName)?.value)??DEFAULT.momentumWeights[key];return out;}
function evidenceEnabled(b){return [
  ['Dangerous Attacks',b.attackEvidenceDangerousAttacksEnabled,b.attackEvidenceDangerousAttacksMin,'dangerous_attacks'],
  ['Shots',b.attackEvidenceShotsEnabled,b.attackEvidenceShotsMin,'shots'],
  ['SOT',b.attackEvidenceShotsOnTargetEnabled,b.attackEvidenceShotsOnTargetMin,'shots_on_target'],
  ['Corners',b.attackEvidenceCornersEnabled,b.attackEvidenceCornersMin,'corners']
].filter(([,on])=>on);}
function validate(b){const errors=[],warnings=[];
  if(![8,50].includes(Number(b.bookmakerCompanyId)))errors.push('Bookmaker ไม่ถูกต้อง');
  if(b.minuteMin===null||b.minuteMax===null||b.minuteMin<1||b.minuteMax>120||b.minuteMin>b.minuteMax)errors.push('ช่วงนาทีไม่ถูกต้อง');
  if(b.oddsMin===null||b.oddsMin<1.01)errors.push('Odds ต่ำสุดต้องไม่น้อยกว่า 1.01');
  if(b.oddsMax!==null&&b.oddsMax<b.oddsMin)errors.push('Odds สูงสุดต้องไม่น้อยกว่า Odds ต่ำสุด');
  if(b.market==='AH'&&b.ahMin===null)errors.push('กรุณาเลือก AH ต่ำสุด');
  if(b.market==='AH'&&b.ahMax!==null&&b.ahMax<b.ahMin)errors.push('AH สูงสุดต้องไม่น้อยกว่า AH ต่ำสุด');
  if(b.market==='OU'&&(b.ouLine===null||b.ouLine<.5||b.ouLine>8.5))errors.push('Goal line ไม่ถูกต้อง');
  if(b.momentumMin===null||b.momentumMin<1||b.momentumMin>99)errors.push('Momentum ต้องอยู่ระหว่าง 1–99%');
  const weightValues=Object.values(b.momentumWeights||{}).map(Number).filter(Number.isFinite);
  if(!weightValues.length||weightValues.every(v=>v===0))errors.push('น้ำหนัก Momentum ห้ามเป็น 0 ทุกตัวพร้อมกัน');
  if(b.attackEvidenceEnabled){const enabled=evidenceEnabled(b),required=b.attackEvidenceRequirement==='ALL'?enabled.length:Number(b.attackEvidenceRequirement);if(enabled.length===0)errors.push('เปิดหลักฐานการบุก แต่ปิดหลักฐานย่อยทั้งหมด');if(required>enabled.length)errors.push(`ตั้งให้ผ่าน ${required} หลักฐาน แต่เปิดไว้เพียง ${enabled.length}`);for(const [label,,minimum,key] of enabled){if(n(minimum)===null||Number(minimum)<1)errors.push(`${label} ต้องเพิ่มอย่างน้อย 1`);if(Number(b.momentumWeights?.[key]??0)===0)warnings.push(`${label} ยังเป็นด่าน Evidence แต่ตั้ง Weight = 0 จึงไม่ช่วยคะแนน Momentum`);}}
  if(b.confirmationRounds===null||b.confirmationRounds<1||b.confirmationRounds>10)errors.push('รอบยืนยันต้องอยู่ระหว่าง 1–10');
  if(b.goalGapLimited&&(b.maxGoalGap===null||b.maxGoalGap<0))errors.push('ผลต่างประตูสูงสุดไม่ถูกต้อง');
  if(b.signalLimitEnabled&&(b.maxSignalsPerDay===null||b.maxSignalsPerDay<1))errors.push('จำนวนสัญญาณต่อวันต้องอย่างน้อย 1');
  if(b.requireCoreStats)warnings.push('Core Stats = ต้องครบ: ด่าน SOURCE จะได้ 100% เสมอ ค่า Match confidence จึงไม่เพิ่มความเข้มในโหมดนี้');
  else if(Number(b.matchConfidenceMin)>70)warnings.push('อนุญาตข้อมูลไม่ครบ แต่ Match confidence > 70% จะยังตัดข้อมูลไม่ครบออกอยู่ดี');
  if(b.side==='BOTH')warnings.push('BOTH = เครื่องจะเลือกฝั่งที่มี Momentum สูงกว่าในรอบนั้น');
  return{errors,warnings};
}
function marketSummary(b){if(b.market==='AH')return `AH ${ahText(b.ahMin)}${b.ahMax===null?' ถึงไม่จำกัด':` ถึง ${ahText(b.ahMax)}`}`;if(b.market==='OU')return `${b.ouDirection} ${b.ouLine}`;return '1X2 · ทีมชนะ';}
function evidenceSummary(b){if(!b.attackEvidenceEnabled)return'ปิด Evidence';const enabled=evidenceEnabled(b).map(([label,,min])=>`${label} +${min}`);return `${enabled.join(' / ')} · ต้องผ่าน ${b.attackEvidenceRequirement==='ALL'?'ทั้งหมด':b.attackEvidenceRequirement+' รายการ'}`;}
function render(){const b=body();const validation=validate(b);const odds=b.oddsMax===null?`≥ ${b.oddsMin}`:`${b.oddsMin}–${b.oddsMax}`;$('#ruleSummary').innerHTML=`<strong>${bookLabel(b.bookmakerCompanyId)}</strong> · <strong>${sideLabel(b.side)}</strong> · นาที ${b.minuteMin}–${b.minuteMax} · <strong>${marketSummary(b)}</strong> · Odds ${odds}<br>Momentum ≥ <strong>${b.momentumMin}%</strong> · ${evidenceSummary(b)} · ยืนยัน <strong>${b.confirmationRounds} รอบติดกัน</strong>${b.goalGapLimited?` · ผลต่างสกอร์ ≤ ${b.maxGoalGap}`:''}${b.signalLimitEnabled?` · สูงสุด ${b.maxSignalsPerDay} สัญญาณ/วัน`:''}`;
  const notes=[...validation.errors.map(x=>`❌ ${x}`),...validation.warnings.map(x=>`⚠ ${x}`)];$('#logicWarnings').innerHTML=notes.length?notes.join('<br>'):'✅ ค่าปัจจุบันสัมพันธ์กัน สามารถส่งเข้าตัวตัดสินได้';$('#logicWarnings').className=`gate-note ${validation.errors.length?'danger-text':validation.warnings.length?'warn-text':'ok-text'}`;
  $('#ahSection').classList.toggle('inactive',b.market!=='AH');$('#ouSection').classList.toggle('inactive',b.market!=='OU');$('#ahPreview').textContent=b.market==='AH'?`ช่วงที่เครื่องยอมรับ: ${ahText(b.ahMin)}${b.ahMax===null?' ถึงไม่จำกัด':` ถึง ${ahText(b.ahMax)}`}`:'ไม่ได้ใช้ในตลาดนี้';
  const confidence=field('matchConfidenceMin');confidence.disabled=Boolean(b.requireCoreStats);$('#confidenceHelp').textContent=b.requireCoreStats?'บังคับข้อมูลครบแล้ว → SOURCE confidence = 100% โดยอัตโนมัติ':'ข้อมูลครบ = 100% · ข้อมูลไม่ครบ = 70%';
  field('maxGoalGap').disabled=!b.goalGapLimited;field('maxSignalsPerDay').disabled=!b.signalLimitEnabled;
  const evidenceOff=!b.attackEvidenceEnabled;for(const name of ['attackEvidenceDangerousAttacksEnabled','attackEvidenceShotsEnabled','attackEvidenceShotsOnTargetEnabled','attackEvidenceCornersEnabled','attackEvidenceRequirement'])field(name).disabled=evidenceOff;for(const [enabledName,minName] of [['attackEvidenceDangerousAttacksEnabled','attackEvidenceDangerousAttacksMin'],['attackEvidenceShotsEnabled','attackEvidenceShotsMin'],['attackEvidenceShotsOnTargetEnabled','attackEvidenceShotsOnTargetMin'],['attackEvidenceCornersEnabled','attackEvidenceCornersMin']])field(minName).disabled=evidenceOff||!field(enabledName).checked;
}
function comparable(input){const x={};for(const key of ACTIVE_KEYS)x[key]=input?.[key]??null;x.momentumWeights={};for(const key of Object.values(WEIGHTS))x.momentumWeights[key]=Number(input?.momentumWeights?.[key]??0);return x;}
function sameConfig(a,b){return JSON.stringify(comparable(a))===JSON.stringify(comparable(b));}
function ownerKey(){return sessionStorage.getItem(OWNER_KEY_STORAGE)||'';}
function setOwnerState(){const has=Boolean(ownerKey());$('#ownerState').textContent=has?'พร้อมบันทึก':'ยังไม่ยืนยัน';$('#ownerState').className=has?'ok-text':'warn-text';}
function result(text,kind='warn'){const box=$('#actionResult');box.textContent=text;box.className=`result ${kind}`;}
function setBusy(on){busy=on;for(const id of ['reloadBtn','saveBtn','runBtn','rememberKey'])$('#'+id).disabled=on;}
async function runtime(){try{const r=await fetch('./runtime.json',{cache:'no-store'});if(r.ok){const d=await r.json();if(d?.workerUrl)workerUrl=d.workerUrl;}}catch{}return workerUrl;}
async function workerGet(path){const r=await fetch(`${workerUrl}${path}${path.includes('?')?'&':'?'}t=${Date.now()}`,{cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok||!d)throw new Error(d?.error||`HTTP ${r.status}`);return d;}
async function health(){try{const h=await workerGet('/health');$('#healthState').textContent=h.ok===false?'ผิดปกติ':'ออนไลน์';$('#healthState').className=h.ok===false?'danger-text':'ok-text';$('#lastCycle').textContent=h.lastCycle?new Date(h.lastCycle).toLocaleString('th-TH'):'ยังไม่มีรอบ';return h;}catch(e){$('#healthState').textContent='ตรวจไม่ได้';$('#healthState').className='danger-text';$('#lastCycle').textContent='—';return null;}}
async function loadConfig(){const d=await workerGet('/config');fill(d.config||DEFAULT);$('#configUpdated').textContent=d.updatedAt?new Date(d.updatedAt).toLocaleString('th-TH'):'ค่าเริ่มต้น';return d;}
async function reload(){if(busy)return;setBusy(true);result('กำลังโหลดค่าที่ Worker เก็บจริง…','warn');try{await runtime();await loadConfig();await health();result('โหลดค่าจาก Worker สำเร็จ · หน้านี้กำลังแสดงค่าที่เครื่องเก็บจริง','good');}catch(e){fill(DEFAULT);await health();result(`โหลด config ไม่สำเร็จ: ${e.message||e}`,'bad');}finally{setBusy(false);}}
async function postConfig(payload,key){const r=await fetch(`${workerUrl}/config`,{method:'POST',headers:{'content-type':'application/json','x-owner-key':key},body:JSON.stringify(payload),cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok||!d?.config)throw new Error(d?.error||`SAVE HTTP ${r.status}`);return d;}
async function scanNow(key){const r=await fetch(`${workerUrl}/scan?t=${Date.now()}`,{method:'POST',headers:{'content-type':'application/json','x-owner-key':key},body:'{}',cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok||d?.ok===false)throw new Error(d?.error||`SCAN HTTP ${r.status}`);return d;}
async function save(runNow=false){if(busy)return;const payload=body(),check=validate(payload);if(check.errors.length){result(`บันทึกไม่ได้: ${check.errors.join(' · ')}`,'bad');return;}const key=ownerKey();if(!key){result('กรุณากรอก Owner key แล้วกด “ใช้คีย์นี้” ก่อนบันทึก','bad');return;}setBusy(true);result(runNow?'กำลังบันทึกค่าใหม่ → อ่านกลับยืนยัน → สั่งสแกนทันที…':'กำลังบันทึกค่าใหม่ → อ่านกลับยืนยันจาก Worker…','warn');try{
  await runtime();const saved=await postConfig(payload,key);const confirmed=await workerGet('/config');if(!sameConfig(saved.config,confirmed.config))throw new Error('CONFIG_READBACK_MISMATCH');fill(confirmed.config);$('#configUpdated').textContent=confirmed.updatedAt?new Date(confirmed.updatedAt).toLocaleString('th-TH'):'ยืนยันแล้ว';
  if(runNow){const scan=await scanNow(key);const matches=Array.isArray(scan.matches)?scan.matches:[];const passed=matches.filter(m=>m?.engine?.decision==='SHADOW SIGNAL').length;const confirming=matches.filter(m=>(m?.engine?.streak||0)>0).length;result(`สำเร็จ · Worker รับค่าและอ่านกลับตรงกัน · สแกนทันทีแล้ว · live ${matches.length} · ผ่านทุก Gate ${passed} · อยู่ระหว่างยืนยัน ${confirming}`,'good');}
  else result('สำเร็จ · Worker รับค่าและอ่านกลับตรงกัน · รอบ Cron ถัดไปจะใช้ค่าชุดนี้จริง','good');await health();
}catch(e){result(`ไม่สำเร็จ: ${e.message||e}`,'bad');}finally{setBusy(false);}}

buildAh();
form.addEventListener('input',render);
$('#rememberKey').addEventListener('click',()=>{const value=$('#ownerKey').value.trim();if(value)sessionStorage.setItem(OWNER_KEY_STORAGE,value);else sessionStorage.removeItem(OWNER_KEY_STORAGE);setOwnerState();result(value?'เก็บ Owner key ไว้ใน session นี้แล้ว':'ล้าง Owner key จาก session แล้ว',value?'good':'warn');});
$('#reloadBtn').addEventListener('click',reload);
$('#saveBtn').addEventListener('click',()=>save(false));
$('#runBtn').addEventListener('click',()=>save(true));
$('#ownerKey').value=ownerKey();setOwnerState();
reload();
