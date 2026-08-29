(()=>{
'use strict';
function relabel(){
  if(document.body?.dataset?.page!=='live')return;
  document.querySelectorAll('.market-label b').forEach(el=>{if(String(el.textContent||'').trim()==='M88')el.textContent='THScore';});
  document.querySelectorAll('.match-detail h3').forEach(el=>{if(/^M88\b/i.test(String(el.textContent||'').trim()))el.textContent=String(el.textContent).replace(/^M88\b/i,'THScore');});
}
function start(){relabel();const root=document.getElementById('matchList');if(root)new MutationObserver(()=>requestAnimationFrame(relabel)).observe(root,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
