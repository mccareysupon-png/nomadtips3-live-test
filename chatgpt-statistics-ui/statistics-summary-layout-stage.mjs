// BALL46 statistics metric layout — STAGING ONLY.
// Values are read from the EXISTING summary strip; no calculations, no API calls.
export const stageSummaryScript = String.raw`(() => {
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
  const labelOf = value => String(value || '').replace(/\s+/g,' ').trim().toUpperCase();
  function sync(){
    if(document.body?.dataset.workspaceView!=='statistics')return;
    // Desktop only. Mobile uses the original top strip and overview without relocation.
    if(!window.matchMedia('(min-width: 851px)').matches){
      const panel=document.querySelector('.sp-stats-content');
      const chart=panel?.querySelector('#b46-finance-chart-card');
      chart?.querySelector('.b46-stage-summary-grid')?.remove();
      chart?.querySelector('.b46-stage-outcomes')?.remove();
      chart?.classList.remove('b46-stage-summary-ready');
      panel?.classList.remove('b46-stage-summary-ready');
      lastOverview=null; lastFingerprint='';
      return;
    }
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
    // The 3 outcome totals already exist in the source strip. Do not add redundant
    // summary cards: visualize their share while the existing W·P·L card keeps exact counts.
    const outcomeSpecs=[['WIN','win'],['PUSH','push'],['LOSS','loss']];
    const outcomes=[];
    for(const [label,key] of outcomeSpecs){
      const raw=available.get(label)?.querySelector('.b46v23-value')?.textContent?.trim();
      if(!raw)return;
      const count=Number(raw.replace(/[^0-9]/g,''));
      if(!Number.isSafeInteger(count)||count<0)return;
      outcomes.push({key,label,count});
    }
    const outcomeTotal=outcomes.reduce((sum,x)=>sum+x.count,0);
    const settledRaw=available.get('SETTLED')?.querySelector('.b46v23-value')?.textContent?.trim();
    const settled=Number((settledRaw||'').replace(/[^0-9]/g,''));
    if(outcomeTotal<1||outcomeTotal!==settled||outcomeTotal!==snapshot.total)return;
    const fingerprint=values.map(x=>x.key+':'+x.value).join('|')+
      '|outcomes:'+outcomes.map(x=>x.key+':'+x.count).join(',');
    if(lastOverview===overview && lastFingerprint===fingerprint &&
        overview.querySelector('.b46-stage-summary-grid') &&
        overview.querySelector('.b46-stage-outcomes')){
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
    let outcomesPanel=overview.querySelector('.b46-stage-outcomes');
    if(!outcomesPanel){
      outcomesPanel=document.createElement('section');
      outcomesPanel.className='b46-stage-outcomes';
      outcomesPanel.setAttribute('aria-label','Signal outcomes by settlement result');
    }
    const head=document.createElement('div');
    head.className='b46-stage-outcomes-heading';
    const name=document.createElement('strong');
    name.textContent='SIGNAL OUTCOMES';
    const period=document.createElement('span');
    period.textContent='All time';
    head.append(name,period);
    const track=document.createElement('div');
    track.className='b46-stage-outcomes-track';
    track.setAttribute('role','img');
    track.setAttribute('aria-label',outcomes.map(x=>x.label.toLowerCase()+' '+x.count.toLocaleString('en-US')).join(', '));
    const legend=document.createElement('div');
    legend.className='b46-stage-outcomes-legend';
    for(const outcome of outcomes){
      const segment=document.createElement('span');
      segment.className='b46-stage-outcomes-segment';
      segment.dataset.result=outcome.key;
      segment.dataset.count=String(outcome.count);
      segment.style.flexGrow=String(outcome.count);
      segment.title=outcome.label+' · '+outcome.count.toLocaleString('en-US')+' · '+(outcome.count/outcomeTotal*100).toFixed(1)+'%';
      track.appendChild(segment);
      const item=document.createElement('span');
      item.className='b46-stage-outcomes-legend-item';
      item.dataset.result=outcome.key;
      const dot=document.createElement('i');
      dot.className='b46-stage-outcomes-legend-dot';
      dot.setAttribute('aria-hidden','true');
      const key=document.createElement('span');
      key.textContent=outcome.label.charAt(0)+outcome.label.slice(1).toLowerCase();
      const pct=document.createElement('b');
      pct.textContent=(100*outcome.count/outcomeTotal).toFixed(1)+'%';
      item.append(dot,key,pct);
      legend.appendChild(item);
    }
    outcomesPanel.replaceChildren(head,track,legend);
    overview.append(outcomesPanel,grid);
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
    window.addEventListener('resize',schedule,{passive:true});
    setInterval(()=>{if(document.visibilityState==='visible')schedule()},2500);
    schedule();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();`;
