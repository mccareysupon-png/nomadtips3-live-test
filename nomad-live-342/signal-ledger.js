(()=>{
'use strict';
const runtime=window.NOMAD342_LEDGER_RUNTIME||{};
const base=String(runtime.base||'').replace(/\/$/,'');
const list=document.getElementById('signalList');
const status=document.getElementById('signalStatus');
const metrics={locked:document.getElementById('signalLocked'),predictions:document.getElementById('signalPredictions'),settled:document.getElementById('signalSettled'),pending:document.getElementById('signalPending'),winRate:document.getElementById('signalWinRate')};
let timer=null,busy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const finite=value=>{if(value===null||value===undefined||value===''||typeof value==='boolean')return null;const n=Number(value);return Number.isFinite(n)?n:null};
const fmtOdds=value=>{const n=finite(value);if(n===null)return'—';const formatter=window.NOMAD342_ODDS_DISPLAY?.format;return typeof formatter==='function'?formatter(n):n.toFixed(2);};
const fmtPct=value=>finite(value)===null?'—':`${Math.round(finite(value))}%`;
const fmtLine=value=>{const n=finite(value);if(n===null)return'—';const digits=Number.isInteger(n)?1:2;return `${n>0?'+':''}${n.toFixed(digits)}`;};
const pair=value=>`${value?.home??'—'}–${value?.away??'—'}`;
const when=value=>{try{return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '—'}};
const resultClass=result=>String(result||'PENDING').toLowerCase().replace(/[^a-z]/g,'');
const displayResult=result=>String(result||'PENDING').toUpperCase()==='PUSH'?'DRAW':String(result||'PENDING').toUpperCase().replaceAll('_',' ');
const set=(node,value)=>{if(node)node.textContent=String(value)};
const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
const scorePair=value=>{
  const home=finite(Array.isArray(value)?value[0]:value?.home),away=finite(Array.isArray(value)?value[1]:value?.away);
  return home===null||away===null?null:{home,away};
};
function ensureAsianHandicapCardStyle(){
  if(document.getElementById('nomad342-ah-signal-card-style'))return;
  const style=document.createElement('style');
  style.id='nomad342-ah-signal-card-style';
  style.textContent=`
    .signal-lock-grid.has-asian-handicap{grid-template-columns:minmax(0,1fr) 90px minmax(0,1fr) minmax(0,1fr)}
    .signal-market.signal-market-ah .signal-market-head>span:first-child{color:#d9c46d}
    .signal-market.signal-market-ah.is-no-lock{opacity:.62}
    .signal-market.signal-market-ah.is-no-lock strong{color:#8f9991}
    @media(max-width:900px){.signal-lock-grid.has-asian-handicap{grid-template-columns:repeat(2,minmax(0,1fr))}.signal-lock-grid.has-asian-handicap .signal-final{min-height:100%}}
    @media(max-width:700px){.signal-lock-grid.has-asian-handicap{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}
function currentLive(record){
  const rows=Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[];
  const usable=rows.map(row=>row?.m).filter(m=>m&&!m?.freshness?.stale&&scorePair(m.score));
  const id=String(record?.matchId??'');
  if(id){const exact=usable.find(m=>String(m.id??'')===id);if(exact)return exact;}
  const key=teamKey(record?.home,record?.away);if(key==='|')return null;
  const matches=usable.filter(m=>teamKey(m.home,m.away)===key);
  return matches.length===1?matches[0]:null;
}
function scoreMirror(record){
  const settledScore=scorePair(record?.settlement?.finalScore);
  if(settledScore)return {score:settledScore,status:'FT'};
  const live=currentLive(record),liveScore=scorePair(live?.score),minute=finite(live?.minute);
  if(liveScore&&minute!==null)return {score:liveScore,status:`${Math.max(0,Math.trunc(minute))}′`};
  return {score:null,status:'WAIT'};
}
function signalByMarket(record,key,settled=false){
  const rows=settled?record?.settlement?.signals:record?.signals;
  if(!Array.isArray(rows))return null;
  if(key==='oneXtwo')return rows.find(signal=>String(signal?.market||'').toUpperCase()==='1X2')||null;
  if(key==='ah')return rows.find(signal=>String(signal?.market||'').toUpperCase()==='AH')||null;
  return rows.find(signal=>['OVER','UNDER'].includes(String(signal?.market||'').toUpperCase()))||null;
}
function marketView(record,key){
  const liveSignal=signalByMarket(record,key,false);
  if(liveSignal){
    if(key==='oneXtwo')return {locked:true,pick:liveSignal.pick,odds:liveSignal.odds,home:liveSignal.home,draw:liveSignal.draw,away:liveSignal.away};
    if(key==='ah')return {locked:true,pick:liveSignal.pick,line:liveSignal.line,odds:liveSignal.odds,bookmaker:liveSignal.bookmaker,provider:liveSignal.provider};
    return {locked:true,pick:liveSignal.pick,line:liveSignal.line,odds:liveSignal.odds,over:liveSignal.over,under:liveSignal.under};
  }
  if(key==='oneXtwo')return {...(record?.prediction?.oneXtwo||{}),locked:false};
  if(key==='ah')return {locked:false,pick:null,line:null,odds:null,bookmaker:null,provider:null};
  return {...(record?.prediction?.totals||{}),locked:false};
}
function marketResult(record,key){
  const settledSignal=signalByMarket(record,key,true);
  if(settledSignal?.result)return settledSignal.result;
  if(key==='oneXtwo')return record?.settlement?.oneXtwo?.result||'PENDING';
  if(key==='ah')return 'PENDING';
  return record?.settlement?.totals?.result||'PENDING';
}
function asianHandicapCard(ah,result){
  const locked=Boolean(ah?.locked),pick=String(ah?.pick||'').toUpperCase();
  const selection=locked&&['HOME','AWAY'].includes(pick)?`${pick} ${fmtLine(ah.line)}`:'NO LOCK';
  const source=[ah?.bookmaker,ah?.provider].filter(Boolean).join(' · ');
  return `<section class="signal-market signal-market-ah${locked?'':' is-no-lock'}"><div class="signal-market-head"><span>ASIAN HANDICAP</span><span class="signal-odds">@ ${esc(fmtOdds(ah?.odds))}</span></div><strong>${esc(selection)}</strong><small>${locked?`LINE ${esc(fmtLine(ah.line))}${source?` · ${esc(source)}`:''}`:'ยังไม่มี Asian Handicap Signal ที่ล็อกในคู่นี้'}</small><span class="signal-result ${esc(resultClass(result))}">${esc(locked?displayResult(result):'NO LOCK')}</span></section>`;
}
function card(record){
  const one=marketView(record,'oneXtwo'),totals=marketView(record,'totals'),ah=marketView(record,'ah');
  const oneResult=marketResult(record,'oneXtwo'),totalsResult=marketResult(record,'totals'),ahResult=marketResult(record,'ah'),mirror=scoreMirror(record);
  return `<article class="signal-lock-card" data-match-id="${esc(record.matchId)}">
    <div class="signal-lock-head"><div><div class="signal-lock-kicker">SIGNAL LOCKED · 3.42</div><div class="signal-lock-teams">${esc(record.home)} — ${esc(record.away)}</div><div class="signal-lock-league">${esc(record.league||'—')}</div></div><div class="signal-lock-meta"><span>LOCK ${esc(record.minute??'—')}′ · SCORE ${esc(pair(record.entryScore))}</span><span>${esc(when(record.lockedAt))}</span></div></div>
    <div class="signal-lock-grid has-asian-handicap">
      <section class="signal-market"><div class="signal-market-head"><span>1X2</span><span class="signal-odds">@ ${esc(fmtOdds(one.odds))}</span></div><strong>${esc(one.pick||'—')}</strong><small>HOME ${esc(fmtPct(one.home))} · DRAW ${esc(fmtPct(one.draw))} · AWAY ${esc(fmtPct(one.away))}</small><span class="signal-result ${esc(resultClass(oneResult))}">${esc(displayResult(oneResult))}</span></section>
      <section class="signal-final ${mirror.status==='FT'?'is-final':'is-wait'}" aria-label="Live score mirror"><span>${mirror.status==='FT'?'FINAL':'LIVE SCORE'}</span><strong>${esc(mirror.score?pair(mirror.score):'—')}</strong><small>${esc(mirror.status)}</small></section>
      <section class="signal-market"><div class="signal-market-head"><span>OVER / UNDER ${esc(totals.line??'—')}</span><span class="signal-odds">@ ${esc(fmtOdds(totals.odds))}</span></div><strong>${esc(totals.pick||'—')}</strong><small>OVER ${esc(fmtPct(totals.over))} · UNDER ${esc(fmtPct(totals.under))}</small><span class="signal-result ${esc(resultClass(totalsResult))}">${esc(displayResult(totalsResult))}</span></section>
      ${asianHandicapCard(ah,ahResult)}
    </div>
  </article>`;
}
async function load(){
  if(busy||!base||!list)return;busy=true;
  try{
    const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.timeoutMs)||6500);
    let response;try{response=await fetch(`${base}${runtime.signalPath||'/signal'}?limit=500&t=${Date.now()}`,{cache:'no-store',signal:ac.signal});}finally{clearTimeout(timeout)}
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json(),summary=data?.summary||{},records=Array.isArray(data?.records)?data.records:[];
    set(metrics.locked,summary.lockedMatches??records.length);set(metrics.predictions,summary.totalPredictions??records.length*2);set(metrics.settled,summary.settledPredictions??0);set(metrics.pending,summary.pendingPredictions??0);set(metrics.winRate,`${Number(summary.winRate||0).toFixed(1)}%`);
    list.innerHTML=records.length?records.map(card).join(''):'<div class="ledger-empty">No qualifying picks yet.</div>';
    set(status,`LEDGER ONLINE · ${records.length} locked matches · updated ${when(data.updatedAt)}`);
  }catch(error){
    set(status,'LEDGER TEMPORARILY UNAVAILABLE');
    if(!list.children.length||list.querySelector('.ledger-empty'))list.innerHTML='<div class="ledger-empty">Signal ledger connection temporarily unavailable.</div>';
  }finally{busy=false;}
}
const refresh=()=>setTimeout(load,0);
ensureAsianHandicapCardStyle();
load();timer=setInterval(load,Math.max(3000,Number(runtime.pollMs)||5000));
document.addEventListener('nomad342:ledgerlocked',refresh);
document.addEventListener('nomad342:ledgerrefresh',refresh);
document.addEventListener('nomad342:odds-display-change',refresh);
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)});
})();
