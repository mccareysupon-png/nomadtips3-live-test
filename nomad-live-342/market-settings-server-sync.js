(()=>{
'use strict';
const SERVER_BASE='https://nomadtips3-342-signal-engine.mccarey-supon.workers.dev';
const MARKETS=['over','under','oneXtwo','ah'];
let syncTimer=null,syncBusy=false,syncPending=false;

const api=()=>window.NOMAD342_MARKET_SETTINGS||null;
const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
const anyRun=run=>MARKETS.some(name=>Boolean(run?.[name]));
const snapshot=()=>{
  const settingsApi=api();if(!settingsApi)return null;
  const running=settingsApi.runningSnapshot?.()||{};
  return {
    ...running,
    settings:settingsApi.loadDraft?.()||running.settings||{},
    run:settingsApi.loadRun?.()||running.run||{}
  };
};

function setLight(name,running){
  const light=document.querySelector(`[data-status-light="${name}"]`),label=document.querySelector(`[data-status-label="${name}"]`);
  if(light){light.classList.remove('is-off','is-ready','is-run','is-error');light.classList.add(running?'is-run':'is-off')}
  if(label)label.textContent=running?'กำลังทำงาน · SERVER 24/7':'หยุด';
}
function setNote(name,text){const form=document.querySelector(`form[data-market-form="${name}"]`);const note=form?.querySelector('[data-form-note]');if(note)note.textContent=text}
function fillForm(name,cfg){
  const form=document.querySelector(`form[data-market-form="${name}"]`);if(!form||!cfg)return;
  for(const el of form.elements){
    if(!el.name)continue;
    const value=cfg[el.name];
    if(el.type==='radio'){el.checked=String(el.value).toUpperCase()===String(value).toUpperCase();continue}
    if(value!==undefined&&value!==null)el.value=String(value);
  }
}
function applyLocal(serverSnapshot){
  const settingsApi=api();if(!settingsApi||!serverSnapshot)return;
  const settings=serverSnapshot.settings||{},run=serverSnapshot.run||{};
  try{
    localStorage.setItem(settingsApi.activeKey,JSON.stringify(settings));
    localStorage.setItem(settingsApi.draftKey,JSON.stringify(settings));
    localStorage.setItem(settingsApi.runKey,JSON.stringify({over:Boolean(run.over),under:Boolean(run.under),oneXtwo:Boolean(run.oneXtwo),ah:Boolean(run.ah),updatedAt:finite(run.updatedAt)||finite(serverSnapshot.updatedAt)||Date.now()}));
  }catch{}
  for(const name of MARKETS){fillForm(name,settings[name]);setLight(name,Boolean(run[name]));if(run[name])setNote(name,'SERVER 24/7 · ระบบตรวจจับทำงานต่อแม้ปิดหน้านี้')}
}
async function readServer(){
  const response=await fetch(`${SERVER_BASE}/settings?t=${Date.now()}`,{cache:'no-store'});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok||data?.ok===false||!data?.snapshot)throw new Error(data?.error||`SERVER_HTTP_${response.status}`);
  return data.snapshot;
}
async function writeServer(localSnapshot){
  const response=await fetch(`${SERVER_BASE}/settings`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot:localSnapshot}),cache:'no-store'});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok||data?.ok===false||!data?.snapshot)throw new Error(data?.error||`SERVER_HTTP_${response.status}`);
  return data.snapshot;
}
function verifyServerEcho(localSnapshot,serverSnapshot){
  const wanted=finite(localSnapshot?.settings?.over?.maxGoalsToFullWin),received=finite(serverSnapshot?.settings?.over?.maxGoalsToFullWin);
  if(wanted>0&&received!==wanted)throw new Error(`OVER_FULL_WIN_GOALS_SYNC_MISMATCH:${wanted}->${received}`);
}
function markSynced(serverSnapshot){
  const run=serverSnapshot?.run||{};
  for(const name of MARKETS){
    setLight(name,Boolean(run[name]));
    if(run[name])setNote(name,'RUNNING · SERVER 24/7 · ปิดหน้านี้ได้');
    else{
      const form=document.querySelector(`form[data-market-form="${name}"]`),note=form?.querySelector('[data-form-note]');
      if(note&&/SERVER|RUNNING/i.test(note.textContent||''))note.textContent='STOP · ฝั่งเซิร์ฟเวอร์หยุดตรวจตลาดนี้แล้ว';
    }
  }
}
function markError(error){
  const local=snapshot(),message=String(error?.message||error||'server_sync_failed');
  for(const name of MARKETS){
    if(!local?.run?.[name]&&name!=='over')continue;
    const light=document.querySelector(`[data-status-light="${name}"]`),label=document.querySelector(`[data-status-label="${name}"]`);
    if(light){light.classList.remove('is-off','is-ready','is-run');light.classList.add('is-error')}
    if(label)label.textContent='SERVER SYNC ERROR';
    setNote(name,`ค่าถูกเก็บในเครื่อง แต่เซิร์ฟเวอร์ยังไม่ยืนยัน · ${message.slice(0,80)}`);
  }
}
async function pushCurrent(){
  if(syncBusy){syncPending=true;return}
  const local=snapshot();if(!local)return;syncBusy=true;
  try{
    const server=await writeServer(local);
    verifyServerEcho(local,server);
    applyLocal(server);
    markSynced(server);
  }catch(error){markError(error)}
  finally{
    syncBusy=false;
    if(syncPending){syncPending=false;queuePush()}
  }
}
function queuePush(){clearTimeout(syncTimer);syncTimer=setTimeout(pushCurrent,60)}
async function reconcile(){
  const settingsApi=api();if(!settingsApi)return;
  const local=snapshot();
  try{
    const server=await readServer(),localTime=finite(local?.run?.updatedAt),serverTime=Math.max(finite(server?.updatedAt),finite(server?.run?.updatedAt));
    const localRunning=anyRun(local?.run),serverRunning=anyRun(server?.run);
    if(localRunning&&!serverRunning&&localTime>=serverTime){
      const saved=await writeServer(local);verifyServerEcho(local,saved);applyLocal(saved);markSynced(saved);return;
    }
    if(localRunning&&serverRunning&&localTime>serverTime+1000){
      const saved=await writeServer(local);verifyServerEcho(local,saved);applyLocal(saved);markSynced(saved);return;
    }
    if(!serverRunning&&!localRunning&&localTime>serverTime+1000)return;
    applyLocal(server);markSynced(server);
  }catch(error){markError(error)}
}
function start(){
  if(document.body?.dataset?.page!=='market-settings-v3')return;
  document.addEventListener('nomad342:marketsettingsrun',queuePush);
  document.addEventListener('nomad342:marketsettingsstop',queuePush);
  document.addEventListener('submit',event=>{if(event.target?.matches?.('form[data-market-form]'))queuePush()});
  window.addEventListener('focus',()=>{if(!syncBusy)reconcile()});
  reconcile();
  window.NOMAD342_SERVER_SETTINGS=Object.freeze({base:SERVER_BASE,reconcile,pushCurrent});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
