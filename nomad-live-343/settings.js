(()=>{
'use strict';
const VERSION='nomad343-settings-server-v1';
const API_BASE='https://nomadtips3-343-auto-engine.mccarey-supon.workers.dev';
const DRAFT_KEY='nomad343MarketSettingsDraftV1';
const RUN_KEY='nomad343MarketRunV1';
const MARKETS=['over','under','oneXtwo','ah'];
const DEFAULTS={
 over:{lineMin:0.5,lineMax:10,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 under:{sideMode:'BOTH',lineMin:0.5,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:45,attackPct:45,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 oneXtwo:{sideMode:'BOTH',scoreTrailingMax:1,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
 ah:{sideMode:'BOTH',lineMin:-10,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10}
};
let serverState=null;
let serverOnline=false;
let currentSettings=null;
let currentRun=null;
function clone(v){return JSON.parse(JSON.stringify(v))}
function load(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:fallback}catch{return fallback}}
function save(key,v){localStorage.setItem(key,JSON.stringify(v))}
function mergeSettings(raw){const out={};for(const m of MARKETS)out[m]={...clone(DEFAULTS[m]),...(raw?.[m]||{})};return out}
function localDraft(){return mergeSettings(load(DRAFT_KEY,{}))}
function localRun(){return {...{over:false,under:false,oneXtwo:false,ah:false},...load(RUN_KEY,{})}}
async function api(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const res=await fetch(`${API_BASE}${path}`,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})},signal:controller.signal});
  const text=await res.text();let body=null;try{body=JSON.parse(text)}catch{}
  if(!res.ok||!body)throw new Error(body?.error||`HTTP_${res.status}`);
  return body;
 }finally{clearTimeout(timer)}
}
function readForm(form,market){const cfg={...(currentSettings?.[market]||localDraft()[market])};for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){if(el.checked)cfg[el.name]=el.value;continue;}if(el.tagName==='SELECT')cfg[el.name]=Number(el.value);else cfg[el.name]=Number(el.value)}return cfg}
function fillForm(form,cfg){for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){el.checked=String(el.value).toUpperCase()===String(cfg[el.name]).toUpperCase()}else el.value=String(cfg[el.name]??'')}}
function validate(m,c){const e=[];for(const k of ['shotOnTarget','shotOff','corner'])if(!Number.isFinite(Number(c[k]))||c[k]<0||c[k]>50)e.push('ค่าจำนวนครั้งต้องอยู่ระหว่าง 0–50');for(const k of ['dangerousAttackPct','attackPct','possessionPct'])if(!Number.isFinite(Number(c[k]))||c[k]<0||c[k]>100)e.push('ค่าเปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100');if(!Number.isInteger(Number(c.evidenceRequired))||c.evidenceRequired<1||c.evidenceRequired>6)e.push('จำนวนหลักฐานต้องอยู่ระหว่าง 1–6');if(!Number.isInteger(Number(c.minuteFrom))||!Number.isInteger(Number(c.minuteTo))||c.minuteFrom<0||c.minuteTo>120||c.minuteFrom>c.minuteTo)e.push('ช่วงนาทีไม่ถูกต้อง');if(!Number.isInteger(Number(c.rollingWindowMinutes))||c.rollingWindowMinutes<2||c.rollingWindowMinutes>30)e.push('ช่วงย้อนหลังต้องอยู่ระหว่าง 2–30 นาที');if(!Number.isFinite(Number(c.oddsMin))||c.oddsMin<1.01)e.push('ราคาอย่างน้อยต้องเป็น 1.01');if(m==='over'&&c.lineMin>c.lineMax)e.push('เส้น Over ตั้งแต่ ต้องไม่มากกว่า เส้น Over ไม่เกิน');return e}
function light(m,state,text){const dot=document.querySelector(`[data-status-light="${m}"]`),label=document.querySelector(`[data-status-label="${m}"]`);if(dot)dot.className=`status-light is-${state}`;if(label)label.textContent=text}
function badge(){const el=document.querySelector('.preview-badge');if(!el)return;if(serverOnline){const status=serverState?.status||'STARTING_OR_STALE';el.textContent=status==='ONLINE'?'AUTO SERVER · ทำงานบน Cloudflare ทุก 1 นาที · ปิดหน้าเว็บได้':'AUTO SERVER · กำลังเริ่ม/รอรอบ Cron · ปิดหน้าเว็บได้';}else el.textContent='SERVER OFFLINE · หน้าเว็บติดต่อเครื่อง 3.43 ไม่ได้';}
function sync(){const run=currentRun||localRun();for(const m of MARKETS){if(!serverOnline){light(m,'error','OFFLINE');continue}if(run[m])light(m,serverState?.status==='ONLINE'?'run':'ready',serverState?.status==='ONLINE'?'AUTO / ONLINE':'AUTO / STARTING');else light(m,'off','STOP');}badge()}
function setNote(form,text){const n=form.querySelector('[data-form-note]');if(n)n.textContent=text}
async function refreshState({migrate=true}={}){
 try{
  const state=await api('/api/state');serverOnline=true;serverState=state;currentSettings=mergeSettings(state.settings);currentRun={...{over:false,under:false,oneXtwo:false,ah:false},...(state.run||{})};
  if(migrate&&state.settingsInitialized===false){
   const rawDraft=load(DRAFT_KEY,null);if(rawDraft){currentSettings=mergeSettings(rawDraft);await api('/api/settings',{method:'POST',body:JSON.stringify({settings:currentSettings})});}
   const rawRun=load(RUN_KEY,null);if(rawRun){for(const m of MARKETS)if(Object.prototype.hasOwnProperty.call(rawRun,m))await api('/api/run',{method:'POST',body:JSON.stringify({market:m,running:Boolean(rawRun[m])})});const again=await api('/api/state');serverState=again;currentRun={...currentRun,...again.run};}
  }
 }catch(error){serverOnline=false;serverState=null;currentSettings=currentSettings||localDraft();currentRun=currentRun||localRun();}
 sync();return serverOnline;
}
async function saveMarket(m,cfg,form){
 const all=mergeSettings(currentSettings||localDraft());all[m]=cfg;currentSettings=all;save(DRAFT_KEY,all);
 if(!serverOnline)throw new Error('SERVER_OFFLINE');
 const out=await api('/api/settings',{method:'POST',body:JSON.stringify({settings:all})});currentSettings=mergeSettings(out.settings);setNote(form,'บันทึกเข้าเครื่อง 3.43 บนเซิร์ฟเวอร์แล้ว');
}
async function setRun(m,running,form){
 if(!serverOnline)throw new Error('SERVER_OFFLINE');
 const out=await api('/api/run',{method:'POST',body:JSON.stringify({market:m,running})});currentRun={...currentRun,...out.run};save(RUN_KEY,currentRun);
 if(running){api('/scan',{method:'POST'}).catch(()=>{});setNote(form,'RUN AUTO SERVER แล้ว · ปิดหน้าเว็บได้ ระบบยังทำงานต่อ');}
 else setNote(form,'STOP บนเซิร์ฟเวอร์แล้ว');
 await refreshState({migrate:false});
}
async function boot(){
 await refreshState();
 const d=currentSettings||localDraft();
 for(const m of MARKETS){const form=document.querySelector(`form[data-market-form="${m}"]`);if(!form)continue;fillForm(form,d[m]);
  form.addEventListener('submit',async ev=>{ev.preventDefault();const cfg=readForm(form,m),err=validate(m,cfg);if(err.length){light(m,'error','ค่าผิด');setNote(form,err[0]);return}try{await saveMarket(m,cfg,form);sync()}catch{light(m,'error','OFFLINE');setNote(form,'บันทึกในเครื่องไว้แล้ว แต่ SERVER 3.43 ยังติดต่อไม่ได้')}});
  form.querySelector('[data-run-button]')?.addEventListener('click',async()=>{const cfg=readForm(form,m),err=validate(m,cfg);if(err.length){light(m,'error','ค่าผิด');setNote(form,err[0]);return}try{await saveMarket(m,cfg,form);await setRun(m,true,form)}catch{light(m,'error','OFFLINE');setNote(form,'RUN ไม่สำเร็จ · SERVER 3.43 ยังติดต่อไม่ได้')}});
  form.querySelector('[data-stop-button]')?.addEventListener('click',async()=>{try{await setRun(m,false,form)}catch{light(m,'error','OFFLINE');setNote(form,'STOP ไม่สำเร็จ · SERVER 3.43 ยังติดต่อไม่ได้')}});
 }
 document.querySelectorAll('[data-market-tab]').forEach(btn=>btn.addEventListener('click',()=>{const t=btn.dataset.marketTab;document.querySelectorAll('[data-market-tab]').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('[data-market-panel]').forEach(p=>{const on=p.dataset.marketPanel===t;p.hidden=!on;p.setAttribute('aria-hidden',String(!on))})}));
 sync();setInterval(()=>refreshState({migrate:false}),30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.NOMAD343_SETTINGS_SERVER={version:VERSION,apiBase:API_BASE,refresh:()=>refreshState({migrate:false}),state:()=>serverState};
})();
