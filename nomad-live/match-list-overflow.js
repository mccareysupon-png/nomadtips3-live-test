(()=>{
  const LIMIT=6;
  const MOBILE_MAX=700;
  const list=document.querySelector('.match-list');
  if(!list)return;

  const panel=list.closest('.panel');
  if(!panel)return;

  let mobileExpanded=false;
  let frame=0;
  let lastMobile=window.innerWidth<=MOBILE_MAX;

  const controls=document.createElement('div');
  controls.className='match-list-overflow-controls';
  controls.hidden=true;

  const button=document.createElement('button');
  button.type='button';
  button.className='match-list-overflow-toggle';
  button.setAttribute('aria-expanded','false');
  controls.appendChild(button);

  if(!list.id)list.id='nomad-monitored-match-list';
  button.setAttribute('aria-controls',list.id);
  list.insertAdjacentElement('afterend',controls);

  const rows=()=>[...list.querySelectorAll(':scope > .match-wrap')];
  const eligible=row=>row.style.display!=='none';

  const clearMobileHiding=()=>{
    for(const row of rows())row.classList.remove('match-list-mobile-hidden');
  };

  const sync=()=>{
    frame=0;
    const mobile=window.innerWidth<=MOBILE_MAX;
    if(mobile!==lastMobile){
      mobileExpanded=false;
      lastMobile=mobile;
    }

    const allRows=rows();
    const visibleRows=allRows.filter(eligible);
    const overflowCount=Math.max(0,visibleRows.length-LIMIT);

    list.dataset.overflowScroll=!mobile&&visibleRows.length>LIMIT?'1':'0';

    if(!mobile){
      clearMobileHiding();
      controls.hidden=true;
      button.setAttribute('aria-expanded','false');
      return;
    }

    for(const row of allRows)row.classList.remove('match-list-mobile-hidden');
    if(!mobileExpanded&&overflowCount>0){
      visibleRows.slice(LIMIT).forEach(row=>row.classList.add('match-list-mobile-hidden'));
    }

    controls.hidden=overflowCount===0;
    if(overflowCount===0){
      mobileExpanded=false;
      button.setAttribute('aria-expanded','false');
      button.textContent='';
      return;
    }

    button.setAttribute('aria-expanded',mobileExpanded?'true':'false');
    button.textContent=mobileExpanded?'SHOW LESS ↑':`SHOW ${overflowCount} MORE ↓`;
  };

  const schedule=()=>{
    if(frame)return;
    frame=requestAnimationFrame(sync);
  };

  const resetMobileAndSchedule=()=>{
    if(window.innerWidth<=MOBILE_MAX)mobileExpanded=false;
    schedule();
  };

  button.addEventListener('click',()=>{
    mobileExpanded=!mobileExpanded;
    schedule();
  });

  document.querySelectorAll('.tabs .tab').forEach(tab=>tab.addEventListener('click',()=>requestAnimationFrame(resetMobileAndSchedule)));
  const search=document.querySelector('.search input');
  if(search)search.addEventListener('input',()=>requestAnimationFrame(resetMobileAndSchedule));

  window.addEventListener('resize',schedule,{passive:true});

  const observer=new MutationObserver(mutations=>{
    if(mutations.some(item=>item.type==='childList'||(item.type==='attributes'&&item.attributeName==='style'&&item.target.classList?.contains('match-wrap'))))schedule();
  });
  observer.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});

  schedule();
})();
