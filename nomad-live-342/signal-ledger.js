(()=>{
'use strict';
const runtime=window.NOMAD342_LEDGER_RUNTIME||{};
const base=String(runtime.base||'').replace(/\/$/,'');
const list=document.getElementById('signalList');
const status=document.getElementById('signalStatus');
const metrics={
  locked:document.getElementById('signalLocked'),predictions:document.getElementById('signalPredictions'),settled:document.getElementById('signalSettled'),pending:document.getElementById('signalPending'),winRate:document.getElementById('signalWinRate')
};
const FINAL_STORE_KEY='nomad342SignalFinalMirrorV1';
let timer=null,busy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const fmtOdds=value=>finite(value)===null?'—':finite(value).toFixed(2);
const fmtPct=value=>finite(value)===null?'—':`${Math.round(finite(value))}%`;
const pair=value=>`${value?.home??'—'}–${value?.away??'—'}`;
const when=value=>{try{return new Date(value).toLocaleString([],{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '—'}};
const resultClass=result=>String(result||'PENDING').toLowerCase().replace(/[^a-z]/g,'');
const set=(node,value)=>{if(node)node.textContent=String(value)};
const scorePair=value=>{
  const home=finite(Array.isArray(value)?value[0]:value?.home),away=finite(Array.isArray(value)?value[1]:value?.away);
  return home===null||away===null?null:{home,away};
};
const finalPhase=m=>{
  const snapshot=Array.isArray(m?.event?.snapshots)?m.event.snapshots[m.event.snapshots.length-1]:null;
  const values=[m?.status,m?.matchStatus,m?.match_status,m?.fixtureStatus,m?.fixture_status,m?.phase,m?.period,m?.state,m?.event?.status,m?.event?.phase,m?.event?.period,snapshot?.status,snapshot?.phase,snapshot?.period];
  return values.some(raw=>{
    if(raw===null||raw===undefined||raw==='')return false;
    const value=String(raw).trim().toUpperCase().replace(/_/g,' ').replace(/\s+/g,' ');
    return ['FT','FULL TIME','FULLTIME','FULL-TIME','FINISHED','FINAL','ENDED','MATCH ENDED'].includes(value);
  });
};
function finalStore(){try{return JSON.parse(sessionStorage.getItem(FINAL_STORE_KEY)||'{}')||{}}catch{return {}}}
function saveFinalStore(store){try{sessionStorage.setItem(FINAL_STORE_KEY,JSON.stringify(store))}catch{}}
function rememberLiveFinals(){
  const rows=Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[];
  if(!rows.length)return;
  const store=finalStore();let changed=false;
  for(const row of rows){
    const m=row?.m||{};if(!finalPhase(m))continue;
    const score=scorePair(m.score);if(!score)continue;
    const id=String(m.id??'');if(!id)continue;
    store[id]={score,seenAt:Date.now()};changed=true;
  }
  if(changed)saveFinalStore(store);
}
function finalMirror(record){
  const id=String(record?.matchId??'');
  const rows=Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[];
  const live=rows.find(row=>String(row?.m?.id??'')===id&&finalPhase(row?.m));
  const liveScore=scorePair(live?.m?.score),settledScore=scorePair(record?.settlement?.finalScore),cachedScore=scorePair(finalStore()[id]?.score);
  if(liveScore&&settledScore&&(liveScore.home!==settledScore.home||liveScore.away!==settledScore.away))return {score:settledScore,status:'FT'};
  if(liveScore)return {score:liveScore,status:'FT'};
  if(settledScore)return {score:settledScore,status:'FT'};
  if(cachedScore)return {score:cachedScore,status:'FT'};
  return {score:null,status:'WAIT'};
}

function marketResult(record,key){
  if(key==='oneXtwo')return record?.settlement?.oneXtwo?.result||'PENDING';
  return record?.settlement?.totals?.result||'PENDING';
}
function card(record){
  const one=record?.prediction?.oneXtwo||{},totals=record?.prediction?.totals||{};
  const oneResult=marketResult(record,'oneXtwo'),totalsResult=marketResult(record,'totals'),final=finalMirror(record);
  return `<article class="signal-lock-card" data-match-id="${esc(record.matchId)}">
    <div class="signal-lock-head"><div><div class="signal-lock-kicker">SIGNAL LOCKED · 3.42</div><div class="signal-lock-teams">${esc(record.home)} — ${esc(record.away)}</div><div class="signal-lock-league">${esc(record.league||'—')}</div></div><div class="signal-lock-meta"><span>${esc(record.minute??'—')}′ · ${esc(pair(record.entryScore))}</span><span>${esc(when(record.lockedAt))}</span></div></div>
    <div class="signal-lock-grid">
      <section class="signal-market"><div class="signal-market-head"><span>1X2</span><span class="signal-odds">@ ${esc(fmtOdds(one.odds))}</span></div><strong>${esc(one.pick||'—')}</strong><small>HOME ${esc(fmtPct(one.home))} · DRAW ${esc(fmtPct(one.draw))} · AWAY ${esc(fmtPct(one.away))}</small><span class="signal-result ${esc(resultClass(oneResult))}">${esc(oneResult)}</span></section>
      <section class="signal-final ${final.score?'is-final':'is-wait'}" aria-label="Final score mirror"><span>FINAL</span><strong>${esc(final.score?pair(final.score):'—')}</strong><small>${esc(final.status)}</small></section>
      <section class="signal-market"><div class="signal-market-head"><span>OVER / UNDER ${esc(totals.line??'—')}</span><span class="signal-odds">@ ${esc(fmtOdds(totals.odds))}</span></div><strong>${esc(totals.pick||'—')}</strong><small>OVER ${esc(fmtPct(totals.over))} · UNDER ${esc(fmtPct(totals.under))}</small><span class="signal-result ${esc(resultClass(totalsResult))}">${esc(totalsResult)}</span></section>
    </div>
  </article>`;
}
async function load(){
  if(busy||!base||!list)return;busy=true;
  try{
    const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.timeoutMs)||6500);
    let response;try{response=await fetch(`${base}${runtime.signalPath||'/signal'}?limit=250&t=${Date.now()}`,{cache:'no-store',signal:ac.signal});}finally{clearTimeout(timeout)}
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json(),summary=data?.summary||{},records=Array.isArray(data?.records)?data.records:[];
    rememberLiveFinals();
    set(metrics.locked,summary.lockedMatches??records.length);set(metrics.predictions,summary.totalPredictions??records.length*2);set(metrics.settled,summary.settledPredictions??0);set(metrics.pending,summary.pendingPredictions??0);set(metrics.winRate,`${Number(summary.winRate||0).toFixed(1)}%`);
    list.innerHTML=records.length?records.map(card).join(''):'<div class="ledger-empty">No qualifying picks yet.</div>';
    set(status,`LEDGER ONLINE · ${records.length} locked matches`);
  }catch(error){
    set(status,'LEDGER TEMPORARILY UNAVAILABLE');
    if(!list.children.length||list.querySelector('.ledger-empty'))list.innerHTML='<div class="ledger-empty">Signal ledger connection temporarily unavailable.</div>';
  }finally{busy=false;}
}
load();timer=setInterval(load,Math.max(10000,Number(runtime.pollMs)||15000));
window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)});
})();
