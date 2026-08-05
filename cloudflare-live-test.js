(()=>{
  'use strict';

  const WORKER='https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const LOCK_KEY='nomadtips3.live-engine-test.fixture.v1';
  const CARD_ID='cloudflareLiveTestCard';
  const TERMINAL=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO','PST']);
  const host=document.getElementById('matches');
  const palette=['#2563eb','#dc2626','#f59e0b','#16a34a','#7c3aed','#0891b2','#e11d48','#f97316','#4f46e5','#65a30d'];
  const statRows=[
    ['Attacks','attacks'],['Dangerous Attacks','dangerous_attacks'],['Expected Goals (xG)','expected_goals'],
    ['Ball Possession','possession'],['Total Shots','shots'],['Shots on Target','shots_on_target'],
    ['Shots off Target','shots_off_target'],['Blocked Shots','blocked_shots'],['Shots Inside Box','shots_inside_box'],
    ['Shots Outside Box','shots_outside_box'],['Corner Kicks','corners'],['Fouls','fouls'],['Offsides','offsides'],
    ['Goalkeeper Saves','goalkeeper_saves'],['Total Passes','total_passes'],['Accurate Passes','accurate_passes'],
    ['Pass Accuracy','pass_accuracy'],['Yellow Cards','yellow_cards'],['Red Cards','red_cards']
  ];
  let loading=false;
  let cachedStats={};
  let cachedEvents=[];

  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const shown=value=>value===null||value===undefined||value===''?'–':value;
  const number=value=>{const parsed=Number(String(value??'').replace('%',''));return Number.isFinite(parsed)?parsed:null};

  async function fetchJson(url,timeout=10000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return response.json();
    }finally{
      clearTimeout(timer);
    }
  }

  function readLock(){
    try{return JSON.parse(localStorage.getItem(LOCK_KEY)||'null')}catch{return null}
  }

  function writeLock(value){
    localStorage.setItem(LOCK_KEY,JSON.stringify(value));
  }

  function shirtColor(name,avoid=''){
    let hash=0;
    for(const char of String(name||''))hash=((hash<<5)-hash)+char.charCodeAt(0);
    let color=palette[Math.abs(hash)%palette.length];
    if(color===avoid)color=palette[(Math.abs(hash)+3)%palette.length];
    return color;
  }

  function statusInfo(status,elapsed){
    const current=String(status||'').toUpperCase();
    if(TERMINAL.has(current))return{label:'FT',minute:'FT',cls:'finished'};
    if(current==='HT')return{label:'HT',minute:'HT · 45′',cls:''};
    if(['NS','TBD',''].includes(current))return{label:'WAITING',minute:'WAITING',cls:'waiting'};
    const minute=Number(elapsed);
    const text=Number.isFinite(minute)?`LIVE ${minute}′`:'LIVE';
    return{label:text,minute:text,cls:''};
  }

  function cardMarkup(){
    return `<article id="${CARD_ID}" class="match-card" data-test-only="true">
      <header class="match-head"><span data-k="league">CLOUDFLARE · LIVE ENGINE TEST</span><b class="status waiting" data-k="status">LOADING</b></header>
      <section class="scoreboard">
        <div class="team"><i class="shirt" data-k="homeShirt"></i><strong data-k="home">Home</strong><small>HOME</small></div>
        <div class="scorebox"><span data-k="minute">—</span><b data-k="score">– : –</b><small data-k="kickoff">Loading</small></div>
        <div class="team"><i class="shirt" data-k="awayShirt"></i><strong data-k="away">Away</strong><small>AWAY</small></div>
      </section>
      <section class="latest"><i></i><div><small>LATEST EVENT</small><b data-k="latest">Waiting for API-FOOTBALL</b></div><strong data-k="latestMinute">—</strong></section>
      <nav class="tabs"><button class="active" type="button" data-tab="stats">Stats</button><button type="button" data-tab="timeline">Timeline</button></nav>
      <section class="panel active" data-panel="stats"><div data-k="stats" class="stat-list"><p class="empty">Loading statistics</p></div></section>
      <section class="panel" data-panel="timeline"><div data-k="events" class="event-list"><p class="empty">No events yet.</p></div></section>
      <section class="pick"><div><small>TEST MODE</small><b>NOT COUNTED</b></div><div><small>PROVIDER</small><b>API-FOOTBALL</b></div><div><small>ROUTE</small><b>CLOUDFLARE</b></div></section>
      <section class="markets"><div><small>MAIN PICKS</small><b>ISOLATED</b></div><div><small>STATISTICS</small><b>EXCLUDED</b></div><div><small>POSTER</small><b>EXCLUDED</b></div><div><small>REFRESH</small><b>25 SEC</b></div></section>
      <section class="reason"><small>CLOUDFLARE TEST NOTE</small><p>Temporary live fixture used only to verify LIVE → SCORE → FT. It is excluded from Match Predictions, Statistics and Analysis Poster.</p></section>
      <footer><span data-k="updated">Waiting for update</span><span>Cloudflare Worker · isolated test</span></footer>
    </article>`;
  }

  function ensureCard(){
    let card=document.getElementById(CARD_ID);
    if(card)return card;
    host?.querySelector('.empty-state')?.remove();
    host?.insertAdjacentHTML('afterbegin',cardMarkup());
    card=document.getElementById(CARD_ID);
    card?.querySelector('.tabs')?.addEventListener('click',event=>{
      const button=event.target.closest('button[data-tab]');
      if(!button)return;
      card.querySelectorAll('.tabs button').forEach(node=>node.classList.remove('active'));
      card.querySelectorAll('.panel').forEach(node=>node.classList.remove('active'));
      button.classList.add('active');
      card.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active');
    });
    return card;
  }

  function element(card,key){return card.querySelector(`[data-k="${key}"]`)}

  function statRow(label,home,away){
    if((home===null||home===undefined||home==='')&&(away===null||away===undefined||away===''))return'';
    const homeNumber=number(home),awayNumber=number(away);
    const total=homeNumber!==null&&awayNumber!==null&&homeNumber+awayNumber>0?homeNumber+awayNumber:null;
    const homePercent=total?Math.round(homeNumber/total*100):50;
    const awayPercent=total?Math.round(awayNumber/total*100):50;
    return `<div class="stat-row"><b>${esc(shown(home))}</b><div><small>${esc(label)}</small><span><i style="width:${homePercent}%"></i><i class="away" style="width:${awayPercent}%"></i></span></div><b>${esc(shown(away))}</b></div>`;
  }

  function normalizeFixturePayload(payload){
    const fixture=payload?.result;
    if(!fixture)return null;
    return {
      fetched_at_utc:payload.generatedAt||new Date().toISOString(),
      match:{
        id:String(fixture.fixtureId),
        league:fixture.league?.name||'Live Football',
        country:fixture.league?.country||'World',
        home:{name:fixture.home?.name||'Home'},
        away:{name:fixture.away?.name||'Away'},
        kickoff_utc:fixture.kickoffUtc,
        status:fixture.status,
        status_long:fixture.statusLong,
        elapsed:fixture.elapsed,
        score:{home:fixture.homeScore,away:fixture.awayScore},
        stats:cachedStats,
        events:cachedEvents
      }
    };
  }

  function render(data){
    const match=data?.match;
    if(!match)return;
    const card=ensureCard();
    const status=statusInfo(match.status,match.elapsed);
    const home=match.home?.name||'Home';
    const away=match.away?.name||'Away';
    const homeColor=shirtColor(home);
    const awayColor=shirtColor(away,homeColor);

    element(card,'league').textContent=`CLOUDFLARE TEST · ${[match.country,match.league].filter(Boolean).join(' · ')}`;
    element(card,'status').textContent=status.label;
    element(card,'status').className=`status ${status.cls}`;
    element(card,'minute').textContent=status.minute;
    element(card,'home').textContent=home;
    element(card,'away').textContent=away;
    element(card,'homeShirt').style.setProperty('--shirt',homeColor);
    element(card,'awayShirt').style.setProperty('--shirt',awayColor);
    element(card,'score').textContent=`${shown(match.score?.home)} : ${shown(match.score?.away)}`;
    if(match.kickoff_utc)element(card,'kickoff').textContent=new Date(match.kickoff_utc).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});

    const statistics=match.stats||cachedStats||{};
    const statisticsHtml=statRows.map(([label,key])=>statRow(label,statistics[key]?.home,statistics[key]?.away)).filter(Boolean).join('');
    element(card,'stats').innerHTML=statisticsHtml||'<p class="empty">Basic score and status test active. Detailed statistics may not be supplied for this fixture.</p>';

    const events=Array.isArray(match.events)?[...match.events]:cachedEvents;
    const sortedEvents=events.sort((a,b)=>(Number(b.minute)||0)-(Number(a.minute)||0));
    element(card,'events').innerHTML=sortedEvents.length?sortedEvents.slice(0,24).map(event=>`<div class="event"><b>${esc(event.minute??'–')}′</b><div><strong>${esc([event.type,event.team].filter(Boolean).join(' — '))}</strong><small>${esc([event.detail,event.player].filter(Boolean).join(' · '))}</small></div></div>`).join(''):'<p class="empty">No events supplied yet.</p>';
    const latest=sortedEvents[0];
    element(card,'latest').textContent=latest?[latest.team,latest.type,latest.detail].filter(Boolean).join(' · '):'Cloudflare Worker connection active';
    element(card,'latestMinute').textContent=latest?`${latest.minute??'—'}′':'—';
    element(card,'updated').textContent=`Updated ${new Date(data.fetched_at_utc||Date.now()).toLocaleString()}`;

    const count=document.getElementById('matchCount');
    if(count)count.textContent='LIVE ENGINE TEST · 1 MATCH · NOT COUNTED';
  }

  async function load(){
    if(loading||document.hidden)return;
    loading=true;
    try{
      const lock=readLock();
      if(lock?.completedAt){
        const age=Date.now()-Number(lock.completedAt);
        if(age>120000){document.getElementById(CARD_ID)?.remove();return;}
      }

      let data;
      if(lock?.fixtureId){
        const payload=await fetchJson(`${WORKER}/fixture?id=${encodeURIComponent(lock.fixtureId)}&t=${Date.now()}`);
        data=normalizeFixturePayload(payload);
      }else{
        data=await fetchJson(`${WORKER}/live-test?t=${Date.now()}`);
        if(!data?.match){document.getElementById(CARD_ID)?.remove();return;}
        cachedStats=data.match.stats||{};
        cachedEvents=Array.isArray(data.match.events)?data.match.events:[];
        writeLock({fixtureId:String(data.match.id),startedAt:Date.now(),completedAt:null});
      }

      if(!data?.match)return;
      render(data);

      if(TERMINAL.has(String(data.match.status||'').toUpperCase())){
        const current=readLock()||{};
        if(!current.completedAt)writeLock({...current,completedAt:Date.now()});
      }
    }catch(error){
      const card=ensureCard();
      element(card,'status').textContent='RETRYING';
      element(card,'status').className='status error';
      element(card,'updated').textContent=String(error?.message||error);
    }finally{
      loading=false;
    }
  }

  load();
  setInterval(load,25000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
})();
