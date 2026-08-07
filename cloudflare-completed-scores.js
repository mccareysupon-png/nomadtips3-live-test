(()=>{
  'use strict';

  const WORKER='https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const LOCK_KEY='nomadtips3.live-engine-test.fixture.v1';
  const LIVE_CARD_ID='cloudflareLiveTestCard';
  const host=document.getElementById('matches');
  let loading=false;

  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const shown=value=>value===null||value===undefined||value===''?'–':value;

  function readCompletedIds(){
    try{
      const state=JSON.parse(localStorage.getItem(LOCK_KEY)||'null');
      return [...new Set((Array.isArray(state?.completedIds)?state.completedIds:[]).map(String).filter(Boolean))];
    }catch{
      return [];
    }
  }

  async function fetchFixture(id){
    const response=await fetch(`${WORKER}/fixture?id=${encodeURIComponent(id)}&t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    return payload?.result||null;
  }

  function cardId(id){
    return `cloudflareCompleted-${String(id).replace(/[^a-z0-9_-]+/gi,'-')}`;
  }

  function markup(fixture){
    const id=String(fixture.fixtureId||fixture.id||'match');
    const league=[fixture.league?.country,fixture.league?.name].filter(Boolean).join(' · ')||'LIVE ENGINE TEST';
    const home=fixture.home?.name||'Home';
    const away=fixture.away?.name||'Away';
    const status=String(fixture.status||'FT').toUpperCase();
    const finished=['FT','AET','PEN'].includes(status);
    const label=finished?'FT':status;
    return `<article id="${esc(cardId(id))}" class="match-card cloudflare-completed-card" data-cloudflare-completed="${esc(id)}">
      <header class="match-head"><span>CLOUDFLARE TEST RESULT · ${esc(league)}</span><b class="status finished">${esc(label)}</b></header>
      <section class="scoreboard">
        <div class="team"><i class="shirt"></i><strong>${esc(home)}</strong><small>HOME</small></div>
        <div class="scorebox"><span>${esc(label)}</span><b>${esc(shown(fixture.homeScore))} : ${esc(shown(fixture.awayScore))}</b><small>Completed test match</small></div>
        <div class="team"><i class="shirt"></i><strong>${esc(away)}</strong><small>AWAY</small></div>
      </section>
      <section class="latest"><i></i><div><small>LIVE ENGINE TEST</small><b>Final score retained on Page 4</b></div><strong>${esc(label)}</strong></section>
      <section class="reason"><small>TEST HISTORY</small><p>This completed Cloudflare test match stays visible while the next test fixture continues. It is not counted in official NOMAD statistics.</p></section>
      <footer><span>Cloudflare Worker · completed test</span><span>NOT COUNTED</span></footer>
    </article>`;
  }

  async function syncCompletedScores(){
    if(loading||document.hidden||!host)return;
    loading=true;
    try{
      const ids=readCompletedIds();
      const wanted=new Set(ids);
      host.querySelectorAll('.cloudflare-completed-card').forEach(card=>{
        if(!wanted.has(String(card.dataset.cloudflareCompleted||'')))card.remove();
      });

      let anchor=document.getElementById(LIVE_CARD_ID);
      for(const id of ids){
        const existing=document.getElementById(cardId(id));
        if(existing){anchor=existing;continue;}
        const fixture=await fetchFixture(id);
        if(!fixture)continue;
        const html=markup(fixture);
        if(anchor){
          anchor.insertAdjacentHTML('afterend',html);
          anchor=document.getElementById(cardId(id));
        }else{
          host.insertAdjacentHTML('afterbegin',html);
          anchor=document.getElementById(cardId(id));
        }
      }
    }catch(error){
      console.error('Completed Cloudflare score sync failed',error);
    }finally{
      loading=false;
    }
  }

  syncCompletedScores();
  setInterval(syncCompletedScores,15000);
  window.addEventListener('storage',event=>{if(event.key===LOCK_KEY)syncCompletedScores()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCompletedScores()});
})();
