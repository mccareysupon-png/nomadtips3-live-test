/* BALL46_STAT_TABS_V1
   Phase 1: presentation-only navigation over the existing Statistics page.
   Deliberately performs no network requests and changes no statistics data. */
(()=>{
  'use strict';
  const NAV_CLASS='b46-performance-tabs-v1';
  if(document.querySelector('.'+NAV_CLASS)) return;

  const main=document.querySelector('main.next-shell');
  if(!main) return;

  const pageHead=main.querySelector(':scope > .next-page-head') || main.firstElementChild;
  if(!pageHead) return;

  const panels=()=>Array.from(main.querySelectorAll(':scope > .next-panel'));
  const byHeading=(rx)=>panels().find((panel)=>rx.test(String(panel.querySelector('h2')?.textContent||''))) || null;

  const resolveTarget=(key)=>{
    if(key==='overview') return main.querySelector(':scope > .next-kpis') || pageHead;
    if(key==='markets'){
      const grid=main.querySelector('[data-next-stat-markets]');
      return grid?.closest('.market-performance-cluster-v2') || grid?.closest('.market-performance-grid') || grid || main.querySelector('.market-performance-title');
    }
    if(key==='engine') return main.querySelector('.ceo-performance-shell') || main.querySelector('[data-ceo-performance]');
    if(key==='history') return byHeading(/results\s*history|history/i) || main.querySelector('[data-next-stat-body]')?.closest('.next-panel');
    return null;
  };

  const nav=document.createElement('nav');
  nav.className=NAV_CLASS;
  nav.setAttribute('aria-label','Performance sections');
  nav.dataset.b46Phase='statistics-tabs-v1';

  const items=[
    ['overview','OVERVIEW'],
    ['markets','MARKETS'],
    ['engine','ENGINE'],
    ['history','HISTORY']
  ];

  const buttons=new Map();
  const select=(key)=>{
    for(const [name,button] of buttons){
      const active=name===key;
      button.setAttribute('aria-selected',active?'true':'false');
      button.tabIndex=active?0:-1;
    }
  };

  for(const [key,label] of items){
    const button=document.createElement('button');
    button.type='button';
    button.className='b46-performance-tab-v1';
    button.textContent=label;
    button.dataset.b46StatTab=key;
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',key==='overview'?'true':'false');
    button.tabIndex=key==='overview'?0:-1;
    button.addEventListener('click',()=>{
      select(key);
      const target=resolveTarget(key);
      if(!target) return;
      const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      target.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start',inline:'nearest'});
    });
    button.addEventListener('keydown',(event)=>{
      if(event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
      event.preventDefault();
      const index=items.findIndex(([name])=>name===key);
      const step=event.key==='ArrowRight'?1:-1;
      const next=items[(index+step+items.length)%items.length][0];
      const nextButton=buttons.get(next);
      select(next);
      nextButton?.focus();
    });
    buttons.set(key,button);
    nav.appendChild(button);
  }

  pageHead.insertAdjacentElement('afterend',nav);
})();
