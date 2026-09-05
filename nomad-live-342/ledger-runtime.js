(()=>{
'use strict';
window.NOMAD342_LEDGER_RUNTIME=Object.freeze({
  version:'ledger-v2-realtime-repair',
  base:'https://nomadtips3-342-ledger.mccarey-supon.workers.dev',
  lockPath:'/lock',
  signalPath:'/signal',
  statisticsPath:'/statistics',
  healthPath:'/health',
  pollMs:5000,
  timeoutMs:6500,
});

const PREDICTION_STORE='nomad342ApiFootballPredictionsV1';
const OUTBOX_STORE='nomad342LedgerOutboxV1';
let repairBusy=false;
const readJson=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{return {}}};
const readSessionJson=(key)=>{try{return JSON.parse(sessionStorage.getItem(key)||'{}')||{}}catch{return {}}};
const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
const liveById=()=>new Map((Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[]).map(row=>[String(row?.m?.id??''),row]));

function rebuildMissingOutbox(){
  const predictions=readSessionJson(PREDICTION_STORE),outbox=readJson(OUTBOX_STORE),byId=liveById();
  let changed=false;
  for(const [id,row] of Object.entries(predictions)){
    if(row?.status!=='PREDICTED'||row?.ledgerStatus==='SYNCED'||outbox[id])continue;
    const live=byId.get(String(id));
    if(!live?.m)continue;
    const m=live.m,event=live.event||{},market=row.market||{};
    const payload={
      schemaVersion:1,
      matchId:String(id),
      fixtureId:String(market?.fixture?.id||id),
      league:m.league||'',
      home:m.home||'',
      away:m.away||'',
      minute:m.minute,
      entryScore:m.score,
      eventPass:event.pass===true,
      eventMetrics:event.metrics||null,
      configVersion:window.NOMAD342_CONFIG?.version||null,
      presetVersion:window.NOMAD342_K_LIVE_PRESET?.version||null,
      prediction:row.prediction,
      market:{
        provider:market.provider||'NOMAD-MARKET',
        observedAt:market.observedAt||Date.now(),
        oneXtwo:market.oneXtwo||null,
        totals:market.totals||null,
      },
    };
    outbox[id]={payload,createdAt:Date.now(),attempts:0,nextAt:0,lastError:null};
    changed=true;
  }
  for(const [id,item] of Object.entries(outbox)){
    if(!item?.payload)continue;
    if(!String(item.payload.matchId||'').trim()){item.payload.matchId=String(id);changed=true;}
    if(!String(item.payload.fixtureId||'').trim()&&String(item.payload.matchId||'').trim()){
      item.payload.fixtureId=String(item.payload.matchId);
      changed=true;
    }
  }
  if(changed)writeJson(OUTBOX_STORE,outbox);
  return changed;
}

function repairLedgerSync(){
  if(repairBusy)return;
  repairBusy=true;
  try{
    rebuildMissingOutbox();
    window.__nomad342ApiFootballCandidate?.flushLedgerOutbox?.();
  }finally{repairBusy=false;}
}

function startRepair(){
  repairLedgerSync();
  setInterval(repairLedgerSync,3000);
  document.addEventListener('nomad342:ledgerlocked',()=>{
    document.dispatchEvent(new CustomEvent('nomad342:ledgerrefresh'));
    setTimeout(repairLedgerSync,250);
  });
  window.addEventListener('focus',repairLedgerSync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)repairLedgerSync();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startRepair,{once:true});else startRepair();
})();
