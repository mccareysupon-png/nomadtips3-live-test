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
  const setText=(node,value)=>{
    const next=String(value);
    if(node&&node.textContent!==next)node.textContent=next;
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

  function splitLine(line){
    const n=Number(line);
    if(!Number.isFinite(n))return [];
    const quarter=Math.round(n*4);
    if(Math.abs(n*4-quarter)>1e-9)return [n];
    return Math.abs(quarter)%2===1?[(quarter-1)/4,(quarter+1)/4]:[n];
  }
  function settleLeg(diff,line){
    const value=diff+line;
    if(value>1e-9)return 'WIN';
    if(value<-1e-9)return 'LOSS';
    return 'PUSH';
  }
  function settleAsianDisplay(record,finalScore){
    const final=scoreObject(finalScore);
    const entry=scoreObject(record?.entryScore);
    const line=Number(record?.line);
    const odds=Number(record?.odds);
    if(!final||!entry||!Number.isFinite(line)||!Number.isFinite(odds))return null;
    const away=String(record?.selection||'home').toLowerCase()==='away';
    const finalDiff=away?final.away-final.home:final.home-final.away;
    const entryDiff=away?entry.away-entry.home:entry.home-entry.away;
    const legs=splitLine(line).map(value=>settleLeg(finalDiff-entryDiff,value));
    if(!legs.length)return null;
    let profit=0;
    for(const result of legs){
      const stake=1/legs.length;
      if(result==='WIN')profit+=stake*(odds-1);
      else if(result==='LOSS')profit-=stake;
    }
    let result;
    if(legs.every(x=>x==='WIN'))result='WIN';
    else if(legs.every(x=>x==='LOSS'))result='LOSS';
    else if(legs.every(x=>x==='PUSH'))result='PUSH';
    else if(legs.includes('WIN')&&legs.includes('PUSH'))result='HALF WIN';
    else if(legs.includes('LOSS')&&legs.includes('PUSH'))result='HALF LOSS';
    else result=profit>1e-9?'WIN':profit<-1e-9?'LOSS':'PUSH';
    return {result,profit:Number(profit.toFixed(4)),legs,finalScore:final,settlementScope:'LIVE_POST_ENTRY',settlementRuleVersion:2,displayMirror:true};
  }

  function effectiveRecord(record){
    if(isCanonicalSettled(record))return record;
    const final=findFinal(record);
    if(!final)return record;
    const settlement=settleAsianDisplay(record,final.score);
    return settlement?{...record,settlement}:record;
  }

  function rowRecord(row,index,effectiveRecords){
    if(effectiveRecords.length===document.querySelectorAll('.data-table tbody tr').length)return effectiveRecords[index]||null;
    const matchText=normalize(row.children?.[1]?.textContent||'');
    if(!matchText)return effectiveRecords[index]||null;
    let found=null;
    for(const record of effectiveRecords){
      const expected=normalize(`${record?.home??''} — ${record?.away??''}`);
      if(expected!==matchText)continue;
      if(found)return effectiveRecords[index]||record;
      found=record;
    }
    return found||effectiveRecords[index]||null;
  }

  function resultClass(result){
    if(/WIN/.test(result||''))return 'win';
    if(/LOSS/.test(result||''))return 'loss';
    return '';
  }

  function restoreCanonicalRow(row,record){
    const finalCell=row.children?.[8],resultCell=row.children?.[9],profitCell=row.children?.[10];
    const settlement=record?.settlement;
    const fin=settlement?.finalScore;
    setCellText(finalCell,fin?`${fin.home??'—'}–${fin.away??'—'}`:'—');
    setCellText(resultCell,settlement?.result||'PENDING');
    setCellText(profitCell,settlement?`${Number(settlement.profit)>=0?'+':''}${Number(settlement.profit||0).toFixed(2)}u`:'—');
    for(const cell of [resultCell,profitCell]){
      if(!cell)continue;
      cell.classList.remove('win','loss');
      const cls=resultClass(settlement?.result);
      if(cls)cell.classList.add(cls);
    }
    if(finalCell)finalCell.removeAttribute('data-live-score-mirror');
    if(resultCell)resultCell.removeAttribute('data-settlement-mirror');
  }

  function applySummary(effectiveRecords){
    const settled=effectiveRecords.filter(item=>item?.settlement&&item.settlement?.result&&item.settlement.result!=='PENDING');
    const wins=settled.filter(item=>/WIN/.test(item.settlement.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement.result||'')).length;
    const pushes=settled.filter(item=>item.settlement.result==='PUSH').length;
    const decided=wins+losses;
    const profit=settled.reduce((sum,item)=>sum+(Number(item.settlement?.profit)||0),0);
    const avgOdds=effectiveRecords.length?effectiveRecords.reduce((sum,item)=>sum+(Number(item?.odds)||0),0)/effectiveRecords.length:0;
    const metrics=[...document.querySelectorAll('.summary-grid .metric strong')];
    setText(metrics[0],effectiveRecords.length);
    setText(metrics[1],`${decided?(wins/decided*100).toFixed(1):'0.0'}%`);
    setText(metrics[2],effectiveRecords.length?avgOdds.toFixed(2):'—');
    setText(metrics[3],`${profit>=0?'+':''}${settled.length?(profit/settled.length*100).toFixed(1):'0.0'}%`);
    const muted=document.querySelector('.panel-head .muted');
    setText(muted,`WIN ${wins} · LOSS ${losses} · PUSH ${pushes}`);
  }

  function apply(){
    if(applying)return;
    applying=true;
    try{
      if(lastLiveSuccessAt&&Date.now()-lastLiveSuccessAt>LIVE_KEEP_MS){
        liveById=new Map();liveByTeams=new Map();lastLiveSuccessAt=0;
      }
      const effectiveRecords=canonicalRecords.map(effectiveRecord);
      const rows=[...document.querySelectorAll('.data-table tbody tr')];
      rows.forEach((row,index)=>{
        const record=rowRecord(row,index,effectiveRecords);
        if(!record||row.children.length<11)return;
        if(record?.settlement&&record.settlement?.result&&record.settlement.result!=='PENDING'){
          restoreCanonicalRow(row,record);
          if(record.settlement.displayMirror){
            const resultCell=row.children?.[9];
            if(resultCell)resultCell.setAttribute('data-settlement-mirror','1');
          }
          return;
        }
        restoreCanonicalRow(row,record);
        const live=findLive(record);
        if(!live)return;
        const score=scoreText(live.score),minute=minuteText(live.minute),finalCell=row.children?.[8];
        if(score&&minute&&finalCell){
          setCellText(finalCell,`${score} · ${minute}`);
          finalCell.setAttribute('data-live-score-mirror','1');
        }
      });
      applySummary(effectiveRecords);
      window.dispatchEvent(new CustomEvent('nomad:statistics-records',{detail:{records:effectiveRecords,mirror:true}}));
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
            id:match?.id,home:match?.home,away:match?.away,minute:match?.minute,score:match?.score,
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
    }catch(_){
      // Canonical 3.41 settlement remains authoritative when the final mirror is unavailable.
    }
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
    if(event?.detail?.mirror)return;
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
