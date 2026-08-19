(()=>{
  const FALLBACK_WORKER='https://nomadtips3-car-livescore.mccarey-supon.workers.dev';
  const body=document.body;
  const view=body.dataset.view||'live';
  const expanded=new Set();
  let payload=null;
  let workerUrl=FALLBACK_WORKER;
  let refreshSeconds=20;
  let filter='all';
  let timer=null;

  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:null;};
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));

  function formatClock(value){
    if(!value)return'—';
    try{return new Intl.DateTimeFormat([], {hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
    catch{return'—';}
  }

  function formatDate(value=new Date()){
    try{return new Intl.DateTimeFormat([], {day:'2-digit',month:'short',year:'numeric'}).format(value instanceof Date?value:new Date(value));}
    catch{return'Today';}
  }

  function ageText(value){
    const stamp=Date.parse(value||'');
    if(!Number.isFinite(stamp))return'Updated —';
    const seconds=Math.max(0,Math.floor((Date.now()-stamp)/1000));
    if(seconds<5)return'Updated just now';
    if(seconds<60)return`Updated ${seconds}s ago`;
    return`Updated ${Math.floor(seconds/60)}m ago`;
  }

  function stateLabel(match){
    if(match.status==='LIVE')return match.minute?`${Math.max(1,Math.round(match.minute))}'`:'LIVE';
    if(match.status==='HT')return'HT';
    if(match.status==='FT')return'FT';
    if(match.status==='UPCOMING')return formatClock(match.kickoffUtc);
    return match.status||'—';
  }

  function stateClass(match){
    if(match.status==='LIVE')return'live';
    if(match.status==='HT')return'ht';
    if(match.status==='FT')return'ft';
    return'upcoming';
  }

  function miniCards(match,side){
    const yellow=num(match?.cards?.yellow?.[side])||0;
    const red=num(match?.cards?.red?.[side])||0;
    let html='';
    if(yellow>0)html+=`<span class="card-dot" title="Yellow cards">${yellow}</span>`;
    if(red>0)html+=`<span class="card-dot red" title="Red cards">${red}</span>`;
    return html?`<span class="card-mini">${html}</span>`:'';
  }

  function metric(match,key,label,suffix=''){
    const home=num(match?.stats?.[key]?.home);
    const away=num(match?.stats?.[key]?.away);
    if(home===null||away===null)return'';

    let homeWidth=0,awayWidth=0;
    if(key==='possession'){
      const total=Math.max(1,home+away);
      homeWidth=clamp(home/total*100);
      awayWidth=clamp(away/total*100);
    }else{
      const max=Math.max(1,home,away);
      homeWidth=clamp(home/max*100);
      awayWidth=clamp(away/max*100);
    }

    return `<div class="stat-card">
      <div class="stat-head"><strong>${esc(home)}${suffix}</strong><span>${esc(label)}</span><strong>${esc(away)}${suffix}</strong></div>
      <div class="dual-track">
        <div class="track home"><div class="fill" style="width:${homeWidth.toFixed(1)}%"></div></div>
        <div class="track away"><div class="fill" style="width:${awayWidth.toFixed(1)}%"></div></div>
      </div>
    </div>`;
  }

  function details(match){
    const metrics=[
      metric(match,'possession','Possession','%'),
      metric(match,'attacks','Attacks'),
      metric(match,'dangerous_attacks','Dangerous attacks'),
      metric(match,'shots','Shots'),
      metric(match,'shots_on_target','On target'),
      metric(match,'corners','Corners')
    ].filter(Boolean);

    const redHome=num(match?.cards?.red?.home)||0;
    const redAway=num(match?.cards?.red?.away)||0;
    const yellowHome=num(match?.cards?.yellow?.home)||0;
    const yellowAway=num(match?.cards?.yellow?.away)||0;

    return `<div class="match-details"><div class="detail-shell">
      <div class="detail-title"><strong>Match statistics</strong><span>${metrics.length?'Live comparison':'Waiting for detailed statistics'}</span></div>
      <div class="stats-grid">${metrics.join('')||'<div class="stat-card unavailable">Detailed match statistics are not available yet.</div>'}</div>
      <div class="match-footer">
        <span class="info-pill">Yellow cards ${yellowHome}–${yellowAway}</span>
        <span class="info-pill ${redHome||redAway?'red':''}">Red cards ${redHome}–${redAway}</span>
        <span class="info-pill">Kickoff ${esc(formatClock(match.kickoffUtc))}</span>
      </div>
    </div></div>`;
  }

  function matchRow(match){
    const id=String(match.id||'');
    const isExpanded=expanded.has(id);
    const liveish=match.status==='LIVE'||match.status==='HT';
    return `<article class="match ${isExpanded?'expanded':''}" data-match-id="${esc(id)}">
      <button class="match-toggle" type="button" aria-expanded="${isExpanded?'true':'false'}">
        <div class="match-state ${stateClass(match)}">${esc(stateLabel(match))}</div>
        <div class="match-teams">
          <div class="team-line"><span class="team-name">${esc(match.home||'Home')}</span>${miniCards(match,'home')}</div>
          <div class="team-line"><span class="team-name">${esc(match.away||'Away')}</span>${miniCards(match,'away')}</div>
        </div>
        <div class="score ${liveish?'live':''}">${esc(match?.score?.home??'—')}<br>${esc(match?.score?.away??'—')}</div>
        <div class="chevron">⌄</div>
      </button>
      ${details(match)}
    </article>`;
  }

  function groupMatches(matches){
    const map=new Map();
    for(const match of matches){
      const league=String(match.league||'Football');
      if(!map.has(league))map.set(league,[]);
      map.get(league).push(match);
    }
    return [...map.entries()];
  }

  function filteredMatches(){
    const matches=Array.isArray(payload?.matches)?payload.matches:[];
    if(view==='results')return matches.filter(match=>match.status==='FT');
    if(filter==='live')return matches.filter(match=>match.status==='LIVE'||match.status==='HT');
    if(filter==='upcoming')return matches.filter(match=>match.status==='UPCOMING');
    if(filter==='finished')return matches.filter(match=>match.status==='FT');
    return matches;
  }

  function render(){
    const scoreboard=$('#scoreboard');
    if(!scoreboard)return;
    const matches=filteredMatches();
    if(!matches.length){
      const text=view==='results'?'No completed matches are available in the current feed.':filter==='live'?'No matches are live right now.':'No matches are available for this view.';
      scoreboard.innerHTML=`<div class="empty-card">${esc(text)}</div>`;
      return;
    }

    scoreboard.innerHTML=groupMatches(matches).map(([league,items])=>`<section class="league">
      <header class="league-head"><div class="league-name"><span class="league-mark"></span><strong>${esc(league)}</strong></div><small>${items.length} ${items.length===1?'match':'matches'}</small></header>
      <div>${items.map(matchRow).join('')}</div>
    </section>`).join('');
  }

  function renderSummary(){
    const s=payload?.summary||{};
    const pairs=[
      ['liveCount',s.live],['totalCount',s.total],['leagueCount',s.leagues],['finishedCount',s.finished]
    ];
    pairs.forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value??'—';});
    const today=$('#todayLabel');if(today)today.textContent=formatDate(new Date());
    const fresh=$('#freshness');if(fresh)fresh.textContent=ageText(payload?.generatedAt);
  }

  function setError(message=''){
    const box=$('#pageError');
    if(!box)return;
    box.textContent=message;
    box.hidden=!message;
  }

  function setOnline(online){
    body.classList.toggle('offline',!online);
    const status=$('#headerStatus');
    if(status)status.textContent=online?'Live data':'Feed unavailable';
  }

  async function load(){
    try{
      const response=await fetch(`${workerUrl}/scores`,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const next=await response.json();
      if(!next?.ok)throw new Error(next?.error||'Feed unavailable');
      payload=next;
      setError(next?.sourceHealth?.index==='EMPTY'?'The live source returned no fixtures for this cycle.':'');
      setOnline(true);
      renderSummary();
      render();
    }catch(error){
      setOnline(false);
      setError(`Live score feed is temporarily unavailable. ${error.message||error}`);
      const fresh=$('#freshness');if(fresh)fresh.textContent='Update delayed';
      if(!payload){const board=$('#scoreboard');if(board)board.innerHTML='<div class="empty-card">Waiting for the live score service to recover.</div>';}
    }
  }

  function bind(){
    $('#filters')?.addEventListener('click',event=>{
      const button=event.target.closest('button[data-filter]');
      if(!button)return;
      filter=button.dataset.filter||'all';
      document.querySelectorAll('#filters button').forEach(el=>el.classList.toggle('active',el===button));
      render();
    });

    $('#scoreboard')?.addEventListener('click',event=>{
      const toggle=event.target.closest('.match-toggle');
      if(!toggle)return;
      const match=toggle.closest('.match');
      const id=String(match?.dataset.matchId||'');
      if(!id)return;
      if(expanded.has(id))expanded.delete(id);else expanded.add(id);
      match.classList.toggle('expanded',expanded.has(id));
      toggle.setAttribute('aria-expanded',expanded.has(id)?'true':'false');
    });
  }

  async function boot(){
    try{
      const runtime=await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());
      workerUrl=runtime.workerUrl||workerUrl;
      refreshSeconds=Math.max(10,Number(runtime.refreshSeconds)||20);
    }catch{}
    bind();
    await load();
    clearInterval(timer);
    timer=setInterval(load,refreshSeconds*1000);
    setInterval(()=>{const fresh=$('#freshness');if(fresh&&payload)fresh.textContent=ageText(payload.generatedAt);},1000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
