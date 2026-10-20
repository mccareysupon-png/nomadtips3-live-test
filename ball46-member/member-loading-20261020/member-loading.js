/* BALL46_MEMBER_GRAPHITE_SPLASH_V1_20261020.
 * Cosmetic lifecycle only; member.js decides authentication and data readiness. */
(()=>{
 'use strict';
 const layer=document.getElementById('b46-member-loading');
 if(!layer)return;
 const label=layer.querySelector('.b46-ml-status');
 const helper=layer.querySelector('.b46-ml-help');
 const retry=layer.querySelector('.b46-ml-retry');
 const started=performance.now();
 let closed=false;
 let holdTimer=null;
 const slowTimer=setTimeout(()=>{
   if(closed)return;
   layer.classList.add('b46-ml-slow');
   helper.textContent='Still connecting to the Member Signal Center…';
 },9000);
 const timeout=setTimeout(()=>{
   if(closed)return;
   layer.classList.add('b46-ml-failed');
   label.textContent='CONNECTION TAKING LONGER';
   helper.textContent='Unable to confirm live Member data yet. Please retry.';
 },25000);
 const stopTimers=()=>{clearTimeout(slowTimer);clearTimeout(timeout);if(holdTimer)clearTimeout(holdTimer)};
 const ready=()=>{
   if(closed)return;
   closed=true;stopTimers();
   const wait=Math.max(0,850-(performance.now()-started));
   holdTimer=setTimeout(()=>{
     layer.classList.add('b46-member-loading-out');
     layer.setAttribute('aria-hidden','true');
     setTimeout(()=>layer.remove(),380);
   },wait);
 };
 const error=()=>{
   if(closed)return;
   clearTimeout(slowTimer);clearTimeout(timeout);
   layer.classList.add('b46-ml-failed');
   label.textContent='MEMBER DATA UNAVAILABLE';
   helper.textContent='The Member Signal Center could not load. Please retry.';
 };
 retry?.addEventListener('click',()=>location.reload());
 window.addEventListener('ball46:member-data-ready',ready,{once:true});
 window.addEventListener('ball46:member-data-error',error,{once:true});
})();
