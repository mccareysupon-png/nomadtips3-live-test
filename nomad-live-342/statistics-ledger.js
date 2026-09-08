(()=>{
'use strict';
const runtime=window.NOMAD342_LEDGER_RUNTIME||{};
const base=String(runtime.base||'').replace(/\/$/,'');
const tbody=document.getElementById('statsRows');
const status=document.getElementById('statsStatus');
const metrics={
  roi:document.getElementById('statsRoi'),
  profit:document.getElementById('statsProfit'),
  total:document.getElementById('statsTotal'),
  day:document.getElementById('statsDay'),
  win:document.getElementById('statsWin'),
  loss:document.getElementById('statsLoss'),
  draw:document.getElementById('statsDraw'),
  avgOdds:document.getElementById('statsAvgOdds'),
  winRate:document.getElementById('statsWinRate')
};
let timer=null,busy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const finite=value=>{if(value===null||value===undefined||value===''||typeof value==='boolean')return null;const n=Number(value);return Number.isFinite(n)?n:null};
const pair=value=>`${value?.home??'—'}–${value?.away??'—'}`;
const when=value=>{try{return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '—'}};
const fmtOdds=value=>{const n=finite(value);if(n===null)return'—';const formatter=window.NOMAD342_ODDS_DISPLAY?.format;return typeof formatter==='function'?formatter(n):n.toFixed(2);};
const fmtDecimal=value=>{const n=finite(value);return n===null?'—':n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');};
const fmtLine=value=>{const n=finite(value);if(n===null)return'—';if(Math.abs(n)<1e-9)return'0.0';const abs=Math.abs(n);const digits=Number.isInteger(abs)?1:2;return `${n>0?'+':'-'}${abs.toFixed(digits)}`;};
const fmtRawHk=value=>{const n=finite(value);return n===null?'—':n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');};
const fmtProfit=value=>finite(value)===null?'—':`${finite(value)>0?'+':''}${finite(value).toFixed(2)}u`;
const resultClass=result=>`result-${String(result||'PENDING').toLowerCase()}`;
const displayResult=result=>String(result||'PENDING').toUpperCase()==='PUSH'?'DRAW':String(result||'PENDING').toUpperCase().replaceAll('_',' ');
const profitClass=value=>finite(value)===null?'':finite(value)>0?'pl-positive':finite(value)<0?'pl-negative':'';
const set=(node,value)=>{if(node)node.textContent=String(value)};
const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
const BANGKOK_OFFSET_MS=7*60*60*1000;
const bangkokDayKey=value=>{
  const n=finite(value);
  if(n===null)return null;
  const d=new Date(n+BANGKOK_OFFSET_MS);
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
};
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
function currentLive(row){
  const rows=Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[];
  const usable=rows.map(item=>item?.m).filter(m=>m&&!m?.freshness?.stale&&scorePair(m.score));
  const id=String(row?.matchId??'');
  if(id){const exact=usable.find(m=>String(m.id??'')===id);if(exact)return exact;}
  const key=teamKey(row?.home,row?.away);if(key==='|')return null;
  const matches=usable.filter(m=>teamKey(m.home,m.away)===key);
  return matches.length===1?matches[0]:null;
}
function finalDisplay(row){
  const settledScore=scorePair(row?.finalScore);
  if(settledScore)return pair(settledScore);
  const result=String(row?.result||'PENDING').toUpperCase();
  if(result!=='PENDING')return '—';
  const live=currentLive(row),liveScore=scorePair(live?.score),minute=finite(live?.minute);
  if(liveScore&&minute!==null)return `${pair(liveScore)} · ${Math.max(0,Math.trunc(minute))}′`;
  return '—';
}
function finalHtml(row){
  const text=finalDisplay(row);
  const liveMatch=/^(.*? · )(\d+′)$/.exec(text);
  if(!liveMatch)return esc(text);
  return `${esc(liveMatch[1])}<span class="live-minute">${esc(liveMatch[2])}</span>`;
}
function fallbackDays(rows){
  return new Set(rows.map(row=>bangkokDayKey(row?.lockedAt)).filter(Boolean)).size;
}
function fallbackAvgOdds(rows){
  const settled=rows.filter(row=>String(row?.result||'PENDING').toUpperCase()!=='PENDING');
  const priced=settled.map(row=>finite(row?.odds)).filter(value=>value!==null);
  return priced.length?priced.reduce((sum,value)=>sum+value,0)/priced.length:null;
}
function buildAhAudit(records){
  const audit=new Map();
  for(const record of Array.isArray(records)?records:[]){
    const signal=(Array.isArray(record?.signals)?record.signals:[]).find(item=>String(item?.market||'').toUpperCase()==='AH');
    if(!signal)continue;
    const matchId=String(record?.matchId??'');if(!matchId)continue;
    audit.set(matchId,{
      pick:String(signal.pick||'').toUpperCase(),line:finite(signal.line),rawLine:finite(signal.rawLine),odds:finite(signal.odds),
      homeOdds:finite(signal.homeOdds),awayOdds:finite(signal.awayOdds),rawHomeHk:finite(signal.rawHomeHk),rawAwayHk:finite(signal.rawAwayHk),
      bookmaker:String(signal.bookmaker||record?.market?.asianHandicap?.bookmaker||'Bet365'),provider:String(signal.provider||record?.market?.asianHandicap?.provider||record?.market?.provider||'Nowgoal')
    });
  }
  return audit;
}
function ahCells(row,audit){
  const pick=String(audit?.pick||row?.pick||'').toUpperCase(),selectedLine=finite(audit?.line)??finite(row?.line),rawLine=finite(audit?.rawLine);
  const selectedOdds=finite(audit?.odds)??finite(row?.odds),homeOdds=finite(audit?.homeOdds),awayOdds=finite(audit?.awayOdds),rawHome=finite(audit?.rawHomeHk),rawAway=finite(audit?.rawAwayHk);
  const rawSelected=pick==='HOME'?rawHome:pick==='AWAY'?rawAway:null,bookmaker=String(audit?.bookmaker||'Bet365'),provider=String(audit?.provider||'Nowgoal');
  const expected=rawLine===null?null:(pick==='AWAY'?-rawLine:rawLine),perspectiveOk=expected===null||selectedLine===null?null:Math.abs(expected-selectedLine)<1e-9;
  const priceExpected=rawSelected===null?null:1+rawSelected,priceOk=priceExpected===null||selectedOdds===null?null:Math.abs(priceExpected-selectedOdds)<1e-6;
  const pickMain=`${pick||'—'} ${fmtLine(selectedLine)}`;
  const perspective=rawLine===null?'Home-perspective raw line not stored':`Home perspective ${fmtLine(rawLine)}${perspectiveOk===null?'':perspectiveOk?' · ✓':' · ⚠'}`;
  const priceMain=fmtDecimal(selectedOdds);
  const pricePair=`${bookmaker} · ${provider} · Home ${fmtDecimal(homeOdds)} · Away ${fmtDecimal(awayOdds)}`;
  const rawPair=rawHome===null&&rawAway===null?'Hong Kong raw odds not stored':`Hong Kong Home ${fmtRawHk(rawHome)} · Away ${fmtRawHk(rawAway)}${priceOk===null?'':` · selected → ${fmtDecimal(priceExpected)} ${priceOk?'✓':'⚠'}`}`;
  const finalScore=scorePair(row?.finalScore),expectedResult=finalScore?gradeAhExpected(pick,selectedLine,finalScore):null,serverResult=String(row?.result||'PENDING').toUpperCase(),settlementOk=expectedResult?expectedResult===serverResult:null;
  const settlement=expectedResult&&finalScore?`FT ${pair(finalScore)} · expected ${displayResult(expectedResult)} · ${settlementOk?'✓':'⚠'}`:'';
  return {
    market:'Asian Handicap',
    pick:`<strong>${esc(pickMain)}</strong><br><small>${esc(perspective)}</small>`,
    odds:`<strong>${esc(priceMain)}</strong><br><small>${esc(pricePair)}</small><br><small>${esc(rawPair)}</small>`,
    settlement:settlement?`<br><small>${esc(settlement)}</small>`:''
  };
}
function rowHtml(row,ahAudit){
  const result=String(row.result||'PENDING').toUpperCase(),isAh=String(row.market||'').startsWith('Asian Handicap');
  const audit=isAh?ahCells(row,ahAudit.get(String(row?.matchId??''))):null;
  const marketHtml=isAh?esc(audit.market):esc(row.market);
  const pickHtml=isAh?audit.pick:esc(row.pick);
  const oddsHtml=isAh?audit.odds:esc(fmtOdds(row.odds));
  const resultHtml=isAh?`${esc(displayResult(result))}${audit.settlement}`:esc(displayResult(result));
  return `<tr><td>${esc(when(row.lockedAt))}</td><td>${esc(row.home)} — ${esc(row.away)}</td><td class="market-cell">${marketHtml}</td><td>${pickHtml}</td><td>${oddsHtml}</td><td>${esc(row.minute??'—')}′ · ${esc(pair(row.entryScore))}</td><td class="final-cell">${finalHtml(row)}</td><td class="${esc(resultClass(result))}">${resultHtml}</td><td class="${esc(profitClass(row.profit))}">${esc(fmtProfit(row.profit))}</td></tr>`;
}
async function fetchJson(path){
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.timeoutMs)||6500);
  try{const response=await fetch(`${base}${path}${path.includes('?')?'&':'?'}t=${Date.now()}`,{cache:'no-store',signal:ac.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}
  finally{clearTimeout(timeout);}
}
async function load(){
  if(busy||!base||!tbody)return;busy=true;
  try{
    const data=await fetchJson(`${runtime.statisticsPath||'/statistics'}?limit=500`),summary=data?.summary||{},rows=Array.isArray(data?.rows)?data.rows:[];
    let ahAudit=new Map();
    try{const signalData=await fetchJson(`${runtime.signalPath||'/signal'}?limit=500`);ahAudit=buildAhAudit(signalData?.records);}catch{}
    const avgOdds=finite(summary.avgOdds)??fallbackAvgOdds(rows);
    set(metrics.roi,finite(summary.roi)===null?'—':`${Number(summary.roi).toFixed(2)}%`);
    set(metrics.profit,fmtProfit(summary.profit));
    const daily=document.getElementById('statsDailyRows');
    if(daily)daily.innerHTML=(data.daily||[]).map(d=>`<tr><td>${esc(d.day)}</td><td>${esc(d.totalPredictions)}</td><td>${esc(d.wins)} (${esc(d.halfWins||0)} half)</td><td>${esc(d.losses)} (${esc(d.halfLosses||0)} half)</td><td>${esc(d.pushes)}</td><td>${esc(d.pendingPredictions)}</td><td>${Number(d.winRate).toFixed(1)}%</td><td>${esc(fmtProfit(d.profit))}</td><td>${finite(d.roi)===null?'—':Number(d.roi).toFixed(2)+'%'}</td></tr>`).join('');
    set(metrics.total,summary.totalPredictions??rows.length);
    set(metrics.day,summary.days??fallbackDays(rows));
    set(metrics.win,summary.wins??0);
    set(metrics.loss,summary.losses??0);
    set(metrics.draw,summary.pushes??0);
    set(metrics.avgOdds,avgOdds===null?'—':fmtOdds(avgOdds));
    set(metrics.winRate,`${Number(summary.winRate||0).toFixed(1)}%`);
    tbody.innerHTML=rows.length?rows.map(row=>rowHtml(row,ahAudit)).join(''):'<tr><td colspan="9">No picks recorded yet.</td></tr>';
    set(status,`LEDGER ONLINE · ${summary.settledPredictions??0} settled · ${summary.pendingPredictions??0} pending · updated ${when(data.updatedAt)}`);
  }catch(error){
    set(status,'LEDGER TEMPORARILY UNAVAILABLE');
    if(!tbody.children.length||/Connecting|No picks|unavailable/i.test(tbody.textContent||''))tbody.innerHTML='<tr><td colspan="9">Statistics ledger connection temporarily unavailable.</td></tr>';
  }finally{busy=false;}
}
const refresh=()=>setTimeout(load,0);
load();timer=setInterval(load,Math.max(3000,Number(runtime.pollMs)||5000));
document.addEventListener('nomad342:ledgerlocked',refresh);
document.addEventListener('nomad342:ledgerrefresh',refresh);
document.addEventListener('nomad342:odds-display-change',refresh);
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)});
})();