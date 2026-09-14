(()=>{
'use strict';
const KEY='ball46-344-expanded-cards';
const load=()=>{try{return new Set(JSON.parse(sessionStorage.getItem(KEY)||'[]').map(String));}catch{return new Set();}};
const expanded=load();
const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify([...expanded]));}catch{}};
const restore=()=>{
  document.querySelectorAll('.match-card[data-id]').forEach(card=>{
    const id=String(card.dataset.id||'');
    if(id&&expanded.has(id)) card.classList.add('expanded');
  });
};
const start=()=>{
  const root=document.querySelector('#liveRoot');
  if(!root)return;
  document.addEventListener('click',e=>{
    const main=e.target.closest?.('.match-main');
    if(!main)return;
    const card=main.closest('.match-card[data-id]');
    if(!card)return;
    queueMicrotask(()=>{
      const id=String(card.dataset.id||'');
      if(!id)return;
      if(card.classList.contains('expanded')) expanded.add(id); else expanded.delete(id);
      save();
    });
  });
  const observer=new MutationObserver(restore);
  observer.observe(root,{childList:true,subtree:true});
  restore();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
