(()=>{
  'use strict';

  const LIVE_SCORE_V3_BASE='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev';
  const LIVE_SCORE_V2_BASE='https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev';
  const POLL_MS=10000;
  const FINAL_POLL_MS=30000;
  const REQUEST_TIMEOUT_MS=9000;
  const CLIENT_LAST_GOOD_MS=60000;

  let records=[];
  let liveById=new Map();
  let liveByTeams=new Map();
  let finalById=new Map();
  let finalByTeams=new Map();
  let timer=null;
  let running=false;
  let lastLiveSuccessAt=0;
  let lastFinalFetchAt=0;

  const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
  const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const scorePair=score=>{
    const home=Array.isArray(score)?score[0]:score?.home;
    const away=Array.isArray(score)?score[1]:score?.away;
    if(!finite(home)||!finite(away))return null;
    return `${Number(home)}–${Number(away)}`;
  };
  const minuteText=value=>finite(value)?`${Math.max(0,Math.trunc(Number(value)))}′`:'';
  const isSettled=record=>Boolean(record?.settlement&&record.settlement?.result&&record.settlement.result!=='PENDING');
  const isUsableLive=match=>Boolean(match&&!match?.freshness?.stale&&scorePair(match.score)&&finite(match.minute));
  const setCellText=(cell,value)=>{
    const next=String(value);
    if(cell&&cell.textContent!==next)cell.textContent=next;
  };

  function cacheBust(url){
    const joiner=url.includes('?')?'&':'?';
    return `${url}${joiner}_nomad_stats_mirror=${Date.now()}`;
  }

  async function fetchJson(url){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetch(cacheBust(url),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }finally{
      clearTimeout(timeout);
    }
  }

  async function fetchLiveFeed(){
    try{
      const data=await fetchJson(`${LIVE_SCORE_V3_BASE}/feed`);
      if(String(data?.version)!=='3.42'||!Array.isArray(data?.matches))throw new Error('invalid_v3_feed_contract');
      return data;
    }catch{
      const data=await fetchJson(`${LIVE_SCORE_V2_BASE}/feed`);
      if(String(data?.version)!=='3.42'||!Array.isArray(data?.matches))throw new Error('invalid_v2_feed_contract');
      return data;
    }
  }

  function indexUnique(rows,usable){
    const byId=new Map(),byTeams=new Map();
    for(const row of rows){
      if(!usable(row))continue;
      if(row.id!==null&&row.id!==undefined&&row.id!=='')byId.set(String(row.id),row);
      const key=teamKey(row.home,row.away);
      if(key!=='|'){
        if(byTeams.has(key))byTeams.set(key,null);
        else byTeams.set(key,row);
      }
    }
    return {byId,byTeams};
  }

  function indexLive(matches=[]){
    const indexed=indexUnique(matches,isUsableLive);
    liveById=indexed.byId;
    liveByTeams=indexed.byTeams;
  }

  function indexFinals(finals=[]){
    const indexed=indexUnique(finals,item=>Boolean(item&&item.status==='FT'&&scorePair(item.score)));
    finalById=indexed.byId;
    finalByTeams=indexed.byTeams;
  }

  function findIndexed(record,byId,byTeams){
    if(record?.matchId!==null&&record?.matchId!==undefined&&record?.matchId!==''){
      const exact=byId.get(String(record.matchId));
      if(exact)return exact;
    }
    return byTeams.get(teamKey(record?.home,record?.away))||null;
  }

  function findLive(record){return findIndexed(record,liveById,liveByTeams);}
  function findFinal(record){return findIndexed(record,finalById,finalByTeams);}

  function restoreFinalCell(cell,record){
    if(!cell)return;
    const fin=record?.settlement?.finalScore;
    setCellText(cell,fin?`${fin.home??'—'}–${fin.away??'—'}`:'—');
    cell.removeAttribute('data-live-score-mirror');
  }

  function restoreResultCell(cell,record){
    if(!cell)return;
    const result=record?.settlement?.result||'PENDING';
    setCellText(cell,result);
    cell.removeAttribute('data-live-score-mirror');
  }

  function showPendingLive(cell,score,minute){
    if(!cell||!score||!minute)return;
    setCellText(cell,`PENDING\n${score} · ${minute}`);
    cell.setAttribute('data-live-score-mirror','1');
  }

  function apply(){
    const rows=[...document.querySelectorAll('.data-table tbody tr')];
    if(!rows.length||!records.length)return;

    rows.forEach((row,index)=>{
      const record=records[index];
      const finalCell=row.children?.[8];
      const resultCell=row.children?.[9];
      if(!record||!finalCell||!resultCell)return;

      if(isSettled(record)){
        restoreFinalCell(finalCell,record);
        restoreResultCell(resultCell,record);
        return;
      }

      const live=findLive(record);
      if(live){
        const score=scorePair(live.score);
        const minute=minuteText(live.minute);
        if(score&&minute){
          // While the match is live, FINAL must remain reserved for FT only.
          restoreFinalCell(finalCell,record);
          showPendingLive(resultCell,score,minute);
          return;
        }
      }

      const final=findFinal(record);
      const finalScore=scorePair(final?.score);
      if(finalScore){
        setCellText(finalCell,`${finalScore} · FT`);
        finalCell.setAttribute('data-live-score-mirror','ft');
        restoreResultCell(resultCell,record);
        return;
      }

      restoreFinalCell(finalCell,record);
      restoreResultCell(resultCell,record);
    });
  }

  async function refreshLive(){
    try{
      const data=await fetchLiveFeed();
      indexLive(data.matches);
      lastLiveSuccessAt=Date.now();
    }catch{
      if(!lastLiveSuccessAt||Date.now()-lastLiveSuccessAt>CLIENT_LAST_GOOD_MS){
        liveById=new Map();
        liveByTeams=new Map();
      }
    }
  }

  async function refreshFinals(force=false){
    if(!force&&lastFinalFetchAt&&Date.now()-lastFinalFetchAt<FINAL_POLL_MS)return;
    lastFinalFetchAt=Date.now();
    try{
      const data=await fetchJson(`${LIVE_SCORE_V3_BASE}/finals`);
      if(String(data?.version)!=='3.42'||!Array.isArray(data?.finals))throw new Error('invalid_v3_final_contract');
      indexFinals(data.finals);
    }catch{
      // Keep the last good FT index. Engine settlement remains authoritative.
    }
  }

  async function tick(forceFinal=false){
    if(running)return;
    running=true;
    try{
      await Promise.allSettled([refreshLive(),refreshFinals(forceFinal)]);
      apply();
    }finally{
      running=false;
    }
  }

  window.addEventListener('nomad:statistics-records',event=>{
    records=Array.isArray(event.detail?.records)?event.detail.records:[];
    apply();
    tick(true);
  });

  const table=document.querySelector('.data-table tbody');
  if(table)new MutationObserver(()=>requestAnimationFrame(apply)).observe(table,{childList:true,subtree:true});

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)tick(true);
  });

  tick(true);
  timer=setInterval(()=>{if(!document.hidden)tick(false);},POLL_MS);
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
