(()=>{
'use strict';
const VERSION='market-settings-v3';
const DRAFT_KEY='nomad342MarketSettingsDraftV3';
const ACTIVE_KEY='nomad342MarketSettingsActiveV3';
const RUN_KEY='nomad342MarketRunV3';
const MARKETS=['over','under','oneXtwo'];
const DEFAULTS=Object.freeze({
  over:{lineMin:0.5,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
  under:{sideMode:'BOTH',lineMin:0.5,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
  oneXtwo:{sideMode:'BOTH',scoreTrailingMax:0,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5}
});
function clone(v){return JSON.parse(JSON.stringify(v))}
function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function loadJson(key,fallback){try{const raw=JSON.parse(localStorage.getItem(key)||'null');return raw&&typeof raw==='object'?raw:fallback}catch{return fallback}}
function normalizeMarket(name,input={}){
  const base=clone(DEFAULTS[name]);const out={...base,...(input||{})};
  if(name!=='over')out.sideMode=['HOME','AWAY','BOTH'].includes(String(out.sideMode||'').toUpperCase())?String(out.sideMode).toUpperCase():'BOTH';
  for(const key of Object.keys(base)){
    if(key==='sideMode')continue;
    const n=finite(out[key]);out[key]=n===null?base[key]:n;
  }
  return out;
}
function normalizeSettings(input={}){return {version:VERSION,over:normalizeMarket('over',input.over),under:normalizeMarket('under',input.under),oneXtwo:normalizeMarket('oneXtwo',input.oneXtwo)}}
function loadDraft(){return normalizeSettings(loadJson(DRAFT_KEY,{}))}
function loadActive(){return normalizeSettings(loadJson(ACTIVE_KEY,loadDraft()))}
function loadRun(){const raw=loadJson(RUN_KEY,{});return {over:Boolean(raw.over),under:Boolean(raw.under),oneXtwo:Boolean(raw.oneXtwo),updatedAt:finite(raw.updatedAt)}}
function saveDraft(settings){const next=normalizeSettings(settings);localStorage.setItem(DRAFT_KEY,JSON.stringify(next));return next}
function saveActive(settings){const next=normalizeSettings(settings);localStorage.setItem(ACTIVE_KEY,JSON.stringify(next));return next}
function saveRun(run){const next={over:Boolean(run.over),under:Boolean(run.under),oneXtwo:Boolean(run.oneXtwo),updatedAt:Date.now()};localStorage.setItem(RUN_KEY,JSON.stringify(next));return next}
function validate(name,cfg){
  const e=[];
  if(!MARKETS.includes(name))return ['ไม่รู้จักตลาด'];
  if(!Number.isInteger(Number(cfg.minuteFrom))||cfg.minuteFrom<0||cfg.minuteFrom>120)e.push('นาทีเริ่มต้องเป็นจำนวนเต็ม 0–120');
  if(!Number.isInteger(Number(cfg.minuteTo))||cfg.minuteTo<0||cfg.minuteTo>120)e.push('นาทีจบต้องเป็นจำนวนเต็ม 0–120');
  if(Number(cfg.minuteFrom)>Number(cfg.minuteTo))e.push('นาทีเริ่มต้องไม่มากกว่านาทีจบ');
  if(!Number.isInteger(Number(cfg.rollingWindowMinutes))||cfg.rollingWindowMinutes<2||cfg.rollingWindowMinutes>30)e.push('ช่วงย้อนหลังต้องเป็น 2–30 นาที');
  if(finite(cfg.oddsMin)===null||cfg.oddsMin<1.01||cfg.oddsMin>20)e.push('ราคา odds ต้องเริ่มตั้งแต่ 1.01');
  if(name!=='oneXtwo'&&(finite(cfg.lineMin)===null||cfg.lineMin<0.5||cfg.lineMin>10||!Number.isInteger(cfg.lineMin*2)))e.push('เส้นประตูใช้ 0.5–10.0 เพิ่มทีละ 0.5');
  if(name==='oneXtwo'&&(!Number.isInteger(Number(cfg.scoreTrailingMax))||cfg.scoreTrailingMax<0||cfg.scoreTrailingMax>10))e.push('ระยะห่างของสกอร์ต้องเป็นจำนวนเต็ม 0–10');
  if(name!=='over'&&!['HOME','AWAY','BOTH'].includes(String(cfg.sideMode||'').toUpperCase()))e.push('เลือก Home / Away / Both ให้ถูกต้อง');
  for(const key of ['shotOnTarget','shotOff','corner'])if(finite(cfg[key])===null||cfg[key]<0||cfg[key]>50)e.push(`${key} ต้องเป็น 0–50`);
  for(const key of ['dangerousAttackPct','attackPct','possessionPct'])if(finite(cfg[key])===null||cfg[key]<0||cfg[key]>100)e.push(`${key} ต้องเป็น 0–100%`);
  if(!Number.isInteger(Number(cfg.evidenceRequired))||cfg.evidenceRequired<1||cfg.evidenceRequired>6)e.push('ต้องการหลักฐานดังกล่าวต้องเป็น 1–6');
  return e;
}
function marketActive(name){const run=loadRun();return Boolean(run[name])?loadActive()[name]:null}
function anyRunning(){const r=loadRun();return MARKETS.some(k=>r[k])}
function runMarket(name,cfg){const errors=validate(name,cfg);if(errors.length)return {ok:false,errors};const draft=loadDraft();draft[name]=normalizeMarket(name,cfg);saveDraft(draft);const active=loadActive();active[name]=normalizeMarket(name,cfg);saveActive(active);const run=loadRun();run[name]=true;saveRun(run);document.dispatchEvent(new CustomEvent('nomad342:marketsettingsrun',{detail:{market:name,settings:active[name]}}));return {ok:true,settings:active[name]}}
function stopMarket(name){const run=loadRun();run[name]=false;saveRun(run);document.dispatchEvent(new CustomEvent('nomad342:marketsettingsstop',{detail:{market:name}}));return run}
function stopAll(){saveRun({over:false,under:false,oneXtwo:false});document.dispatchEvent(new CustomEvent('nomad342:marketsettingsstop',{detail:{market:'all'}}))}
function runningSnapshot(){return {version:VERSION,settings:loadActive(),run:loadRun()}}
function readForm(form,name){const base=loadDraft()[name],next={...base};for(const el of form.elements){if(!el.name)continue;if(el.type==='radio'){if(el.checked)next[el.name]=el.value;continue;}next[el.name]=el.tagName==='SELECT'?el.value:Number(el.value)}return normalizeMarket(name,next)}
function fillForm(form,name,cfg){for(const el of form.elements){if(!el.name)continue;const v=cfg[el.name];if(el.type==='radio'){el.checked=String(el.value).toUpperCase()===String(v).toUpperCase();continue;}el.value=String(v??'')}}
function setText(node,text){if(node)node.textContent=text}
function setLight(name,state,message){const light=document.querySelector(`[data-status-light="${name}"]`),label=document.querySelector(`[data-status-label="${name}"]`);if(light){light.classList.remove('is-off','is-ready','is-run','is-error');light.classList.add(`is-${state}`)}setText(label,message)}
function syncStatus(name){const run=loadRun();setLight(name,run[name]?'run':'off',run[name]?'กำลังทำงาน':'หยุด')}
function startSettingsPage(){
  if(document.body?.dataset?.page!=='market-settings-v3')return;
  let draft=loadDraft();
  for(const name of MARKETS){
    const form=document.querySelector(`form[data-market-form="${name}"]`);if(!form)continue;fillForm(form,name,draft[name]);syncStatus(name);
    form.addEventListener('submit',event=>{event.preventDefault();const next=readForm(form,name),errors=validate(name,next);const note=form.querySelector('[data-form-note]');if(errors.length){setLight(name,'error','ตั้งค่าไม่ถูกต้อง');setText(note,errors[0]);return;}draft[name]=next;saveDraft(draft);const run=loadRun();run[name]=false;saveRun(run);setLight(name,'ready','บันทึกแล้ว · รอกด RUN');setText(note,'บันทึกแล้ว · ค่านี้ยังไม่ทำงานจนกว่าจะกด RUN');});
    form.querySelector('[data-run-button]')?.addEventListener('click',()=>{const next=readForm(form,name),result=runMarket(name,next),note=form.querySelector('[data-form-note]');if(!result.ok){setLight(name,'error','ตั้งค่าไม่ถูกต้อง');setText(note,result.errors[0]);return;}draft[name]=next;setLight(name,'run','กำลังทำงาน');setText(note,'RUNNING · ใช้ค่าชุดนี้กับการตรวจจับใหม่');});
    form.querySelector('[data-stop-button]')?.addEventListener('click',()=>{stopMarket(name);setLight(name,'off','หยุด');setText(form.querySelector('[data-form-note]'),'STOP · ไม่สร้าง Signal ใหม่ของตลาดนี้');});
  }
  document.querySelectorAll('[data-market-tab]').forEach(button=>button.addEventListener('click',()=>{
    const target=button.dataset.marketTab;document.querySelectorAll('[data-market-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('[data-market-panel]').forEach(p=>{const on=p.dataset.marketPanel===target;p.hidden=!on;p.setAttribute('aria-hidden',String(!on));});
  }));
}
window.NOMAD342_MARKET_SETTINGS=Object.freeze({version:VERSION,draftKey:DRAFT_KEY,activeKey:ACTIVE_KEY,runKey:RUN_KEY,defaults:DEFAULTS,loadDraft,loadActive,loadRun,saveDraft,saveActive,saveRun,validate,marketActive,anyRunning,runMarket,stopMarket,stopAll,runningSnapshot});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startSettingsPage,{once:true});else startSettingsPage();
})();
