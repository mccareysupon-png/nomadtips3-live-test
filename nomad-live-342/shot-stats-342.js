(()=>{
'use strict';
const BASE='https://nomadtips3-shot-sidecar-342.mccarey-supon.workers.dev';
const POLL_MS=90_000;
let rowsByMatch=new Map();
let busy=false;
let timer=null;
let queued=false;

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const value=v=>finite(v)?String(Number(v)):'—';
const delta=v=>finite(v)?`${Number(v)>=0?'+':''}${Number(v)}`:'—';

function statByLabel(card,label){
  return [...card.querySelectorAll('.event-stats .event-stat')].find(node=>String(node.querySelector('.event-stat-title')?.textContent||'').trim().toUpperCase()===label);
}
function applyStat(card,label,pair,rollingPair,meta){
  const stat=statByLabel(card,label);if(!stat)return;
  const lines=stat.querySelectorAll('.event-stat-row');
  const home=lines[0]?.querySelector('b'),away=lines[1]?.querySelector('b');
  if(home)home.textContent=value(pair?.home);
  if(away)away.textContent=value(pair?.away);
  const small=stat.querySelector('small');
  if(small){
    const roll=rollingPair?`15M CHANGE · HOME ${delta(rollingPair.home)} · AWAY ${delta(rollingPair.away)}`:'5DOLLAR · DISPLAY ONLY';
    small.textContent=roll;
    small.title=`5DollarFootballAPI · mapping ${meta?.confidence??'—'} · detector not connected`;
  }
  stat.dataset.n342shotSource='5dollar';
  stat.dataset.n342shotDisplayOnly='true';
}
function resetStat(card,label){
  const stat=statByLabel(card,label);if(!stat)return;
  const lines=stat.querySelectorAll('.event-stat-row');
  lines[0]?.querySelector('b')?.replaceChildren('—');
  lines[1]?.querySelector('b')?.replaceChildren('—');
  const small=stat.querySelector('small');if(small)small.textContent='5DOLLAR · NO MATCH / NO STATS';
}
function applyCard(card){
  const id=String(card.dataset.matchId||'');if(!id)return;
  const row=rowsByMatch.get(id);
  if(!row||row.status!=='MATCHED'){
    resetStat(card,'SHOTS ON TARGET');
    resetStat(card,'SHOTS OFF TARGET');
    return;
  }
  applyStat(card,'SHOTS ON TARGET',row.shotOnTarget,row.rolling15?.shotOnTarget,row.mapping);
  applyStat(card,'SHOTS OFF TARGET',row.shotOffTarget,row.rolling15?.shotOffTarget,row.mapping);
}
function applyAll(){document.querySelectorAll('.event-compact[data-match-id]').forEach(applyCard)}
function queueApply(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;applyAll()})}

async function refresh(){
  if(busy)return;busy=true;
  try{
    const response=await fetch(`${BASE}/snapshot?t=${Date.now()}`,{cache:'no-store',headers:{accept:'application/json'}});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok||!Array.isArray(payload.results))throw new Error(payload?.error||`SHOT_HTTP_${response.status}`);
    rowsByMatch=new Map(payload.results.map(row=>[String(row.nomadMatchId),row]));
    window.NOMAD342_SHOT_SIDECAR=Object.freeze({base:BASE,lastSnapshot:payload});
    queueApply();
  }catch(error){
    window.NOMAD342_SHOT_SIDECAR=Object.freeze({base:BASE,error:String(error?.message||error),lastSnapshot:null});
  }finally{busy=false}
}
function start(){
  if(document.body?.dataset?.page!=='live')return;
  const host=document.getElementById('matchList');if(!host)return;
  new MutationObserver(queueApply).observe(host,{childList:true,subtree:true});
  refresh();
  timer=setInterval(refresh,POLL_MS);
  window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer)},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
