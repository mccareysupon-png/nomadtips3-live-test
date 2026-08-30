(()=>{
  'use strict';

  const EXPAND_ICON='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 2H2v4M10 2h4v4M14 10v4h-4M2 10v4h4"/></svg>';
  const COLLAPSE_ICON='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 6H2V2M10 6h4V2M14 10h-4v4M2 10h4v4"/></svg>';
  let chart=null;
  let button=null;
  let control=null;
  let mountObserver=null;
  let fallback=false;
  let savedScrollY=0;
  let redrawTimer=0;

  const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
  const nativeActive=()=>Boolean(chart&&fullscreenElement()===chart);
  const expanded=()=>fallback||nativeActive();

  function setButtonState(){
    if(!button)return;
    const active=expanded();
    button.innerHTML=active?COLLAPSE_ICON:EXPAND_ICON;
    button.setAttribute('aria-pressed',active?'true':'false');
    button.setAttribute('aria-label',active?'Minimize cumulative unit chart':'Expand cumulative unit chart to fullscreen');
    button.title=active?'Minimize chart':'Fullscreen chart';
  }

  function redrawSafety(){
    const fire=()=>{
      try{window.dispatchEvent(new Event('resize'));}catch{}
      try{window.NOMAD_STATISTICS_EMA?.redraw?.();}catch{}
      try{window.NOMAD_STATISTICS_INDICATORS?.redraw?.();}catch{}
    };
    requestAnimationFrame(()=>{
      fire();
      requestAnimationFrame(fire);
    });
    clearTimeout(redrawTimer);
    redrawTimer=setTimeout(fire,180);
  }

  function enterFallback(){
    if(!chart||fallback)return;
    savedScrollY=window.scrollY||window.pageYOffset||0;
    fallback=true;
    chart.classList.add('is-chart-fullscreen-fallback');
    document.body.classList.add('chart-fullscreen-fallback-lock');
    setButtonState();
    redrawSafety();
  }

  function exitFallback(){
    if(!fallback)return;
    fallback=false;
    chart?.classList.remove('is-chart-fullscreen-fallback');
    document.body.classList.remove('chart-fullscreen-fallback-lock');
    setButtonState();
    requestAnimationFrame(()=>window.scrollTo(0,savedScrollY));
    redrawSafety();
  }

  async function enterNative(){
    if(!chart)return;
    const request=chart.requestFullscreen||chart.webkitRequestFullscreen;
    if(typeof request!=='function'){
      enterFallback();
      return;
    }
    try{
      const result=request.call(chart);
      if(result&&typeof result.then==='function')await result;
      if(!nativeActive()){
        enterFallback();
        return;
      }
      chart.classList.add('is-chart-fullscreen-native');
      setButtonState();
      redrawSafety();
    }catch{
      enterFallback();
    }
  }

  async function exitNative(){
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    if(typeof exit!=='function')return;
    try{
      const result=exit.call(document);
      if(result&&typeof result.then==='function')await result;
    }catch{}
  }

  function toggle(){
    if(fallback){
      exitFallback();
      return;
    }
    if(nativeActive()){
      exitNative();
      return;
    }
    enterNative();
  }

  function syncNativeState(){
    if(!chart)return;
    const active=nativeActive();
    chart.classList.toggle('is-chart-fullscreen-native',active);
    setButtonState();
    redrawSafety();
  }

  function mount(){
    if(chart?.isConnected&&button?.isConnected)return true;
    chart=document.querySelector('.cumulative-unit-chart');
    const head=chart?.querySelector('.cumulative-unit-head')||null;
    const total=head?.querySelector('[data-unit-total]')||null;
    if(!chart||!head||!total)return false;
    const existing=head.querySelector('[data-chart-fullscreen-button]');
    if(existing){
      button=existing;
      control=button.closest('.statistics-chart-fullscreen-control');
      setButtonState();
      return true;
    }

    control=document.createElement('div');
    control.className='statistics-chart-fullscreen-control';
    button=document.createElement('button');
    button.type='button';
    button.className='statistics-chart-fullscreen-button';
    button.dataset.chartFullscreenButton='1';
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    control.appendChild(button);
    total.insertAdjacentElement('beforebegin',control);
    setButtonState();
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

  function onKeydown(event){
    if(event.key==='Escape'&&fallback)exitFallback();
  }

  function start(){
    ensureMount();
    document.addEventListener('fullscreenchange',syncNativeState);
    document.addEventListener('webkitfullscreenchange',syncNativeState);
    document.addEventListener('keydown',onKeydown);
  }

  window.NOMAD_STATISTICS_FULLSCREEN=Object.freeze({
    isExpanded:expanded,
    expand:()=>fallback||nativeActive()?undefined:enterNative(),
    collapse:()=>fallback?exitFallback():nativeActive()?exitNative():undefined,
    toggle
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
