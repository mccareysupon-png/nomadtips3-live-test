(()=>{
'use strict';
const ATTR='b46FlowBg';
function stableKey(chart){
  const expanded=chart.closest?.('[data-expanded-match]');
  const row=chart.closest?.('[data-match-id]');
  const signal=chart.closest?.('[data-next-card]');
  return String(
    expanded?.dataset?.expandedMatch ||
    row?.dataset?.matchId ||
    signal?.dataset?.nextCard ||
    ''
  ).trim();
}
function fnv1a(text){
  let h=0x811c9dc5;
  for(let i=0;i<text.length;i++){
    h^=text.charCodeAt(i);
    h=Math.imul(h,0x01000193)>>>0;
  }
  return h>>>0;
}
function decorate(chart){
  if(!(chart instanceof Element)||!chart.matches('.expand-flow-chart'))return;
  const key=stableKey(chart);
  if(!key)return;
  const idx=(fnv1a(key)%10)+1;
  const value=String(idx).padStart(2,'0');
  if(chart.dataset[ATTR]!==value)chart.dataset[ATTR]=value;
}
function scan(root=document){
  if(root instanceof Element&&root.matches('.expand-flow-chart'))decorate(root);
  root.querySelectorAll?.('.expand-flow-chart').forEach(decorate);
}
let queued=false;
function schedule(root=document){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;scan(root)});
}
scan();
new MutationObserver(records=>{
  for(const r of records){
    for(const n of r.addedNodes){
      if(n instanceof Element&&(n.matches('.expand-flow-chart')||n.querySelector?.('.expand-flow-chart'))){schedule(document);return;}
    }
  }
}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('nomad343:fixture-ready',()=>schedule(document));
document.addEventListener('ball46:workspace-view',()=>schedule(document));
window.BALL46_EVENT_FLOW_BG={version:'343-event-flow-bg-20261002a',refresh:()=>scan(document)};
})();
