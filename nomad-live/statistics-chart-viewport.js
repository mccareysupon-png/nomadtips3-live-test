(()=>{
  'use strict';

  const STORAGE_KEY='nomadStatisticsViewport341';
  const VIEWPORT_EVENT='nomad:statistics-viewport';
  const PRESETS=[50,100,200,500,'ALL'];
  let chart=null;
  let control=null;
  let select=null;
  let zoomOutButton=null;
  let zoomInButton=null;
  let latestButton=null;
  let statusNode=null;
  let mountObserver=null;
  let initialApplied=false;

  function api(){return window.NOMAD_UNIT_CHART;}
  function normalize(value){
    if(String(value).toUpperCase()==='ALL')return 'ALL';
    const number=Math.trunc(Number(value));
    return PRESETS.includes(number)?number:'ALL';
  }
  function readSaved(){
    try{return normalize(localStorage.getItem(STORAGE_KEY)||'ALL');}catch{return 'ALL';}
  }
  function save(value){
    try{localStorage.setItem(STORAGE_KEY,String(value));}catch{}
  }
  function indexOfPreset(value){
    const normalized=normalize(value);
    return PRESETS.findIndex(item=>String(item)===String(normalized));
  }
  function apply(value){
    const next=normalize(value);
    save(next);
    api()?.setViewportSize?.(next);
  }
  function step(direction){
    const view=api()?.getViewport?.();
    const current=view?.size??readSaved();
    let index=indexOfPreset(current);
    if(index<0)index=PRESETS.length-1;
    const nextIndex=Math.max(0,Math.min(PRESETS.length-1,index+direction));
    if(nextIndex!==index)apply(PRESETS[nextIndex]);
  }
  function sync(detail){
    if(!control)return;
    const view=detail||api()?.getViewport?.();
    if(!view)return;
    const size=normalize(view.size);
    if(select)select.value=String(size);
    const index=indexOfPreset(size);
    if(zoomInButton)zoomInButton.disabled=index<=0;
    if(zoomOutButton)zoomOutButton.disabled=index>=PRESETS.length-1;
    if(latestButton){
      latestButton.hidden=!view.canPan||view.followLatest;
      latestButton.disabled=!view.canPan||view.followLatest;
    }
    if(statusNode){
      if(!view.total)statusNode.textContent='NO DATA';
      else if(size==='ALL'||view.total<=Number(size))statusNode.textContent=`ALL · ${view.total}`;
      else statusNode.textContent=`${view.start+1}–${view.end} / ${view.total}`;
    }
  }
  function mount(){
    if(control?.isConnected)return true;
    chart=document.querySelector('.cumulative-unit-chart');
    const plot=chart?.querySelector('.cumulative-unit-plot')||null;
    if(!chart||!plot||!api()?.setViewportSize)return false;

    control=document.createElement('div');
    control.className='statistics-chart-viewport-control';
    control.setAttribute('role','group');
    control.setAttribute('aria-label','Chart zoom and history navigation');
    control.innerHTML=`<button type="button" class="statistics-chart-viewport-step" data-chart-zoom-out aria-label="Zoom out">−</button>
      <select class="statistics-chart-viewport-select" data-chart-range aria-label="Visible settled results">
        <option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="500">500</option><option value="ALL">ALL</option>
      </select>
      <button type="button" class="statistics-chart-viewport-step" data-chart-zoom-in aria-label="Zoom in">+</button>
      <button type="button" class="statistics-chart-latest" data-chart-latest hidden>LATEST</button>
      <span class="statistics-chart-viewport-status" data-chart-viewport-status>ALL</span>`;
    plot.classList.add('has-chart-viewport');
    plot.appendChild(control);
    select=control.querySelector('[data-chart-range]');
    zoomOutButton=control.querySelector('[data-chart-zoom-out]');
    zoomInButton=control.querySelector('[data-chart-zoom-in]');
    latestButton=control.querySelector('[data-chart-latest]');
    statusNode=control.querySelector('[data-chart-viewport-status]');

    select?.addEventListener('change',()=>apply(select.value));
    zoomOutButton?.addEventListener('click',()=>step(1));
    zoomInButton?.addEventListener('click',()=>step(-1));
    latestButton?.addEventListener('click',()=>api()?.goLatest?.());
    control.addEventListener('click',event=>event.stopPropagation());

    if(!initialApplied){
      initialApplied=true;
      apply(readSaved());
    }else sync();
    return true;
  }
  function ensureMount(){
    if(mount())return;
    if(mountObserver)return;
    mountObserver=new MutationObserver(()=>{
      if(!mount())return;
      mountObserver.disconnect();
      mountObserver=null;
    });
    mountObserver.observe(document.body,{childList:true,subtree:true});
  }
  function start(){ensureMount();}

  window.addEventListener(VIEWPORT_EVENT,event=>sync(event?.detail));
  window.NOMAD_STATISTICS_VIEWPORT=Object.freeze({
    presets:[...PRESETS],
    get:()=>api()?.getViewport?.(),
    set:apply,
    latest:()=>api()?.goLatest?.()
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
