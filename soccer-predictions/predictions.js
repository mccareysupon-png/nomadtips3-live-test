const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const esc=s=>String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const hash=s=>[...String(s??'')].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0);
const finite=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));

function pickSide(p){
  const pick=String(p.pick||'').toLowerCase();
  if(pick.includes('draw')) return 'draw';
  if(String(p.away||'') && pick.startsWith(String(p.away).toLowerCase())) return 'away';
  return 'home';
}

function previewModel(p){
  const seed=Math.abs(hash(p.id));
  const awayPick=pickSide(p)==='away';
  const chosen=clamp(Math.round(Number(p.confidence)||50),40,64);
  const draw=clamp(25-Math.round((chosen-40)*.12),20,25);
  const other=100-chosen-draw;
  const probs=awayPick?{home:other,draw,away:chosen}:{home:chosen,draw,away:other};
  const metrics=['Attack Strength','Shot Volume','Shots on Target','Recent Form','Home / Away Form','Defense Stability','Conversion Rate'].map((label,i)=>{
    let fav=clamp(52+((seed>>(i%8))%11),49,67);
    if(awayPick) return {label,home:100-fav,away:fav};
    return {label,home:fav,away:100-fav};
  });
  const forms=['W','W','D','W','L'];
  const alt=['D','W','L','D','L'];
  const rotate=(arr,n)=>arr.map((_,i)=>arr[(i+n)%arr.length]);
  const homeForm=rotate(awayPick?alt:forms,seed%5);
  const awayForm=rotate(awayPick?forms:alt,(seed>>3)%5);
  const h2h=awayPick?{home:1,draw:1,away:3}:{home:3,draw:1,away:1};
  const base=(seed%9)/10;
  const stats={
    home:{gf:(1.35+base).toFixed(2),ga:(.85+(base/2)).toFixed(2),corners:(4.8+base).toFixed(1),pos:Math.round(49+base*5)+'%',sot:(3.8+base).toFixed(1)},
    away:{gf:(1.18+(1-base)/2).toFixed(2),ga:(1.05+(1-base)/3).toFixed(2),corners:(4.4+(1-base)).toFixed(1),pos:Math.round(47+(1-base)*5)+'%',sot:(3.4+(1-base)).toFixed(1)}
  };
  return {source:false,probs,metrics,homeForm,awayForm,h2h,stats};
}

function realModel(p){
  const d=p.analysisData||{};
  const prob=d.probability||{};
  const probs={home:Number(prob.home),draw:Number(prob.draw),away:Number(prob.away)};
  const probabilityReady=['home','draw','away'].every(k=>finite(prob[k]));
  const metrics=Array.isArray(d.metrics)?d.metrics.filter(x=>x&&finite(x.home)&&finite(x.away)).map(x=>({label:String(x.label||'Metric'),home:clamp(Math.round(Number(x.home)),0,100),away:clamp(Math.round(Number(x.away)),0,100)})):[];
  const form=d.form||{};
  const homeForm=Array.isArray(form.home)?form.home.slice(-5):[];
  const awayForm=Array.isArray(form.away)?form.away.slice(-5):[];
  const hh=d.h2h||{};
  const h2h={home:finite(hh.home)?Number(hh.home):null,draw:finite(hh.draw)?Number(hh.draw):null,away:finite(hh.away)?Number(hh.away):null};
  const stats={home:d.stats?.home||{},away:d.stats?.away||{}};
  return {source:true,probabilityReady,probs,metrics,homeForm,awayForm,h2h,stats,dataQuality:d.dataQuality||{}};
}

function model(p){
  return p.analysisData && typeof p.analysisData==='object' ? realModel(p) : previewModel(p);
}

function formPills(arr){return arr.length?arr.map(x=>`<span class="form-pill ${String(x).toLowerCase()}">${esc(x)}</span>`).join(''):'<span class="metric-na">—</span>'}
function statCell(label,val){return val===undefined||val===null||val===''?'':`<div class="stat"><span>${label}</span><strong>${esc(val)}</strong></div>`}
function teamBlock(name,logo,isAway=false){
  const image=logo?`<img class="team-logo" src="${esc(logo)}" alt="${esc(name)} logo" loading="lazy" decoding="async" onerror="this.hidden=true">`:'';
  const label=`<span class="team-name">${esc(name)}</span>`;
  return `<div class="team${isAway?' away':''}">${isAway?label+image:image+label}</div>`;
}

function analystComment(p){
  if(typeof p.analysis==='string'&&p.analysis.trim()) return esc(p.analysis.trim());
  const confidence=Number(p.confidence);
  const odds=Number(p.odds);
  let confidenceView='This is a higher-variance selection, so the price needs to compensate for the added uncertainty.';
  if(confidence>=55) confidenceView='The confidence rating places it among the stronger selections on the current slate, while still leaving normal match-day risk.';
  else if(confidence>=50) confidenceView='The confidence rating points to a modest edge rather than a clear-cut advantage, so price discipline remains important.';
  else if(confidence>=45) confidenceView='The matchup is relatively balanced, making this a selective value position rather than a low-risk pick.';
  let priceView='At this price, the selection offers a balanced risk-to-return profile for a pre-match 1X2 position.';
  if(odds>=3) priceView='The larger price increases the potential return, but it also reflects a materially higher level of market risk.';
  else if(odds>=2.4) priceView='The price offers an attractive return profile, although the market is signalling meaningful uncertainty.';
  else if(odds<1.9) priceView='The shorter price reflects a more conservative market position, with less room for error in the value assessment.';
  return `${esc(p.pick)} is the preferred 1X2 selection at odds of ${odds.toFixed(2)}, with a ${confidence.toFixed(2)}% confidence rating. ${confidenceView} ${priceView}`;
}

function probabilityPanel(m){
  if(m.source&&!m.probabilityReady){
    return `<section class="panel"><div class="panel-title"><h3>WIN PROBABILITY</h3><span class="demo-tag">SOURCE DATA</span></div><div class="empty">Probability data unavailable.</div></section>`;
  }
  const {home,draw,away}=m.probs;
  const selectedColor='var(--selected-green)';
  const opponentColor='var(--opponent-red)';
  const side=pickSide(window.__renderingPrediction||{});
  const homeColor=side==='home'?selectedColor:opponentColor;
  const awayColor=side==='away'?selectedColor:opponentColor;
  const drawColor=side==='draw'?selectedColor:'#7d837e';
  const conic=`conic-gradient(${homeColor} 0 ${home}%, ${drawColor} ${home}% ${home+draw}%, ${awayColor} ${home+draw}% 100%)`;
  return `<section class="panel">
    <div class="panel-title"><h3>WIN PROBABILITY</h3><span class="demo-tag">${m.source?'NOMAD MODEL':'PREVIEW'}</span></div>
    <div class="prob-layout"><div class="donut" style="background:${conic}"><strong>${Math.max(home,draw,away).toFixed(m.source?2:0)}%</strong><small>TOP SIDE</small></div><div class="legend">
      <div class="legend-row ${side==='home'?'selected':'opponent'}"><span>Home Win</span><strong>${home}%</strong></div>
      <div class="legend-row ${side==='draw'?'selected':'neutral'}"><span>Draw</span><strong>${draw}%</strong></div>
      <div class="legend-row ${side==='away'?'selected':'opponent'}"><span>Away Win</span><strong>${away}%</strong></div>
    </div></div>
  </section>`;
}

function card(p){
  window.__renderingPrediction=p;
  const m=model(p);
  const bars=m.metrics.map(x=>`<div class="compare-row"><div class="compare-label">${esc(x.label)}</div><div class="bar-wrap"><span class="bar-num">${x.home}%</span><div class="bar"><span class="bar-home" style="width:${x.home}%"></span><span class="bar-away" style="width:${x.away}%"></span></div><span class="bar-num">${x.away}%</span></div></div>`).join('');
  const side=pickSide(p);
  const sideClass=side==='away'?'selected-away':side==='draw'?'selected-draw':'selected-home';
  const h2h=m.h2h;
  const h2hReady=[h2h.home,h2h.draw,h2h.away].every(finite);
  const sourceUrl=typeof p.source==='string'?p.source:p.source?.url;
  const stats=m.stats||{home:{},away:{}};
  const sourceTag=m.source?'SOURCE METRICS':'PREVIEW METRICS';
  const quality=m.source&&m.dataQuality?.status?` · ${String(m.dataQuality.status).toUpperCase()}`:'';
  const probability=probabilityPanel(m);
  window.__renderingPrediction=null;
  return `<article class="prediction-card ${p.featured?'featured':''} ${sideClass}" data-search="${esc((p.home+' '+p.away+' '+p.league).toLowerCase())}">
    <div class="card-head">
      <div>
        <div class="league-line"><span>${esc(p.league)}</span><span>•</span><span>${esc(p.kickoff)}</span><span class="badge">${esc(p.abc||'SELECTED')}</span></div>
        <div class="match-title">${teamBlock(p.home,p.homeLogo)}<div class="vs">VS</div>${teamBlock(p.away,p.awayLogo,true)}</div>
      </div>
      <div class="pick-box">
        <div class="pick-main"><strong>${esc(p.pick)}</strong></div>
        <div class="pick-stat"><span>ODDS</span><strong>${Number(p.odds).toFixed(2)}</strong></div>
        <div class="pick-stat conf"><span>CONFIDENCE</span><strong>${Number(p.confidence).toFixed(2)}%</strong></div>
      </div>
    </div>

    <div class="card-grid">
      <section class="panel">
        <div class="panel-title"><h3>TEAM COMPARISON</h3><span class="demo-tag">${sourceTag}${quality}</span></div>
        <div class="comparison-list">${bars||'<div class="empty">Comparison metrics unavailable.</div>'}</div>
        <div class="stats-grid">
          ${statCell('HOME GF',stats.home?.gf)}${statCell('HOME GA',stats.home?.ga)}${statCell('HOME CORNERS',stats.home?.corners)}${statCell('HOME POS',stats.home?.pos)}${statCell('HOME SOT',stats.home?.sot)}
          ${statCell('AWAY GF',stats.away?.gf)}${statCell('AWAY GA',stats.away?.ga)}${statCell('AWAY CORNERS',stats.away?.corners)}${statCell('AWAY POS',stats.away?.pos)}${statCell('AWAY SOT',stats.away?.sot)}
        </div>
      </section>

      <div class="right-stack">
        ${probability}
        <div class="mini-grid">
          <section class="mini-card"><h4>RECENT FORM · LAST 5</h4><div class="form-row">${formPills(m.homeForm)}</div><div class="form-row" style="margin-top:6px">${formPills(m.awayForm)}</div></section>
          <section class="mini-card"><h4>H2H</h4>${h2hReady?`<div class="h2h"><span>${esc(p.home)}</span><strong>${h2h.home}</strong><span>Draw</span><strong>${h2h.draw}</strong><span>${esc(p.away)}</span><strong>${h2h.away}</strong></div>`:'<div class="empty">H2H data unavailable.</div>'}</section>
        </div>
      </div>
    </div>

    <div class="analysis"><strong>ANALYSIS · </strong>${analystComment(p)}</div>
    ${sourceUrl?`<div class="source-line"><a href="${esc(sourceUrl)}" target="_blank" rel="noopener">Source reference</a></div>`:''}
  </article>`;
}

function resultCard(r){
  const state=String(r.result||'').toLowerCase();
  return `<article class="result-card ${state}" data-search="${esc((r.home+' '+r.away+' '+r.league+' '+r.pick).toLowerCase())}">
    <div class="result-main"><div class="result-meta"><span>${esc(r.league)}</span><span>•</span><span>${esc(r.kickoff)}</span></div><div class="result-match"><span>${esc(r.home)}</span><span class="vs">VS</span><span>${esc(r.away)}</span></div><div class="result-pick"><strong>${esc(r.pick)}</strong></div><div class="result-summary">Yesterday's public result view keeps only the previous slate. Older history remains in the private Excel ledger.</div></div>
    <div class="result-settle"><div class="settle-box"><span>FINAL SCORE</span><strong>${esc(r.score)}</strong></div><div class="settle-box"><span>ODDS</span><strong>${Number(r.odds).toFixed(2)}</strong></div><div class="settle-box"><span>RESULT</span><strong class="settle-result ${state}">${esc(r.result)}</strong></div></div>
  </article>`;
}

function resultSummary(rows){
  const win=rows.filter(r=>String(r.result||'').toUpperCase()==='WIN').length;
  const loss=rows.filter(r=>String(r.result||'').toUpperCase()==='LOSS').length;
  const odds=rows.map(r=>Number(r.odds)).filter(Number.isFinite);
  const avgOdds=odds.length?(odds.reduce((sum,n)=>sum+n,0)/odds.length).toFixed(2):'—';
  return `<section class="result-kpis" aria-label="Yesterday summary"><div class="result-kpi win"><span>WIN</span><strong>${win}</strong></div><div class="result-kpi loss"><span>LOSS</span><strong>${loss}</strong></div><div class="result-kpi odds"><span>AVG ODDS</span><strong>${avgOdds}</strong></div></section>`;
}

async function loadJson(path){const res=await fetch(path,{cache:'no-store'});if(!res.ok) throw new Error(`HTTP ${res.status}`);return res.json();}

async function boot(){
  const predictionList=document.getElementById('predictionList');
  const resultList=document.getElementById('resultList');
  const input=document.getElementById('searchInput');
  let activeView='today',picks=[],results=[];
  try{
    const [predictionData,resultData]=await Promise.all([loadJson('data/predictions.json?v=20260828-team-logos-v1'),loadJson('data/results.json?v=20260828-daily-rotation-v1')]);
    picks=Array.isArray(predictionData.picks)?predictionData.picks:[];results=Array.isArray(resultData.results)?resultData.results:[];
    document.getElementById('pickCount').textContent=picks.length;document.getElementById('todayCount').textContent=picks.length;document.getElementById('yesterdayCount').textContent=results.length;
    predictionList.innerHTML=picks.map(card).join('')||'<div class="empty">No predictions available.</div>';
    resultList.innerHTML=results.length?(resultSummary(results)+results.map(resultCard).join('')):'<div class="empty">No previous results available.</div>';
  }catch(err){predictionList.innerHTML=`<div class="empty">Unable to load daily data: ${esc(err.message)}</div>`;resultList.innerHTML=`<div class="empty">Unable to load previous results: ${esc(err.message)}</div>`;}
  function applySearch(){const q=input.value.trim().toLowerCase();const root=activeView==='today'?predictionList:resultList;[...root.querySelectorAll('[data-search]')].forEach(el=>el.hidden=!!q&&!el.dataset.search.includes(q));}
  function setView(view){activeView=view;const today=view==='today';predictionList.hidden=!today;resultList.hidden=today;document.querySelectorAll('.day-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));document.getElementById('heroLabel').textContent=today?"TODAY'S PREDICTIONS":"YESTERDAY'S RESULTS";document.getElementById('pickCount').textContent=today?picks.length:results.length;document.getElementById('heroSmall').textContent=today?'qualified picks':'settled picks';document.getElementById('sectionEyebrow').textContent=today?"TODAY'S SELECTIONS":"PREVIOUS SLATE";document.getElementById('sectionTitle').textContent=today?'':"Yesterday's Results";input.placeholder=today?'team / league':'team / result';input.value='';applySearch();}
  document.querySelectorAll('.day-tab').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));input.addEventListener('input',applySearch);setView('today');
}

document.addEventListener('DOMContentLoaded',boot);
