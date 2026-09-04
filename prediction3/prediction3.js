(()=>{
  'use strict';

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const fmtOdds=value=>finite(value)?Number(value).toFixed(2):'—';
  const fmtPct=value=>finite(value)?`${Number(value).toFixed(2)}%`:'—';

  function team(name,logo,away=false){
    const image=logo?`<img class="team-logo" src="${esc(logo)}" alt="${esc(name)} logo" loading="lazy" decoding="async" onerror="this.hidden=true">`:'';
    const label=`<span class="team-name">${esc(name)}</span>`;
    return `<div class="team${away?' away':''}">${away?label+image:image+label}</div>`;
  }

  function sourceLinks(item){
    const sources=Array.isArray(item.sources)?item.sources:[];
    if(!sources.length)return '';
    return `<div class="prediction3-source-list">${sources.map((source,index)=>{
      const url=typeof source==='string'?source:source?.url;
      const label=typeof source==='string'?`Source ${index+1}`:(source?.label||`Source ${index+1}`);
      return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';
    }).join('')}</div>`;
  }

  function detailMetrics(item){
    const rows=[];
    if(finite(item.modelProbability))rows.push(['MODEL',fmtPct(item.modelProbability)]);
    if(finite(item.marketProbability))rows.push(['MARKET',fmtPct(item.marketProbability)]);
    if(finite(item.edge))rows.push(['EDGE',`${Number(item.edge).toFixed(2)} pp`]);
    if(item.grade)rows.push(['GRADE',item.grade]);
    if(item.risk)rows.push(['RISK',item.risk]);
    if(item.reviewedAt)rows.push(['REVIEWED',item.reviewedAt]);
    if(!rows.length)return '';
    return `<div class="p3-metrics">${rows.map(([label,value])=>`<div class="p3-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
  }

  function predictionCard(item){
    const confidence=finite(item.confidence)?fmtPct(Number(item.confidence)<=1?Number(item.confidence)*100:item.confidence):'—';
    const badge=item.badge||'MANUAL REVIEW';
    const search=[item.home,item.away,item.league,item.pick].join(' ').toLowerCase();
    return `<article class="prediction-card" data-search="${esc(search)}">
      <div class="card-head">
        <div>
          <div class="league-line"><span>${esc(item.league||'—')}</span><span>•</span><span>${esc(item.kickoff||'—')}</span><span class="badge">${esc(badge)}</span></div>
          <div class="match-title">${team(item.home||'Home',item.homeLogo)}<div class="vs">VS</div>${team(item.away||'Away',item.awayLogo,true)}</div>
        </div>
        <div class="pick-box">
          <div class="pick-main"><strong>${esc(item.pick||'—')}</strong></div>
          <div class="pick-stat"><span>ODDS</span><strong>${fmtOdds(item.odds)}</strong></div>
          <div class="pick-stat conf"><span>CONFIDENCE</span><strong>${confidence}</strong></div>
        </div>
      </div>
      ${detailMetrics(item)}
      <div class="analysis"><strong>ADD K ANALYSIS · </strong>${esc(item.analysis||'Manual analysis will be attached before publication.')}</div>
      ${sourceLinks(item)}
      <div class="prediction3-card-note">Prediction3 manual record · published only after owner command.</div>
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
    return {
      settled:settled.length,wins,losses,pushes,
      winRate:decided?wins/decided*100:null,
      avgOdds:odds.length?odds.reduce((sum,n)=>sum+n,0)/odds.length:null
    };
  }

  async function load(){
    const response=await fetch('data/ledger.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function empty(title,copy){
    return `<div class="p3-empty"><strong>${esc(title)}</strong><span>${esc(copy)}</span></div>`;
  }

  async function boot(){
    const predictionList=document.getElementById('predictionList');
    const resultList=document.getElementById('resultList');
    const input=document.getElementById('searchInput');
    const tabs=[...document.querySelectorAll('.day-tab')];
    let today=[];
    let results=[];
    let active='today';

    try{
      const data=await load();
      today=Array.isArray(data.today)?data.today:[];
      results=Array.isArray(data.results)?data.results:[];
      const stats=summary(results);

      document.getElementById('pickCount').textContent=today.length;
      document.getElementById('todayCount').textContent=today.length;
      document.getElementById('resultCount').textContent=results.length;
      document.getElementById('statSettled').textContent=stats.settled;
      document.getElementById('statWins').textContent=stats.wins;
      document.getElementById('statLosses').textContent=stats.losses;
      document.getElementById('statPushes').textContent=stats.pushes;
      document.getElementById('statWinRate').textContent=stats.winRate===null?'—':`${stats.winRate.toFixed(2)}%`;
      document.getElementById('statAvgOdds').textContent=stats.avgOdds===null?'—':stats.avgOdds.toFixed(2);

      predictionList.innerHTML=today.length?today.map(predictionCard).join(''):empty('READY FOR FIRST OWNER COMMAND','No Prediction3 picks have been published yet. Add K will analyze and publish only when the owner starts the daily run.');
      resultList.innerHTML=results.length?results.map(resultCard).join(''):empty('NO SETTLED RESULTS YET','Prediction3 statistics start from zero and remain separate from Prediction2 / KING Statistics V3.');
    }catch(error){
      console.error('Prediction3 load failed',error);
      predictionList.innerHTML=empty('PREDICTION3 DATA UNAVAILABLE','The isolated manual ledger could not be loaded. No automatic fallback or engine data was used.');
      resultList.innerHTML=empty('PREDICTION3 DATA UNAVAILABLE','Manual results were not loaded.');
    }

    function applySearch(){
      const q=String(input?.value||'').trim().toLowerCase();
      const host=active==='today'?predictionList:resultList;
      host.querySelectorAll('[data-search]').forEach(card=>{
        card.hidden=Boolean(q)&&!String(card.dataset.search||'').includes(q);
      });
    }

    function setView(view){
      active=view;
      const isToday=view==='today';
      predictionList.hidden=!isToday;
      resultList.hidden=isToday;
      document.getElementById('sectionEyebrow').textContent=isToday?"TODAY'S SELECTIONS":'MANUAL RESULT LEDGER';
      document.getElementById('sectionTitle').textContent=isToday?'Manual Prediction Desk':'Prediction3 Results';
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
