(()=>{
'use strict';
const VERSION='nomad343-settings-preview-v1';
const DRAFT_KEY='nomad343MarketSettingsDraftV1';
const RUN_KEY='nomad343MarketRunV1';
const MARKETS=['over','under','oneXtwo','ah'];
const DEFAULTS={
 over:{lineMin:0.5,lineMax:10,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 under:{sideMode:'BOTH',lineMin:0.5,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:45,attackPct:45,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 oneXtwo:{sideMode:'BOTH',scoreTrailingMax:1,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 ah:{sideMode:'BOTH',lineMin:-10,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10}
};
function clone(v){return JSON.parse(JSON.stringify(v))}
function load(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:fallback}catch{return fallback}}
function save(key,v){localStorage.setItem(key,JSON.stringify(v))}
function draft(){const raw=load(DRAFT_KEY,{});const out={};for(const m of MARKETS)out[m]={...clone(DEFAULTS[m]),...(raw[m]||{})};return out}
function runState(){return {...{over:false,under:false,oneXtwo:false,ah:false},...load(RUN_KEY,{})}}
function readForm(form,market){const cfg={...draft()[market]};for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){if(el.checked)cfg[el.name]=el.value;continue;}if(el.tagName==='SELECT')cfg[el.name]=Number(el.value);else cfg[el.name]=Number(el.value)}return cfg}
function fillForm(form,cfg){for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){el.checked=String(el.value).toUpperCase()===String(cfg[el.name]).toUpperCase()}else el.value=String(cfg[el.name]??'')}}
function validate(m,c){const e=[];for(const k of ['shotOnTarget','shotOff','corner'])if(!Number.isFinite(Number(c[k]))||c[k]<0||c[k]>50)e.push('ค่าจำนวนครั้งต้องอยู่ระหว่าง 0–50');for(const k of ['dangerousAttackPct','attackPct','possessionPct'])if(!Number.isFinite(Number(c[k]))||c[k]<0||c[k]>100)e.push('ค่าเปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100');if(!Number.isInteger(Number(c.evidenceRequired))||c.evidenceRequired<1||c.evidenceRequired>6)e.push('จำนวนหลักฐานต้องอยู่ระหว่าง 1–6');if(!Number.isInteger(Number(c.minuteFrom))||!Number.isInteger(Number(c.minuteTo))||c.minuteFrom<0||c.minuteTo>120||c.minuteFrom>c.minuteTo)e.push('ช่วงนาทีไม่ถูกต้อง');if(!Number.isInteger(Number(c.rollingWindowMinutes))||c.rollingWindowMinutes<2||c.rollingWindowMinutes>30)e.push('ช่วงย้อนหลังต้องอยู่ระหว่าง 2–30 นาที');if(!Number.isFinite(Number(c.oddsMin))||c.oddsMin<1.01)e.push('ราคาอย่างน้อยต้องเป็น 1.01');if(m==='over'&&c.lineMin>c.lineMax)e.push('เส้น Over ตั้งแต่ ต้องไม่มากกว่า เส้น Over ไม่เกิน');return e}
function light(m,state,text){const dot=document.querySelector(`[data-status-light="${m}"]`),label=document.querySelector(`[data-status-label="${m}"]`);if(dot){dot.className=`status-light is-${state}`}if(label)label.textContent=text}
function sync(){const r=runState();for(const m of MARKETS)light(m,r[m]?'run':'off',r[m]?'พร้อมต่อสาย / RUN':'หยุด')}
function setNote(form,text){const n=form.querySelector('[data-form-note]');if(n)n.textContent=text}
function boot(){
 const d=draft();const r=runState();
 for(const m of MARKETS){const form=document.querySelector(`form[data-market-form="${m}"]`);if(!form)continue;fillForm(form,d[m]);
  form.addEventListener('submit',ev=>{ev.preventDefault();const cfg=readForm(form,m),err=validate(m,cfg);if(err.length){light(m,'error','ค่าผิด');setNote(form,err[0]);return}const all=draft();all[m]=cfg;save(DRAFT_KEY,all);light(m,r[m]?'run':'ready',r[m]?'บันทึกแล้ว / RUN':'บันทึกแล้ว / รอต่อสาย');setNote(form,'บันทึกค่าหน้า 3.43 แล้ว · ยังไม่ส่งเข้าเครื่องจริง');});
  form.querySelector('[data-run-button]')?.addEventListener('click',()=>{const cfg=readForm(form,m),err=validate(m,cfg);if(err.length){light(m,'error','ค่าผิด');setNote(form,err[0]);return}const all=draft();all[m]=cfg;save(DRAFT_KEY,all);const next=runState();next[m]=true;save(RUN_KEY,next);r[m]=true;light(m,'run','พร้อมต่อสาย / RUN');setNote(form,'RUN โหมดทดสอบหน้าเว็บ · ยังไม่เรียกข้อมูล 5USD และยังไม่สร้าง Signal จริง');});
  form.querySelector('[data-stop-button]')?.addEventListener('click',()=>{const next=runState();next[m]=false;save(RUN_KEY,next);r[m]=false;light(m,'off','หยุด');setNote(form,'STOP · หน้าเว็บหยุดสถานะทดสอบ');});
 }
 document.querySelectorAll('[data-market-tab]').forEach(btn=>btn.addEventListener('click',()=>{const t=btn.dataset.marketTab;document.querySelectorAll('[data-market-tab]').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('[data-market-panel]').forEach(p=>{const on=p.dataset.marketPanel===t;p.hidden=!on;p.setAttribute('aria-hidden',String(!on))})}));
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.NOMAD343_SETTINGS_PREVIEW={version:VERSION,defaults:DEFAULTS,draft,runState};
})();
