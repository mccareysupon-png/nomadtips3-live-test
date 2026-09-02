(()=>{
  'use strict';

  const PRIMARY='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
  const FALLBACK='https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev/feed';
  const PREDICTIONS='data/predictions.json?v=20260902-live-result-mirror-v2';
  const POLL_MS=10000;
  const TIMEOUT_MS=8000;
  const PICKS_REFRESH_MS=60000;

  const clean=value=>String(value??'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\b(fc|afc|cf|sc|club)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  const esc=value=>String(value??'').replace(/[&<>'\"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'
  }[ch]));

  const sleepTimeout=(controller,ms)=>setTimeout(()=>controller.abort(),ms);
  const finite=value=>Number.isFinite(Number(value));

  function tokenSet(value){
    return new Set(clean(value).split(' ').filter(Boolean));
  }

  function sameTeam(a,b){
    const aa=clean(a),bb=clean(b);
    if(!aa||!bb)return false;
    if(aa===bb)return true;
    if(aa.length>=4&&bb.length>=4&&(aa.includes(bb)||bb.includes(aa)))return true;
    const as=tokenSet(aa),bs=tokenSet(bb);
    if(!as.size||!bs.size)return false;
    let common=0;
    for(const token of as)if(bs.has(token))common++;
    return common/Math.min(as.size,bs.size)>=0.75;
  }

  function pairMatches(pick,match){
    return sameTeam(pick?.home,match?.home)&&sameTeam(pick?.away,match?.away);
  }

  function scoreOf(match){
    const score=Array.isArray(match?.score)?match.score:null;
    const home=Number(score?.[0]);
    const away=Number(score?.[1]);
    return Number.isFinite(home)&&Number.isFinite(away)?[home,away]:null;
  }

  async function fetchJson(url){
    const controller=new AbortController();
    const timer=sleepTimeout(controller,TIMEOUT_MS);
    try{
      const joiner=url.includes('?')?'&':'?';
      const response=await fetch(`${url}${joiner}mirror=${Date.now()}`,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }finally{
      clearTimeout(timer);
    }
  }

  async function liveFeed(){
    try{
      const data=await fetchJson(PRIMARY);
      if(!data||!Array.isArray(data.matches))throw new Error('invalid primary feed');
      return data;
    }catch(_){
      const data=await fetchJson(FALLBACK);
      if(!data||!Array.isArray(data.matches))throw new Error('invalid fallback feed');
      return data;
    }
  }

  let picks=[];
  let picksLoadedAt=0;
  async function loadPicks(force=false){
    if(!force&&picks.length&&Date.now()-picksLoadedAt<PICKS_REFRESH_MS)return picks;
    const data=await fetchJson(PREDICTIONS);
    picks=Array.isArray(data?.picks)?data.picks:[];
    picksLoadedAt=Date.now();
    return picks;
  }

  function mirrorKey(pick){
    return String(pick?.id||`${clean(pick?.home)}-${clean(pick?.away)}`);
  }

  function pendingMarkup(pick){
    const odds=finite(pick?.odds)?Number(pick.odds).toFixed(2):'—';
    return `<article class="result-card pending" data-live-result-pending="1" data-mirror-key="${esc(mirrorKey(pick))}" data-search="${esc(`${pick?.home||''} ${pick?.away||''} ${pick?.league||''} ${pick?.pick||''} pending`.toLowerCase())}">
      <div class="result-main">
        <div class="result-meta"><span>${esc(pick?.league||'')}</span><span>•</span><span>${esc(pick?.kickoff||'')}</span></div>
        <div class="result-match"><span>${esc(pick?.home||'')}</span><span class="vs">VS</span><span>${esc(pick?.away||'')}</span></div>
        <div class="result-pick"><strong>${esc(pick?.pick||'')}</strong></div>
        <div class="result-summary">Current NOMAD pick · FINAL mirrors the live score while this match remains pending.</div>
      </div>
      <div class="result-settle">
        <div class="settle-box"><span>FINAL · PENDING</span><strong data-mirror-score>—</strong></div>
        <div class="settle-box"><span>ODDS</span><strong>${odds}</strong></div>
        <div class="settle-box"><span>RESULT</span><strong class="settle-result pending">PENDING</strong></div>
      </div>
    </article>`;
  }

  function ensurePendingCard(list,pick){
    const key=mirrorKey(pick);
    let card=[...list.querySelectorAll('[data-live-result-pending="1"]')].find(node=>node.dataset.mirrorKey===key);
    if(card)return card;

    const holder=document.createElement('div');
    holder.innerHTML=pendingMarkup(pick);
    card=holder.firstElementChild;
    if(!card)return null;

    const firstResult=list.querySelector('.result-card:not([data-live-result-pending="1"])');
    if(firstResult)list.insertBefore(card,firstResult);
    else list.appendChild(card);
    return card;
  }

  function applyLive(card,match){
    if(!card)return;
    const box=card.querySelector('.settle-box');
    const label=box?.querySelector('span');
    const value=box?.querySelector('[data-mirror-score]')||box?.querySelector('strong');
    const score=scoreOf(match);
    if(score&&value)value.textContent=`${score[0]}–${score[1]}`;
    if(label){
      const minute=Number(match?.minute);
      label.textContent=Number.isFinite(minute)?`FINAL · LIVE ${Math.round(minute)}′`:'FINAL · LIVE';
    }
    card.dataset.liveScoreMirror='1';
  }

  function applyWaiting(card){
    if(!card)return;
    const box=card.querySelector('.settle-box');
    const label=box?.querySelector('span');
    if(label&&!card.dataset.liveScoreMirror)label.textContent='FINAL · PENDING';
  }

  function updateCounts(list){
    const total=list.querySelectorAll('.result-card').length;
    const yesterdayCount=document.getElementById('yesterdayCount');
    if(yesterdayCount)yesterdayCount.textContent=String(total);
    const page2=document.querySelector('.day-tab[data-view="yesterday"]')?.classList.contains('active');
    if(page2){
      const pickCount=document.getElementById('pickCount');
      if(pickCount)pickCount.textContent=String(total);
      const heroSmall=document.getElementById('heroSmall');
      if(heroSmall)heroSmall.textContent=list.querySelector('[data-live-result-pending="1"]')?'settled / pending':'settled picks';
    }
  }

  async function sync(){
    const list=document.getElementById('resultList');
    if(!list)return;

    let currentPicks;
    try{currentPicks=await loadPicks()}
    catch(_){return}

    // Page 2 must always have a visible PENDING row for today's picks.
    // The FINAL field becomes a live mirror only when the 3.42 feed finds the match.
    const activeKeys=new Set();
    for(const pick of currentPicks){
      activeKeys.add(mirrorKey(pick));
      ensurePendingCard(list,pick);
    }

    for(const card of [...list.querySelectorAll('[data-live-result-pending="1"]')]){
      if(!activeKeys.has(card.dataset.mirrorKey||''))card.remove();
    }

    let feed=null;
    try{feed=await liveFeed()}
    catch(_){
      updateCounts(list);
      return;
    }

    const matches=Array.isArray(feed.matches)?feed.matches:[];
    for(const pick of currentPicks){
      const card=[...list.querySelectorAll('[data-live-result-pending="1"]')].find(node=>node.dataset.mirrorKey===mirrorKey(pick));
      const match=matches.find(row=>pairMatches(pick,row));
      if(match)applyLive(card,match);
      else applyWaiting(card);
    }
    updateCounts(list);
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
    // predictions.js renders the settled result list after DOMContentLoaded; wait for that render,
    // then prepend current PENDING rows without altering predictions.js or results.json.
    new MutationObserver(()=>{if(!busy)queueMicrotask(tick)}).observe(list,{childList:true});
    setTimeout(tick,0);
    timer=setInterval(tick,POLL_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
    document.querySelectorAll('.day-tab').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>updateCounts(list),0)));
    window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer)},{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
