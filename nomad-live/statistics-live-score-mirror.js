(()=>{
  'use strict';

  const LIVE_SCORE_V3_BASE='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev';
  const LIVE_SCORE_V2_BASE='https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev';
  const POLL_MS=5000;
  const FINAL_POLL_MS=15000;
  const REQUEST_TIMEOUT_MS=8000;
  const LIVE_KEEP_MS=25000;

  let canonicalRecords=[];
  let liveById=new Map();
  let liveByTeams=new Map();
  let finalById=new Map();
  let finalByTeams=new Map();
  let lastLiveSuccessAt=0;
  let lastFinalFetchAt=0;
  let timer=null;
  let running=false;
  let applying=false;

  const normalize=value=>String(value??'').trim().toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ');
  const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const scoreObject=score=>{
    const home=Array.isArray(score)?score[0]:score?.home;
    const away=Array.isArray(score)?score[1]:score?.away;
    if(!finite(home)||!finite(away))return null;
    return {home:Number(home),away:Number(away)};
  };
  const scoreText=score=>{
    const pair=scoreObject(score);
    return pair?`${pair.home}–${pair.away}`:null;
  };
  const minuteText=value=>finite(value)?`${Math.max(0,Math.trunc(Number(value)))}'`:'';
  const isCanonicalSettled=record=>Boolean(record?.settlement&&record.settlement?.result&&record.settlement.result!=='PENDING');
  const isUsableLive=match=>Boolean(match&&!match?.freshness?.stale&&scoreObject(match.score)&&finite(match.minute));
  const setCellText=(cell,value)=>{
    const next=String(value);
    if(cell&&cell.textContent!==next)cell.textContent=next;
  };

  function uniqueIndex(items,idGetter,keyGetter){
    const byId=new Map(),byTeams=new Map();
    for(const item of items){
      const id=idGetter(item);
      if(id!==null&&id!==undefined&&id!=='')byId.set(String(id),item);
      const key=keyGetter(item);
      if(!key||key==='|')continue;
      if(byTeams.has(key))byTeams.set(key,null);
      else byTeams.set(key,item);
    }
    return {byId,byTeams};
  }

  function indexLive(matches=[]){
    const usable=matches.filter(isUsableLive);
    const indexed=uniqueIndex(usable,m=>m?.id,m=>teamKey(m?.home,m?.away));
    liveById=indexed.byId;
    liveByTeams=indexed.byTeams;
    lastLiveSuccessAt=Date.now();
  }

  function indexFinals(finals=[]){
    const usable=finals.filter(item=>scoreObject(item?.score));
    const indexed=uniqueIndex(usable,item=>item?.id,item=>teamKey(item?.home,item?.away));
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
  const findLive=record=>findIndexed(record,liveById,liveByTeams);
  const findFinal=record=>findIndexed(record,finalById,finalByTeams);

  function rowRecord(row,index,records){
    if(records.length===document.querySelectorAll('.data-table tbody tr').length)return records[index]||null;
    const matchText=normalize(row.children?.[1]?.textContent||'');
    if(!matchText)return records[index]||null;
    let found=null;
    for(const record of records){
      const expected=normalize(`${record?.home??''} — ${record?.away??''}`);
      if(expected!==matchText)continue;
      if(found)return records[index]||record;
      found=record;
    }
    return found||records[index]||null;
  }

  function restoreCanonicalFinal(cell,record){
    setCellText(cell,scoreText(record?.settlement?.finalScore)||'—');
    cell?.removeAttribute('data-live-score-mirror');
    cell?.removeAttribute('data-final-score-mirror');
  }

  function apply(){
    if(applying)return;
    applying=true;
    try{
      if(lastLiveSuccessAt&&Date.now()-lastLiveSuccessAt>LIVE_KEEP_MS){
        liveById=new Map();liveByTeams=new Map();lastLiveSuccessAt=0;
      }
      const rows=[...document.querySelectorAll('.data-table tbody tr')];
      rows.forEach((row,index)=>{
        const record=rowRecord(row,index,canonicalRecords);
        const finalCell=row.children?.[8];
        if(!record||!finalCell)return;

        if(isCanonicalSettled(record)){
          restoreCanonicalFinal(finalCell,record);
          return;
        }

        finalCell.removeAttribute('data-live-score-mirror');
        finalCell.removeAttribute('data-final-score-mirror');

        const final=findFinal(record);
        const mirroredFinal=scoreText(final?.score);
        if(mirroredFinal){
          setCellText(finalCell,mirroredFinal);
          finalCell.setAttribute('data-final-score-mirror','1');
          return;
        }

        const live=findLive(record);
        const liveScore=scoreText(live?.score);
        const minute=minuteText(live?.minute);
        if(liveScore&&minute){
          setCellText(finalCell,`${liveScore} · ${minute}`);
          finalCell.setAttribute('data-live-score-mirror','1');
          return;
        }

        restoreCanonicalFinal(finalCell,record);
      });

      window.dispatchEvent(new CustomEvent('nomad:statistics-live-mirror',{
        detail:{liveCount:liveById.size,finalCount:finalById.size}
      }));
    }finally{
      applying=false;
    }
  }

  async function getJson(url){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }finally{clearTimeout(timeout)}
  }

  async function fetchLiveSources(token){
    try{
      const data=await getJson(`${LIVE_SCORE_V3_BASE}/feed?force=1&t=${token}`);
      if(String(data?.version)!=='3.42'||!Array.isArray(data?.matches)||data?.ok===false)throw new Error('invalid_v3_feed');
      indexLive(data.matches);
      return;
    }catch(_){
      try{
        const data=await getJson(`${LIVE_SCORE_V2_BASE}/feed?force=1&t=${token}`);
        if(String(data?.version)!=='3.42'||!Array.isArray(data?.matches)||data?.ok===false)throw new Error('invalid_v2_feed');
        indexLive(data.matches);
        return;
      }catch(__){
        try{
          const data=await getJson(`/api/feed?t=${token}`);
          if(!Array.isArray(data?.matches))throw new Error('invalid_page1_feed');
          const normalized=data.matches.map(match=>({
            id:match?.id,
            home:match?.home,
            away:match?.away,
            minute:match?.minute,
            score:match?.score,
            freshness:{stale:Boolean(match?.freshness?.sourceStale||match?.freshness?.stale)}
          }));
          indexLive(normalized);
        }catch(___){
          if(!lastLiveSuccessAt||Date.now()-lastLiveSuccessAt>LIVE_KEEP_MS){
            liveById=new Map();liveByTeams=new Map();lastLiveSuccessAt=0;
          }
        }
      }
    }
  }

  async function fetchFinals(token){
    try{
      const data=await getJson(`${LIVE_SCORE_V3_BASE}/finals?force=1&t=${token}`);
      if(String(data?.version)!=='3.42'||!Array.isArray(data?.finals)||data?.ok===false)throw new Error('invalid_v3_finals');
      indexFinals(data.finals);
    }catch(_){}
  }

  async function refresh(){
    if(running)return;
    running=true;
    const token=Date.now();
    try{
      const jobs=[fetchLiveSources(token)];
      if(!lastFinalFetchAt||token-lastFinalFetchAt>=FINAL_POLL_MS){
        lastFinalFetchAt=token;
        jobs.push(fetchFinals(token));
      }
      await Promise.allSettled(jobs);
      apply();
    }finally{running=false}
  }

  window.addEventListener('nomad:statistics-records',event=>{
    canonicalRecords=Array.isArray(event?.detail?.records)?event.detail.records:[];
    apply();
    refresh();
  });

  const table=document.querySelector('.data-table tbody');
  if(table)new MutationObserver(()=>requestAnimationFrame(apply)).observe(table,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});

  refresh();
  timer=setInterval(refresh,POLL_MS);
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
