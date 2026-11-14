/* B46_STATISTICS_VISUALS_20261114: presentation only; no requests or timers. */
(()=>{'use strict';
 function boot(){
  const panel=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]');
  if(!panel||panel.querySelector(':scope > .b46-stats-loader'))return;
  const template=document.createElement('template');template.innerHTML=__B46_LOADER_HTML__;
  const loader=template.content.firstElementChild;
  function place(){const content=panel.querySelector(':scope > .sp-stats-content');if(content&&loader.nextElementSibling!==content)panel.insertBefore(loader,content)}
  function state(){const h=document.documentElement,waiting=h.getAttribute('data-b46-statistics-render-ready')!=='1'&&h.getAttribute('data-b46-statistics-render-error')!=='1';loader.setAttribute('aria-busy',String(waiting))}
  place();state();
  new MutationObserver(place).observe(panel,{childList:true});
  new MutationObserver(state).observe(document.documentElement,{attributes:true,attributeFilter:['data-b46-statistics-render-ready','data-b46-statistics-render-error']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
