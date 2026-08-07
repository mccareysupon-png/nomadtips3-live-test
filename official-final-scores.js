(()=>{
  'use strict';

  const RAW='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/';
  const TERMINAL=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO','PST','NOT_CONFIRMED']);
  const host=document.getElementById('matches');
  let loading=false;

  async function fetchJson(name){
    const response=await fetch(`${RAW}${name}?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function removeCompletedCard(result){
    const slug=String(result?.slug||'');
    const fixtureId=String(result?.fixtureId||result?.providerFixtureId||'');
    if(slug){
      const liveFile=`live-data-${slug}.json`;
      host?.querySelectorAll('.match-card[data-file]').forEach(card=>{
        if(card.dataset.file===liveFile)card.remove();
      });
      document.getElementById(`officialFinal-${slug.replace(/[^a-z0-9_-]+/gi,'-')}`)?.remove();
    }
    if(fixtureId){
      host?.querySelectorAll('[data-cloudflare-completed]').forEach(card=>{
        if(String(card.dataset.cloudflareCompleted||'')===fixtureId)card.remove();
      });
    }
  }

  function refreshCount(){
    const count=document.getElementById('matchCount');
    if(!count||!host)return;
    const active=host.querySelectorAll('.match-card').length;
    if(!active&&!host.querySelector('.empty-state')){
      host.innerHTML='<section class="empty-state"><strong>NO ACTIVE MATCHES</strong><span>Waiting for the next locked Manual Set 2 fixtures.</span></section>';
    }
    if(!active)count.textContent='MANUAL SET 2 · 0 MATCHES';
  }

  async function syncFinalScores(){
    if(loading||document.hidden||!host)return;
    loading=true;
    try{
      const feed=await fetchJson('result-feed.json');
      const finals=(feed.results||[]).filter(item=>
        item?.resultConfirmed||TERMINAL.has(String(item?.status||item?.providerStatus||'').toUpperCase())
      );
      finals.forEach(removeCompletedCard);
      host.querySelectorAll('.official-final-card,.cloudflare-completed-card').forEach(card=>card.remove());
      refreshCount();
    }catch(error){
      console.error('Final score cleanup sync failed',error);
    }finally{
      loading=false;
    }
  }

  syncFinalScores();
  setInterval(syncFinalScores,30000);
  window.addEventListener('pageshow',syncFinalScores);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncFinalScores()});
})();
