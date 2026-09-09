(()=>{
'use strict';
const BASE='https://nomadtips3-shot-sidecar-342.mccarey-supon.workers.dev';

function style(){
  if(document.getElementById('n342shot-settings-style'))return;
  const el=document.createElement('style');el.id='n342shot-settings-style';
  el.textContent=`
    .n342shot-settings{margin:16px 0;padding:14px 16px;background:#171b17;border:1px solid #2c352c;color:#dce6dc}
    .n342shot-settings-head{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}
    .n342shot-settings h2{margin:4px 0 0;font-size:16px}.n342shot-settings p{margin:0;color:#9ba69b;font-size:11px}
    .n342shot-settings-badge{font:800 10px/1 Arial;padding:7px 9px;border:1px solid #556355;color:#cbd7cb}
    .n342shot-settings-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}
    .n342shot-settings-grid div{padding:9px;background:#111411}.n342shot-settings-grid span{display:block;color:#818b81;font-size:9px}.n342shot-settings-grid b{display:block;margin-top:5px;font-size:13px}
    @media(max-width:700px){.n342shot-settings-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(el);
}
function panel(){
  let el=document.getElementById('n342shotSettings');if(el)return el;
  const shell=document.querySelector('.settings-v3-shell');if(!shell)return null;
  el=document.createElement('section');el.id='n342shotSettings';el.className='n342shot-settings';
  el.dataset.detectorConnected='false';
  el.innerHTML=`<div class="n342shot-settings-head"><div><p>SHOT DATA BRIDGE · 5DOLLAR</p><h2>เตรียมสาย SOT / SOFF สำหรับ 3.42</h2></div><span class="n342shot-settings-badge">DISPLAY ONLY · DETECTOR NOT CONNECTED</span></div><div class="n342shot-settings-grid"><div><span>SOURCE</span><b data-shot-field="source">5Dollar Pro</b></div><div><span>ROLLING</span><b data-shot-field="window">20 min</b></div><div><span>MATCHED</span><b data-shot-field="matched">—</b></div><div><span>STATS READY</span><b data-shot-field="ready">—</b></div><div><span>NOMAD LIVE</span><b data-shot-field="nomad">—</b></div><div><span>PROVIDER LIVE</span><b data-shot-field="provider">—</b></div><div><span>AMBIGUOUS</span><b data-shot-field="ambiguous">—</b></div><div><span>FUTURE PORT</span><b data-shot-field="future">READY · CLOSED</b></div></div>`;
  shell.appendChild(el);return el;
}
function set(el,name,value){const node=el?.querySelector(`[data-shot-field="${name}"]`);if(node)node.textContent=String(value??'—')}
async function refresh(){
  const el=panel();if(!el)return;
  try{
    const response=await fetch(`${BASE}/status?t=${Date.now()}`,{cache:'no-store',headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.error||`SHOT_STATUS_HTTP_${response.status}`);
    const c=payload.counts||{};
    set(el,'window',`${payload.rollingWindowMinutes??20} min`);set(el,'matched',`${c.matched??0}`);set(el,'ready',`${c.statsReady??0}`);set(el,'nomad',`${c.nomadLive??0}`);set(el,'provider',`${c.providerLive??0}`);set(el,'ambiguous',`${c.ambiguous??0}`);set(el,'future',payload.futureDetectorPort==='READY'?'READY · CLOSED':'CLOSED');
  }catch{set(el,'matched','OFFLINE');set(el,'ready','—')}
}
function mount(){
  if(document.body?.dataset?.page!=='market-settings-v3')return;
  style();panel();refresh();
}
window.NOMAD342_SHOT_SETTINGS_STATUS=Object.freeze({base:BASE,mount,refresh});
// Prepared only. This file is intentionally NOT loaded by settings.html yet.
})();
