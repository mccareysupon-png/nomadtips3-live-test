(()=>{
  'use strict';

  const WORKER='https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const LOCK_KEY='nomadtips3.live-engine-test.fixture.v1';
  const CARD_ID='cloudflareLiveTestCard';
  const TARGET_MATCHES=3;
  const SWITCH_DELAY_MS=20000;
  const FINAL_DISPLAY_MS=120000;
  const TERMINAL=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO','PST']);
  const host=document.getElementById('matches');
  const palette=['#2563eb','#dc2626','#f59e0b','#16a34a','#7c3aed','#0891b2','#e11d48','#f97316'];
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
  const numeric=value=>{const parsed=Number(String(value??'').replace('%',''));return Number.isFinite(parsed)?parsed:null};

  async function fetchJson(url){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }finally{
      clearTimeout(timer);
    }
  }

  function normalizeSession(raw){
    const source=raw&&typeof raw==='object'?raw:{};
    let fixtureId=source.fixtureId?String(source.fixtureId):null;
    const completedIds=[...new Set((Array.isArray(source.completedIds)?source.completedIds:[]).map(String))];
    let completedAt=Number(source.completedAt)||null;

    // Migrate the original one-match test after it has already finished.
    if(completedAt&&fixtureId&&!completedIds.includes(fixtureId)){
      completedIds.push(fixtureId);
      fixtureId=null;
      completedAt=null;
    }

    if(completedIds.length<TARGET_MATCHES)completedAt=null;
    return {
      version:2,
      targetTotal:TARGET_MATCHES,
      fixtureId,
      startedAt:Number(source.startedAt)||null,
      completedIds:completedIds.slice(0,TARGET_MATCHES),
      transitionAt:Number(source.transitionAt)||null,
      completedAt
    };
  }

  function readSession(){
    try{return normalizeSession(JSON.parse(localStorage.getItem(LOCK_KEY)||'null'))}
    catch{return normalizeSession(null)}
  }

  function writeSession(value){localStorage.setItem(LOCK_KEY,JSON.stringify(normalizeSession(value)))}

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

  function markup(){
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
      <section class="reason"><small>CLOUDFLARE TEST NOTE</small><p data-k="reason">Temporary live fixture used only to verify LIVE → SCORE → FT. It is excluded from Match Predictions, Statistics and Analysis Poster.</p></section>
      <footer><span data-k="updated">Waiting for update</span><span>Cloudflare Worker · isolated test</span></footer>
    </article>`;
  }

  function ensureCard(){
    let card=document.getElementById(CARD_ID);
    if(card)return card;
    host?.querySelector('.empty-state')?.remove();
    host?.insertAdjacentHTML('afterbegin',markup());
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

  const field=(card,key)=>card.querySelector(`[data-k="${key}"]`);

  function statRow(label,home,away){
    if((home===null||home===undefined||home==='')&&(away===null||away===undefined||away===''))return'';
    const h=numeric(home),a=numeric(away),total=h!==null&&a!==null&&h+a>0?h+a:null;
    const hp=total?Math.round(h/total*100):50;
    const ap=total?Math.round(a/total*100):50;
    return `<div class="stat-row"><b>${esc(shown(home))}</b><div><small>${esc(label)}</small><span><i style="width:${hp}%"></i><i class="away" style="width:${ap}%"></i></span></div><b>${esc(shown(away))}</b></div>`;
  }

  function fromFixture(payload){
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

  function updateProgress(session,waiting=false){
    const count=document.getElementById('matchCount');
    if(!count)return;
    const completed=session.completedIds.length;
    if(completed>=TARGET_MATCHES){
      count.textContent=`LIVE ENGINE TEST · ${TARGET_MATCHES}/${TARGET_MATCHES} COMPLETE`;
      return;
    }
    const current=Math.min(TARGET_MATCHES,completed+1);
    count.textContent=waiting
      ?`LIVE ENGINE TEST · WAITING ${current}/${TARGET_MATCHES}`
      :`LIVE ENGINE TEST · MATCH ${current}/${TARGET_MATCHES} · NOT COUNTED`;
  }

  function showWaiting(session,message='Searching for the next live fixture'){
    const card=ensureCard();
    field(card,'league').textContent='CLOUDFLARE · LIVE ENGINE TEST';
    field(card,'status').textContent='WAITING';
    field(card,'status').className='status waiting';
    field(card,'minute').textContent='WAITING';
    field(card,'home').textContent='Next';
    field(card,'away').textContent='Live Match';
    field(card,'score').textContent='– : –';
    field(card,'kickoff').textContent='Automatic queue active';
    field(card,'latest').textContent=message;
    field(card,'latestMinute').textContent='—';
    field(card,'stats').innerHTML='<p class="empty">The system will continue automatically when another live fixture is available.</p>';
    field(card,'events').innerHTML='<p class="empty">Waiting for the next test match.</p>';
    field(card,'reason').textContent=`Continuous test queue: ${session.completedIds.length} of ${TARGET_MATCHES} matches completed. No result is added to official statistics.`;
    field(card,'updated').textContent=`Checked ${new Date().toLocaleString()}`;
    updateProgress(session,true);
  }

  function render(data,session){
    const match=data?.match;
    if(!match)return;
    const card=ensureCard();
    const status=statusInfo(match.status,match.elapsed);
    const home=match.home?.name||'Home';
    const away=match.away?.name||'Away';
    const homeColor=shirtColor(home);
    const awayColor=shirtColor(away,homeColor);

    field(card,'league').textContent=`CLOUDFLARE TEST · ${[match.country,match.league].filter(Boolean).join(' · ')}`;
    field(card,'status').textContent=status.label;
    field(card,'status').className=`status ${status.cls}`;
    field(card,'minute').textContent=status.minute;
    field(card,'home').textContent=home;
    field(card,'away').textContent=away;
    field(card,'homeShirt').style.setProperty('--shirt',homeColor);
    field(card,'awayShirt').style.setProperty('--shirt',awayColor);
    field(card,'score').textContent=`${shown(match.score?.home)} : ${shown(match.score?.away)}`;
    if(match.kickoff_utc)field(card,'kickoff').textContent=new Date(match.kickoff_utc).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});

    const statistics=match.stats||cachedStats||{};
    const statisticsHtml=statRows.map(([label,key])=>statRow(label,statistics[key]?.home,statistics[key]?.away)).filter(Boolean).join('');
    field(card,'stats').innerHTML=statisticsHtml||'<p class="empty">Basic score and status test active. Detailed statistics may not be supplied for this fixture.</p>';

    const events=Array.isArray(match.events)?[...match.events]:cachedEvents;
    const sortedEvents=events.sort((a,b)=>(Number(b.minute)||0)-(Number(a.minute)||0));
    field(card,'events').innerHTML=sortedEvents.length?sortedEvents.slice(0,24).map(event=>`<div class="event"><b>${esc(event.minute??'–')}′</b><div><strong>${esc([event.type,event.team].filter(Boolean).join(' — '))}</strong><small>${esc([event.detail,event.player].filter(Boolean).join(' · '))}</small></div></div>`).join(''):'<p class="empty">No events supplied yet.</p>';
    const latest=sortedEvents[0];
    field(card,'latest').textContent=latest?[latest.team,latest.type,latest.detail].filter(Boolean).join(' · '):'Cloudflare Worker connection active';
    field(card,'latestMinute').textContent=latest?`${latest.minute??'—'}′`:'—';
    field(card,'reason').textContent=`Continuous Cloudflare test match ${Math.min(TARGET_MATCHES,session.completedIds.length+1)} of ${TARGET_MATCHES}. This card remains excluded from all official records.`;
    field(card,'updated').textContent=`Updated ${new Date(data.fetched_at_utc||Date.now()).toLocaleString()}`;
    updateProgress(session,false);
  }

  async function load(){
    if(loading||document.hidden)return;
    loading=true;
    try{
      let session=readSession();

      if(session.completedIds.length>=TARGET_MATCHES){
        if(!session.completedAt){session.completedAt=Date.now();writeSession(session)}
        updateProgress(session,false);
        if(Date.now()-session.completedAt>FINAL_DISPLAY_MS)document.getElementById(CARD_ID)?.remove();
        return;
      }

      if(session.transitionAt){
        if(Date.now()<session.transitionAt){updateProgress(session,false);return}
        session={...session,fixtureId:null,startedAt:null,transitionAt:null};
        cachedStats={};
        cachedEvents=[];
        writeSession(session);
      }

      let data;
      if(session.fixtureId){
        data=fromFixture(await fetchJson(`${WORKER}/fixture?id=${encodeURIComponent(session.fixtureId)}&t=${Date.now()}`));
      }else{
        data=await fetchJson(`${WORKER}/live-test?t=${Date.now()}`);
        if(!data?.match){showWaiting(session);return}

        const candidateId=String(data.match.id);
        if(session.completedIds.includes(candidateId)){
          showWaiting(session,'Waiting for API-FOOTBALL to release the completed fixture');
          return;
        }

        cachedStats=data.match.stats||{};
        cachedEvents=Array.isArray(data.match.events)?data.match.events:[];
        session={...session,fixtureId:candidateId,startedAt:Date.now(),transitionAt:null};
        writeSession(session);
      }

      if(!data?.match){showWaiting(session);return}
      render(data,session);

      if(TERMINAL.has(String(data.match.status||'').toUpperCase())){
        const fixtureId=String(data.match.id||session.fixtureId||'');
        const completedIds=[...new Set([...session.completedIds,fixtureId].filter(Boolean))].slice(0,TARGET_MATCHES);
        const complete=completedIds.length>=TARGET_MATCHES;
        session={
          ...session,
          completedIds,
          transitionAt:complete?null:Date.now()+SWITCH_DELAY_MS,
          completedAt:complete?Date.now():null
        };
        writeSession(session);
        updateProgress(session,false);
      }
    }catch(error){
      const session=readSession();
      const card=ensureCard();
      field(card,'status').textContent='RETRYING';
      field(card,'status').className='status error';
      field(card,'updated').textContent=String(error?.message||error);
      updateProgress(session,true);
    }finally{
      loading=false;
    }
  }

  load();
  setInterval(load,25000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
})();
