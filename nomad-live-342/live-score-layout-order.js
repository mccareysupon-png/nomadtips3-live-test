(()=>{
  'use strict';

  const headingText=section=>String(section?.querySelector('.na-section-head > div:first-child > span')?.textContent||'').trim().toUpperCase();

  function arrangeCard(card){
    if(!card?.classList?.contains('expanded'))return;
    const details=card.querySelector('.event-details');
    const top=details?.querySelector(':scope > .nomad-analytics-top');
    const bottom=details?.querySelector(':scope > .nomad-analytics-bottom');
    if(!top||!bottom)return;

    const timeline=[...top.children].find(section=>headingText(section)==='EVENT TIMELINE');
    if(timeline){
      const firstBottomSection=bottom.querySelector(':scope > .na-section');
      if(firstBottomSection?.nextSibling)bottom.insertBefore(timeline,firstBottomSection.nextSibling);
      else bottom.append(timeline);
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
