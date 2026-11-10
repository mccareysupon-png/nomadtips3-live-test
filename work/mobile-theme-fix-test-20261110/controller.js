/* Mobile presentation only; the existing shared theme preference remains authoritative. */
(()=>{'use strict';const mq=matchMedia('(max-width:760px)'),root=document.documentElement,KEY='nomad343_dashboard_theme_v1';
 function current(){return root.dataset.theme==='dark'?'dark':'light'}
 function toggle(){const existing=document.querySelector('[data-theme-toggle]');if(existing){existing.click();return}const next=current()==='dark'?'light':'dark';root.dataset.theme=next;try{localStorage.setItem(KEY,next)}catch{}}
 function apply(){
  if(mq.matches)root.setAttribute('data-b46-mobile-v3','1');else root.removeAttribute('data-b46-mobile-v3');
  const t=current(),meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',t==='dark'?'#050807':'#f4f8f5');
  const head=document.querySelector('#b46m-drawer .b46m-drawerhead');let button=document.querySelector('[data-b46-mobile-theme-toggle]');
  if(head&&!button){button=document.createElement('button');button.type='button';button.className='b46m-iconbutton b46-mobile-theme-toggle';button.setAttribute('data-b46-mobile-theme-toggle','');button.addEventListener('click',toggle);head.insertBefore(button,head.querySelector('[data-b46m-close]'));}
  if(button){const target=t==='dark'?'light':'dark';button.setAttribute('aria-label','Switch to '+target+' mode');button.title='Switch to '+target+' mode';const shape=t==='dark'?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>':'<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>';if(button.dataset.iconTheme!==t){button.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'+shape+'</svg>';button.dataset.iconTheme=t;}}
 }
 new MutationObserver(apply).observe(root,{attributes:true,attributeFilter:['data-theme']});mq.addEventListener('change',()=>{apply();requestAnimationFrame(apply)});
 addEventListener('storage',e=>{if(e.key===KEY){root.dataset.theme=e.newValue==='dark'?'dark':'light'}});
 document.addEventListener('DOMContentLoaded',apply,{once:true});addEventListener('ball46:board-first-paint',apply);apply();
})();
