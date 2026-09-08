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
const fmtDecimal=value=>{const n=finite(value);return n===null?'—':n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');};
const fmtRaw=value=>{const n=finite(value);return n===null?'—':n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');};
const fmtPct=value=>finite(value)===null?'—':`${Math.round(finite(value))}%`;
const fmtLine=value=>{const n=finite(value);if(n===null)return'—';if(Math.abs(n)<1e-9)return'0.0';const abs=Math.abs(n),digits=Number.isInteger(abs)?1:2;return `${n>0?'+':'-'}${abs.toFixed(digits)}`;};
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
function gradeAhExpected(pick,line,score){
  const p=String(pick||'').toUpperCase(),l=finite(line),s=scorePair(score);
  if(!['HOME','AWAY'].includes(p)||l===null||!s||!Number.isInteger(l*4))return null;
  const selected=p==='HOME'?s.home:s.away,opponent=p==='HOME'?s.away:s.home;
  const grade=part=>{const adjusted=selected+part-opponent;if(Math.abs(adjusted)<1e-9)return'PUSH';return adjusted>0?'WIN':'LOSS';};
  if(Number.isInteger(l*2))return grade(l);
  const parts=[grade(l-.25),grade(l+.25)];
  if(parts.includes('PUSH'))return parts.includes('WIN')?'HALF_WIN':'HALF_LOSS';
  return parts[0]===parts[1]?parts[0]:null;
}
function ensureAsianHandicapCardStyle(){
  if(document.getElementById('nomad342-ah-signal-card-style'))return;
  const style=document.createElement('style');
  style.id='nomad342-ah-signal-card-style';
  style.textContent=`
    .signal-lock-grid.has-asian-handicap{grid-template-columns:minmax(0,1fr) 90px minmax(0,1fr) minmax(0,1fr)}
    .signal-market.signal-market-ah .signal-market-head>span:first-child{color:#d9c46d}
    .signal-market.signal-market-ah.is-no-lock{opacity:.62}
    .signal-market.signal-market-ah.is-no-lock strong{color:#8f9991}
    .signal-market.signal-market-ah .ah-audit-ok{color:#8fc59c}
    .signal-market.signal-market-ah .ah-audit-warn{color:#e3b864;font-weight:800}
    .signal-market.signal-market-ah .ah-audit-row{display:block;line-height:1.35}
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
    const lock={lockedAt:finite(liveSignal.lockedAt)??finite(record?.lockedAt),lockMinute:finite(liveSignal.lockMinute)??finite(record?.minute),entryScore:liveSignal.entryScore||record?.entryScore};
    if(key==='oneXtwo')return {locked:true,pick:liveSignal.pick,odds:liveSignal.odds,home:liveSignal.home,draw:liveSignal.draw,away:liveSignal.away,...lock};
    if(key==='ah')return {locked:true,pick:liveSignal.pick,line:liveSignal.line,rawLine:liveSignal.rawLine,odds:liveSignal.odds,homeOdds:liveSignal.homeOdds,awayOdds:liveSignal.awayOdds,rawHomeHk:liveSignal.rawHomeHk,rawAwayHk:liveSignal.rawAwayHk,bookmaker:liveSignal.bookmaker,provider:liveSignal.provider,...lock};
    return {locked:true,pick:liveSignal.pick,line:liveSignal.line,odds:liveSignal.odds,over:liveSignal.over,under:liveSignal.under,...lock};
  }
  if(key==='oneXtwo')return {...(record?.prediction?.oneXtwo||{}),locked:false,lockedAt:record?.lockedAt,lockMinute:record?.minute,entryScore:record?.entryScore};
  if(key==='ah')return {locked:false,pick:null,line:null,rawLine:null,odds:null,homeOdds:null,awayOdds:null,rawHomeHk:null,rawAwayHk:null,bookmaker:null,provider:null,lockedAt:null,lockMinute:null,entryScore:null};
  return {...(record?.prediction?.totals||{}),locked:false,lockedAt:record?.lockedAt,lockMinute:record?.minute,entryScore:record?.entryScore};
}
function marketResult(record,key){
  const settledSignal=signalByMarket(record,key,true);
  if(settledSignal?.result)return settledSignal.result;
  if(key==='oneXtwo')return record?.settlement?.oneXtwo?.result||'PENDING';
  if(key==='ah')return 'PENDING';
  return record?.settlement?.totals?.result||'PENDING';
}
function marketLockText(view,record){const minute=finite(view?.lockMinute)??finite(record?.minute),score=scorePair(view?.entryScore)||scorePair(record?.entryScore);return `LOCK ${minute===null?'—':Math.trunc(minute)}′ · SCORE ${score?pair(score):'—'}`;}
function asianHandicapCard(ah,result,record){
  const locked=Boolean(ah?.locked),pick=String(ah?.pick||'').toUpperCase();
  const selectedLine=finite(ah?.line),rawLine=finite(ah?.rawLine),selectedOdds=finite(ah?.odds),homeOdds=finite(ah?.homeOdds),awayOdds=finite(ah?.awayOdds),rawHome=finite(ah?.rawHomeHk),rawAway=finite(ah?.rawAwayHk);
  const rawSelected=pick==='HOME'?rawHome:pick==='AWAY'?rawAway:null,expectedLine=rawLine===null?null:(pick==='AWAY'?-rawLine:rawLine),expectedOdds=rawSelected===null?null:1+rawSelected;
  const perspectiveOk=expectedLine===null||selectedLine===null?null:Math.abs(expectedLine-selectedLine)<1e-9;
  const priceOk=expectedOdds===null||selectedOdds===null?null:Math.abs(expectedOdds-selectedOdds)<1e-6;
  const selection=locked&&['HOME','AWAY'].includes(pick)?`${pick} ${fmtLine(selectedLine)}`:'NO LOCK';
  const source=[ah?.bookmaker,ah?.provider].filter(Boolean).join(' · ');
  const perspectiveText=rawLine===null?'Raw Home line not stored':`Home perspective ${fmtLine(rawLine)}${perspectiveOk===null?'':perspectiveOk?' · ✓':' · ⚠'}`;
  const pairText=`Home ${fmtDecimal(homeOdds)} · Away ${fmtDecimal(awayOdds)}`;
  const rawText=rawHome===null&&rawAway===null?'Hong Kong raw odds not stored':`Hong Kong Home ${fmtRaw(rawHome)} · Away ${fmtRaw(rawAway)}${priceOk===null?'':` · selected → ${fmtDecimal(expectedOdds)} ${priceOk?'✓':'⚠'}`}`;
  const finalScore=scorePair(record?.settlement?.finalScore),expectedResult=finalScore?gradeAhExpected(pick,selectedLine,finalScore):null,serverResult=String(result||'PENDING').toUpperCase(),settlementOk=expectedResult?expectedResult===serverResult:null;
  const settlementText=expectedResult&&finalScore?`FT ${pair(finalScore)} · expected ${displayResult(expectedResult)} · ${settlementOk?'✓':'⚠'}`:'';
  return `<section class="signal-market signal-market-ah${locked?'':' is-no-lock'}"><div class="signal-market-head"><span>ASIAN HANDICAP</span><span class="signal-odds">DECIMAL ${esc(fmtDecimal(selectedOdds))}</span></div><strong>${esc(selection)}</strong><small class="ah-audit-row ${perspectiveOk===false?'ah-audit-warn':'ah-audit-ok'}">${locked?esc(perspectiveText):'ยังไม่มี Asian Handicap Signal ที่ล็อกในคู่นี้'}</small><small class="ah-audit-row">${locked?esc(`${source?`${source} · `:''}${pairText}`):'—'}</small><small class="ah-audit-row ${priceOk===false?'ah-audit-warn':'ah-audit-ok'}">${locked?esc(rawText):'—'}</small><small>${locked?esc(marketLockText(ah,record)):'—'}</small>${settlementText?`<small class="ah-audit-row ${settlementOk===false?'ah-audit-warn':'ah-audit-ok'}">${esc(settlementText)}</small>`:''}<span class="signal-result ${esc(resultClass(result))}">${esc(locked?displayResult(result):'NO LOCK')}</span></section>`;
}
function card(record){
  const one=marketView(record,'oneXtwo'),totals=marketView(record,'totals'),ah=marketView(record,'ah');
  const oneResult=marketResult(record,'oneXtwo'),totalsResult=marketResult(record,'totals'),ahResult=marketResult(record,'ah'),mirror=scoreMirror(record);
  return `<article class="signal-lock-card" data-match-id="${esc(record.matchId)}">
    <div class="signal-lock-head"><div><div class="signal-lock-kicker">SIGNAL LOCKED · 3.42</div><div class="signal-lock-teams">${esc(record.home)} — ${esc(record.away)}</div><div class="signal-lock-league">${esc(record.league||'—')}</div></div><div class="signal-lock-meta"><span>FIRST LOCK ${esc(record.minute??'—')}′ · SCORE ${esc(pair(record.entryScore))}</span><span>${esc(when(record.lockedAt))}</span></div></div>
    <div class="signal-lock-grid has-asian-handicap">
      <section class="signal-market"><div class="signal-market-head"><span>1X2</span><span class="signal-odds">@ ${esc(fmtOdds(one.odds))}</span></div><strong>${esc(one.pick||'—')}</strong><small>HOME ${esc(fmtPct(one.home))} · DRAW ${esc(fmtPct(one.draw))} · AWAY ${esc(fmtPct(one.away))}</small><small>${esc(marketLockText(one,record))}</small><span class="signal-result ${esc(resultClass(oneResult))}">${esc(displayResult(oneResult))}</span></section>
      <section class="signal-final ${mirror.status==='FT'?'is-final':'is-wait'}" aria-label="Live score mirror"><span>${mirror.status==='FT'?'FINAL':'LIVE SCORE'}</span><strong>${esc(mirror.score?pair(mirror.score):'—')}</strong><small>${esc(mirror.status)}</small></section>
      <section class="signal-market"><div class="signal-market-head"><span>OVER / UNDER ${esc(totals.line??'—')}</span><span class="signal-odds">@ ${esc(fmtOdds(totals.odds))}</span></div><strong>${esc(totals.pick||'—')}</strong><small>OVER ${esc(fmtPct(totals.over))} · UNDER ${esc(fmtPct(totals.under))}</small><small>${esc(marketLockText(totals,record))}</small><span class="signal-result ${esc(resultClass(totalsResult))}">${esc(displayResult(totalsResult))}</span></section>
      ${asianHandicapCard(ah,ahResult,record)}
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
    const fallbackPredictions=records.reduce((sum,record)=>sum+(Array.isArray(record?.signals)?record.signals.length:(record?.prediction?2:0)),0);set(metrics.locked,summary.lockedMatches??records.length);set(metrics.predictions,summary.totalPredictions??fallbackPredictions);set(metrics.settled,summary.settledPredictions??0);set(metrics.pending,summary.pendingPredictions??0);set(metrics.winRate,`${Number(summary.winRate||0).toFixed(1)}%`);
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
