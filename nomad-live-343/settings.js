(()=>{
'use strict';
const VERSION='343-settings-engine-v1';
const API='/api/engine/settings';
const KEY='nomad343CleanSettingsV1';
const RUN_KEY='nomad343CleanRunStateV1';
const markets=['ah','oneXtwo','over','under'];
const defaults={
 ah:{sideMode:'BOTH',shotOnTarget:1,shotOff:1,corner:1,attackPct:55,dangerousAttackPct:55,possessionPct:50,evidenceRequired:3,lineMin:0,oddsMin:1.50,oddsMax:3.00,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 oneXtwo:{sideMode:'BOTH',shotOnTarget:1,shotOff:1,corner:1,attackPct:55,dangerousAttackPct:55,possessionPct:50,evidenceRequired:3,scoreTrailingMax:1,oddsMin:1.50,oddsMax:4.00,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 over:{shotOnTarget:1,shotOff:1,corner:1,attackPct:55,dangerousAttackPct:55,possessionPct:50,evidenceRequired:3,lineMin:0.5,lineMax:5.5,oddsMin:1.50,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 under:{sideMode:'BOTH',shotOnTarget:1,shotOff:1,corner:1,attackPct:45,dangerousAttackPct:45,possessionPct:50,evidenceRequired:3,lineMin:0.5,lineMax:5.5,oddsMin:1.50,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10}
};
let currentSettings={...defaults};
let currentRun={ah:false,oneXtwo:false,over:false,under:false};
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
const cache=()=>{localStorage.setItem(KEY,JSON.stringify(currentSettings));localStorage.setItem(RUN_KEY,JSON.stringify(currentRun))};
function read(form,market){const out={...currentSettings[market]};for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){if(el.checked)out[el.name]=el.value;continue;}out[el.name]=Number(el.value)}return out}
function fill(form,cfg){for(const el of form.elements){if(!el.name)continue;if(el.type==='radio')el.checked=el.value===cfg[el.name];else if(cfg[el.name]!==undefined)el.value=String(cfg[el.name])}}
function validate(cfg){const errors=[];for(const k of ['shotOnTarget','shotOff','corner'])if(k in cfg&&(!Number.isFinite(cfg[k])||cfg[k]<0))errors.push('ค่าจำนวนครั้งไม่ถูกต้อง');for(const k of ['attackPct','dangerousAttackPct','possessionPct'])if(k in cfg&&(!Number.isFinite(cfg[k])||cfg[k]<0||cfg[k]>100))errors.push('ค่าเปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100');if(!Number.isFinite(cfg.minuteFrom)||!Number.isFinite(cfg.minuteTo)||cfg.minuteFrom>cfg.minuteTo)errors.push('ช่วงนาทีไม่ถูกต้อง');if(!Number.isFinite(cfg.rollingWindowMinutes)||cfg.rollingWindowMinutes<2||cfg.rollingWindowMinutes>30)errors.push('Rolling Window ต้องอยู่ระหว่าง 2–30 นาที');if('oddsMin'in cfg&&(!Number.isFinite(cfg.oddsMin)||cfg.oddsMin<1.01))errors.push('ราคาเริ่มต้นต้องไม่น้อยกว่า 1.01');return errors}
function setMessage(form,text){const el=form.querySelector('[data-message]');if(el)el.textContent=text}
function syncStatus(){for(const m of markets){const el=document.querySelector(`[data-status="${m}"]`);if(!el)continue;el.classList.toggle('run',!!currentRun[m]);el.querySelector('b').textContent=currentRun[m]?'RUN':'หยุด'}}
async function push(){const r=await fetch(API,{method:'PUT',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({settings:currentSettings,runState:currentRun})});if(!r.ok)throw new Error(`HTTP_${r.status}`);const j=await r.json();if(j?.ok!==true)throw new Error(j?.error||'ENGINE_REJECTED');currentSettings=j.settings;currentRun=j.runState;cache();syncStatus();return j}
async function pull(){try{const r=await fetch(`${API}?_=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);const j=await r.json();if(j?.ok!==true)throw new Error(j?.error||'ENGINE_NOT_READY');currentSettings={...defaults,...j.settings};currentRun={...currentRun,...j.runState};cache();return true}catch{currentSettings={...defaults,...load(KEY,{})};currentRun={...currentRun,...load(RUN_KEY,{})};return false}}
async function boot(){
 const online=await pull();
 for(const m of markets){const form=document.querySelector(`[data-form="${m}"]`);if(!form)continue;fill(form,currentSettings[m]);form.addEventListener('submit',async e=>{e.preventDefault();const cfg=read(form,m),err=validate(cfg);if(err.length){setMessage(form,err[0]);return}currentSettings[m]=cfg;setMessage(form,'กำลังบันทึกเข้า Engine…');try{await push();setMessage(form,'บันทึกเข้า Engine แล้ว')}catch(error){cache();setMessage(form,`Engine ไม่รับค่า · ${error.message}`)}});form.querySelector('[data-run]')?.addEventListener('click',async()=>{const cfg=read(form,m),err=validate(cfg);if(err.length){setMessage(form,err[0]);return}currentSettings[m]=cfg;currentRun[m]=true;setMessage(form,'กำลัง RUN…');try{await push();setMessage(form,'RUN แล้ว · Engine ใช้ค่าชุดนี้ทันที')}catch(error){currentRun[m]=false;syncStatus();setMessage(form,`RUN ไม่สำเร็จ · ${error.message}`)}});form.querySelector('[data-stop]')?.addEventListener('click',async()=>{currentRun[m]=false;syncStatus();setMessage(form,'กำลัง STOP…');try{await push();setMessage(form,'STOP แล้ว')}catch(error){setMessage(form,`STOP ไม่สำเร็จ · ${error.message}`)}})}
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{const target=btn.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==target)}));
 syncStatus();
 const first=document.querySelector('[data-form="ah"] [data-message]');if(first&&online)first.textContent='เชื่อม Engine แล้ว · ค่าที่เห็นมาจากเครื่องจริง';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.NOMAD343_SETTINGS={version:VERSION,defaults,get settings(){return currentSettings},get runState(){return currentRun}};
})();
