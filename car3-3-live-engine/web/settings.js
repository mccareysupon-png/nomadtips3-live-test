const WORKER='https://nomadtips3-car33-live.mccarey-supon.workers.dev';
const $=s=>document.querySelector(s);
const form=$('#form');

const DEFAULT={
  side:'HOME',minuteMin:60,minuteMax:80,market:'AH',oddsMin:1.70,oddsMax:null,
  ahMin:.25,ahMax:null,momentumMin:60,confirmationRounds:2,
  goalGapLimited:false,maxGoalGap:1,signalLimitEnabled:false,maxSignalsPerDay:10,
  ouDirection:'OVER',ouLine:2.5,requireCoreStats:true,redCardPolicy:'ALLOW',
  attackEvidenceEnabled:true,
  attackEvidenceDangerousAttacksEnabled:true,attackEvidenceDangerousAttacksMin:1,
  attackEvidenceShotsEnabled:true,attackEvidenceShotsMin:1,
  attackEvidenceShotsOnTargetEnabled:true,attackEvidenceShotsOnTargetMin:1,
  attackEvidenceCornersEnabled:true,attackEvidenceCornersMin:1,
  attackEvidenceRequirement:'1',
  momentumWeights:{attacks:.16,dangerous_attacks:.52,shots:2,shots_on_target:4,corners:1.25,possession:.07}
};

let cfg=structuredClone(DEFAULT),busy=false;
const BOOLS=['goalGapLimited','signalLimitEnabled','requireCoreStats','attackEvidenceEnabled','attackEvidenceDangerousAttacksEnabled','attackEvidenceShotsEnabled','attackEvidenceShotsOnTargetEnabled','attackEvidenceCornersEnabled'];
const NUMBERS=['minuteMin','minuteMax','oddsMin','oddsMax','ahMin','ahMax','momentumMin','confirmationRounds','maxGoalGap','maxSignalsPerDay','ouLine','attackEvidenceDangerousAttacksMin','attackEvidenceShotsMin','attackEvidenceShotsOnTargetMin','attackEvidenceCornersMin'];
const WEIGHTS={w_attacks:'attacks',w_dangerous_attacks:'dangerous_attacks',w_shots:'shots',w_shots_on_target:'shots_on_target',w_corners:'corners',w_possession:'possession'};
const n=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};

function setStatus(text='',kind=''){
  const el=$('#status');el.textContent=text;el.className=`save-status ${kind}`;
}
function setValidation(text='',kind=''){
  const el=$('#validation');el.textContent=text;el.className=`settings-validation ${kind}`;
}
function setValue(name,value){
  const el=form.elements[name];if(!el)return;
  if(el.type==='checkbox')el.checked=Boolean(value);else el.value=value??'';
}
function fill(c){
  cfg={...structuredClone(DEFAULT),...(c||{}),momentumWeights:{...DEFAULT.momentumWeights,...(c?.momentumWeights||{})}};
  for(const key of [...NUMBERS,'side','market','ouDirection','attackEvidenceRequirement','redCardPolicy'])setValue(key,cfg[key]);
  for(const key of BOOLS)setValue(key,cfg[key]);
  for(const [field,key] of Object.entries(WEIGHTS))setValue(field,cfg.momentumWeights[key]);
  updateUI();summary();setValidation();
}
function currentBody(){
  const body={...cfg,momentumWeights:{...cfg.momentumWeights}};
  for(const key of NUMBERS)body[key]=n(form.elements[key]?.value);
  for(const key of BOOLS)body[key]=Boolean(form.elements[key]?.checked);
  body.side=form.elements.side.value;
  body.market=form.elements.market.value;
  body.ouDirection=form.elements.ouDirection.value;
  body.attackEvidenceRequirement=form.elements.attackEvidenceRequirement.value;
  body.redCardPolicy=form.elements.redCardPolicy.value;
  for(const [field,key] of Object.entries(WEIGHTS))body.momentumWeights[key]=n(form.elements[field]?.value)??DEFAULT.momentumWeights[key];
  return body;
}
function validate(body){
  const errors=[];
  if(body.minuteMin===null||body.minuteMax===null||body.minuteMin>body.minuteMax)errors.push('Minute range is invalid.');
  if(body.oddsMin===null||body.oddsMin<1.01)errors.push('Odds min must be at least 1.01.');
  if(body.oddsMax!==null&&body.oddsMax<body.oddsMin)errors.push('Odds max cannot be lower than odds min.');
  if(body.market==='AH'&&body.ahMax!==null&&body.ahMax<body.ahMin)errors.push('AH line max cannot be lower than AH line min.');
  if(body.confirmationRounds===null||body.confirmationRounds<1)errors.push('Confirmation rounds must be at least 1.');
  if(body.goalGapLimited&&(body.maxGoalGap===null||body.maxGoalGap<0))errors.push('Max goal gap is required when Goal gap limit is ON.');
  if(body.signalLimitEnabled&&(body.maxSignalsPerDay===null||body.maxSignalsPerDay<1))errors.push('Max signals / day is required when Daily signal limit is ON.');
  if(body.attackEvidenceEnabled){
    const enabled=['attackEvidenceDangerousAttacksEnabled','attackEvidenceShotsEnabled','attackEvidenceShotsOnTargetEnabled','attackEvidenceCornersEnabled'].filter(k=>body[k]).length;
    if(enabled===0)errors.push('Attack evidence is ON but every evidence source is OFF.');
    const req=body.attackEvidenceRequirement==='ALL'?enabled:Number(body.attackEvidenceRequirement);
    if(req>enabled)errors.push(`Evidence requirement needs ${req} rules but only ${enabled} are enabled.`);
  }
  return errors;
}
function toggleDisabled(selector,disabled){document.querySelectorAll(selector).forEach(el=>el.classList.toggle('is-disabled',disabled));}
function updateUI(){
  const market=form.elements.market.value;
  document.querySelectorAll('.market-ah').forEach(x=>x.classList.toggle('hidden-by-market',market!=='AH'));
  document.querySelectorAll('.market-ou').forEach(x=>x.classList.toggle('hidden-by-market',market!=='OU'));
  toggleDisabled('.dependent-gap',!form.elements.goalGapLimited.checked);
  toggleDisabled('.dependent-limit',!form.elements.signalLimitEnabled.checked);
  document.querySelectorAll('.evidence-dependent').forEach(x=>x.classList.toggle('is-disabled',!form.elements.attackEvidenceEnabled.checked));
}
function summary(){
  const b=currentBody(),market=b.market==='WIN'?'1X2 WIN':b.market==='AH'?`AH ${b.ahMin==null?'—':`${b.ahMin>0?'+':''}${b.ahMin}`}+`:`${b.ouDirection} ${b.ouLine}`;
  const extra=[];
  if(b.goalGapLimited)extra.push(`Gap ≤${b.maxGoalGap}`);
  if(b.signalLimitEnabled)extra.push(`Daily ≤${b.maxSignalsPerDay}`);
  if(b.attackEvidenceEnabled)extra.push(`Evidence ${b.attackEvidenceRequirement}`);else extra.push('Evidence OFF');
  $('#rule').innerHTML=`<b><span class="rule-accent">${b.side}</span> · ${b.minuteMin}'–${b.minuteMax}' · ${market} · Odds ≥${b.oddsMin??'—'} · Momentum ≥${b.momentumMin??'—'}% · Confirm ${b.confirmationRounds??'—'} rounds${extra.length?` · ${extra.join(' · ')}`:''}</b>`;
}
async function refreshHealth(){
  const el=$('#engineState');
  try{
    const h=await fetch(`${WORKER}/health?t=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();});
    const cycle=h.lastCycle||{};el.className='engine-state online';el.textContent=`Online · ${h.signals??0} signals · ${cycle.liveMatches??'—'} live`;
  }catch(e){el.className='engine-state error';el.textContent='Status unavailable';}
}
async function load(){
  if(busy)return;busy=true;setStatus();
  try{
    const r=await fetch(`${WORKER}/config?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`CONFIG HTTP ${r.status}`);
    const d=await r.json();fill(d.config||DEFAULT);setStatus();await refreshHealth();
  }catch(e){fill(DEFAULT);setValidation('Saved settings could not be loaded.','error');setStatus('Using defaults','error');await refreshHealth();}
  finally{busy=false;}
}
async function saveConfig(runNow){
  if(busy)return;const body=currentBody(),errors=validate(body);
  if(errors.length){setValidation(errors.join(' '),'error');setStatus('Not saved','error');return;}
  busy=true;setValidation();setStatus(runNow?'Saving & running…':'Saving…');
  try{
    const r=await fetch(`${WORKER}/config`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`SAVE HTTP ${r.status}`);
    const d=await r.json();if(!d?.config)throw new Error('Invalid save response');cfg=d.config;
    if(runNow){const scan=await fetch(`${WORKER}/scan?t=${Date.now()}`,{cache:'no-store'});const payload=await scan.json().catch(()=>({}));if(!scan.ok||payload.ok!==true)throw new Error(`SCAN ${scan.status}${payload.error?` · ${payload.error}`:''}`);setStatus(`Saved & run · ${payload.liveMatches??0} live · ${payload.candidates??0} candidates · ${payload.signals??0} signals`,'ok');}
    else setStatus('Saved','ok');
    fill(d.config);await refreshHealth();
  }catch(e){setStatus('Save failed','error');setValidation('Changes were not confirmed.','error');}
  finally{busy=false;}
}

form.addEventListener('input',()=>{updateUI();summary();const errors=validate(currentBody());setValidation(errors.length?errors.join(' '):'',errors.length?'error':'');});
form.onsubmit=e=>{e.preventDefault();saveConfig(true);};
$('#save').onclick=()=>saveConfig(false);
$('#reload').onclick=()=>load();
$('#reset').onclick=()=>{fill(DEFAULT);setStatus('Defaults loaded · save to apply');};
load();
