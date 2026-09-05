(()=>{
  'use strict';

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const fmtOdds=value=>finite(value)?Number(value).toFixed(2):'—';

  const ICONS={
    crown:'<path d="M4 8l4 4 4-7 4 7 4-4-2 10H6L4 8Z"/><path d="M6 21h12"/>',
    target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/>',
    chart:'<path d="M4 19V8M10 19V4M16 19v-7M22 19V2"/><path d="M3 19h20"/>',
    form:'<path d="M3 18 9 12l4 4 8-10"/><path d="M16 6h5v5"/>',
    squad:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.6-4 3-6 6-6s5.4 2 6 6M14 15c3 0 5 1.7 6 5"/>',
    shield:'<path d="M12 3 20 6v6c0 5-3.2 8.1-8 10-4.8-1.9-8-5-8-10V6l8-3Z"/><path d="M9 12l2 2 4-5"/>',
    price:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>',
    tactics:'<path d="M4 5h6M7 2v6M14 4l6 6M20 4l-6 6"/><circle cx="6" cy="17" r="3"/><path d="M10 18h10M17 15l3 3-3 3"/>',
    warning:'<path d="M12 3 22 21H2L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
    stop:'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    megaphone:'<path d="M4 14v-4l12-5v14L4 14Z"/><path d="M16 9h3a3 3 0 0 1 0 6h-3M7 15l1 6h4l-2-6"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    document:'<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
    list:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };

  const icon=(name,cls='')=>`<span class="p3-icon ${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||ICONS.check}</svg></span>`;

  function shirtSvg(def={}){
    const base=def.base||'#1f2730';
    const stripe=def.stripe||'#4573a8';
    const accent=def.accent||'#d2b06a';
    const pattern=def.pattern||'stripe';
    let detail='';
    if(pattern==='stripe')detail=`<path d="M18 10v38M26 7v43M34 7v43M42 10v38" stroke="${stripe}" stroke-width="5" opacity=".9"/>`;
    if(pattern==='sleeve')detail=`<path d="M7 15 21 8v12l-9 7-5-12Zm50 0L43 8v12l9 7 5-12Z" fill="${stripe}"/>`;
    if(pattern==='center')detail=`<path d="M27 6h10v48H27z" fill="${stripe}"/>`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient><clipPath id="c"><path d="M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z"/></clipPath></defs><g clip-path="url(#c)"><rect width="64" height="64" fill="${base}"/>${detail}<rect width="64" height="64" fill="url(#g)"/></g><path d="M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z" fill="none" stroke="#080a09" stroke-width="1.8"/><path d="M27 5 32 12 37 5" fill="#101210" stroke="${accent}" stroke-width="1"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function teamIdentity(name,short,colors,away=false){
    const initials=esc(short||String(name||'').split(/\s+/).map(s=>s[0]).join('').slice(0,3).toUpperCase());
    return `<div class="p3-team ${away?'away':''}">
      <span class="p3-team-badge">${initials}</span>
      <img class="p3-team-shirt" alt="" aria-hidden="true" draggable="false" src="${shirtSvg(colors)}">
      <strong>${esc(name)}</strong>
    </div>`;
  }

  function sourceLinks(item){
    const sources=Array.isArray(item.sources)?item.sources:[];
    if(!sources.length)return '';
    return `<div class="p3-sources"><span class="p3-sources-label">Sources Reviewed</span>${sources.map((source,index)=>{
      const url=typeof source==='string'?source:source?.url;
      const label=typeof source==='string'?`Source ${index+1}`:(source?.label||`Source ${index+1}`);
      const type=source?.type||'document';
      return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon(type)}${esc(label)}</a>`:'';
    }).join('')}</div>`;
  }

  function bulletList(rows,kind='check'){
    return `<ul class="p3-bullets">${(Array.isArray(rows)?rows:[]).map(row=>`<li>${kind==='check'?icon('check','check'):''}<span>${esc(row)}</span></li>`).join('')}</ul>`;
  }

  function supportPanel(name,label,text){
    return `<div class="p3-support-card">${icon(name)}<div><span>${esc(label)}</span><strong>${esc(text)}</strong></div></div>`;
  }

  function predictionCard(item){
    const search=[item.home,item.away,item.league,item.pick].join(' ').toLowerCase();
    const support=item.support||{};
    const implied=finite(item.referenceOdds)?(100/Number(item.referenceOdds)).toFixed(1)+'%':'—';
    const pickLabel=item.pick||'—';
    return `<article class="p3-featured" data-search="${esc(search)}">
      <header class="p3-match-head">
        <div class="p3-match-teams">
          ${teamIdentity(item.home||'Home',item.homeShort,item.homeColors,false)}
          <span class="p3-vs">VS</span>
          ${teamIdentity(item.away||'Away',item.awayShort,item.awayColors,true)}
        </div>
        <div class="p3-match-meta">
          <span class="p3-competition">${esc(item.league||'—')}</span>
          <span>${esc(item.round||'')}</span>
          <span>${esc(item.kickoff||'—')}</span>
          <span class="p3-manual-pill">PREDICTION3 MANUAL</span>
        </div>
      </header>

      <section class="p3-pick-grid">
        <div class="p3-pick-hero">
          <div class="p3-section-label">${icon('crown')}<span>ADD K PICK</span></div>
          <h2>${esc(pickLabel)}</h2>
          <div class="p3-pick-facts">
            <div><span>MARKET</span><strong>${esc(item.market||'1X2')}</strong></div>
            <div><span>REFERENCE ODDS</span><strong>${fmtOdds(item.referenceOdds||item.odds)}</strong></div>
            <div><span>BEST OBSERVED</span><strong>${fmtOdds(item.bestOddsObserved)}</strong></div>
            <div><span>CONFIDENCE</span><strong class="positive">${esc(item.confidenceLabel||'Controlled')}</strong></div>
            <div><span>CURRENT VIEW</span><strong class="warning">${esc(item.currentView||'Provisional')}</strong></div>
            <div><span>FINAL CHECK</span><strong class="warning">${esc(item.finalCheck||'Starting XI')}</strong></div>
          </div>
        </div>
        <aside class="p3-value-box">
          <div class="p3-section-label">${icon('chart')}<span>VALUE SNAPSHOT</span></div>
          <dl>
            <div><dt>Raw implied</dt><dd>${implied}</dd></div>
            <div><dt>NOMAD View</dt><dd class="positive">${esc(item.nomadView||'Positive')}</dd></div>
            <div><dt>Risk</dt><dd class="warning">${esc(item.risk||'Moderate')}</dd></div>
            <div><dt>Grade</dt><dd><span class="p3-grade">${esc(item.grade||'A')}</span></dd></div>
          </dl>
          <p class="p3-price-rule">Playable only at <strong>1.90+</strong>. Re-check price before kick-off.</p>
        </aside>
      </section>

      <section class="p3-analysis-grid">
        <div class="p3-panel p3-why">
          <div class="p3-panel-title">${icon('target')}<h3>WHY THIS PICK</h3></div>
          ${bulletList(item.why,'check')}
        </div>
        <div class="p3-panel p3-support">
          <div class="p3-panel-title">${icon('chart')}<h3>MATCH SUPPORT</h3></div>
          <div class="p3-support-grid">
            ${supportPanel('form','FORM',support.form||'—')}
            ${supportPanel('squad','SQUAD NEWS',support.squad||'—')}
            ${supportPanel('shield','LEVEL GAP',support.level||'—')}
            ${supportPanel('price','PRICE CHECK',support.price||'—')}
          </div>
        </div>
      </section>

      <section class="p3-three-grid">
        <div class="p3-panel">
          <div class="p3-panel-title">${icon('tactics')}<h3>TACTICAL VIEW</h3></div>
          ${bulletList(item.tactical,'dot')}
        </div>
        <div class="p3-panel p3-risk">
          <div class="p3-panel-title">${icon('warning')}<h3>RISK OUTLOOK</h3></div>
          <strong class="p3-risk-level">${esc(item.risk||'MODERATE')}</strong>
          ${bulletList(item.riskFactors,'dot')}
        </div>
        <div class="p3-panel p3-break">
          <div class="p3-panel-title">${icon('stop')}<h3>NO BET IF CONDITIONS BREAK</h3></div>
          ${bulletList(item.noBetIf,'dot')}
        </div>
      </section>

      <section class="p3-final-call">
        <div class="p3-final-heading">${icon('megaphone')}<div><span>FINAL CALL</span><strong>${esc(item.finalCall||'FOLLOW — AFTER LINEUP CHECK')}</strong></div></div>
        <div class="p3-final-copy">
          <p>${esc(item.finalNote||'Final confirmation depends on the starting XI and late market stability.')}</p>
          <small>${esc(item.disciplineNote||'No signal expansion. No forced second pick.')}</small>
        </div>
      </section>

      ${sourceLinks(item)}
      <div class="prediction3-card-note">Prediction3 manual record · owner-command publication · no automatic selection engine.</div>
    </article>`;
  }

  function resultCard(item){
    const result=String(item.result||'PENDING').toUpperCase();
    const state=result.toLowerCase();
    const search=[item.home,item.away,item.league,item.pick,result].join(' ').toLowerCase();
    return `<article class="result-card ${state}" data-search="${esc(search)}">
      <div class="result-main">
        <div class="result-meta"><span>${esc(item.league||'—')}</span><span>•</span><span>${esc(item.kickoff||item.date||'—')}</span></div>
        <div class="result-match"><span>${esc(item.home||'Home')}</span><span class="vs">VS</span><span>${esc(item.away||'Away')}</span></div>
        <div class="result-pick"><strong>${esc(item.pick||'—')}</strong></div>
        <div class="result-summary">Result reviewed manually by Add K after owner command.</div>
      </div>
      <div class="result-settle">
        <div class="settle-box"><span>FINAL SCORE</span><strong>${esc(item.ft||item.score||'—')}</strong></div>
        <div class="settle-box"><span>ODDS</span><strong>${fmtOdds(item.odds)}</strong></div>
        <div class="settle-box"><span>RESULT</span><strong class="settle-result ${state}">${esc(result)}</strong></div>
      </div>
    </article>`;
  }

  function summary(records){
    const settled=records.filter(row=>['WIN','LOSS','PUSH'].includes(String(row.result||'').toUpperCase()));
    const wins=settled.filter(row=>String(row.result).toUpperCase()==='WIN').length;
    const losses=settled.filter(row=>String(row.result).toUpperCase()==='LOSS').length;
    const pushes=settled.filter(row=>String(row.result).toUpperCase()==='PUSH').length;
    const decided=wins+losses;
    const odds=settled.map(row=>Number(row.odds)).filter(Number.isFinite);
    return {settled:settled.length,wins,losses,pushes,winRate:decided?wins/decided*100:null,avgOdds:odds.length?odds.reduce((sum,n)=>sum+n,0)/odds.length:null};
  }

  async function load(){
    const response=await fetch('data/ledger.json?v=20260905-freiburg-v1',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function empty(title,copy){return `<div class="p3-empty"><strong>${esc(title)}</strong><span>${esc(copy)}</span></div>`;}

  async function boot(){
    const predictionList=document.getElementById('predictionList');
    const resultList=document.getElementById('resultList');
    const input=document.getElementById('searchInput');
    const tabs=[...document.querySelectorAll('.day-tab')];
    let today=[],results=[],active='today';

    try{
      const data=await load();
      today=Array.isArray(data.today)?data.today:[];
      results=Array.isArray(data.results)?data.results:[];
      const stats=summary(results);
      document.body.dataset.pickMode=today.length===1?'solo':today.length<=3?'spotlight':'grid';
      document.getElementById('pickCount').textContent=today.length;
      document.getElementById('todayCount').textContent=today.length;
      document.getElementById('resultCount').textContent=results.length;
      document.getElementById('statSettled').textContent=stats.settled;
      document.getElementById('statWins').textContent=stats.wins;
      document.getElementById('statLosses').textContent=stats.losses;
      document.getElementById('statPushes').textContent=stats.pushes;
      document.getElementById('statWinRate').textContent=stats.winRate===null?'—':`${stats.winRate.toFixed(2)}%`;
      document.getElementById('statAvgOdds').textContent=stats.avgOdds===null?'—':stats.avgOdds.toFixed(2);
      predictionList.innerHTML=today.length?today.map(predictionCard).join(''):empty('READY FOR OWNER COMMAND','No Prediction3 picks have been published. NO PICK remains a valid daily result.');
      resultList.innerHTML=results.length?results.map(resultCard).join(''):empty('NO SETTLED RESULTS YET','Prediction3 statistics start from zero and remain separate from Prediction2 / KING Statistics V3.');
    }catch(error){
      console.error('Prediction3 load failed',error);
      predictionList.innerHTML=empty('PREDICTION3 DATA UNAVAILABLE','The isolated manual ledger could not be loaded. No automatic fallback or engine data was used.');
      resultList.innerHTML=empty('PREDICTION3 DATA UNAVAILABLE','Manual results were not loaded.');
    }

    function applySearch(){
      const q=String(input?.value||'').trim().toLowerCase();
      const host=active==='today'?predictionList:resultList;
      host.querySelectorAll('[data-search]').forEach(card=>{card.hidden=Boolean(q)&&!String(card.dataset.search||'').includes(q);});
    }

    function setView(view){
      active=view;
      const isToday=view==='today';
      predictionList.hidden=!isToday;
      resultList.hidden=isToday;
      document.getElementById('sectionEyebrow').textContent=isToday?"TODAY'S SELECTIONS":'MANUAL RESULT LEDGER';
      document.getElementById('sectionTitle').textContent=isToday?(today.length===1?'Featured Manual Pick':'Manual Prediction Desk'):'Prediction3 Results';
      tabs.forEach(tab=>tab.classList.toggle('active',tab.dataset.view===view));
      applySearch();
    }

    tabs.forEach(tab=>tab.addEventListener('click',()=>setView(tab.dataset.view||'today')));
    if(input)input.addEventListener('input',applySearch);
    setView('today');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
