(()=>{
  'use strict';

  const PROD_HOSTS=new Set([
    'www.nomadtips3.com',
    'nomadtips3.com',
    'nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
  ]);
  const GITHUB_HOST='mccareysupon-png.github.io';
  const TEST_342_BASE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
  const POLL_MS=10000;
  const REQUEST_TIMEOUT_MS=12000;

  let records=[];
  let liveById=new Map();
  let liveByTeams=new Map();
  let timer=null;
  let running=false;

  const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
  const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const scorePair=score=>{
    const home=Array.isArray(score)?score[0]:score?.home;
    const away=Array.isArray(score)?score[1]:score?.away;
    if(!finite(home)||!finite(away))return null;
    return `${Number(home)}–${Number(away)}`;
  };
  const minuteText=value=>finite(value)?`${Math.max(0,Math.trunc(Number(value)))}'`:'';
  const isSettled=record=>Boolean(record?.settlement&&record.settlement?.result&&record.settlement.result!=='PENDING');
  const isUsableLive=match=>Boolean(match&&!match?.freshness?.stale&&scorePair(match.score)&&finite(match.minute));
  const setCellText=(cell,value)=>{
    const next=String(value);
    if(cell&&cell.textContent!==next)cell.textContent=next;
  };

  function feedUrl(){
    const host=String(location.hostname||'').toLowerCase();
    if(PROD_HOSTS.has(host))return `${location.origin}/nomad-live-342/feed`;
    if(host===GITHUB_HOST)return `${TEST_342_BASE}/feed`;
    return `${TEST_342_BASE}/feed`;
  }

  function indexLive(matches=[]){
    const byId=new Map(),byTeams=new Map();
    for(const match of matches){
      if(!isUsableLive(match))continue;
      if(match.id!==null&&match.id!==undefined&&match.id!=='')byId.set(String(match.id),match);
      const key=teamKey(match.home,match.away);
      if(key!=='|'){
        if(byTeams.has(key))byTeams.set(key,null);
        else byTeams.set(key,match);
      }
    }
    liveById=byId;
    liveByTeams=byTeams;
  }

  function findLive(record){
    if(record?.matchId!==null&&record?.matchId!==undefined&&record?.matchId!==''){
      const exact=liveById.get(String(record.matchId));
      if(exact)return exact;
    }
    const fallback=liveByTeams.get(teamKey(record?.home,record?.away));
    return fallback||null;
  }

  function restoreFinalCell(cell,record){
    const fin=record?.settlement?.finalScore;
    setCellText(cell,fin?`${fin.home??'—'}–${fin.away??'—'}`:'—');
    cell.removeAttribute('data-live-score-mirror');
  }

  function apply(){
    const rows=[...document.querySelectorAll('.data-table tbody tr')];
    if(!rows.length||!records.length)return;

    rows.forEach((row,index)=>{
      const record=records[index];
      const finalCell=row.children?.[8];
      if(!record||!finalCell)return;

      if(isSettled(record)){
        restoreFinalCell(finalCell,record);
        return;
      }

      const live=findLive(record);
      if(!live){
        restoreFinalCell(finalCell,record);
        return;
      }

      const score=scorePair(live.score);
      const minute=minuteText(live.minute);
      if(!score||!minute){
        restoreFinalCell(finalCell,record);
        return;
      }

      setCellText(finalCell,`${score} · ${minute}`);
      if(finalCell.getAttribute('data-live-score-mirror')!=='1')finalCell.setAttribute('data-live-score-mirror','1');
    });
  }

  async function fetchLive(){
    if(running)return;
    running=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetch(feedUrl(),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(String(data?.version)!=='3.42'||!Array.isArray(data?.matches))throw new Error('invalid_342_feed_contract');
      indexLive(data.matches);
      apply();
    }catch{
      liveById=new Map();
      liveByTeams=new Map();
      apply();
    }finally{
      clearTimeout(timeout);
      running=false;
    }
  }

  window.addEventListener('nomad:statistics-records',event=>{
    records=Array.isArray(event.detail?.records)?event.detail.records:[];
    apply();
    fetchLive();
  });

  const table=document.querySelector('.data-table tbody');
  if(table)new MutationObserver(()=>requestAnimationFrame(apply)).observe(table,{childList:true,subtree:true});

  fetchLive();
  timer=setInterval(fetchLive,POLL_MS);
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
