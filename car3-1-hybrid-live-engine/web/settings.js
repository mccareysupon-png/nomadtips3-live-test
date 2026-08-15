import { CAR31_DEFAULT_CONFIG, CAR31_SOURCE_MODE, configSummary, normalizeCar31Config, validateCar31Config } from '../src/config.js';

const STORAGE_KEY='nomadtips3-car31-active-config';
const fields=[
  'side','minuteMin','minuteMax','market','oddsMin','oddsMax','ahMin','ahMax','ouDirection','ouLine','momentumMin','goalGapLimited','maxGoalGap','confirmationRounds','signalLimitEnabled','maxSignalsPerDay',
  'attackEvidenceEnabled','attackEvidenceRequirement','attackEvidenceDangerousAttacksEnabled','attackEvidenceDangerousAttacksMin','attackEvidenceShotsEnabled','attackEvidenceShotsMin','attackEvidenceShotsOnTargetEnabled','attackEvidenceShotsOnTargetMin','attackEvidenceCornersEnabled','attackEvidenceCornersMin',
  'sourcePrimary','sourceFallback','sourceBackup','sourceRefreshSeconds','sourceFreshnessMaxSeconds','matchConfidenceMin','requireCoreStats','apiVerifyPolicy','dataConflictPolicy','maxSourceMismatchPercent','redCardPolicy',
  'trendWindowMinutes','chartHistoryMinutes','pressureSpikeEnabled','pressureSpikeMin'
];
const weightIds=['attacks','dangerous_attacks','shots','shots_on_target','corners','possession'];
const lockedSourceIds=['sourcePrimary','sourceFallback','sourceBackup','apiVerifyPolicy','dataConflictPolicy'];

function parseValue(el){
  if(!el) return undefined;
  if(el.tagName==='SELECT' && ['true','false'].includes(el.value)) return el.value==='true';
  if(el.type==='number') return el.value===''?null:Number(el.value);
  return el.value;
}
function readForm(){
  const raw={}; fields.forEach(id=>raw[id]=parseValue(document.getElementById(id)));
  raw.momentumWeights={}; weightIds.forEach(key=>raw.momentumWeights[key]=Number(document.getElementById(`w_${key}`).value));
  return raw;
}
function lockGoalooOnlyUi(){
  if(!CAR31_SOURCE_MODE.locked) return;
  for(const id of lockedSourceIds){
    const el=document.getElementById(id);
    if(!el) continue;
    el.disabled=true;
    el.title='CAR 3.1 is currently locked to GOALOO only; fallback/API modules are dormant, not deleted.';
  }
}
function fill(configInput){
  const config=normalizeCar31Config(configInput);
  fields.forEach(id=>{const el=document.getElementById(id);if(!el)return;const value=config[id];el.value=value===null?'':String(value);});
  weightIds.forEach(key=>document.getElementById(`w_${key}`).value=config.momentumWeights[key]);
  lockGoalooOnlyUi();
  refresh();
}
function refresh(){
  const result=validateCar31Config(readForm());
  const sourceText=CAR31_SOURCE_MODE.locked
    ? 'GOALOO ONLY · FALLBACK OFF · BACKUP OFF · API VERIFY OFF'
    : `${result.config.sourcePrimary} → ${result.config.sourceFallback} · Verify ${result.config.apiVerifyPolicy}`;
  document.getElementById('summary').textContent=`SHADOW ACTIVE PREVIEW · ${configSummary(result.config)} · ${sourceText}`;
  const box=document.getElementById('validation');
  if(result.errors.length){box.className='validation bad';box.textContent='BLOCKED · '+result.errors.join(' · ');}
  else if(result.warnings.length){box.className='validation warn';box.textContent='WARNING · '+result.warnings.join(' · ');}
  else{box.className='validation good';box.textContent=CAR31_SOURCE_MODE.locked?'CONFIG VALID · GOALOO-ONLY MODE LOCKED · API-Football will not be called':'CONFIG VALID · พร้อมใช้กับ Shadow Preview';}
  return result;
}

document.getElementById('settingsForm').addEventListener('input',refresh);
document.getElementById('saveBtn').addEventListener('click',()=>{
  const result=refresh(); if(!result.ok) return; localStorage.setItem(STORAGE_KEY,JSON.stringify(result.config));
  const box=document.getElementById('validation');box.className='validation good';box.textContent='SAVED · เก็บค่า CAR 3.1 Shadow แล้ว · GOALOO ONLY ยังคงถูกล็อก';
});
document.getElementById('runBtn').addEventListener('click',()=>{
  const result=refresh(); if(!result.ok) return; localStorage.setItem(STORAGE_KEY,JSON.stringify(result.config)); location.href='./index.html';
});
document.getElementById('resetBtn').addEventListener('click',()=>{localStorage.removeItem(STORAGE_KEY);fill(CAR31_DEFAULT_CONFIG);});

let stored=null;try{stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{}
const migrated=normalizeCar31Config(stored||CAR31_DEFAULT_CONFIG);
localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));
fill(migrated);
