(()=>{
  'use strict';

  const RAW='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/';
  const TERMINAL=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO','PST','NOT_CONFIRMED']);
  const host=document.getElementById('matches');
  let loading=false;
  let selectionDate=null;

  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const shown=value=>value===null||value===undefined||value===''?'–':value;

  async function fetchJson(name){
    const response=await fetch(`${RAW}${name}?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function finalId(slug){
    return `officialFinal-${String(slug||'match').replace(/[^a-z0-9_-]+/gi,'-')}`;
  }

  function patchExisting(card,result){
    const set=(key,value)=>{const node=card.querySelector(`[data-k="${key}"]`);if(node)node.textContent=value};
    const status=String(result.status||result.providerStatus||'FT').toUpperCase();
    const statusNode=card.querySelector('[data-k="status"]');
    if(statusNode){statusNode.textContent=status==='NOT_CONFIRMED'?'CHECK':'FT';statusNode.className='status finished'}
    set('minute',status==='NOT_CONFIRMED'?'CHECK':'FT');
    set('home',result.home||'Home');
    set('away',result.away||'Away');
    set('score',`${shown(result.homeScore)} : ${shown(result.awayScore)}`);
    set('latest',result.resultConfirmed?'Official final score confirmed':'Final result awaiting confirmation');
    set('latestMinute',status==='NOT_CONFIRMED'?'CHECK':'FT');
    set('updated',result.updatedAt?`Final updated ${new Date(result.updatedAt).toLocaleString()}`:'Final score');
    card.dataset.finalScore='true';
  }

  function resultLabel(value){
    const text=String(value||'pending').toUpperCase();
    return text==='CORRECT'?'WIN':text==='INCORRECT'?'LOSS':text;
  }

  function markup(result,selected){
    const mainOutcome=resultLabel(result.outcome);
    const markets=result.markets||{};
    return `<article id="${esc(finalId(result.slug))}" class="match-card official-final-card" data-final-fixture="${esc(result.slug)}">
      <header class="match-head"><span>OFFICIAL RESULT · ${esc(selected?.league||'FOOTBALL')}</span><b class="status finished">FT</b></header>
      <section class="scoreboard">
        <div class="team"><i class="shirt"></i><strong>${esc(result.home||'Home')}</strong><small>HOME</small></div>
        <div class="scorebox"><span>FT</span><b>${esc(shown(result.homeScore))} : ${esc(shown(result.awayScore))}</b><small>${esc(result.statusLong||'Full Time')}</small></div>
        <div class="team"><i class="shirt"></i><strong>${esc(result.away||'Away')}</strong><small>AWAY</small></div>
      </section>
      <section class="latest"><i></i><div><small>OFFICIAL SETTLEMENT</small><b>${esc(selected?.pick||'Main pick')} · ${esc(mainOutcome)}</b></div><strong>FT</strong></section>
      <section class="pick"><div><small>CORE PICK</small><b>${esc(selected?.pick||'N/A')}</b></div><div><small>RESULT</small><b>${esc(mainOutcome)}</b></div><div><small>FINAL SCORE</small><b>${esc(shown(result.homeScore))}–${esc(shown(result.awayScore))}</b></div></section>
      <section class="markets"><div><small>BTTS</small><b>${esc(resultLabel(markets.btts?.outcome))}</b></div><div><small>DOUBLE CHANCE</small><b>${esc(resultLabel(markets.doubleChance?.outcome))}</b></div><div><small>ASIAN HANDICAP</small><b>${esc(resultLabel(markets.asianHandicap?.outcome))}</b></div><div><small>CONFIRMED</small><b>${result.resultConfirmed?'YES':'CHECK'}</b></div></section>
      <section class="reason"><small>PAGE 4 FINAL SCORE</small><p>Completed matches remain visible until the next NOMAD selection set replaces them.</p></section>
      <footer><span>${result.updatedAt?`Updated ${esc(new Date(result.updatedAt).toLocaleString())}`:'Official final score'}</span><span>API-FOOTBALL · NOMAD validation</span></footer>
    </article>`;
  }

  async function syncFinalScores(){
    if(loading||document.hidden||!host)return;
    loading=true;
    try{
      const [feed,selectedFeed]=await Promise.all([fetchJson('result-feed.json'),fetchJson('selected-live-matches.json')]);
      const currentDate=feed.selectionDate||selectedFeed.selection_date||null;
      if(selectionDate&&currentDate&&selectionDate!==currentDate){
        document.querySelectorAll('.official-final-card').forEach(node=>node.remove());
      }
      selectionDate=currentDate||selectionDate;
      const selectedMap=new Map((selectedFeed.matches||[]).map(item=>[item.slug,item]));
      const finals=(feed.results||[]).filter(item=>
        item.resultConfirmed||TERMINAL.has(String(item.status||item.providerStatus||'').toUpperCase())
      ).filter(item=>item.homeScore!==null&&item.homeScore!==undefined&&item.awayScore!==null&&item.awayScore!==undefined);
      const wanted=new Set(finals.map(item=>item.slug));
      document.querySelectorAll('.official-final-card').forEach(node=>{
        if(!wanted.has(node.dataset.finalFixture))node.remove();
      });
      for(const result of finals){
        const liveFile=`live-data-${result.slug}.json`;
        const existing=[...document.querySelectorAll('.match-card[data-file]')].find(node=>node.dataset.file===liveFile);
        if(existing){
          patchExisting(existing,result);
          document.getElementById(finalId(result.slug))?.remove();
          continue;
        }
        let finalCard=document.getElementById(finalId(result.slug));
        if(!finalCard){
          host.insertAdjacentHTML('beforeend',markup(result,selectedMap.get(result.slug)));
          finalCard=document.getElementById(finalId(result.slug));
        }
      }
    }catch(error){
      console.error('Final score sync failed',error);
    }finally{
      loading=false;
    }
  }

  syncFinalScores();
  setInterval(syncFinalScores,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncFinalScores()});
})();
