/* BALL46 statistics first-render guard.
   Existing authoritative renderer updates [data-sp-feed-state] only after renderStats() finishes.
   Observe that state; do not use timers and do not edit any statistics data or DOM. */
(()=>{
 'use strict';
 const html=document.documentElement;
 function boot(){
  const panel=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]');
  if(!panel)return;
  const status=panel.querySelector('[data-sp-feed-state]');
  if(!status)return;
  function check(){
   const value=(status.textContent||'').trim();
   if(/^Updated\b/i.test(value)){
    html.setAttribute('data-b46-statistics-render-ready','1');
    html.removeAttribute('data-b46-statistics-render-error');
    observer.disconnect();
   }else if(/^Statistics incomplete or unavailable/i.test(value)){
    html.setAttribute('data-b46-statistics-render-error','1');
   }
  }
  const observer=new MutationObserver(check);
  observer.observe(status,{characterData:true,childList:true,subtree:true});
  check();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();