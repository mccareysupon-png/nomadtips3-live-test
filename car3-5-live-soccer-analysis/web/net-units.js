const DEFAULT_WORKER='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
let runtime={liveUrl:`${DEFAULT_WORKER}/live`};
const $=id=>document.getElementById(id);
const base=()=>String(runtime.workerUrl||runtime.liveUrl||DEFAULT_WORKER).replace(/\/live(?:\?.*)?$/,'');
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
async function loadRuntime(){try{runtime={...runtime,...await json(`./runtime.json?t=${Date.now()}`)};}catch{}}
function range(){return document.querySelector('#historyRanges [data-range].active')?.dataset.range||'ALL';}
async function refresh(){
  try{
    const data=await json(`${base()}/history?page=1&limit=1&range=${encodeURIComponent(range())}&t=${Date.now()}`);
    const value=Number(data?.summary?.netUnits);
    const el=$('statUnits');
    if(el)el.textContent=Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(2)}u`:'—';
  }catch{const el=$('statUnits');if(el)el.textContent='—';}
}
await loadRuntime();
document.querySelectorAll('#historyRanges [data-range]').forEach(button=>button.addEventListener('click',()=>setTimeout(refresh,0)));
await refresh();
setInterval(refresh,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
