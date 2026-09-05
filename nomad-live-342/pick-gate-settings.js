(()=>{
'use strict';
const KEY='nomad342PickGateV1';
const DEFAULTS=Object.freeze({
  minuteFrom:0,minuteTo:120,
  priceFreshnessEnabled:false,maximumPriceAgeSeconds:90,
  allowHome:true,allowDraw:true,allowAway:true,
  oneXtwoMinProbability:0,oneXtwoMinLead:0,oneXtwoMinEdge:-100,
  oneXtwoOddsMin:1.01,oneXtwoOddsMax:6,
  oneXtwoPressureConfirm:false,oneXtwoSidePressureMin:0,oneXtwoDrawBalanceMax:50,
  oneXtwoRejectSelectedSideIfTrailing:false,
  allowOver:true,allowUnder:true,
  totalsMinProbability:0,totalsMinLead:0,totalsMinEdge:-100,
  totalsOddsMin:1.01,totalsOddsMax:6,
  totalsActivityConfirm:false,overMinRecentShots:0,overMinRecentSot:0,
  underMaxRecentShots:99,underMaxRecentSot:99
});
const REFERENCE=Object.freeze({
  minuteFrom:55,minuteTo:80,
  priceFreshnessEnabled:true,maximumPriceAgeSeconds:30,
  allowHome:true,allowDraw:true,allowAway:true,
  oneXtwoMinProbability:62,oneXtwoMinLead:8,oneXtwoMinEdge:5,
  oneXtwoOddsMin:1.45,oneXtwoOddsMax:2.10,
  oneXtwoPressureConfirm:true,oneXtwoSidePressureMin:62,oneXtwoDrawBalanceMax:8,
  oneXtwoRejectSelectedSideIfTrailing:true,
  allowOver:true,allowUnder:true,
  totalsMinProbability:62,totalsMinLead:8,totalsMinEdge:5,
  totalsOddsMin:1.45,totalsOddsMax:2.10,
  totalsActivityConfirm:true,overMinRecentShots:2,overMinRecentSot:1,
  underMaxRecentShots:1,underMaxRecentSot:1
});
function load(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...DEFAULTS}}}
function save(v){localStorage.setItem(KEY,JSON.stringify(v));}
function read(form,base={}){const out={...base};for(const [k,d] of Object.entries(DEFAULTS)){const e=form.elements[k];if(!e)continue;out[k]=typeof d==='boolean'?e.checked:Number(e.value);}return out;}
function fill(form,v){for(const [k,d] of Object.entries(DEFAULTS)){const e=form.elements[k];if(!e)continue;if(typeof d==='boolean')e.checked=Boolean(v[k]);else e.value=String(v[k]);}}
function validate(v){const e=[];
  if(!Number.isFinite(v.minuteFrom)||!Number.isFinite(v.minuteTo)||v.minuteFrom>v.minuteTo)e.push('Minute From must not be later than Minute To');
  if(v.priceFreshnessEnabled&&(!Number.isFinite(v.maximumPriceAgeSeconds)||v.maximumPriceAgeSeconds<1))e.push('Maximum Price Age must be at least 1 second');
  if(!v.allowHome&&!v.allowDraw&&!v.allowAway)e.push('Enable at least one 1X2 pick');
  if(!v.allowOver&&!v.allowUnder)e.push('Enable OVER or UNDER');
  if(v.oneXtwoOddsMin>v.oneXtwoOddsMax)e.push('1X2 minimum odds must not exceed maximum odds');
  if(v.totalsOddsMin>v.totalsOddsMax)e.push('O/U minimum odds must not exceed maximum odds');
  if(v.oneXtwoMinProbability<0||v.oneXtwoMinProbability>100)e.push('1X2 minimum probability must be 0–100%');
  if(v.totalsMinProbability<0||v.totalsMinProbability>100)e.push('O/U minimum probability must be 0–100%');
  return e;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function summary(v){return [
  `${v.minuteFrom}–${v.minuteTo}'`,v.priceFreshnessEnabled?`price age ≤${v.maximumPriceAgeSeconds}s`:'price age OFF',
  `1X2 ${[v.allowHome?'H':null,v.allowDraw?'D':null,v.allowAway?'A':null].filter(Boolean).join('/')}`,
  `1X2 P≥${v.oneXtwoMinProbability}%`,`lead≥${v.oneXtwoMinLead}%`,`edge≥${v.oneXtwoMinEdge}%`,`odds ${v.oneXtwoOddsMin.toFixed(2)}–${v.oneXtwoOddsMax.toFixed(2)}`,
  v.oneXtwoPressureConfirm?`pressure confirm ≥${v.oneXtwoSidePressureMin}%`:'pressure confirm OFF',v.oneXtwoRejectSelectedSideIfTrailing?'reject selected side if trailing':'score-state check OFF',
  `O/U ${[v.allowOver?'OVER':null,v.allowUnder?'UNDER':null].filter(Boolean).join('/')}`,
  `O/U P≥${v.totalsMinProbability}%`,`lead≥${v.totalsMinLead}%`,`edge≥${v.totalsMinEdge}%`,`odds ${v.totalsOddsMin.toFixed(2)}–${v.totalsOddsMax.toFixed(2)}`,
  v.totalsActivityConfirm?`OVER shots≥${v.overMinRecentShots}/SOT≥${v.overMinRecentSot} · UNDER shots≤${v.underMaxRecentShots}/SOT≤${v.underMaxRecentSot}`:'activity confirm OFF',
  'LOCK requires 1X2 + O/U PASS'
];}
function render(form,base){const host=document.getElementById('settingsSummary');if(!host)return;const v=read(form,base),errors=validate(v);host.innerHTML=summary(v).map(x=>`<span>${esc(x)}</span>`).join('')+errors.map(x=>`<span class="warn">${esc(x)}</span>`).join('');}
function start(){if(document.body?.dataset?.page!=='settings')return;const form=document.getElementById('settingsForm');if(!form)return;let current=load();fill(form,current);const refresh=()=>render(form,current);form.addEventListener('input',refresh);form.addEventListener('change',refresh);refresh();
  form.addEventListener('submit',event=>{event.preventDefault();const next=read(form,current),errors=validate(next),status=document.getElementById('saveStatus');if(errors.length){status.textContent=`Not saved · ${errors[0]}`;status.className='waittxt';render(form,current);return;}save(next);current={...next};status.textContent='Saved · active on next 3.42 pick scan';status.className='oktxt';render(form,current);document.dispatchEvent(new CustomEvent('nomad342:pickgatesaved',{detail:{settings:current}}));});
  document.getElementById('referenceButton')?.addEventListener('click',()=>{fill(form,REFERENCE);render(form,current);const status=document.getElementById('saveStatus');status.textContent='Reference loaded · press SAVE to apply';status.className='waittxt';});
  document.getElementById('defaultsButton')?.addEventListener('click',()=>{fill(form,DEFAULTS);render(form,current);const status=document.getElementById('saveStatus');status.textContent='Permissive defaults loaded · press SAVE to apply';status.className='waittxt';});
}
window.NOMAD342_PICK_GATE={key:KEY,defaults:DEFAULTS,reference:REFERENCE,load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
