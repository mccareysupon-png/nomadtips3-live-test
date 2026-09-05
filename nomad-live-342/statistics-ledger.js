(()=>{
'use strict';
const runtime=window.NOMAD342_LEDGER_RUNTIME||{};
const base=String(runtime.base||'').replace(/\/$/,'');
const tbody=document.getElementById('statsRows');
const status=document.getElementById('statsStatus');
const metrics={total:document.getElementById('statsTotal'),win:document.getElementById('statsWin'),loss:document.getElementById('statsLoss'),push:document.getElementById('statsPush'),winRate:document.getElementById('statsWinRate')};
let timer=null,busy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const finite=value=>{if(value===null||value===undefined||value===''||typeof value==='boolean')return null;const n=Number(value);return Number.isFinite(n)?n:null};
const pair=value=>`${value?.home??'—'}–${value?.away??'—'}`;
const when=value=>{try{return new Date(value).toLocaleString([],{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '—'}};
const fmtOdds=value=>finite(value)===null?'—':finite(value).toFixed(2);
const fmtProfit=value=>finite(value)===null?'—':`${finite(value)>0?'+':''}${finite(value).toFixed(2)}u`;
const resultClass=result=>`result-${String(result||'PENDING').toLowerCase()}`;
const profitClass=value=>finite(value)===null?'':finite(value)>0?'pl-positive':finite(value)<0?'pl-negative':'';
const set=(node,value)=>{if(node)node.textContent=String(value)};
const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
const scorePair=value=>{
  const home=finite(Array.isArray(value)?value[0]:value?.home),away=finite(Array.isArray(value)?value[1]:value?.away);
  return home===null||away===null?null:{home,away};
};
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
function rowHtml(row){
  const result=String(row.result||'PENDING').toUpperCase();
  return `<tr><td>${esc(when(row.lockedAt))}</td><td>${esc(row.home)} — ${esc(row.away)}</td><td class="market-cell">${esc(row.market)}</td><td>${esc(row.pick)}</td><td>${esc(fmtOdds(row.odds))}</td><td>${esc(row.minute??'—')}′ · ${esc(pair(row.entryScore))}</td><td class="final-cell">${esc(finalDisplay(row))}</td><td class="${esc(resultClass(result))}">${esc(result)}</td><td class="${esc(profitClass(row.profit))}">${esc(fmtProfit(row.profit))}</td></tr>`;
}
async function load(){
  if(busy||!base||!tbody)return;busy=true;
  try{
    const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.timeoutMs)||6500);
    let response;try{response=await fetch(`${base}${runtime.statisticsPath||'/statistics'}?limit=500&t=${Date.now()}`,{cache:'no-store',signal:ac.signal});}finally{clearTimeout(timeout)}
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json(),summary=data?.summary||{},rows=Array.isArray(data?.rows)?data.rows:[];
    set(metrics.total,summary.totalPredictions??rows.length);set(metrics.win,summary.wins??0);set(metrics.loss,summary.losses??0);set(metrics.push,summary.pushes??0);set(metrics.winRate,`${Number(summary.winRate||0).toFixed(1)}%`);
    tbody.innerHTML=rows.length?rows.map(rowHtml).join(''):'<tr><td colspan="9">No picks recorded yet.</td></tr>';
    set(status,`LEDGER ONLINE · ${summary.settledPredictions??0} settled · ${summary.pendingPredictions??0} pending`);
  }catch(error){
    set(status,'LEDGER TEMPORARILY UNAVAILABLE');
    if(!tbody.children.length||/Connecting|No picks|unavailable/i.test(tbody.textContent||''))tbody.innerHTML='<tr><td colspan="9">Statistics ledger connection temporarily unavailable.</td></tr>';
  }finally{busy=false;}
}
load();timer=setInterval(load,Math.max(10000,Number(runtime.pollMs)||15000));
window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)});
})();
