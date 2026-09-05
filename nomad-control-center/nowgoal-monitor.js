(()=>{
'use strict';

const HEALTH_URL='https://nomadtips3-live-engine.mccarey-supon.workers.dev/health';
const CARD_ID='nowgoalMonitorCard';
const POLL_MS=10_000;
let busy=false;

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const num=value=>finite(value)?Number(value):0;
const pct=(value,total)=>total>0?Math.max(0,Math.min(100,Math.round(value/total*100))):null;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function stateFor(payload,source){
  if(!payload||payload.ok===false)return ['ERROR','state-error'];
  const status=String(source?.status||'').toUpperCase();
  if(status==='ERROR')return ['ERROR','state-error'];
  if(status==='READY')return ['READY','state-ready'];
  if(status==='NOT_NEEDED'||status==='IDLE')return [status.replace('_',' '),'state-unlinked'];
  return status?[status,'state-unlinked']:['NO TELEMETRY','state-degraded'];
}

function cardMarkup(payload,latency){
  const source=payload?.source?.oddspedia||{};
  const checked=num(source.checked),mapped=num(source.mapped),ready=num(source.ready),selected=num(source.selected);
  const coverage=pct(mapped,checked),readyRate=pct(ready,checked);
  const [state,stateClass]=stateFor(payload,source);
  const width=coverage==null?0:coverage;
  const sourceStatus=String(source.status||'—').replaceAll('_',' ');
  const note=source.error?`Source error: ${source.error}`:'Read-only monitor · telemetry from NOMAD Live Engine · does not alter AH referee or price selection.';
  return `<article class="system-card" id="${CARD_ID}">
    <div class="card-top"><div><div class="system-name">Nowgoal · AH Referee</div><div class="role">LIVE AH PRICE CONSENSUS · 20 BOOKMAKERS</div></div><span class="state-badge ${stateClass}">${esc(state)}</span></div>
    <div class="load-row"><div class="load-head"><span>PRICE COVERAGE</span><b>${coverage==null?'—':`${coverage}%`}</b></div><div class="bar"><i style="width:${width}%"></i></div><div class="load-head"><span>${mapped}/${checked} mapped</span><span>20 bookmaker identities</span></div></div>
    <div class="metrics">
      <div class="metric"><span>Checked</span><b>${checked}</b></div>
      <div class="metric"><span>Mapped</span><b>${mapped}</b></div>
      <div class="metric"><span>Price ready</span><b>${ready}</b></div>
      <div class="metric"><span>Ready rate</span><b>${readyRate==null?'—':`${readyRate}%`}</b></div>
      <div class="metric"><span>Selected</span><b>${selected}</b></div>
      <div class="metric"><span>Latency</span><b>${finite(latency)?`${Math.round(latency)} ms`:'—'}</b></div>
    </div>
    <div class="display-map">
      <div class="display-row"><span>หน้าที่</span><b>กรรมการราคา AH / consensus</b></div>
      <div class="display-row"><span>Source status</span><b>${esc(sourceStatus)}</b></div>
      <div class="system-links"><a class="system-link health" href="${HEALTH_URL}" target="_blank" rel="noopener noreferrer">ตรวจสุขภาพ</a></div>
      <div class="system-relation">อ่าน telemetry จาก NOMAD Live Engine · source.oddspedia เป็นชื่อ field เดิม แต่ backend ปัจจุบันใช้ Nowgoal</div>
    </div>
    <div class="note">${esc(note)}</div>
  </article>`;
}

function placeCard(markup){
  const grid=document.getElementById('systemsGrid');
  if(!grid)return;
  const old=document.getElementById(CARD_ID);if(old)old.remove();
  const liveEngine=[...grid.querySelectorAll('.system-card')].find(card=>card.querySelector('.system-name')?.textContent.trim()==='NOMAD Live Engine');
  if(liveEngine)liveEngine.insertAdjacentHTML('afterend',markup);else grid.insertAdjacentHTML('beforeend',markup);
}

async function refresh(){
  if(busy||document.hidden)return;busy=true;
  const started=performance.now();
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(`${HEALTH_URL}?_nowgoal_monitor=${Date.now()}`,{cache:'no-store',signal:controller.signal});
      const latency=Math.round(performance.now()-started);
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      placeCard(cardMarkup(payload,latency));
    }finally{clearTimeout(timer)}
  }catch(error){
    placeCard(`<article class="system-card" id="${CARD_ID}"><div class="card-top"><div><div class="system-name">Nowgoal · AH Referee</div><div class="role">LIVE AH PRICE CONSENSUS · 20 BOOKMAKERS</div></div><span class="state-badge state-offline">OFFLINE</span></div><div class="load-row"><div class="load-head"><span>PRICE COVERAGE</span><b>—</b></div><div class="bar"><i style="width:0%"></i></div><div class="load-head"><span>Telemetry unavailable</span><span>20 bookmaker identities</span></div></div><div class="note">Monitor contact failed: ${esc(error?.name==='AbortError'?'TIMEOUT':error?.message||error)}</div></article>`);
  }finally{busy=false}
}

const grid=document.getElementById('systemsGrid');
if(grid)new MutationObserver(()=>{if(!document.getElementById(CARD_ID))setTimeout(refresh,25)}).observe(grid,{childList:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
setTimeout(refresh,250);
setInterval(refresh,POLL_MS);
})();
