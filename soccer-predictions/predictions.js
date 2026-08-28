const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0);

function model(p){
  const seed=Math.abs(hash(p.id));
  const awayPick=p.pick.toLowerCase().startsWith(p.away.toLowerCase());
  const chosen=clamp(Math.round(p.confidence),40,64);
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
  return {awayPick,probs,metrics,homeForm,awayForm,h2h,stats};
}

function formPills(arr){return arr.map(x=>`<span class="form-pill ${x.toLowerCase()}">${x}</span>`).join('')}
function statCell(label,val){return `<div class="stat"><span>${label}</span><strong>${val}</strong></div>`}

function card(p){
  const m=model(p); const {home,draw,away}=m.probs;
  const conic=`conic-gradient(var(--green) 0 ${home}%, #8a8f89 ${home}% ${home+draw}%, var(--blue) ${home+draw}% 100%)`;
  const bars=m.metrics.map(x=>`<div class="compare-row"><div class="compare-label">${esc(x.label)}</div><div class="bar-wrap"><span class="bar-num">${x.home}%</span><div class="bar"><span class="bar-home" style="width:${x.home}%"></span><span class="bar-away" style="width:${x.away}%"></span></div><span class="bar-num">${x.away}%</span></div></div>`).join('');
  return `<article class="prediction-card ${p.featured?'featured':''}" data-search="${esc((p.home+' '+p.away+' '+p.league).toLowerCase())}">
    <div class="card-head">
      <div>
        <div class="league-line"><span>${esc(p.league)}</span><span>•</span><span>${esc(p.kickoff)}</span><span class="badge">${esc(p.abc)}</span></div>
        <div class="match-title"><div class="team">${esc(p.home)}</div><div class="vs">VS</div><div class="team away">${esc(p.away)}</div></div>
      </div>
      <div class="pick-box">
        <div class="pick-main"><span>THE KING PICK</span><strong>${esc(p.pick)}</strong></div>
        <div class="pick-stat"><span>ODDS</span><strong>${Number(p.odds).toFixed(2)}</strong></div>
        <div class="pick-stat conf"><span>CONFIDENCE</span><strong>${Number(p.confidence).toFixed(2)}%</strong></div>
      </div>
    </div>

    <div class="card-grid">
      <section class="panel">
        <div class="panel-title"><h3>TEAM COMPARISON</h3><span class="demo-tag">PREVIEW METRICS</span></div>
        <div class="comparison-list">${bars}</div>
        <div class="stats-grid">
          ${statCell('HOME GF',m.stats.home.gf)}${statCell('HOME GA',m.stats.home.ga)}${statCell('HOME CORNERS',m.stats.home.corners)}${statCell('HOME POS',m.stats.home.pos)}${statCell('HOME SOT',m.stats.home.sot)}
          ${statCell('AWAY GF',m.stats.away.gf)}${statCell('AWAY GA',m.stats.away.ga)}${statCell('AWAY CORNERS',m.stats.away.corners)}${statCell('AWAY POS',m.stats.away.pos)}${statCell('AWAY SOT',m.stats.away.sot)}
        </div>
      </section>

      <div class="right-stack">
        <section class="panel">
          <div class="panel-title"><h3>WIN PROBABILITY</h3><span class="demo-tag">PREVIEW</span></div>
          <div class="prob-layout"><div class="donut" style="background:${conic}"><strong>${Math.max(home,away)}%</strong><small>TOP SIDE</small></div><div class="legend">
            <div class="legend-row"><span>Home Win</span><strong>${home}%</strong></div>
            <div class="legend-row"><span>Draw</span><strong>${draw}%</strong></div>
            <div class="legend-row"><span>Away Win</span><strong>${away}%</strong></div>
          </div></div>
        </section>
        <div class="mini-grid">
          <section class="mini-card"><h4>RECENT FORM · LAST 5</h4><div class="form-row">${formPills(m.homeForm)}</div><div class="form-row" style="margin-top:6px">${formPills(m.awayForm)}</div></section>
          <section class="mini-card"><h4>H2H · LAST 5</h4><div class="h2h"><span>${esc(p.home)}</span><strong>${m.h2h.home}</strong><span>Draw</span><strong>${m.h2h.draw}</strong><span>${esc(p.away)}</span><strong>${m.h2h.away}</strong></div></section>
        </div>
      </div>
    </div>

    <div class="analysis"><strong>ANALYSIS · </strong>${esc(p.pick)} passes the current THE KING manual screen at ${Number(p.confidence).toFixed(2)}% confidence with locked odds ${Number(p.odds).toFixed(2)}. The detailed attack, shooting, recent-form and H2H values above are layout-preview values; production will replace them with fields approved in WEB_PREDICTIONS before publishing.</div>
    <div class="source-line"><span>No live-score feed · manual pre-match card</span><a href="${esc(p.source)}" target="_blank" rel="noopener">Source reference</a></div>
  </article>`;
}

async function boot(){
  const list=document.getElementById('predictionList');
  try{
    const res=await fetch('data/predictions.json?v=20260828-preview-v1',{cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const picks=Array.isArray(data.picks)?data.picks:[];
    document.getElementById('pickCount').textContent=picks.length;
    list.innerHTML=picks.map(card).join('')||'<div class="empty">No picks available.</div>';
    const input=document.getElementById('searchInput');
    input.addEventListener('input',()=>{
      const q=input.value.trim().toLowerCase();
      [...list.querySelectorAll('.prediction-card')].forEach(el=>el.hidden=q&&!el.dataset.search.includes(q));
    });
  }catch(err){
    list.innerHTML=`<div class="empty">Unable to load prediction data: ${esc(err.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded',boot);
