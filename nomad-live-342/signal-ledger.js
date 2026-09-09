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
const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const compactTeam=value=>normalize(value).replace(/\s/g,'');
const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
const scorePair=value=>{
  const home=finite(Array.isArray(value)?value[0]:value?.home),away=finite(Array.isArray(value)?value[1]:value?.away);
  return home===null||away===null?null:{home,away};
};
function teamSimilarity(a,b){
  const x=normalize(a),y=normalize(b);if(!x||!y)return 0;if(x===y)return 1;
  const cx=compactTeam(a),cy=compactTeam(b);if(cx===cy)return .99;
  if(cx.length>=5&&cy.length>=5&&(cx.includes(cy)||cy.includes(cx)))return .9;
  const aa=new Set(x.split(' ').filter(Boolean)),bb=new Set(y.split(' ').filter(Boolean));let hit=0;for(const token of aa)if(bb.has(token))hit++;
  const union=aa.size+bb.size-hit;return union?hit/union:0;
}
function selectedTeam(record,pick){
  const side=String(pick||'').toUpperCase();
  if(side==='HOME')return String(record?.home||'HOME');
  if(side==='AWAY')return String(record?.away||'AWAY');
  if(side==='DRAW')return 'DRAW';
  return side||'—';
}
function scoreAfterEntry(finalScore,entryScore){
  const final=scorePair(finalScore),entry=scorePair(entryScore);if(!final)return null;if(!entry)return final;
  const home=final.home-entry.home,away=final.away-entry.away;return home<0||away<0?null:{home,away};
}
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
    body[data-page="live"] #nomad342PanelSignal .signal-lock-grid.has-asian-handicap{grid-template-columns:minmax(0,1fr) 150px minmax(0,1fr) minmax(0,1.08fr)}
    body[data-page="live"] #nomad342PanelSignal .signal-market{box-shadow:none!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market-1x2{background:linear-gradient(145deg,rgba(61,72,48,.48),rgba(37,45,31,.52) 58%,rgba(25,31,22,.58))!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market-1x2 .signal-market-head>span:first-child{color:#a8b38a!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market-1x2 .signal-odds{color:#b8c29c!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market-ou{background:linear-gradient(145deg,rgba(46,66,64,.50),rgba(30,48,47,.54) 58%,rgba(22,36,35,.60))!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market-ou .signal-market-head>span:first-child{color:#8eaaa5!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market-ou .signal-odds{color:#a6bbb7!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah{background:linear-gradient(145deg,rgba(78,57,47,.50),rgba(52,40,34,.54) 58%,rgba(36,29,26,.60))!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah .signal-market-head>span:first-child{color:#b58b73!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah .signal-odds{color:#c29a83!important}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah.is-no-lock{opacity:.62}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah.is-no-lock strong{color:#8f9991}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah .ah-audit-ok{color:#8fc59c}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah .ah-audit-warn{color:#c58b72;font-weight:800}
    body[data-page="live"] #nomad342PanelSignal .signal-market.signal-market-ah .ah-audit-row{display:block;line-height:1.35}
    body[data-page="live"] #nomad342PanelSignal .signal-pick-side{margin-top:4px!important;color:#9ea89f!important;font-size:8px!important;letter-spacing:.08em;text-transform:uppercase}
    body[data-page="live"] #nomad342PanelSignal .signal-compare{display:grid!important;grid-template-rows:auto 1fr auto 1fr;gap:5px;align-content:center;min-height:100%;padding:9px 8px!important;background:linear-gradient(180deg,rgba(68,68,60,.34),rgba(42,43,38,.42))!important;opacity:1!important}
    body[data-page="live"] #nomad342PanelSignal .signal-compare>span{color:#a8a99f!important}
    body[data-page="live"] #nomad342PanelSignal .signal-compare-stage{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:6px;padding:5px 0}
    body[data-page="live"] #nomad342PanelSignal .signal-compare-stage+ .signal-compare-stage{border-top:1px solid rgba(206,205,190,.08)}
    body[data-page="live"] #nomad342PanelSignal .signal-compare-stage small{margin:0!important;color:#989b91!important;font:900 7.5px/1 Arial,Helvetica,sans-serif;letter-spacing:.08em}
    body[data-page="live"] #nomad342PanelSignal .signal-compare-stage b{color:#c4c4b8;font:900 9px/1 Arial,Helvetica,sans-serif}
    body[data-page="live"] #nomad342PanelSignal .signal-compare-stage b.signal-live-minute{color:#62d98b!important}
    body[data-page="live"] #nomad342PanelSignal .signal-compare-stage strong{margin:0!important;color:#eeeee7!important;font:900 13px/1 Arial,Helvetica,sans-serif}
    body[data-page="live"] #nomad342PanelSignal .signal-compare-arrow{color:#85897f;font:900 10px/1 Arial,Helvetica,sans-serif;text-align:center}
    body[data-page="live"] #nomad342PanelSignal .signal-final.is-final>strong,body[data-page="live"] #nomad342PanelSignal .signal-final.is-final>small{color:#c3c1b2!important}
    body[data-page="live"] #nomad342PanelSignal .signal-result.push{color:#b9b19a!important;background:rgba(185,177,154,.06)!important}
    body[data-page="live"] #nomad342PanelSignal .signal-live-meta{color:#b9bbb0!important}
    @keyframes nomad342SignalPriceReady{0%,100%{border-color:rgba(86,168,111,.34);box-shadow:0 0 0 rgba(78,180,108,0)}50%{border-color:rgba(102,210,137,.96);box-shadow:0 0 10px rgba(78,180,108,.18),inset 0 0 0 1px rgba(110,216,144,.07)}}
    body[data-page="live"] #nomad342PanelSignal .signal-market.price-ready{box-sizing:border-box;border:1px solid rgba(86,168,111,.52)!important;animation:nomad342SignalPriceReady 2s ease-in-out infinite}
    @media(prefers-reduced-motion:reduce){body[data-page="live"] #nomad342PanelSignal .signal-market.price-ready{animation:none;border-color:rgba(102,210,137,.82)!important}}
    @media(max-width:900px){body[data-page="live"] #nomad342PanelSignal .signal-lock-grid.has-asian-handicap{grid-template-columns:repeat(2,minmax(0,1fr))}.signal-lock-grid.has-asian-handicap .signal-final{min-height:100%}}
    @media(max-width:700px){body[data-page="live"] #nomad342PanelSignal .signal-lock-grid.has-asian-handicap{grid-template-columns:1fr}body[data-page="live"] #nomad342PanelSignal .signal-compare{min-height:92px}body[data-page="live"] #nomad342PanelSignal .signal-compare-stage{grid-template-columns:44px 1fr auto}}
  `;
  document.head.appendChild(style);
}
function currentLive(record){
  const rows=Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[];
  const usable=rows.map(row=>row?.m).filter(m=>m&&!m?.freshness?.stale&&scorePair(m.score));
  const id=String(record?.matchId??'');
  if(id){const exact=usable.find(m=>String(m.id??'')===id);if(exact)return exact;}
  const key=teamKey(record?.home,record?.away);if(key!=='|'){
    const exactTeams=usable.filter(m=>teamKey(m.home,m.away)===key);if(exactTeams.length===1)return exactTeams[0];
  }
  const candidates=usable.map(m=>{const home=teamSimilarity(record?.home,m.home),away=teamSimilarity(record?.away,m.away);return {m,home,away,score:(home+away)/2};}).filter(x=>x.home>=.62&&x.away>=.62).sort((a,b)=>b.score-a.score);
  if(!candidates[0]||candidates[0].score<.72)return null;
  if(candidates[1]&&candidates[0].score-candidates[1].score<.06)return null;
  return candidates[0].m;
}
function scoreMirror(record){
  const settledScore=scorePair(record?.settlement?.finalScore);
  if(settledScore)return {score:settledScore,status:'FT',minute:null};
  const live=currentLive(record),liveScore=scorePair(live?.score),minute=finite(live?.minute);
  if(liveScore&&minute!==null)return {score:liveScore,status:`${Math.max(0,Math.trunc(minute))}′`,minute:Math.max(0,Math.trunc(minute))};
  return {score:null,status:'WAIT',minute:null};
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
function marketPriceReady(view,key){
  const pick=String(view?.pick||'').toUpperCase(),odds=finite(view?.odds);
  if(key==='oneXtwo')return ['HOME','DRAW','AWAY'].includes(pick)&&odds!==null;
  if(key==='totals')return ['OVER','UNDER'].includes(pick)&&finite(view?.line)!==null&&odds!==null;
  if(key==='ah')return Boolean(view?.locked)&&['HOME','AWAY'].includes(pick)&&finite(view?.line)!==null&&odds!==null;
  return false;
}
function lockSnapshot(view,record){
  const minute=finite(view?.lockMinute)??finite(record?.minute),score=scorePair(view?.entryScore)||scorePair(record?.entryScore);
  return {minute,score};
}
function marketLockText(view,record){const lock=lockSnapshot(view,record);return `LOCK ${lock.minute===null?'—':Math.trunc(lock.minute)}′ · SCORE ${lock.score?pair(lock.score):'—'}`;}
function marketCompareText(view,record,mirror){
  const lock=lockSnapshot(view,record),liveStage=mirror.status==='FT'?'FT':mirror.status==='WAIT'?'LIVE —':`LIVE ${mirror.status}`;
  return `LOCK ${lock.minute===null?'—':Math.trunc(lock.minute)}′ · ${lock.score?pair(lock.score):'—'} → ${liveStage} · ${mirror.score?pair(mirror.score):'—'}`;
}
function asianHandicapCard(ah,result,record,mirror){
  const locked=Boolean(ah?.locked),pick=String(ah?.pick||'').toUpperCase(),ready=marketPriceReady(ah,'ah');
  const selectedLine=finite(ah?.line),rawLine=finite(ah?.rawLine),selectedOdds=finite(ah?.odds),homeOdds=finite(ah?.homeOdds),awayOdds=finite(ah?.awayOdds),rawHome=finite(ah?.rawHomeHk),rawAway=finite(ah?.rawAwayHk);
  const rawSelected=pick==='HOME'?rawHome:pick==='AWAY'?rawAway:null,expectedLine=rawLine===null?null:(pick==='HOME'?-rawLine:rawLine),expectedOdds=rawSelected===null?null:1+rawSelected;
  const perspectiveOk=expectedLine===null||selectedLine===null?null:Math.abs(expectedLine-selectedLine)<1e-9;
  const priceOk=expectedOdds===null||selectedOdds===null?null:Math.abs(expectedOdds-selectedOdds)<1e-6;
  const selection=locked&&['HOME','AWAY'].includes(pick)?`${selectedTeam(record,pick)} ${fmtLine(selectedLine)}`:'NO LOCK';
  const source=[ah?.bookmaker].filter(Boolean).join(' · ');
  const perspectiveText=rawLine===null?'Goaloo raw line not stored':`Goaloo raw ${fmtLine(rawLine)} → ${pick||'—'} ${fmtLine(expectedLine)}${perspectiveOk===null?'':perspectiveOk?' · ✓':' · ⚠'}`;
  const pairText=`Home ${fmtDecimal(homeOdds)} · Away ${fmtDecimal(awayOdds)}`;
  const rawText=rawHome===null&&rawAway===null?'Reference odds not stored':`Reference Home ${fmtRaw(rawHome)} · Away ${fmtRaw(rawAway)}${priceOk===null?'':` · selected → ${fmtDecimal(expectedOdds)} ${priceOk?'✓':'⚠'}`}`;
  const finalScore=scorePair(record?.settlement?.finalScore),gradingScore=finalScore?scoreAfterEntry(finalScore,ah?.entryScore||record?.entryScore):null,expectedResult=gradingScore?gradeAhExpected(pick,selectedLine,gradingScore):null,serverResult=String(result||'PENDING').toUpperCase(),settlementOk=expectedResult?expectedResult===serverResult:null;
  const settlementText=expectedResult&&finalScore&&gradingScore?`FT ${pair(finalScore)} · AFTER LOCK ${pair(gradingScore)} · expected ${displayResult(expectedResult)} · ${settlementOk?'✓':'⚠'}`:'';
  return `<section class="signal-market signal-market-ah${locked?'':' is-no-lock'}${ready?' price-ready':''}"><div class="signal-market-head"><span>ASIAN HANDICAP</span><span class="signal-odds">DECIMAL ${esc(fmtDecimal(selectedOdds))}</span></div><strong>${esc(selection)}</strong>${locked?`<small class="signal-pick-side">${esc(pick)}</small>`:`<small class="ah-audit-row">ยังไม่มี Asian Handicap Signal ที่ล็อกในคู่นี้</small>`}<small class="ah-audit-row">${locked?esc(`${source?`${source} · `:''}${pairText}`):'—'}</small><small class="ah-audit-row ${priceOk===false?'ah-audit-warn':'ah-audit-ok'}">${locked?esc(rawText):'—'}</small><small>${locked?esc(marketCompareText(ah,record,mirror)):'—'}</small>${settlementText?`<small class="ah-audit-row ${settlementOk===false?'ah-audit-warn':'ah-audit-ok'}">${esc(settlementText)}</small>`:''}<span class="signal-result ${esc(resultClass(result))}">${esc(locked?displayResult(result):'NO LOCK')}</span></section>`;
}
function card(record){
  const one=marketView(record,'oneXtwo'),totals=marketView(record,'totals'),ah=marketView(record,'ah');
  const oneResult=marketResult(record,'oneXtwo'),totalsResult=marketResult(record,'totals'),ahResult=marketResult(record,'ah'),mirror=scoreMirror(record),firstLock=lockSnapshot({},record);
  const oneTeam=selectedTeam(record,one.pick),liveMeta=mirror.status==='FT'?`FT · SCORE ${mirror.score?pair(mirror.score):'—'}`:mirror.status==='WAIT'?'LIVE WAIT':`LIVE ${mirror.status} · SCORE ${mirror.score?pair(mirror.score):'—'}`;
  const oneReady=marketPriceReady(one,'oneXtwo'),totalsReady=marketPriceReady(totals,'totals');
  return `<article class="signal-lock-card" data-match-id="${esc(record.matchId)}">
    <div class="signal-lock-head"><div><div class="signal-lock-kicker">SIGNAL LOCKED · 3.42</div><div class="signal-lock-teams">${esc(record.home)} — ${esc(record.away)}</div><div class="signal-lock-league">${esc(record.league||'—')}</div></div><div class="signal-lock-meta"><span>FIRST LOCK ${esc(record.minute??'—')}′ · SCORE ${esc(pair(record.entryScore))}</span><span class="signal-live-meta">${esc(liveMeta)}</span><span>${esc(when(record.lockedAt))}</span></div></div>
    <div class="signal-lock-grid has-asian-handicap">
      <section class="signal-market signal-market-1x2${oneReady?' price-ready':''}"><div class="signal-market-head"><span>1X2</span><span class="signal-odds">@ ${esc(fmtOdds(one.odds))}</span></div><strong>${esc(oneTeam)}</strong><small class="signal-pick-side">${esc(one.pick||'—')}</small><small>HOME ${esc(fmtPct(one.home))} · DRAW ${esc(fmtPct(one.draw))} · AWAY ${esc(fmtPct(one.away))}</small><small>${esc(marketCompareText(one,record,mirror))}</small><span class="signal-result ${esc(resultClass(oneResult))}">${esc(displayResult(oneResult))}</span></section>
      <section class="signal-final signal-compare ${mirror.status==='FT'?'is-final':'is-wait'}" aria-label="Lock versus live score comparison"><span>COMPARE</span><div class="signal-compare-stage"><small>LOCK</small><b>${esc(firstLock.minute===null?'—':`${Math.trunc(firstLock.minute)}′`)}</b><strong>${esc(firstLock.score?pair(firstLock.score):'—')}</strong></div><div class="signal-compare-arrow">→</div><div class="signal-compare-stage"><small>${mirror.status==='FT'?'FT':'LIVE'}</small><b class="${mirror.status!=='FT'&&mirror.status!=='WAIT'?'signal-live-minute':''}">${esc(mirror.status==='WAIT'?'—':mirror.status)}</b><strong>${esc(mirror.score?pair(mirror.score):'—')}</strong></div></section>
      <section class="signal-market signal-market-ou${totalsReady?' price-ready':''}"><div class="signal-market-head"><span>OVER / UNDER ${esc(totals.line??'—')}</span><span class="signal-odds">@ ${esc(fmtOdds(totals.odds))}</span></div><strong>${esc(totals.pick||'—')}</strong><small>OVER ${esc(fmtPct(totals.over))} · UNDER ${esc(fmtPct(totals.under))}</small><small>${esc(marketCompareText(totals,record,mirror))}</small><span class="signal-result ${esc(resultClass(totalsResult))}">${esc(displayResult(totalsResult))}</span></section>
      ${asianHandicapCard(ah,ahResult,record,mirror)}
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