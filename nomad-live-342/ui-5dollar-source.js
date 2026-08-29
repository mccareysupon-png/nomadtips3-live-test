(()=>{
'use strict';
function apply(){
  document.querySelectorAll('.market-label b').forEach(el=>{if(el.textContent!=='Bet365')el.textContent='Bet365';});
  document.querySelectorAll('.detail-card h3').forEach(el=>{
    const text=String(el.textContent||'').trim();
    if(text!=='TOTALCORNER EVENT')el.textContent='5Dollar · Bet365 DECISION';
  });
  document.querySelectorAll('.price-selected-name').forEach(el=>{el.title='Bet365 price supplied by 5DollarFootballAPI';});
}
function start(){
  apply();
  const host=document.getElementById('matchList');
  if(host)new MutationObserver(()=>requestAnimationFrame(apply)).observe(host,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
