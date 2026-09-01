(()=>{
  'use strict';

  const headingText=section=>String(section?.querySelector('.na-section-head > div:first-child > span')?.textContent||'').trim().toUpperCase();

  function ensureStatsHeader(details){
    const stats=details?.querySelector(':scope > .event-stats');
    if(!stats||details.querySelector(':scope > .gf-stats-head'))return;
    const head=document.createElement('div');
    head.className='gf-stats-head';
    head.innerHTML='<b class="gf-home">HOME</b><span>LIVE KEY STATS</span><b class="gf-away">AWAY</b>';
    details.insertBefore(head,stats);
  }

  function markAnalytics(details){
    details?.querySelectorAll('.na-section').forEach(section=>{
      const heading=headingText(section);
      const keep=heading==='MATCH PULSE'||heading==='EVENT TIMELINE';
      section.classList.toggle('gf-keep',keep);
      section.classList.toggle('gf-secondary',!keep);
    });
  }

  function decorateCard(card){
    if(!card?.classList?.contains('expanded'))return;
    const details=card.querySelector('.event-details');
    if(!details)return;
    details.classList.add('graph-first-v1');
    ensureStatsHeader(details);
    markAnalytics(details);
  }

  function decorateAll(){
    document.querySelectorAll('.event-compact.expanded').forEach(decorateCard);
  }

  function start(){
    if(document.body?.dataset?.page!=='live')return;
    const list=document.getElementById('matchList');
    if(!list)return;
    let queued=false;
    const queue=()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{
        queued=false;
        decorateAll();
      });
    };
    new MutationObserver(queue).observe(list,{childList:true,subtree:true});
    list.addEventListener('click',()=>setTimeout(queue,0));
    list.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' ')setTimeout(queue,0);
    });
    queue();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
