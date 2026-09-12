(()=>{
'use strict';
const VERSION='343-stable-expanded-v1';
const CARD='.match-card[data-match-id]';
let openId=null,lastTop=null,queued=false;
const retained=new Map();
const escSel=v=>window.CSS?.escape?CSS.escape(String(v)):String(v).replace(/["\\]/g,'\\$&');
function currentOpen(){return document.querySelector(`${CARD}[aria-expanded="true"]`)}
function capture(){
  const card=currentOpen();
  if(!card){openId=null;lastTop=null;return}
  const id=String(card.dataset.matchId||'');if(!id)return;
  openId=id;
  const top=card.getBoundingClientRect().top;if(Number.isFinite(top))lastTop=top;
}
function remember(card){
  if(!(card instanceof Element)||!card.matches(CARD))return;
  const id=String(card.dataset.matchId||'');
  if(!id||id!==openId)return;
  retained.set(id,card);
}
function scanRemoved(node){
  if(!(node instanceof Element))return;
  remember(node);
  node.querySelectorAll?.(CARD).forEach(remember);
}
function replacePart(oldRoot,newRoot,selector){
  const oldNode=oldRoot?.querySelector(selector),newNode=newRoot?.querySelector(selector);
  if(oldNode&&newNode)oldNode.replaceWith(newNode);
  else if(!oldNode&&newNode)oldRoot?.appendChild(newNode);
}
function syncCard(oldCard,freshCard){
  const oldRow=oldCard.querySelector('.match-row.scoreboard-default'),freshRow=freshCard.querySelector('.match-row.scoreboard-default');
  if(oldRow&&freshRow)oldRow.replaceWith(freshRow);
  const oldCue=oldCard.querySelector('.expand-cue'),freshCue=freshCard.querySelector('.expand-cue');
  if(oldCue&&freshCue)oldCue.textContent=freshCue.textContent;
  const oldDetails=oldCard.querySelector('.event-details'),freshDetails=freshCard.querySelector('.event-details');
  if(oldDetails&&freshDetails){
    replacePart(oldDetails,freshDetails,'.evidence-card');
    replacePart(oldDetails,freshDetails,'.book-flow-single');
    replacePart(oldDetails,freshDetails,'.details-note');
    oldDetails.hidden=false;
  }
  oldCard.className=freshCard.className;
  oldCard.classList.add('expanded');
  oldCard.setAttribute('aria-expanded','true');
}
function restore(){
  queued=false;
  if(!openId)return;
  const oldCard=retained.get(openId);if(!oldCard)return;
  const fresh=document.querySelector(`.match-card[data-match-id="${escSel(openId)}"]`);
  if(!fresh||fresh===oldCard)return;
  syncCard(oldCard,fresh);
  fresh.replaceWith(oldCard);
  retained.delete(openId);
  if(lastTop!==null){
    const now=oldCard.getBoundingClientRect().top,delta=now-lastTop;
    if(Number.isFinite(delta)&&Math.abs(delta)>.5)window.scrollBy(0,delta);
  }
  capture();
}
function scheduleRestore(){if(queued)return;queued=true;queueMicrotask(restore)}
function start(){
  capture();
  const mo=new MutationObserver(records=>{
    let touched=false;
    for(const r of records){
      if(r.type!=='childList')continue;
      for(const n of r.removedNodes){scanRemoved(n);touched=true}
      if(r.addedNodes.length)touched=true;
    }
    if(touched)scheduleRestore();
  });
  document.querySelectorAll('.match-stack').forEach(root=>mo.observe(root,{childList:true,subtree:true}));
  document.addEventListener('click',()=>queueMicrotask(capture),true);
  document.addEventListener('keydown',()=>queueMicrotask(capture),true);
  let raf=0;
  const recapture=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;capture()})};
  window.addEventListener('scroll',recapture,{passive:true});
  window.addEventListener('resize',recapture,{passive:true});
  setInterval(capture,250);
  window.NOMAD343_STABLE_EXPANDED={version:VERSION,capture};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
