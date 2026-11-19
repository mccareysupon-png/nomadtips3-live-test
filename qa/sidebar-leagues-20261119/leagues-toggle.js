(() => {
  'use strict';
  if (window.__b46LeaguesToggleV1) return;
  window.__b46LeaguesToggleV1 = true;
  const key='b46:sidebar:leagues-collapsed:v1';
  const selector='aside.left-rail[data-b46-sidebar="1"] [data-league-card]';
  const desktop=matchMedia('(min-width:768px)');
  let collapsed=false;
  try { collapsed=localStorage.getItem(key)==='1'; } catch {}
  function paint(card) {
    const title=card.querySelector(':scope > .rail-title');
    const list=card.querySelector(':scope > [data-league-filters]');
    if (!title||!list) return;
    let button=title.querySelector(':scope > .b46-leagues-toggle');
    if (!button) {
      button=document.createElement('button');
      button.type='button';button.className='b46-leagues-toggle';
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        if(!desktop.matches)return;
        collapsed=!collapsed;try{localStorage.setItem(key,collapsed?'1':'0')}catch{}
        sync();
      });
      title.append(button);
    }
    if (!list.id) list.id='b46-desktop-leagues-list';
    const isCollapsed=desktop.matches&&collapsed;
    const value=isCollapsed?'1':'0';
    if(card.dataset.b46LeaguesCollapsed!==value)card.dataset.b46LeaguesCollapsed=value;
    button.setAttribute('aria-controls',list.id);
    button.setAttribute('aria-expanded',String(!isCollapsed));
    button.setAttribute('aria-label',isCollapsed?'Expand leagues':'Collapse leagues');
    button.title=isCollapsed?'Expand leagues':'Collapse leagues';
  }
  function sync(){document.querySelectorAll(selector).forEach(paint)}
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sync()})}
  function init(){
    sync();
    // Reattach only when a sidebar/card/title/list is replaced, not when match counts tick.
    const obs=new MutationObserver(records=>{
      for(const r of records){
        if(r.target.nodeType!==1)continue;
        if(r.target.matches('[data-league-card], [data-league-card] > .rail-title')){schedule();return}
        for(const n of r.addedNodes){
          if(n.nodeType===1&&(n.matches('aside.left-rail,[data-league-card]')||n.querySelector('aside.left-rail,[data-league-card]'))){schedule();return}
        }
      }
    });
    obs.observe(document.body,{childList:true,subtree:true});
    desktop.addEventListener('change',sync);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();