(()=>{
  const ENGINE=window.NOMAD_RUNTIME?.engineBase;
  const main=document.querySelector('main.shell');
  const summary=document.querySelector('.summary-grid');
  if(!ENGINE||!main||!summary)return;

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const panel=document.createElement('section');
  panel.className='panel match-scouts-statistics';
  panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">MATCH SCOUTS</p><h2>Condition performance</h2></div><span class="match-scouts-ledger-state">CONNECTING</span></div><div class="match-scouts-stats-message">Connecting sidecar registry…</div><div class="match-scouts-cards"></div>`;
  summary.insertAdjacentElement('afterend',panel);

  const style=document.createElement('style');
  style.textContent=`.match-scouts-statistics{margin-top:10px}.match-scouts-ledger-state{font-size:9px;font-weight:900;letter-spacing:.08em;color:#f2d21b}.match-scouts-ledger-state.ok{color:#83df89}.match-scouts-ledger-state.off{color:#ffb36b}.match-scouts-stats-message{font-size:9px;color:#98a091;margin:0 0 9px}.match-scouts-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.match-scout-card{background:rgba(255,255,255,.025);border-radius:10px;padding:12px;min-width:0}.match-scout-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px}.match-scout-card-head small{display:block;color:#899289;font-size:8px;margin-top:3px}.match-scout-card-head b{font-size:14px;overflow-wrap:anywhere}.match-scout-number{font-size:9px;font-weight:900;color:#f2d21b;white-space:nowrap}.match-scout-active{display:inline-block;margin-left:5px;color:#83df89;font-size:7px}.match-scout-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.match-scout-metric{background:rgba(0,0,0,.12);border-radius:7px;padding:7px}.match-scout-metric span{display:block;color:#899289;font-size:7px}.match-scout-metric strong{display:block;margin-top:2px;font-size:11px}.match-scout-form{margin-top:8px;font-size:8px;color:#98a091}@media(max-width:620px){.match-scout-metrics{grid-template-columns:repeat(2,1fr)}}`;
  document.head.appendChild(style);

  const stateEl=panel.querySelector('.match-scouts-ledger-state');
  const messageEl=panel.querySelector('.match-scouts-stats-message');
  const cardsEl=panel.querySelector('.match-scouts-cards');
  let records=[];
  let registry=null;

  const summarize=items=>{
    const settled=items.filter(item=>item?.settlement);
    const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
    const pushes=settled.filter(item=>item.settlement?.result==='PUSH').length;
    const profit=settled.reduce((total,item)=>total+(Number(item.settlement?.profit)||0),0);
    const avgOdds=items.length?items.reduce((total,item)=>total+(Number(item?.odds)||0),0)/items.length:0;
    return {total:items.length,settled,wins,losses,pushes,profit,avgOdds,winRate:settled.length?wins/settled.length*100:0,roi:settled.length?profit/settled.length*100:0};
  };

  const render=()=>{
    if(!registry){stateEl.textContent='UNAVAILABLE';stateEl.className='match-scouts-ledger-state off';messageEl.textContent='Match Scouts sidecar unavailable · overall Statistics above remain unchanged.';cardsEl.innerHTML='';return;}
    if(!registry.enabled){stateEl.textContent='DETACHED';stateEl.className='match-scouts-ledger-state off';messageEl.textContent='SIDE CAR DETACHED · overall Statistics and the Core Engine continue normally. Stored boxes are preserved.';cardsEl.innerHTML='';return;}
    stateEl.textContent='CONNECTED';stateEl.className='match-scouts-ledger-state ok';
    const scouts=Array.isArray(registry.scouts)?registry.scouts:[];
    if(!scouts.length){messageEl.textContent='No named condition boxes yet. Save & Run a named condition in Settings to create #001.';cardsEl.innerHTML='';return;}
    messageEl.textContent=`${scouts.length} named condition box${scouts.length===1?'':'es'} · records are attributed by the locked config version.`;
    cardsEl.innerHTML=scouts.map(scout=>{
      const version=Number(scout.configVersion);
      const items=records.filter(record=>Number(record?.configSnapshot?.version)===version);
      const s=summarize(items);
      const recent=s.settled.slice(0,5).map(item=>item.settlement?.result||'PENDING').join(' · ')||'—';
      const active=Number(registry.activeConfigVersion)===version;
      return `<article class="match-scout-card"><div class="match-scout-card-head"><div><b>${esc(scout.name)}</b>${active?'<span class="match-scout-active">ACTIVE</span>':''}<small>${esc(scout.scoutId)} · Config v${version}</small></div><span class="match-scout-number">#${String(scout.sequence).padStart(3,'0')}</span></div><div class="match-scout-metrics"><div class="match-scout-metric"><span>SIGNALS</span><strong>${s.total}</strong></div><div class="match-scout-metric"><span>WIN RATE</span><strong>${s.settled.length?s.winRate.toFixed(1)+'%':'—'}</strong></div><div class="match-scout-metric"><span>AVG ODDS</span><strong>${s.total?s.avgOdds.toFixed(2):'—'}</strong></div><div class="match-scout-metric"><span>P/L</span><strong>${s.settled.length?`${s.profit>=0?'+':''}${s.profit.toFixed(2)}u`:'—'}</strong></div><div class="match-scout-metric"><span>ROI</span><strong>${s.settled.length?`${s.roi>=0?'+':''}${s.roi.toFixed(1)}%`:'—'}</strong></div><div class="match-scout-metric"><span>W/L/P</span><strong>${s.wins}/${s.losses}/${s.pushes}</strong></div></div><div class="match-scout-form">Recent settled · ${esc(recent)}</div></article>`;
    }).join('');
  };

  const loadRegistry=async()=>{
    try{
      const response=await fetch(`${ENGINE}/match-scouts?_=${Date.now()}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);
      registry=data;
    }catch{registry=null;}
    render();
  };

  const loadRecords=async()=>{
    try{
      const response=await fetch(`${ENGINE}/statistics?_=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      records=Array.isArray(data.records)?data.records:[];
      render();
    }catch{}
  };

  window.addEventListener('nomad:statistics-records',event=>{records=Array.isArray(event.detail?.records)?event.detail.records:[];render();});
  loadRegistry();
  loadRecords();
  setInterval(loadRegistry,15000);
})();
