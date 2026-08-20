const MATCHES = [
  {
    id:'198290122', state:'signal', minute:72, league:'USA · MLS', home:'Colorado Rapids', away:'LAFC', score:'1–1',
    da:'61–39', sot:'5–2', mom:78, delta:'+14', ah:'-0.50', odds:'1.91', conditions:'8 / 8',
    evidence:{attack:'122–75',danger:'61–39',shotOff:'12–7',shotOn:'5–2',corners:'7–4',poss:'56–44'},
    checks:[['Minute 55–80','PASS'],['Score difference ≤ 1','PASS'],['Dangerous attack','PASS'],['Shots on target','PASS'],['Momentum ≥ 70','PASS'],['Bet365 AH allowed','PASS'],['Odds 1.70–2.10','PASS'],['Fresh data','PASS']],
    trend:[18,22,27,31,36,41,45,52,58,63,70,78,84,89,95,101,108,114,121,128,134,140,145,149]
  },
  {
    id:'tc-near-01', state:'near', minute:66, league:'Finland · Ykkönen', home:'Home FC', away:'Away FC', score:'0–0',
    da:'47–28', sot:'4–1', mom:72, delta:'+9', ah:'-0.25', odds:'1.67', conditions:'7 / 8',
    evidence:{attack:'91–66',danger:'47–28',shotOff:'8–5',shotOn:'4–1',corners:'5–2',poss:'59–41'},
    checks:[['Minute 55–80','PASS'],['Score difference ≤ 1','PASS'],['Dangerous attack','PASS'],['Shots on target','PASS'],['Momentum ≥ 70','PASS'],['Bet365 AH allowed','PASS'],['Odds 1.70–2.10','WAIT'],['Fresh data','PASS']],
    trend:[14,17,20,24,29,31,34,39,42,48,53,58,61,66,70,74]
  },
  {
    id:'tc-watch-01', state:'watching', minute:59, league:'Japan · J League', home:'Blue United', away:'City SC', score:'1–0',
    da:'31–27', sot:'3–3', mom:61, delta:'+2', ah:'-0.25', odds:'1.84', conditions:'4 / 8',
    evidence:{attack:'71–68',danger:'31–27',shotOff:'6–6',shotOn:'3–3',corners:'4–4',poss:'51–49'},
    checks:[['Minute 55–80','PASS'],['Score difference ≤ 1','PASS'],['Dangerous attack','WAIT'],['Shots on target','WAIT'],['Momentum ≥ 70','WAIT'],['Bet365 AH allowed','PASS'],['Odds 1.70–2.10','PASS'],['Fresh data','PASS']],
    trend:[9,14,18,20,24,29,34,39,41,46,48,53,57,60]
  },
  {
    id:'tc-live-01', state:'live', minute:43, league:'Brazil · Serie B', home:'Athletic Club', away:'Nova City', score:'0–0',
    da:'19–18', sot:'2–1', mom:48, delta:'+1', ah:'0.00', odds:'1.88', conditions:'2 / 8',
    evidence:{attack:'48–46',danger:'19–18',shotOff:'4–3',shotOn:'2–1',corners:'2–2',poss:'50–50'},
    checks:[['Minute 55–80','WAIT'],['Score difference ≤ 1','PASS'],['Dangerous attack','WAIT'],['Shots on target','WAIT'],['Momentum ≥ 70','WAIT'],['Bet365 AH allowed','WAIT'],['Odds 1.70–2.10','PASS'],['Fresh data','PASS']],
    trend:[7,9,13,16,20,24,28,31,35,39,42,46]
  }
];

const priority = {signal:0, near:1, watching:2, live:3};
let activeFilter = 'all';
let query = '';

function esc(value=''){
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function stateText(state){
  return ({signal:'SIGNAL',near:'NEAR SIGNAL',watching:'WATCHING',live:'LIVE'})[state] || state.toUpperCase();
}

function trendSvg(values){
  const w=360,h=86,pad=6;
  const max=Math.max(...values), min=Math.min(...values);
  const span=Math.max(1,max-min);
  const pts=values.map((v,i)=>{
    const x=pad+(i/(values.length-1))*(w-pad*2);
    const y=h-pad-((v-min)/span)*(h-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Attack pressure trend"><polyline points="${pts}" fill="none" stroke="#74afe8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${pts.split(' ').at(-1).split(',')[0]}" cy="${pts.split(' ').at(-1).split(',')[1]}" r="4" fill="#f2d21b"/></svg>`;
}

function rowTemplate(m){
  const conditionClass = m.state==='signal' ? 'pass' : (m.state==='near' ? 'warn' : '');
  const checks = m.checks.map(([label,status])=>`<div class="check"><span>${esc(label)}</span><b class="${status==='PASS'?'ok':'no'}">${esc(status)}</b></div>`).join('');
  return `
  <article class="match-wrap" data-state="${esc(m.state)}" data-id="${esc(m.id)}">
    <button class="match-row" type="button" aria-expanded="false">
      <div class="statebox"><span class="state-label state-${esc(m.state)}">● ${esc(stateText(m.state))}</span><span class="minute">${esc(m.minute)}′</span></div>
      <div class="match-main"><span class="league">${esc(m.league)}</span><span class="teams">${esc(m.home)} — ${esc(m.away)}</span></div>
      <div class="score">${esc(m.score)}</div>
      <div class="quick-stats">
        <div class="qstat"><span>DA</span><b>${esc(m.da)}</b></div>
        <div class="qstat"><span>SOT</span><b>${esc(m.sot)}</b></div>
        <div class="qstat"><span>MOM</span><b>${esc(m.mom)}</b></div>
        <div class="qstat"><span>Δ5m</span><b>${esc(m.delta)}</b></div>
      </div>
      <div class="market"><span>BET365 · LIVE AH</span><strong>${esc(m.ah)} @ ${esc(m.odds)}</strong></div>
      <div class="condition"><span>CONDITIONS</span><strong class="${conditionClass}">${esc(m.conditions)}</strong></div>
    </button>
    <div class="match-detail">
      <div class="detail-grid">
        <section class="detail-card">
          <h3>LIVE PRESSURE · ATTACK TREND</h3>
          <div class="pressure"><div class="pressure-lines"><i></i><i></i><i></i></div>${trendSvg(m.trend)}<div class="axis"><span>earlier</span><span>now</span></div></div>
          <div class="legend"><span><b>Attack</b> movement from source history</span><span>Δ5m <b>${esc(m.delta)}</b></span></div>
        </section>
        <section class="detail-card">
          <h3>LIVE EVIDENCE</h3>
          <div class="evidence-grid">
            <div><span>ATTACK</span><b>${esc(m.evidence.attack)}</b></div>
            <div><span>DANGER</span><b>${esc(m.evidence.danger)}</b></div>
            <div><span>SHOT OFF</span><b>${esc(m.evidence.shotOff)}</b></div>
            <div><span>SHOT ON</span><b>${esc(m.evidence.shotOn)}</b></div>
            <div><span>CORNERS</span><b>${esc(m.evidence.corners)}</b></div>
            <div><span>POSSESSION</span><b>${esc(m.evidence.poss)}</b></div>
            <div><span>BET365 AH</span><b>${esc(m.ah)}</b></div>
            <div><span>ODDS</span><b>${esc(m.odds)}</b></div>
          </div>
        </section>
        <section class="detail-card">
          <h3>DETECTOR CHECK</h3>
          <div class="checks">${checks}</div>
        </section>
        <section class="detail-card">
          <h3>SOURCE / LOCK CONTRACT</h3>
          <div class="checks">
            <div class="check"><span>TotalCorner match id</span><b>${esc(m.id)}</b></div>
            <div class="check"><span>Stats source</span><b>TotalCorner</b></div>
            <div class="check"><span>Odds source</span><b>Bet365</b></div>
            <div class="check"><span>Mode</span><b>${m.state==='signal'?'LOCKED MOCK':'MONITOR MOCK'}</b></div>
          </div>
        </section>
      </div>
    </div>
  </article>`;
}

function filteredMatches(){
  return MATCHES
    .filter(m => activeFilter==='all' || m.state===activeFilter)
    .filter(m => !query || `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(query))
    .sort((a,b)=>priority[a.state]-priority[b.state] || b.minute-a.minute);
}

function render(){
  const list=document.getElementById('matchList');
  const rows=filteredMatches();
  list.innerHTML=rows.length ? rows.map(rowTemplate).join('') : '<div class="empty">No matches in this view.</div>';
  list.querySelectorAll('.match-row').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const wrap=btn.closest('.match-wrap');
      const willOpen=!wrap.classList.contains('open');
      list.querySelectorAll('.match-wrap.open').forEach(open=>{
        open.classList.remove('open');
        open.querySelector('.match-row')?.setAttribute('aria-expanded','false');
      });
      if(willOpen){wrap.classList.add('open');btn.setAttribute('aria-expanded','true');}
    });
  });
}

function updateMetrics(){
  document.getElementById('metricLive').textContent='126';
  document.getElementById('metricWatching').textContent=MATCHES.filter(x=>x.state==='watching').length;
  document.getElementById('metricNear').textContent=MATCHES.filter(x=>x.state==='near').length;
  document.getElementById('metricSignal').textContent=MATCHES.filter(x=>x.state==='signal').length;
}

document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  tab.classList.add('active');
  activeFilter=tab.dataset.filter;
  render();
}));

document.getElementById('searchInput').addEventListener('input',e=>{
  query=e.target.value.trim().toLowerCase();
  render();
});

updateMetrics();
render();

let age=3;
setInterval(()=>{
  age++;
  document.getElementById('dataAge').textContent=`${age}s`;
  if(age>15){document.getElementById('dataAge').style.color='#f2d21b';document.getElementById('lastUpdate').textContent='mock freshness warning';}
},1000);
