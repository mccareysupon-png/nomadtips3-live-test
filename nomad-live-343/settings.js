(()=>{
'use strict';
const KEY='nomad343CleanSettingsV1';
const RUN_KEY='nomad343CleanRunStateV1';
const markets=['ah','oneXtwo','over','under'];
const defaults={
 ah:{sideMode:'BOTH',shotOnTarget:1,shotOff:1,corner:1,attackPct:55,dangerousAttackPct:55,possessionPct:50,evidenceRequired:3,lineMin:0,oddsMin:1.50,oddsMax:3.00,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 oneXtwo:{sideMode:'BOTH',shotOnTarget:1,shotOff:1,corner:1,attackPct:55,dangerousAttackPct:55,possessionPct:50,evidenceRequired:3,scoreTrailingMax:1,oddsMin:1.50,oddsMax:4.00,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 over:{shotOnTarget:1,shotOff:1,corner:1,attackPct:55,dangerousAttackPct:55,possessionPct:50,evidenceRequired:3,lineMin:0.5,lineMax:5.5,oddsMin:1.50,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 under:{sideMode:'BOTH',shotOnTarget:1,shotOff:1,corner:1,attackPct:45,dangerousAttackPct:45,possessionPct:50,evidenceRequired:3,lineMin:0.5,lineMax:5.5,oddsMin:1.50,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10}
};
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
function save(key,val){localStorage.setItem(key,JSON.stringify(val))}
function allSettings(){return {...defaults,...load(KEY,{})}}
function runState(){return {...{ah:false,oneXtwo:false,over:false,under:false},...load(RUN_KEY,{})}}
function read(form,market){const out={...allSettings()[market]};for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){if(el.checked)out[el.name]=el.value;continue;}out[el.name]=Number(el.value)}return out}
function fill(form,cfg){for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){el.checked=el.value===cfg[el.name]}else if(cfg[el.name]!==undefined)el.value=String(cfg[el.name])}}
function validate(cfg){const errors=[];for(const k of ['shotOnTarget','shotOff','corner'])if(k in cfg&&(!Number.isFinite(cfg[k])||cfg[k]<0))errors.push('ค่าจำนวนครั้งไม่ถูกต้อง');for(const k of ['attackPct','dangerousAttackPct','possessionPct'])if(k in cfg&&(!Number.isFinite(cfg[k])||cfg[k]<0||cfg[k]>100))errors.push('ค่าเปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100');if(!Number.isFinite(cfg.minuteFrom)||!Number.isFinite(cfg.minuteTo)||cfg.minuteFrom>cfg.minuteTo)errors.push('ช่วงนาทีไม่ถูกต้อง');if(!Number.isFinite(cfg.rollingWindowMinutes)||cfg.rollingWindowMinutes<2||cfg.rollingWindowMinutes>30)errors.push('Rolling Window ต้องอยู่ระหว่าง 2–30 นาที');if('oddsMin'in cfg&&(!Number.isFinite(cfg.oddsMin)||cfg.oddsMin<1.01))errors.push('ราคาเริ่มต้นต้องไม่น้อยกว่า 1.01');return errors}
function setMessage(form,text){const el=form.querySelector('[data-message]');if(el)el.textContent=text}
function syncStatus(){const state=runState();for(const m of markets){const el=document.querySelector(`[data-status="${m}"]`);if(!el)continue;el.classList.toggle('run',!!state[m]);el.querySelector('b').textContent=state[m]?'RUN':'หยุด'}}
function boot(){
 const settings=allSettings();
 for(const m of markets){const form=document.querySelector(`[data-form="${m}"]`);if(!form)continue;fill(form,settings[m]);form.addEventListener('submit',e=>{e.preventDefault();const cfg=read(form,m);const err=validate(cfg);if(err.length){setMessage(form,err[0]);return}const next=allSettings();next[m]=cfg;save(KEY,next);setMessage(form,'บันทึกค่าทดสอบแล้ว · ยังไม่ส่งเข้า Engine จริง')});form.querySelector('[data-run]')?.addEventListener('click',()=>{const cfg=read(form,m);const err=validate(cfg);if(err.length){setMessage(form,err[0]);return}const next=allSettings();next[m]=cfg;save(KEY,next);const state=runState();state[m]=true;save(RUN_KEY,state);syncStatus();setMessage(form,'RUN เฉพาะสถานะทดสอบหน้าเว็บ')});form.querySelector('[data-stop]')?.addEventListener('click',()=>{const state=runState();state[m]=false;save(RUN_KEY,state);syncStatus();setMessage(form,'STOP เฉพาะสถานะทดสอบหน้าเว็บ')})}
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{const target=btn.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==target)}));
 syncStatus();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.NOMAD343_SETTINGS={version:'clean-settings-v1',defaults,allSettings,runState};
})();
