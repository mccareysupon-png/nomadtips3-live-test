(()=>{
  'use strict';

  const headingText=section=>String(section?.querySelector('.na-section-head > div:first-child > span')?.textContent||'').trim().toUpperCase();

  function arrangeCard(card){
    if(!card?.classList?.contains('expanded'))return;
    const details=card.querySelector('.event-details');
    const top=details?.querySelector(':scope > .nomad-analytics-top');
    const bottom=details?.querySelector(':scope > .nomad-analytics-bottom');
    if(!details||!top||!bottom)return;

    /* Presentation only: promote EVENT TIMELINE to the first row of the expanded card.
       Keep the existing section intact so feed/event-gate logic and timeline enhancement stay untouched. */
    const sections=[
      ...top.querySelectorAll(':scope > .na-section'),
      ...bottom.querySelectorAll(':scope > .na-section'),
      ...details.querySelectorAll(':scope > .na-section')
    ];
    const timeline=sections.find(section=>headingText(section)==='EVENT TIMELINE');
    if(timeline){
      timeline.dataset.uiGroup='primary-timeline';
      details.prepend(timeline);
    }

    top.dataset.uiGroup='pressure-signals';
    bottom.dataset.uiGroup='comparison-context';
    details.querySelector('.event-stats')?.setAttribute('data-ui-group','team-comparison');
  }

  function arrangeAll(){
    document.querySelectorAll('.event-compact.expanded').forEach(arrangeCard);
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
        arrangeAll();
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
