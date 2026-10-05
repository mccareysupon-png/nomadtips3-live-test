/* Ball46 Mobile V3 — presentation controller only.
   <=760px: dark-only mobile shell. No API/engine/signal/statistics logic changes. */
(()=>{
  'use strict';
  const mq=window.matchMedia('(max-width:760px)');
  const root=document.documentElement;
  let savedTheme=null;
  let forced=false;
  const themeMeta=()=>document.querySelector('meta[name="theme-color"]');
  const apply=()=>{
    if(mq.matches){
      if(!forced){savedTheme=root.getAttribute('data-theme');forced=true;}
      root.setAttribute('data-b46-mobile-v3','1');
      root.setAttribute('data-theme','dark');
      const meta=themeMeta(); if(meta) meta.setAttribute('content','#050807');
    }else{
      root.removeAttribute('data-b46-mobile-v3');
      if(forced){
        if(savedTheme) root.setAttribute('data-theme',savedTheme); else root.removeAttribute('data-theme');
        forced=false;
      }
    }
  };
  apply();
  if(typeof mq.addEventListener==='function') mq.addEventListener('change',apply);
  else if(typeof mq.addListener==='function') mq.addListener(apply);
  document.addEventListener('DOMContentLoaded',apply,{once:true});
})();
