(()=>{
  'use strict';

  const trigger=document.querySelector('.toolbar .tabs .statistics-link');
  const toolbar=trigger?.closest('.toolbar');
  const filterTabs=[...document.querySelectorAll('.toolbar .tabs .tab')];
  const matchPanel=document.querySelector('[data-signal-match-view]');
  const matchNote=document.querySelector('[data-signal-match-note]');
  const mirror=document.querySelector('#statisticsMirror');
  const frame=mirror?.querySelector('.statistics-monitor-frame');

  if(!trigger||!toolbar||!matchPanel||!matchNote||!mirror||!frame)return;

  let active=false;
  let mounted=false;
  let resizeObserver=null;
  let mutationObserver=null;
  let syncFrame=0;

  const syncHeight=()=>{
    syncFrame=0;
    try{
      const doc=frame.contentDocument;
      if(!doc?.documentElement||!doc.body)return;
      const html=doc.documentElement;
      const body=doc.body;
      const height=Math.max(
        html.scrollHeight,
        html.offsetHeight,
        body.scrollHeight,
        body.offsetHeight
      );
      if(!Number.isFinite(height)||height<=0)return;
      const next=`${Math.ceil(height)}px`;
      if(frame.style.height!==next)frame.style.height=next;
      if(mirror.dataset.ready!=='1')mirror.dataset.ready='1';
    }catch{
      /* Same-origin is expected. If it ever is not, the href remains a working fallback. */
    }
  };

  const scheduleSync=()=>{
    if(syncFrame)cancelAnimationFrame(syncFrame);
    syncFrame=requestAnimationFrame(syncHeight);
  };

  const syncOddsMode=()=>{
    try{
      const mode=window.NOMAD_ODDS_DISPLAY?.getMode?.();
      const child=frame.contentWindow?.NOMAD_ODDS_DISPLAY;
      if(mode&&child?.setMode)child.setMode(mode);
    }catch{}
  };

  const installMonitorStyle=doc=>{
    let style=doc.getElementById('statistics-monitor-embed-style');
    if(style)return;
    style=doc.createElement('style');
    style.id='statistics-monitor-embed-style';
    style.textContent=`
      html{scroll-behavior:auto!important;scrollbar-gutter:auto!important;overflow:hidden!important}
      body{overflow:hidden!important}
      .topbar,.hero,.mobile-nav,footer,.site-footer,.public-info-footer,[data-public-info-footer],.odds-display-toolbar{display:none!important}
      main.shell{padding-top:0!important;padding-bottom:0!important}
    `;
    doc.head.appendChild(style);
  };

  const bindMonitorDocument=()=>{
    try{
      const doc=frame.contentDocument;
      if(!doc?.documentElement||!doc.body)return;
      installMonitorStyle(doc);
      syncOddsMode();

      resizeObserver?.disconnect();
      mutationObserver?.disconnect();

      if('ResizeObserver' in window){
        resizeObserver=new ResizeObserver(scheduleSync);
        resizeObserver.observe(doc.documentElement);
        resizeObserver.observe(doc.body);
      }

      mutationObserver=new MutationObserver(scheduleSync);
      mutationObserver.observe(doc.body,{childList:true,subtree:true,attributes:true,characterData:true});

      scheduleSync();
      requestAnimationFrame(()=>{syncOddsMode();scheduleSync();});
      setTimeout(()=>{syncOddsMode();scheduleSync();},80);
      setTimeout(()=>{syncOddsMode();scheduleSync();},300);
      setTimeout(scheduleSync,900);
    }catch{
      mirror.dataset.ready='0';
    }
  };

  const ensureMonitor=()=>{
    if(mounted)return;
    mounted=true;
    mirror.dataset.ready='0';
    frame.addEventListener('load',bindMonitorDocument);
    const source=frame.dataset.src||trigger.getAttribute('href');
    if(source)frame.src=source;
  };

  const setView=next=>{
    const show=next==='statistics';
    if(show===active)return;
    active=show;
    toolbar.classList.toggle('statistics-view-active',show);
    trigger.dataset.active=show?'1':'0';
    trigger.setAttribute('aria-pressed',show?'true':'false');
    matchPanel.classList.toggle('statistics-mirror-hidden',show);
    matchNote.classList.toggle('statistics-mirror-hidden',show);
    mirror.hidden=!show;

    if(show){
      ensureMonitor();
      syncOddsMode();
      scheduleSync();
    }
  };

  trigger.addEventListener('click',event=>{
    event.preventDefault();
    setView('statistics');
  });

  filterTabs.forEach(tab=>tab.addEventListener('click',()=>setView('matches')));
  window.addEventListener('nomad:odds-display-change',()=>{
    syncOddsMode();
    if(active)scheduleSync();
  });
  window.addEventListener('resize',()=>{if(active)scheduleSync()},{passive:true});
  window.addEventListener('beforeunload',()=>{
    if(syncFrame)cancelAnimationFrame(syncFrame);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  },{once:true});

  trigger.dataset.active='0';
  trigger.setAttribute('aria-pressed','false');
  mirror.dataset.ready='0';
})();
