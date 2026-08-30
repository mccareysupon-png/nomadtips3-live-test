(()=>{
'use strict';
const config=window.NOMAD342_CONFIG;
if(!config?.defaults)throw new Error('NOMAD342_CONFIG missing');
const SETTINGS_KEY=config.settingsKey;
const DEFAULTS=config.defaults;
const LEDGER_KEY='nomadLedger342';
const runtime=window.NOMAD342_RUNTIME||{};
function settings(){try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return {...DEFAULTS,...saved,allowedSelectionLines:Array.isArray(saved.allowedSelectionLines)?saved.allowedSelectionLines:[...(DEFAULTS.allowedSelectionLines||[])]};}catch{return {...DEFAULTS,allowedSelectionLines:[...(DEFAULTS.allowedSelectionLines||[])]};}}
function saveSettings(v){localStorage.setItem(SETTINGS_KEY,JSON.stringify(v));}
function fmtLine(n){if(n===null||n===undefined||!Number.isFinite(Number(n)))return '—';const x=Number(Number(n).toFixed(2));return `${x>0?'+':''}${x}`;}
function fillLineOptions(select){if(!select||select.options.length)return;for(let v=-5;v<=5.0001;v+=.25){const n=Number(v.toFixed(2)),op=document.createElement('option');op.value=String(n);op.textContent=fmtLine(n);select.appendChild(op);}}
function bindSettings(){
  const form=document.getElementById('settingsForm');if(!form)return;const lines=form.elements.allowedSelectionLines;fillLineOptions(lines);const c=settings();
  Object.entries(c).forEach(([k,v])=>{const e=form.elements[k];if(!e)return;if(k==='allowedSelectionLines'){[...e.options].forEach(op=>op.selected=(v||[]).map(Number).includes(Number(op.value)));return;}if(e.type==='checkbox')e.checked=Boolean(v);else e.value=v;});
  form.addEventListener('submit',event=>{event.preventDefault();const v={...c};for(const [k,d] of Object.entries(DEFAULTS)){const x=form.elements[k];if(!x)continue;if(k==='allowedSelectionLines'){v[k]=[...x.selectedOptions].map(o=>Number(o.value));continue;}if(typeof d==='boolean')v[k]=x.checked;else if(typeof d==='number')v[k]=Number(x.value);else v[k]=x.value;}saveSettings(v);const status=document.getElementById('saveStatus');if(status)status.textContent='Saved';});
  document.getElementById('defaultsButton')?.addEventListener('click',()=>{saveSettings({...DEFAULTS,allowedSelectionLines:[...(DEFAULTS.allowedSelectionLines||[])]});location.reload();});
}
async function fetchJson(url,timeoutMs=6000){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeoutMs);
  try{const response=await fetch(url,{cache:'no-store',signal:ac.signal});if(!response.ok)throw new Error(`http_${response.status}`);return await response.json();}finally{clearTimeout(timer);}
}
async function renderHealth(){
  const grid=document.getElementById('healthGrid');if(!grid)return;const c=settings();
  const priceBase=String(runtime.priceBase||'https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev').replace(/\/$/,'');
  let adapter=null,adapterError=null;
  try{adapter=await fetchJson(`${priceBase}${runtime.priceHealthPath||'/health'}`,Number(runtime.priceTimeoutMs)||8000);}catch(error){adapterError=String(error?.message||error);}
  const ready=Boolean(adapter?.ok&&adapter?.keyConfigured);
  const adapterState=ready?'READY':adapter?'WAIT':'ERROR';
  const source=adapter?.source||{};
  const items=[
    ['Event Engine',runtime.engineBase?'READY':'WAIT',runtime.engineBase?'TotalCorner 3.42 event feed remains the match/event source.':'3.42 event engine endpoint is not configured.'],
    ['5Dollar Adapter',adapterState,ready?'External price adapter is reachable and its 5Dollar API key is configured.':adapterError?`Adapter health request failed: ${adapterError}`:'Adapter is reachable but the upstream API key is not ready.'],
    ['Bet365 Price Feed',ready?'READY':'WAIT',ready?`${source.source||'5DollarFootballAPI'} supplies ${source.bookmaker||'Bet365'} Full Match LIVE AH prices.`:'Bet365 price confirmation waits until the 5Dollar adapter is healthy.'],
    ['Fixture Mapping','READY','Team/league mapping is fail-closed; low-confidence or ambiguous matches do not receive a price.'],
    ['AH Validator','READY','Only valid quarter-goal HOME AH lines with two-sided decimal odds above 1.00 enter the price gate.'],
    ['Freshness Gate','READY',`Configured maximum adapter-observation age is ${c.maximumPriceAgeSeconds}s. 5Dollar timestamps are treated as adapter observation time, not Bet365 upstream-update time.`],
    ['Final Judge',ready?'ARMED':'WAIT','Signal requires TotalCorner Event Gate PASS plus a valid Bet365 HOME AH quote from 5Dollar inside configured line and odds limits.']
  ];
  grid.innerHTML=items.map(i=>`<article class="health-item"><header><span>${i[0]}</span><b class="${['LIVE','READY','VALID','ARMED'].includes(i[1])?'oktxt':'waittxt'}">${i[1]}</b></header><div class="note">${i[2]}</div></article>`).join('');
}
function renderLegacyStats(){
  const tbody=document.getElementById('statsBody');if(!tbody)return;let rows=[];try{rows=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]');}catch{}
  tbody.innerHTML=rows.length?rows.map(r=>`<tr><td>${new Date(r.ts).toLocaleString()}</td><td>${r.match}</td><td>${r.minute}'</td><td>${r.score}</td><td>HOME ${r.line}</td><td>${r.odds}</td><td>${r.source||'Bet365'}</td><td>${r.result||'PENDING'}</td><td>${r.reason||''}</td></tr>`).join(''):'<tr><td colspan="9">No signal snapshot yet.</td></tr>';
}
document.addEventListener('DOMContentLoaded',()=>{const page=document.body?.dataset?.page;if(page==='settings')bindSettings();if(page==='health')renderHealth();if(page==='statistics')renderLegacyStats();});
})();
