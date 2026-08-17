const DEFAULT_WORKER='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
let runtime={liveUrl:`${DEFAULT_WORKER}/live`};
let lockedSignals=new Map();
let refreshing=false;

const $=id=>document.getElementById(id);
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const workerBase=()=>String(runtime.workerUrl||runtime.liveUrl||DEFAULT_WORKER).replace(/\/live(?:\?.*)?$/,'');

async function json(url,timeout=10000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }finally{clearTimeout(timer);}
}

async function loadRuntime(){
  try{runtime={...runtime,...await json(`./runtime.json?t=${Date.now()}`,5000)};}catch{}
}

function score(value){
  const h=n(value?.home),a=n(value?.away);
  return h===null||a===null?'—':`${h}–${a}`;
}

function line(record){
  const market=String(record?.market||'').toUpperCase();
  if(market==='WIN')return'—';
  const value=n(record?.selectedLine??record?.settlementLine??record?.line);
  if(value===null)return'—';
  if(market==='AH')return`${value>0?'+':''}${Number.isInteger(value)?value.toFixed(1):value}`;
  return String(value);
}

function odds(record){
  const value=n(record?.odds);
  return value===null?'—':value.toFixed(2);
}

function pick(record){
  if(String(record?.market||'').toUpperCase()==='OU')return String(record?.ouDirection||'—').toUpperCase();
  return record?.selectedTeam||record?.selectedSide||'—';
}

function market(record){
  const value=String(record?.market||'—').toUpperCase();
  return value==='OU'?'O/U':value;
}

function setText(id,value){const el=$(id);if(el)el.textContent=value;}

function decorateList(){
  document.querySelectorAll('.signal-item[data-id]').forEach(button=>{
    const record=lockedSignals.get(String(button.dataset.id));
    const old=button.querySelector('.locked-mini');
    if(!record){old?.remove();return;}
    const pill=button.querySelector('.state-pill');
    if(pill){pill.textContent='Signal locked';pill.classList.remove('near','watch');pill.classList.add('signal');}
    const text=`Locked · ${market(record)} ${line(record)!=='—'?line(record):''} · @ ${odds(record)} · ${record.entryMinute??'—'}' · ${score(record.entryScore)}`.replace(/\s+/g,' ').trim();
    if(old)old.textContent=text;
    else button.insertAdjacentHTML('beforeend',`<div class="locked-mini"></div>`),button.querySelector('.locked-mini').textContent=text;
  });
}

function decorateSelected(){
  const active=document.querySelector('.signal-item.active[data-id]');
  const record=active?lockedSignals.get(String(active.dataset.id)):null;
  const audit=$('signalAudit');
  if(!record){
    setText('signalLine','—');setText('entryScore','—');
    setText('oddsLabel','Live odds');setText('momentumLabel','Confidence');setText('detectedLabel','Minute');
    if(audit){audit.classList.remove('locked');audit.textContent='Live values may change until a signal is locked.';}
    return;
  }
  setText('pickValue',pick(record));
  setText('lockedOdds',odds(record));
  setText('confidence',n(record.momentum)===null?'—':`${Math.round(n(record.momentum))}%`);
  setText('detectedMinute',record.entryMinute===null||record.entryMinute===undefined?'—':`${record.entryMinute}'`);
  setText('marketName',market(record));
  setText('signalLine',line(record));
  setText('entryScore',score(record.entryScore));
  setText('oddsLabel','Locked odds');setText('momentumLabel','Signal momentum');setText('detectedLabel','Detected');
  const state=$('decisionState');if(state){state.textContent='Signal locked';state.classList.remove('near','watch');state.classList.add('signal');}
  if(audit){
    audit.classList.add('locked');
    const at=record.selectedAt?new Date(record.selectedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'recorded';
    audit.textContent=`Locked at ${at} · Entry ${score(record.entryScore)} · ${market(record)} ${line(record)!=='—'?line(record):''} @ ${odds(record)}`.replace(/\s+/g,' ').trim();
  }
}

function decorate(){decorateList();decorateSelected();}

async function refreshLocked(){
  if(refreshing)return;
  refreshing=true;
  try{
    const data=await json(`${workerBase()}/history?page=1&limit=100&range=30D&t=${Date.now()}`);
    const next=new Map();
    for(const record of data.records||[]){
      const pending=!record?.settledAt||String(record?.resultGroup||record?.result||'PENDING').toUpperCase()==='PENDING';
      if(!pending)continue;
      const key=String(record?.id||'');
      if(!key)continue;
      const previous=next.get(key);
      if(!previous||Date.parse(record.selectedAt||0)>Date.parse(previous.selectedAt||0))next.set(key,record);
    }
    lockedSignals=next;
    decorate();
  }catch(error){console.warn('Locked signal audit unavailable',error);}
  finally{refreshing=false;}
}

await loadRuntime();
await refreshLocked();
const observer=new MutationObserver(()=>queueMicrotask(decorate));
const target=document.getElementById('liveLayout');
if(target)observer.observe(target,{subtree:true,childList:true,characterData:true});
setInterval(refreshLocked,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLocked();});
window.addEventListener('online',refreshLocked);
