/* BALL46 Full Market Compact Lazy UI Preview 20261111
   Preview only. No Production deploy.
   Goal: move the instruction into the Full Market heading and remove the empty lower panel until a bookmaker is selected.
   No extra API calls; uses existing fixture snapshot and existing Full Market module.
*/
(()=> {
  'use strict';
  const PREVIEW='B46_FULLMARKET_COMPACT_LAZY_UI_PREVIEW_20261111';
  const HEADING='Select a bookmaker to view prices.';

  function setCollapsed(host,panel,buttons){
    host.dataset.b46LazyBook='';
    host.classList.add('b46-lazy-collapsed');
    panel.innerHTML='';
    panel.hidden=true;
    for(const b of buttons){
      b.classList.remove('active');
      b.setAttribute('aria-pressed','false');
    }
  }

  function decorateHost(host){
    if(!host||host.dataset.b46LazyPreview==='1') return;
    host.dataset.b46LazyPreview='1';

    const head=host.querySelector('.fmb-head');
    const panel=host.querySelector('[data-fmb-panel]');
    const tabs=host.querySelector('[data-fmb-tabs]');
    if(!head||!panel||!tabs) return;

    const buttons=[...tabs.querySelectorAll('[data-fmb-book]')];
    if(!buttons.length) return;

    // Replace "FULL MARKET · BOOKMAKERS" with the instruction.
    head.textContent=HEADING;

    // Initial state: there is no lower content area at all.
    setCollapsed(host,panel,buttons);

    tabs.addEventListener('click',ev=>{
      const btn=ev.target.closest?.('[data-fmb-book]');
      if(!btn||!tabs.contains(btn))return;
      ev.preventDefault();
      ev.stopPropagation();

      const slug=String(btn.dataset.fmbBook||'');
      const api=window.NOMAD343_FULL_MARKET_BOOKMAKER;
      const expanded=host.closest('.match-expanded');
      const fixture=expanded?._nomadFixture;
      if(!api||!fixture||!slug)return;

      // Clicking the selected bookmaker again returns to the compact state.
      if(host.dataset.b46LazyBook===slug){
        setCollapsed(host,panel,buttons);
        return;
      }

      host.dataset.b46LazyBook=slug;
      host.classList.remove('b46-lazy-collapsed');
      panel.hidden=false;

      for(const b of buttons){
        const on=String(b.dataset.fmbBook||'')===slug;
        b.classList.toggle('active',on);
        b.setAttribute('aria-pressed',on?'true':'false');
      }

      // Render on demand from data already in memory. No network call.
      panel.innerHTML=api.renderBookHtml(fixture,slug);
    },true);
  }

  function scan(){
    document.querySelectorAll('[data-full-market-card]').forEach(card=>{
      const host=card.querySelector('.fmb-head')?.parentElement || card.querySelector('[data-fmb-tabs]')?.parentElement;
      if(host) decorateHost(host);
    });
  }

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan()})};

  const start=()=>{
    scan();
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
    window.__B46_FULLMARKET_LAZY_UI_PREVIEW={marker:PREVIEW,scan};
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
