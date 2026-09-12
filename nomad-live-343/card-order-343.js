(()=>{
'use strict';
const VERSION='343-card-order-v1-restore-flow-first';
function restore(){
  document.querySelectorAll('.match-card[data-match-id] .event-details').forEach(details=>{
    const board=details.querySelector('[data-b365-addon]');
    if(!board)return;
    const flow=details.querySelector('.nomad-event-flow-card');
    if(flow){if(board.previousElementSibling!==flow)flow.insertAdjacentElement('afterend',board);return}
    const stats=details.querySelector('.evidence-card');
    if(stats&&board.previousElementSibling!==stats)stats.insertAdjacentElement('afterend',board);
  });
}
let queued=false;
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;restore()})}
const mo=new MutationObserver(schedule);
function start(){mo.observe(document.body,{childList:true,subtree:true});restore();window.NOMAD343_CARD_ORDER={version:VERSION,restore}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
