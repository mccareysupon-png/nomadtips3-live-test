(()=>{
'use strict';
const SETTINGS_KEY='nomadSettings342';
const LEDGER_KEY='nomadLedger342';
const DEFAULTS={minuteFrom:55,minuteTo:88,rollingWindowMinutes:5,scoreDifferenceFilterEnabled:true,maxScoreDifference:1,attackWeight:1,dangerousAttackWeight:2,homePressureShareMinimum:55,trendConditionsRequired:2,homeEventRequired:true,sotEvidenceEnabled:true,sotDeltaMinimum:1,shotOffEvidenceEnabled:true,shotOffDeltaMinimum:1,cornerEvidenceEnabled:true,cornerDeltaMinimum:1,evidenceMode:'ANY',allowedLinesMode:'ANY',allowedSelectionLines:[],oddsMinimum:1.80,oddsMaximumEnabled:false,oddsMaximum:2.40,maximumPriceAgeSeconds:30,oneSignalPerMatch:true};
function settings(){try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return {...DEFAULTS,...saved,allowedSelectionLines:Array.isArray(saved.allowedSelectionLines)?saved.allowedSelectionLines:[]};}catch{return {...DEFAULTS,allowedSelectionLines:[]};}}
function saveSettings(v){localStorage.setItem(SETTINGS_KEY,JSON.stringify(v));}
function fmtLine(n){if(n===null||n===undefined||!Number.isFinite(Number(n)))return '—';const x=Number(Number(n).toFixed(2));return `${x>0?'+':''}${x}`;}
function fillLineOptions(select){if(!select||select.options.length)return;for(let v=-5;v<=5.0001;v+=.25){const n=Number(v.toFixed(2)),op=document.createElement('option');op.value=String(n);op.textContent=fmtLine(n);select.appendChild(op);}}
function bindSettings(){
  const form=document.getElementById('settingsForm');if(!form)return;const lines=form.elements.allowedSelectionLines;fillLineOptions(lines);const c=settings();
  Object.entries(c).forEach(([k,v])=>{const e=form.elements[k];if(!e)return;if(k==='allowedSelectionLines'){[...e.options].forEach(op=>op.selected=(v||[]).map(Number).includes(Number(op.value)));return;}if(e.type==='checkbox')e.checked=Boolean(v);else e.value=v;});
  form.addEventListener('submit',event=>{event.preventDefault();const v={...c};for(const [k,d] of Object.entries(DEFAULTS)){const x=form.elements[k];if(!x)continue;if(k==='allowedSelectionLines'){v[k]=[...x.selectedOptions].map(o=>Number(o.value));continue;}if(typeof d==='boolean')v[k]=x.checked;else if(typeof d==='number')v[k]=Number(x.value);else v[k]=x.value;}saveSettings(v);const status=document.getElementById('saveStatus');if(status)status.textContent='Saved';});
  document.getElementById('defaultsButton')?.addEventListener('click',()=>{saveSettings(DEFAULTS);location.reload();});
}
function renderHealth(){
  const grid=document.getElementById('healthGrid');if(!grid)return;const api=window.NOMADBET365,raw=api?.read?.()||null,c=settings();let obs=null;try{if(raw&&api)obs=api.normalizeObservation(raw,c.maximumPriceAgeSeconds);}catch{}
  const hasLive=Boolean(obs),state=obs?.status||'WAIT';
  const items=[
    ['Event Engine','LIVE','TotalCorner rolling-window pressure and event gates feed the 3.42 candidate path.'],
    ['Bet365 Socket Hook','READY','Price referee listens to Bet365 in-play WebSocket callback data already received by the browser.'],
    ['Bet365 Observation',hasLive?state:'WAIT',hasLive?`${obs.home||'—'} — ${obs.away||'—'} · HOME ${fmtLine(obs.decodedHomeLine)} @ ${obs.homeOddsDecimal??'—'} · age ${obs.ageSeconds??'—'}s`:'Waiting for a live Bet365 referee payload from the Chrome bridge.'],
    ['HDP Pair Decode',hasLive&&state==='VALID'?'VALID':'READY','HOME/AWAY handicap values must decode and be opposite sides of the same FT market.'],
    ['Odds Normalizer',hasLive&&state==='VALID'?'VALID':'READY','Bet365 decimal or fractional prices are normalized to decimal before the final price gate.'],
    ['Freshness Gate',state==='STALE'?'STALE':'READY',`Observations older than ${c.maximumPriceAgeSeconds}s fail closed.`],
    ['Final Judge',hasLive&&state==='VALID'?'ARMED':'WAIT','Signal requires Event Gate PASS plus a valid Bet365 FT HOME AH price inside configured line and odds limits.']
  ];
  grid.innerHTML=items.map(i=>`<article class="health-item"><header><span>${i[0]}</span><b class="${['LIVE','READY','VALID','ARMED'].includes(i[1])?'oktxt':'waittxt'}">${i[1]}</b></header><div class="note">${i[2]}</div></article>`).join('');
}
function renderLegacyStats(){
  const tbody=document.getElementById('statsBody');if(!tbody)return;let rows=[];try{rows=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]');}catch{}
  tbody.innerHTML=rows.length?rows.map(r=>`<tr><td>${new Date(r.ts).toLocaleString()}</td><td>${r.match}</td><td>${r.minute}'</td><td>${r.score}</td><td>HOME ${r.line}</td><td>${r.odds}</td><td>${r.source||'Bet365'}</td><td>${r.result||'PENDING'}</td><td>${r.reason||''}</td></tr>`).join(''):'<tr><td colspan="9">No signal snapshot yet.</td></tr>';
}
document.addEventListener('DOMContentLoaded',()=>{const page=document.body?.dataset?.page;if(page==='settings')bindSettings();if(page==='health')renderHealth();if(page==='statistics')renderLegacyStats();});
})();