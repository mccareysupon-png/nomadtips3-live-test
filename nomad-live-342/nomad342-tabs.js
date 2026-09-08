(()=>{
'use strict';
const VALID=new Set(['live-score','signal','statistics']);
const ODDS_KEY='nomad341OddsDisplayV1',ODDS_MODES=new Set(['decimal','american','fractional']);
const HEADING=Object.freeze({
  'live-score':'LIVE SCORE & EVENT MONITOR',
  signal:'1X2 · OVER/UNDER SIGNAL',
  statistics:'STATISTICS'
});
function normalize(value){return VALID.has(value)?value:'live-score'}
function fromHash(){return normalize(String(location.hash||'').replace(/^#/,'').toLowerCase())}
function currentOddsMode(){
  const runtime=window.NOMAD342_ODDS_DISPLAY;
  if(typeof runtime?.getMode==='function')return runtime.getMode();
  try{const value=String(localStorage.getItem(ODDS_KEY)||'').toLowerCase();return ODDS_MODES.has(value)?value:'decimal';}catch{return'decimal'}
}
function syncOddsControl(){
  const mode=currentOddsMode();
  document.querySelectorAll('.nomad342-odds-control [data-odds-mode]').forEach(button=>{
    const active=button.dataset.oddsMode===mode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
}
function setOddsMode(value){
  const mode=ODDS_MODES.has(String(value||'').toLowerCase())?String(value).toLowerCase():'decimal';
  const runtime=window.NOMAD342_ODDS_DISPLAY;
  if(typeof runtime?.setMode==='function'){runtime.setMode(mode);return;}
  try{localStorage.setItem(ODDS_KEY,mode);}catch{}
  document.dispatchEvent(new CustomEvent('nomad342:odds-display-change',{detail:{mode,source:'control-fallback'}}));
}
function mountOddsControl(){
  const tablist=document.querySelector('.nomad342-tabs[role="tablist"]');
  if(!tablist)return null;
  let bar=tablist.closest('.nomad342-controlbar');
  if(!bar){
    bar=document.createElement('div');
    bar.className='nomad342-controlbar';
    tablist.before(bar);
    bar.append(tablist);
  }
  let control=bar.querySelector('.nomad342-odds-control');
  if(!control){
    control=document.createElement('div');
    control.className='nomad342-odds-control';
    control.setAttribute('role','group');
    control.setAttribute('aria-label','Odds display format');
    control.innerHTML='<span class="nomad342-odds-label">ODDS</span><button type="button" data-odds-mode="decimal" aria-pressed="false">DECIMAL</button><button type="button" data-odds-mode="american" aria-pressed="false">AMERICAN</button><button type="button" data-odds-mode="fractional" aria-pressed="false">FRACTION</button>';
    bar.append(control);
    control.addEventListener('click',event=>{
      const button=event.target.closest('[data-odds-mode]');
      if(!button)return;
      setOddsMode(button.dataset.oddsMode);
      syncOddsControl();
    });
  }
  syncOddsControl();
  return bar;
}
function placeTabs(selected,panels){
  const panel=panels.find(item=>item.dataset.panel===selected);
  const tablist=document.querySelector('.nomad342-tabs[role="tablist"]');
  const controlbar=tablist?.closest('.nomad342-controlbar')||tablist;
  const summary=panel?.querySelector('.status-grid');
  if(panel&&controlbar&&summary&&summary.nextElementSibling!==controlbar)summary.after(controlbar);
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
  document.title=`nomadtips3 · ${selected==='live-score'?'Live Score':selected==='signal'?'Signal':'Statistics'} 3.42`;
  document.dispatchEvent(new CustomEvent('nomad342:ledgerrefresh'));
  document.dispatchEvent(new CustomEvent('nomad342:tabchange',{detail:{tab:selected}}));
}
function start(){
  const tabs=[...document.querySelectorAll('.nomad342-tab[role="tab"]')];
  if(!tabs.length)return;
  mountOddsControl();
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
  document.addEventListener('nomad342:odds-display-change',syncOddsControl);
  addEventListener('hashchange',()=>setTab(fromHash(),{updateHash:false}));
  setTab(fromHash(),{updateHash:location.hash.length>0});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.NOMAD342_TABS=Object.freeze({set:setTab});
})();
