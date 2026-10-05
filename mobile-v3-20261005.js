/* Ball46 Mobile V3 — presentation controller only.
   <=760px: dark-only mobile shell. No API/engine/signal/statistics logic changes. */
(()=>{
  'use strict';
  const mq=window.matchMedia('(max-width:760px)');
  const apply=()=>{
    const root=document.documentElement;
    if(mq.matches){
      root.setAttribute('data-b46-mobile-v3','1');
      root.setAttribute('data-theme','dark');
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta) meta.setAttribute('content','#050807');
    }else{
      root.removeAttribute('data-b46-mobile-v3');
    }
  };
  apply();
  if(typeof mq.addEventListener==='function') mq.addEventListener('change',apply);
  else if(typeof mq.addListener==='function') mq.addListener(apply);
  document.addEventListener('DOMContentLoaded',apply,{once:true});
})();
