/* Ball46 3.43 · classic mobile workspace menu
   Presentation/navigation adapter only. No fetch, API, odds or engine calls. */
(()=>{
  'use strict';

  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];

  function labelStatusCard(){
    const firstStatus=qs('[data-status-filter]');
    const card=firstStatus?.closest('.rail-card');
    if(card) card.classList.add('b46-mobile-status-menu');
  }

  function nativeStatisticsRoute(){
    const q=new URLSearchParams(location.search);
    q.delete('status');
    q.set('view','statistics');
    q.set('market','all');
    q.delete('filter');
    q.delete('page');
    location.href=`${location.pathname}?${q.toString()}`;
  }

  function activate(view){
    if(view==='live'){
      const all=qs('[data-status-filter="all"]');
      if(all){all.click();return;}
    }
    if(view==='signal'){
      const signal=qs('[data-workspace-view="signal"]');
      if(signal){signal.click();return;}
    }
    if(view==='statistics'){
      const total=qs('[data-stat-market="all"]');
      if(total){
        total.click();
        window.setTimeout(()=>{
          const panel=qs('[data-workspace-panel="statistics"]');
          const opened=document.body.dataset.workspaceView==='statistics'&&panel&&!panel.hidden;
          if(!opened) nativeStatisticsRoute();
        },160);
        return;
      }
      nativeStatisticsRoute();
    }
  }

  function sync(nav){
    const view=document.body.dataset.workspaceView||'live';
    qsa('button[data-b46-mobile-view]',nav).forEach(btn=>{
      const active=btn.dataset.b46MobileView===view;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-current',active?'page':'false');
    });
  }

  function build(){
    if(qs('.b46-mobile-workspace-nav')) return;
    labelStatusCard();

    const nav=document.createElement('nav');
    nav.className='b46-mobile-workspace-nav';
    nav.setAttribute('aria-label','Mobile workspace navigation');
    nav.innerHTML=`
      <button type="button" data-b46-mobile-view="live" aria-label="Live Scores"><span class="b46-mobile-nav-icon"></span><span>Live Scores</span></button>
      <button type="button" data-b46-mobile-view="signal" aria-label="Signals"><span class="b46-mobile-nav-icon"></span><span>Signals</span></button>
      <button type="button" data-b46-mobile-view="statistics" aria-label="Statistics"><span class="b46-mobile-nav-icon"></span><span>Statistics</span></button>`;

    nav.addEventListener('click',e=>{
      const btn=e.target.closest('button[data-b46-mobile-view]');
      if(!btn) return;
      activate(btn.dataset.b46MobileView);
    });

    document.body.appendChild(nav);
    sync(nav);

    document.addEventListener('ball46:workspace-view',()=>sync(nav));
    new MutationObserver(()=>sync(nav)).observe(document.body,{attributes:true,attributeFilter:['data-workspace-view']});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',build,{once:true});
  else build();
})();
