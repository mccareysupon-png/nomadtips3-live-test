(()=>{
  'use strict';

  const PRIMARY='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
  const FALLBACK='https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev/feed';
  const POLL_MS=10000;
  const TIMEOUT_MS=8000;
  const FINAL_STATES=new Set(['WIN','LOSS','PUSH','VOID','CANCELLED','CANCELED']);

  const sleepTimeout=(controller,ms)=>setTimeout(()=>controller.abort(),ms);
  const clean=value=>String(value??'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\b(fc|afc|cf|sc)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  function teamPair(card){
    const nodes=[...card.querySelectorAll('.result-match span')].filter(node=>!node.classList.contains('vs'));
    return {home:clean(nodes[0]?.textContent),away:clean(nodes[1]?.textContent)};
  }

  function scoreBox(card){
    return [...card.querySelectorAll('.settle-box')].find(box=>/FINAL SCORE/i.test(box.querySelector('span')?.textContent||''))||null;
  }

  function isUnfinished(card){
    const state=String(card.querySelector('.settle-result')?.textContent||'').trim().toUpperCase();
    return !FINAL_STATES.has(state);
  }

  function exactMatch(card,match){
    const pair=teamPair(card);
    return Boolean(pair.home&&pair.away&&pair.home===clean(match?.home)&&pair.away===clean(match?.away));
  }

  function finiteScore(match){
    const score=Array.isArray(match?.score)?match.score:null;
    const home=Number(score?.[0]);
    const away=Number(score?.[1]);
    if(!Number.isFinite(home)||!Number.isFinite(away))return null;
    return [home,away];
  }

  async function fetchFeed(url){
    const controller=new AbortController();
    const timer=sleepTimeout(controller,TIMEOUT_MS);
    try{
      const response=await fetch(`${url}?mirror=${Date.now()}`,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!data||!Array.isArray(data.matches))throw new Error('invalid live feed');
      return data;
    }finally{
      clearTimeout(timer);
    }
  }

  async function liveFeed(){
    try{return await fetchFeed(PRIMARY)}
    catch(_){return fetchFeed(FALLBACK)}
  }

  function restoreCard(card){
    const box=scoreBox(card);
    if(!box)return;
    const label=box.querySelector('span');
    const value=box.querySelector('strong');
    if(value?.dataset.mirrorOriginal!==undefined){
      value.textContent=value.dataset.mirrorOriginal;
      delete value.dataset.mirrorOriginal;
    }
    if(label?.dataset.mirrorOriginal!==undefined){
      label.textContent=label.dataset.mirrorOriginal;
      delete label.dataset.mirrorOriginal;
    }
    card.removeAttribute('data-live-score-mirror');
  }

  function applyMatch(card,match){
    const score=finiteScore(match);
    const box=scoreBox(card);
    if(!score||!box)return false;
    const label=box.querySelector('span');
    const value=box.querySelector('strong');
    if(!value)return false;

    if(value.dataset.mirrorOriginal===undefined)value.dataset.mirrorOriginal=value.textContent||'';
    if(label&&label.dataset.mirrorOriginal===undefined)label.dataset.mirrorOriginal=label.textContent||'FINAL SCORE';

    value.textContent=`${score[0]}–${score[1]}`;
    if(label){
      const minute=Number(match?.minute);
      label.textContent=Number.isFinite(minute)?`FINAL · LIVE ${Math.round(minute)}′`:'FINAL · LIVE';
    }
    card.setAttribute('data-live-score-mirror','1');
    return true;
  }

  async function sync(){
    const list=document.getElementById('resultList');
    if(!list)return;
    const cards=[...list.querySelectorAll('.result-card')].filter(isUnfinished);
    if(!cards.length)return;

    let feed;
    try{feed=await liveFeed()}
    catch(_){return}

    const matches=feed.matches||[];
    for(const card of cards){
      const match=matches.find(row=>exactMatch(card,row));
      if(match)applyMatch(card,match);
      else restoreCard(card);
    }
  }

  let timer=null;
  let busy=false;
  async function tick(){
    if(busy)return;
    busy=true;
    try{await sync()}finally{busy=false}
  }

  function start(){
    const list=document.getElementById('resultList');
    if(!list)return;
    new MutationObserver(()=>tick()).observe(list,{childList:true,subtree:true});
    tick();
    timer=setInterval(tick,POLL_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
    window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer)},{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
