(()=>{
'use strict';
const VALID=new Set(['live-score','signal','statistics']);
const HEADING=Object.freeze({
  'live-score':'STATISTICS 3.41',
  signal:'1X2 · OVER/UNDER SIGNAL',
  statistics:'STATISTICS'
});
const LEGACY_STATS_URL='https://mccareysupon-png.github.io/nomadtips3-live-test/isolated-labs/statistics-341-content-clone/';
function normalize(value){return VALID.has(value)?value:'live-score'}
function fromHash(){return normalize(String(location.hash||'').replace(/^#/,'').toLowerCase())}
function placeTabs(selected,panels){
  const panel=panels.find(item=>item.dataset.panel===selected);
  const tablist=document.querySelector('.nomad342-tabs[role="tablist"]');
  const summary=panel?.querySelector('.status-grid');
  if(panel&&tablist&&summary&&summary.nextElementSibling!==tablist)summary.after(tablist);
}
function mountLegacyStatistics(){
  const panel=document.getElementById('nomad342PanelLive');
  if(!panel||panel.dataset.legacyStatisticsMounted==='1')return;
  const scanner=panel.querySelector('.nomad-scanner-panel');
  if(!scanner)return;
  const summary=panel.querySelector(':scope > .status-grid');
  if(summary)summary.hidden=true;
  const host=document.createElement('section');
  host.className='nomad342-legacy-statistics-host';
  host.setAttribute('aria-label','Statistics 3.41');
  const frame=document.createElement('iframe');
  frame.className='nomad342-legacy-statistics-frame';
  frame.src=LEGACY_STATS_URL;
  frame.title='NOMADTIPS3 Statistics 3.41';
  frame.loading='eager';
  frame.referrerPolicy='no-referrer';
  host.appendChild(frame);
  scanner.replaceWith(host);
  panel.querySelector('.event-footnote')?.remove();
  panel.dataset.legacyStatisticsMounted='1';
  if(!document.getElementById('nomad342-legacy-statistics-style')){
    const style=document.createElement('style');
    style.id='nomad342-legacy-statistics-style';
    style.textContent='.nomad342-legacy-statistics-host{width:100%;min-width:0;margin:0;padding:0;background:#0d120f}.nomad342-legacy-statistics-frame{display:block;width:100%;height:calc(100vh - 170px);min-height:720px;border:0;background:#0d120f}@media(max-width:700px){.nomad342-legacy-statistics-frame{height:calc(100vh - 145px);min-height:680px}}';
    document.head.appendChild(style);
  }
}
function setTab(name,{updateHash=true,focus=false}={}){
  const selected=normalize(name);
  const tabs=[...document.querySelectorAll('.nomad342-tab[role="tab"]')];
  const panels=[...document.querySelectorAll('.nomad342-tab-panel[role="tabpanel"]')];
  placeTabs(selected,panels);
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
  const heading=document.getElementById('nomad342HeadingTitle');
  if(heading)heading.textContent=HEADING[selected];
  if(updateHash){
    const next=`#${selected}`;
    if(location.hash!==next)history.replaceState(null,'',next);
  }
  document.title=`nomadtips3 · ${selected==='live-score'?'Statistics 3.41':selected==='signal'?'Signal':'Statistics'} 3.42`;
  document.dispatchEvent(new CustomEvent('nomad342:ledgerrefresh'));
  document.dispatchEvent(new CustomEvent('nomad342:tabchange',{detail:{tab:selected}}));
}
function start(){
  const tabs=[...document.querySelectorAll('.nomad342-tab[role="tab"]')];
  if(!tabs.length)return;
  mountLegacyStatistics();
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
