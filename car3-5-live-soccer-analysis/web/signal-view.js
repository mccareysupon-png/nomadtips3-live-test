const WORKER='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
let lockedByMatch=new Map();
let refreshing=false;
let applyQueued=false;

const byId=id=>document.getElementById(id);
const setText=(el,value)=>{if(el&&el.textContent!==String(value))el.textContent=String(value);};
const setClass=(el,value)=>{if(el&&el.className!==value)el.className=value;};
const n=value=>{const x=Number(value);return Number.isFinite(x)?x:null;};

function marketLabel(record){
  const market=String(record?.market||'').toUpperCase();
  if(market==='WIN')return'1X2';
  if(market==='AH')return'Asian Handicap';
  if(market==='OU')return'O/U';
  return market||'—';
}

function lineValue(record){
  const market=String(record?.market||'').toUpperCase();
  if(market==='WIN')return null;
  return n(record?.selectedLine??record?.settlementLine??record?.line);
}

function lineLabel(record){
  const value=lineValue(record);
  if(value===null)return'—';
  const market=String(record?.market||'').toUpperCase();
  if(market==='AH')return`${value>0?'+':''}${Number.isInteger(value)?value.toFixed(1):String(value)}`;
  return String(value);
}

function pickLabel(record){
  const market=String(record?.market||'').toUpperCase();
  if(market==='OU')return String(record?.ouDirection||'—').toUpperCase();
  return record?.selectedTeam||record?.selectedSide||'—';
}

function oddsLabel(record){
  const value=n(record?.odds);
  return value===null?'—':value.toFixed(2);
}

function scoreLabel(score){
  const home=n(score?.home),away=n(score?.away);
  return home===null||away===null?'—':`${home}–${away}`;
}

function minuteLabel(record){
  const minute=n(record?.entryMinute);
  return minute===null?'—':`${Math.round(minute)}'`;
}

function timeLabel(record){
  if(!record?.selectedAt)return'—';
  const date=new Date(record.selectedAt);
  if(!Number.isFinite(date.getTime()))return'—';
  return date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function momentumLabel(record){
  const value=n(record?.momentum);
  return value===null?'—':`${Math.round(value)}%`;
}

function compactMarket(record){
  const market=String(record?.market||'').toUpperCase();
  const line=lineLabel(record);
  if(market==='AH')return`AH ${line}`;
  if(market==='OU')return`O/U ${line}`;
  if(market==='WIN')return'1X2';
  return market||'—';
}

function ensureSignalFacts(){
  const facts=document.querySelector('.signal-card .signal-facts');
  if(!facts||byId('signalLine'))return;
  facts.innerHTML=`
    <div><span>Market</span><b id="marketName">—</b></div>
    <div><span>Line / handicap</span><b id="signalLine">—</b></div>
    <div><span>Locked odds</span><b id="lockedOdds">—</b></div>
    <div><span>Entry score</span><b id="entryScore">—</b></div>
    <div><span>Detected minute</span><b id="detectedMinute">—</b></div>
    <div><span>Detected time</span><b id="detectedTime">—</b></div>
    <div><span>Momentum</span><b id="confidence">—</b></div>`;
  if(!byId('signalViewResponsive')){
    const style=document.createElement('style');
    style.id='signalViewResponsive';
    style.textContent=`.signal-facts{grid-template-columns:repeat(2,minmax(0,1fr))!important}.signal-facts div{min-width:0}.signal-facts b{overflow-wrap:anywhere}@media(min-width:700px){.signal-facts{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(min-width:1024px){.signal-facts{grid-template-columns:repeat(4,minmax(0,1fr))!important}}`;
    document.head.appendChild(style);
  }
}

function applyList(){
  const items=[...document.querySelectorAll('.signal-item[data-id]')];
  let confirmed=0;
  for(const item of items){
    const record=lockedByMatch.get(String(item.dataset.id));
    const pill=item.querySelector('.state-pill');
    const pick=item.querySelector('.pick-line');
    const bottom=item.querySelectorAll('.signal-bottom span');
    if(record){
      confirmed++;
      setText(pill,'Signal active');setClass(pill,'state-pill signal');
      setText(pick,pickLabel(record));
      if(bottom[0])setText(bottom[0],`${compactMarket(record)} · Odds ${oddsLabel(record)}`);
      if(bottom[1])setText(bottom[1],`Detected ${minuteLabel(record)} · Entry ${scoreLabel(record.entryScore)}`);
    }else if(pill&&/signal/i.test(pill.textContent||'')){
      setText(pill,'Near signal');setClass(pill,'state-pill near');
      setText(pick,'Monitoring');
      if(bottom[0])setText(bottom[0],'Waiting for confirmed signal');
      if(bottom[1])setText(bottom[1],'No locked record yet');
    }
  }
  if(items.length){
    setText(byId('signalCount'),confirmed);
    setText(byId('watchCount'),Math.max(0,items.length-confirmed));
  }
}

function clearLockedCenter(){
  const state=byId('decisionState');
  if(state&&/signal/i.test(state.textContent||'')){
    setText(state,'Near signal');setClass(state,'state-pill near');
  }
  setText(byId('pickValue'),'Monitoring');
  setText(byId('marketName'),'—');
  setText(byId('signalLine'),'—');
  setText(byId('lockedOdds'),'—');
  setText(byId('entryScore'),'—');
  setText(byId('detectedMinute'),'—');
  setText(byId('detectedTime'),'—');
  setText(byId('confidence'),'—');
}

function applyCenter(){
  ensureSignalFacts();
  const active=document.querySelector('.signal-item.active[data-id]');
  if(!active){clearLockedCenter();return;}
  const record=lockedByMatch.get(String(active.dataset.id));
  if(!record){clearLockedCenter();return;}
  const state=byId('decisionState');
  setText(state,'Signal active');setClass(state,'state-pill signal');
  setText(byId('pickValue'),pickLabel(record));
  setText(byId('marketName'),marketLabel(record));
  setText(byId('signalLine'),lineLabel(record));
  setText(byId('lockedOdds'),oddsLabel(record));
  setText(byId('entryScore'),scoreLabel(record.entryScore));
  setText(byId('detectedMinute'),minuteLabel(record));
  setText(byId('detectedTime'),timeLabel(record));
  setText(byId('confidence'),momentumLabel(record));
}

function apply(){
  applyQueued=false;
  applyList();
  applyCenter();
}

function queueApply(){
  if(applyQueued)return;
  applyQueued=true;
  setTimeout(apply,0);
}

function buildLockedMap(payload){
  const records=Array.isArray(payload?.records)?payload.records:[];
  const pending=records
    .filter(record=>record&&!record.settledAt&&String(record.resultGroup||record.result||'PENDING').toUpperCase()==='PENDING')
    .sort((a,b)=>Date.parse(b.selectedAt||0)-Date.parse(a.selectedAt||0));
  const next=new Map();
  for(const record of pending){
    const ids=[record.id,record.sourceMatchId]
      .filter(value=>value!==null&&value!==undefined&&String(value)!=='')
      .map(String);
    for(const id of ids)if(!next.has(id))next.set(id,record);
  }
  lockedByMatch=next;
}

async function refreshLockedSignals(){
  if(refreshing)return;
  refreshing=true;
  try{
    const response=await fetch(`${WORKER}/history?page=1&limit=100&range=30D&t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    buildLockedMap(await response.json());
    queueApply();
  }catch(error){
    console.warn('Confirmed signal history unavailable',error);
  }finally{refreshing=false;}
}

function init(){
  ensureSignalFacts();
  const target=document.querySelector('.live-layout')||document.body;
  new MutationObserver(queueApply).observe(target,{childList:true,subtree:true});
  document.addEventListener('click',event=>{if(event.target.closest('.signal-item'))queueApply();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLockedSignals();});
  window.addEventListener('online',refreshLockedSignals);
  refreshLockedSignals();
  setInterval(refreshLockedSignals,15000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
