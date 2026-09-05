(()=>{
'use strict';
const VALID=new Set(['live-score','signal','statistics']);
function normalize(value){return VALID.has(value)?value:'live-score'}
function fromHash(){return normalize(String(location.hash||'').replace(/^#/,'').toLowerCase())}
function setTab(name,{updateHash=true,focus=false}={}){
  const selected=normalize(name);
  const tabs=[...document.querySelectorAll('.nomad342-tab[role="tab"]')];
  const panels=[...document.querySelectorAll('.nomad342-tab-panel[role="tabpanel"]')];
  for(const tab of tabs){
    const active=tab.dataset.tab===selected;
    tab.setAttribute('aria-selected',active?'true':'false');
    tab.tabIndex=active?0:-1;
    if(active&&focus)tab.focus();
  }
  for(const panel of panels){
    const active=panel.dataset.panel===selected;
    panel.hidden=!active;
    panel.setAttribute('aria-hidden',active?'false':'true');
  }
  if(updateHash){
    const next=`#${selected}`;
    if(location.hash!==next)history.replaceState(null,'',next);
  }
  document.dispatchEvent(new CustomEvent('nomad342:tabchange',{detail:{tab:selected}}));
}
function start(){
  const tabs=[...document.querySelectorAll('.nomad342-tab[role="tab"]')];
  if(!tabs.length)return;
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>setTab(tab.dataset.tab));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      let next=index;
      if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=tabs.length-1;
      setTab(tabs[next].dataset.tab,{focus:true});
    });
  });
  addEventListener('hashchange',()=>setTab(fromHash(),{updateHash:false}));
  setTab(fromHash(),{updateHash:location.hash.length>0});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.NOMAD342_TABS=Object.freeze({set:setTab});
})();
