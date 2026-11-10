/* BALL46 Full Market Lazy UI Preview 20261110
   Preview only. No Production deploy.
   Goal: expand card shows bookmaker buttons only; render prices after user chooses a bookmaker.
   No extra API calls; uses existing fixture snapshot and existing Full Market module.
*/
(()=> {
  'use strict';
  const PREVIEW='B46_FULLMARKET_LAZY_UI_PREVIEW_20261110';
  const state=new WeakMap();

  function decorateHost(host){
    if(!host||host.dataset.b46LazyPreview==='1') return;
    host.dataset.b46LazyPreview='1';

    const panel=host.querySelector('[data-fmb-panel]');
    const tabs=host.querySelector('[data-fmb-tabs]');
    if(!panel||!tabs) return;

    const buttons=[...tabs.querySelectorAll('[data-fmb-book]')];
    if(!buttons.length) return;

    const current={panelHtml:panel.innerHTML, active:null, initialized:false};
    state.set(host,current);

    // Preview behavior: collapse initial table content.
    panel.innerHTML='<div class="b46-lazy-empty">Select a bookmaker to view prices.</div>';
    host.dataset.b46LazyBook='';

    for(const btn of buttons){
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed','false');
    }

    tabs.addEventListener('click',ev=>{
      const btn=ev.target.closest?.('[data-fmb-book]');
      if(!btn||!tabs.contains(btn))return;
      ev.preventDefault();
      ev.stopPropagation();

      const slug=String(btn.dataset.fmbBook||'');
      const api=window.NOMAD343_FULL_MARKET_BOOKMAKER;
      const expanded=host.closest('.match-expanded');
      const fixture=expanded?._nomadFixture;

      if(!api||!fixture)return;

      // Clicking same bookmaker collapses panel again.
      if(host.dataset.b46LazyBook===slug){
        host.dataset.b46LazyBook='';
        panel.innerHTML='<div class="b46-lazy-empty">Select a bookmaker to view prices.</div>';
        for(const b of buttons){b.classList.remove('active');b.setAttribute('aria-pressed','false')}
        return;
      }

      host.dataset.b46LazyBook=slug;
      for(const b of buttons){
        const on=String(b.dataset.fmbBook||'')===slug;
        b.classList.toggle('active',on);
        b.setAttribute('aria-pressed',on?'true':'false');
      }

      // Render on demand from the fixture already in memory. No network call.
      const html=api.renderBookHtml(fixture,slug);
      panel.innerHTML=html;
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
