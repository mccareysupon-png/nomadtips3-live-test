(()=>{
'use strict';
const KEY='nomad342PickGateV2';
const DEFAULTS=Object.freeze({
  minuteFrom:0,minuteTo:120,rollingWindowMinutes:5,
  priceFreshnessEnabled:false,maximumPriceAgeSeconds:90,
  attackWeight:1,dangerousAttackWeight:2.5,
  allowHome:true,allowDraw:true,allowAway:true,
  oneXtwoEvidenceEnabled:false,
  oneXtwoAttackMin:0,oneXtwoDangerousMin:0,oneXtwoSotMin:0,oneXtwoShotOffMin:0,oneXtwoCornerMin:0,
  oneXtwoEvidenceRequired:1,oneXtwoSidePressureMin:0,oneXtwoTrendRequired:0,
  oneXtwoRejectSelectedSideIfTrailing:false,
  drawPressureBalanceMax:50,drawDangerousDiffMax:99,drawSotDiffMax:99,drawRequireLevelScore:false,
  oneXtwoMinProbability:0,oneXtwoMinLead:0,oneXtwoMinEdge:-100,
  oneXtwoOddsMin:1.01,oneXtwoOddsMax:6,
  allowOver:true,allowUnder:true,
  totalsEvidenceEnabled:false,
  overAttackMin:0,overDangerousMin:0,overSotMin:0,overShotOffMin:0,overCornerMin:0,overEvidenceRequired:1,
  underAttackMax:999,underDangerousMax:999,underSotMax:999,underShotOffMax:999,underCornerMax:999,underEvidenceRequired:1,
  totalsMinProbability:0,totalsMinLead:0,totalsMinEdge:-100,
  totalsOddsMin:1.01,totalsOddsMax:6
});
const REFERENCE=Object.freeze({
  minuteFrom:55,minuteTo:80,rollingWindowMinutes:8,
  priceFreshnessEnabled:true,maximumPriceAgeSeconds:30,
  attackWeight:1,dangerousAttackWeight:2.5,
  allowHome:true,allowDraw:true,allowAway:true,
  oneXtwoEvidenceEnabled:true,
  oneXtwoAttackMin:3,oneXtwoDangerousMin:3,oneXtwoSotMin:1,oneXtwoShotOffMin:1,oneXtwoCornerMin:1,
  oneXtwoEvidenceRequired:3,oneXtwoSidePressureMin:60,oneXtwoTrendRequired:3,
  oneXtwoRejectSelectedSideIfTrailing:true,
  drawPressureBalanceMax:8,drawDangerousDiffMax:2,drawSotDiffMax:1,drawRequireLevelScore:true,
  oneXtwoMinProbability:62,oneXtwoMinLead:8,oneXtwoMinEdge:5,
  oneXtwoOddsMin:1.45,oneXtwoOddsMax:2.10,
  allowOver:true,allowUnder:true,
  totalsEvidenceEnabled:true,
  overAttackMin:6,overDangerousMin:5,overSotMin:2,overShotOffMin:2,overCornerMin:1,overEvidenceRequired:3,
  underAttackMax:5,underDangerousMax:3,underSotMax:1,underShotOffMax:1,underCornerMax:1,underEvidenceRequired:3,
  totalsMinProbability:62,totalsMinLead:8,totalsMinEdge:5,
  totalsOddsMin:1.45,totalsOddsMax:2.10
});
function load(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...DEFAULTS}}}
function save(v){localStorage.setItem(KEY,JSON.stringify(v));}
function read(form,base={}){const out={...base};for(const [k,d] of Object.entries(DEFAULTS)){const e=form.elements[k];if(!e)continue;out[k]=typeof d==='boolean'?e.checked:Number(e.value);}return out;}
function fill(form,v){for(const [k,d] of Object.entries(DEFAULTS)){const e=form.elements[k];if(!e)continue;if(typeof d==='boolean')e.checked=Boolean(v[k]);else e.value=String(v[k]);}}
function validate(v){const e=[];
  if(!Number.isFinite(v.minuteFrom)||!Number.isFinite(v.minuteTo)||v.minuteFrom>v.minuteTo)e.push('Minute From must not be later than Minute To');
  if(!Number.isFinite(v.rollingWindowMinutes)||v.rollingWindowMinutes<2||v.rollingWindowMinutes>20)e.push('Rolling Window must be 2–20 minutes');
  if(v.priceFreshnessEnabled&&(!Number.isFinite(v.maximumPriceAgeSeconds)||v.maximumPriceAgeSeconds<1))e.push('Maximum Price Age must be at least 1 second');
  if(v.attackWeight<0||v.dangerousAttackWeight<0||(v.attackWeight===0&&v.dangerousAttackWeight===0))e.push('Attack and Dangerous Attack weights cannot both be zero');
  if(!v.allowHome&&!v.allowDraw&&!v.allowAway)e.push('Enable at least one 1X2 pick');
  if(!v.allowOver&&!v.allowUnder)e.push('Enable OVER or UNDER');
  for(const [label,value] of [['1X2 Evidence Required',v.oneXtwoEvidenceRequired],['OVER Evidence Required',v.overEvidenceRequired],['UNDER Evidence Required',v.underEvidenceRequired]])if(!Number.isInteger(value)||value<1||value>4)e.push(`${label} must be 1–4`);
  if(v.oneXtwoTrendRequired<0||v.oneXtwoTrendRequired>3)e.push('1X2 Trend Required must be 0–3');
  if(v.oneXtwoSidePressureMin<0||v.oneXtwoSidePressureMin>100)e.push('1X2 Side Pressure must be 0–100%');
  if(v.drawPressureBalanceMax<0||v.drawPressureBalanceMax>50)e.push('DRAW Pressure Imbalance must be 0–50%');
  if(v.oneXtwoOddsMin>v.oneXtwoOddsMax)e.push('1X2 minimum odds must not exceed maximum odds');
  if(v.totalsOddsMin>v.totalsOddsMax)e.push('O/U minimum odds must not exceed maximum odds');
  if(v.oneXtwoMinProbability<0||v.oneXtwoMinProbability>100)e.push('1X2 minimum probability must be 0–100%');
  if(v.totalsMinProbability<0||v.totalsMinProbability>100)e.push('O/U minimum probability must be 0–100%');
  return e;}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function evidenceLabel(n){return n===1?'ANY 1 OF 4':n===4?'ALL 4 OF 4':`${n} OF 4`;}
function summary(v){return [
  `${v.minuteFrom}–${v.minuteTo}' · rolling ${v.rollingWindowMinutes}m`,
  `weights ATTACK×${v.attackWeight} · DANGER×${v.dangerousAttackWeight}`,
  v.priceFreshnessEnabled?`price age ≤${v.maximumPriceAgeSeconds}s`:'price age OFF',
  `1X2 ${[v.allowHome?'H':null,v.allowDraw?'D':null,v.allowAway?'A':null].filter(Boolean).join('/')}`,
  v.oneXtwoEvidenceEnabled?`1X2 evidence ${evidenceLabel(v.oneXtwoEvidenceRequired)}`:'1X2 evidence OFF',
  v.oneXtwoEvidenceEnabled?`ATTACK≥${v.oneXtwoAttackMin} · DANGER≥${v.oneXtwoDangerousMin} · SOT≥${v.oneXtwoSotMin} · OFF≥${v.oneXtwoShotOffMin} · CORNER≥${v.oneXtwoCornerMin}`:'',
  v.oneXtwoEvidenceEnabled?`side pressure≥${v.oneXtwoSidePressureMin}% · trend ${v.oneXtwoTrendRequired}/3`:'',
  `DRAW balance ±${v.drawPressureBalanceMax}% · DANGER diff≤${v.drawDangerousDiffMax} · SOT diff≤${v.drawSotDiffMax}`,
  `1X2 final P≥${v.oneXtwoMinProbability}% · lead≥${v.oneXtwoMinLead}% · edge≥${v.oneXtwoMinEdge}% · odds ${v.oneXtwoOddsMin.toFixed(2)}–${v.oneXtwoOddsMax.toFixed(2)}`,
  `O/U ${[v.allowOver?'OVER':null,v.allowUnder?'UNDER':null].filter(Boolean).join('/')}`,
  v.totalsEvidenceEnabled?`OVER evidence ${evidenceLabel(v.overEvidenceRequired)} · UNDER quiet ${evidenceLabel(v.underEvidenceRequired)}`:'O/U evidence OFF',
  v.totalsEvidenceEnabled?`OVER A≥${v.overAttackMin} D≥${v.overDangerousMin} SOT≥${v.overSotMin} OFF≥${v.overShotOffMin} C≥${v.overCornerMin}`:'',
  v.totalsEvidenceEnabled?`UNDER A≤${v.underAttackMax} D≤${v.underDangerousMax} SOT≤${v.underSotMax} OFF≤${v.underShotOffMax} C≤${v.underCornerMax}`:'',
  `O/U final P≥${v.totalsMinProbability}% · lead≥${v.totalsMinLead}% · edge≥${v.totalsMinEdge}% · odds ${v.totalsOddsMin.toFixed(2)}–${v.totalsOddsMax.toFixed(2)}`,
  'LOCK requires GLOBAL + 1X2 + O/U PASS'].filter(Boolean);}
function render(form,base){const host=document.getElementById('settingsSummary');if(!host)return;const v=read(form,base),errors=validate(v);host.innerHTML=summary(v).map(x=>`<span>${esc(x)}</span>`).join('')+errors.map(x=>`<span class="warn">${esc(x)}</span>`).join('');}
function start(){if(document.body?.dataset?.page!=='settings')return;const form=document.getElementById('settingsForm');if(!form)return;let current=load();fill(form,current);const refresh=()=>render(form,current);form.addEventListener('input',refresh);form.addEventListener('change',refresh);refresh();
  form.addEventListener('submit',event=>{event.preventDefault();const next=read(form,current),errors=validate(next),status=document.getElementById('saveStatus');if(errors.length){status.textContent=`Not saved · ${errors[0]}`;status.className='waittxt';render(form,current);return;}save(next);current={...next};status.textContent='Saved · active on next 3.42 pick scan';status.className='oktxt';render(form,current);document.dispatchEvent(new CustomEvent('nomad342:pickgatesaved',{detail:{settings:current}}));});
  document.getElementById('referenceButton')?.addEventListener('click',()=>{fill(form,REFERENCE);render(form,current);const status=document.getElementById('saveStatus');status.textContent='K football reference loaded · press SAVE to apply';status.className='waittxt';});
  document.getElementById('defaultsButton')?.addEventListener('click',()=>{fill(form,DEFAULTS);render(form,current);const status=document.getElementById('saveStatus');status.textContent='Permissive defaults loaded · press SAVE to apply';status.className='waittxt';});}
window.NOMAD342_PICK_GATE={key:KEY,defaults:DEFAULTS,reference:REFERENCE,load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();