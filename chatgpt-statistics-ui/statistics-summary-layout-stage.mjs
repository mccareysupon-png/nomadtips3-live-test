// BALL46 statistics metric layout — STAGING ONLY.
// Values are read from the EXISTING summary strip; no calculations, no API calls.
export const stageSummaryScript = String.raw\`(() => {
  'use strict';
  const specs = [
    ['ROI','roi'],
    ['WIN RATE','rate'],
    ['AVG ODDS','odds'],
    ['SETTLED DAYS','days'],
    ['UNSETTLED','unsettled'],
    ['W · P · L','wpl'],
    ['STAKE','stake'],
    ['MAX DRAWDOWN','drawdown']
  ];
  let lastOverview=null, lastFingerprint='', pending=false;
  const labelOf = value => String(value || '').replace(/\\s+/g,' ').trim().toUpperCase();
  function sync(){
    if(document.body?.dataset.workspaceView!=='statistics')return;
    const panel=document.querySelector('.sp-stats-content');
    const chart=panel?.querySelector('#b46-finance-chart-card');
    const overview=chart?.querySelector('.f46-overview');
    const strip=panel?.querySelector('.b46v23-strip-grid');
    if(!panel||!chart||!overview||!strip)return;
    let snapshot=null;
    try{snapshot=window.BALL46_STATISTICS_DATA?.getSnapshot?.()}catch{}
    if(snapshot?.ok!==true||!Array.isArray(snapshot.ledgerRows)||
       snapshot.ledgerRows.length!==snapshot.ledgerTotal||snapshot.hasMore!==false)return;
    const available=new Map();
    for(const source of strip.querySelectorAll('.b46v23-micro-card')){
      const name=labelOf(source.querySelector('.b46v23-label')?.textContent);
      if(name && !available.has(name))available.set(name,source);
    }
    const values=[];
    for(const [label,key] of specs){
      const source=available.get(label);
      const value=source?.querySelector('.b46v23-value')?.textContent?.trim();
      if(!value||value==='—'||value==='-'||!source)return;
      values.push({label,key,value,tone:source.getAttribute('data-b46-stat-tone')||'white',
        detail:source.querySelector('.b46v23-meta')?.textContent?.trim()||''});
    }
    const fingerprint=values.map(x=>x.key+':'+x.value).join('|');
    if(lastOverview===overview && lastFingerprint===fingerprint &&
        overview.querySelector('.b46-stage-summary-grid')){
      panel.classList.add('b46-stage-summary-ready');
      chart.classList.add('b46-stage-summary-ready');
      return;
    }
    let grid=overview.querySelector('.b46-stage-summary-grid');
    if(!grid){
      grid=document.createElement('div');
      grid.className='b46-stage-summary-grid';
      grid.setAttribute('role','group');
      grid.setAttribute('aria-label','All-time statistics summary');
    }
    const fragment=document.createDocumentFragment();
    for(const entry of values){
      const item=document.createElement('div');
      item.className='b46-stage-summary-item';
      item.dataset.key=entry.key;
      item.dataset.tone=entry.tone;
      const title=document.createElement('span');
      title.className='b46-stage-summary-label';
      title.textContent=entry.label;
      const value=document.createElement('strong');
      value.className='b46-stage-summary-number';
      value.textContent=entry.value;
      item.title=entry.label+' · '+entry.value+(entry.detail?' · '+entry.detail:'');
      item.append(title,value);
      fragment.append(item);
    }
    grid.replaceChildren(fragment);
    overview.appendChild(grid);
    panel.classList.add('b46-stage-summary-ready');
    chart.classList.add('b46-stage-summary-ready');
    lastOverview=overview;lastFingerprint=fingerprint;
  }
  function schedule(){
    if(pending)return;
    pending=true;
    setTimeout(()=>{pending=false;sync()},60);
  }
  const start=()=>{
    const observer=new MutationObserver(records=>{
      if(document.body?.dataset.workspaceView!=='statistics')return;
      // Ignore mutations in our own summary grid to avoid feedback loops.
      if(records.some(r=>!r.target?.closest?.('.b46-stage-summary-grid')))schedule();
    });
    observer.observe(document.body,{childList:true,characterData:true,subtree:true});
    document.addEventListener('ball46:statistics-snapshot',schedule);
    setInterval(()=>{if(document.visibilityState==='visible')schedule()},2500);
    schedule();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();\`;
