(()=>{
  const list=document.querySelector('.match-list');
  if(!list)return;

  // 3.41 LIVE-only long-board mode: never cap the number of visible live cards.
  // Filtering/search still owns row.style.display; this module only removes its old overflow state.
  const clearOverflowState=()=>{
    delete list.dataset.overflowScroll;
    for(const row of list.querySelectorAll(':scope > .match-wrap.match-list-mobile-hidden')){
      row.classList.remove('match-list-mobile-hidden');
    }
    const controls=list.parentElement?.querySelector(':scope > .match-list-overflow-controls');
    if(controls)controls.remove();
  };

  let frame=0;
  const schedule=()=>{
    if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;clearOverflowState();});
  };

  new MutationObserver(schedule).observe(list,{childList:true,subtree:false});
  window.addEventListener('resize',schedule,{passive:true});
  clearOverflowState();
})();
