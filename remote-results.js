(()=>{
  const KEY='nomadtips3.nomad-control.draft.v2';
  const URL='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/result-feed.json';
  let busy=false;

  async function syncResults(){
    if(busy||document.hidden)return;
    busy=true;
    try{
      const response=await fetch(`${URL}?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)return;
      const feed=await response.json();
      const raw=localStorage.getItem(KEY);
      if(!raw)return;
      const state=JSON.parse(raw);
      if(!Array.isArray(state.publishedPicks))return;
      const resultMap=new Map((feed.results||[]).map(item=>[String(item.fixtureId),item]));
      let changed=false;
      state.publishedPicks=state.publishedPicks.map(pick=>{
        const result=resultMap.get(String(pick.fixtureId));
        if(!result||!result.resultConfirmed)return pick;
        if(pick.resultConfirmed&&pick.outcome===result.outcome&&Number(pick.homeScore)===Number(result.homeScore)&&Number(pick.awayScore)===Number(result.awayScore))return pick;
        changed=true;
        return {
          ...pick,
          homeScore:result.homeScore,
          awayScore:result.awayScore,
          matchStatus:result.status,
          status:'RESULT_CONFIRMED',
          resultSource:result.resultSource||'API-FOOTBALL',
          resultConfirmed:true,
          outcome:result.outcome,
          resultUpdatedAt:result.updatedAt||feed.generatedAt
        };
      });
      if(!changed)return;
      state.updatedAt=feed.generatedAt||new Date().toISOString();
      localStorage.setItem(KEY,JSON.stringify(state));
      window.dispatchEvent(new Event('nomad-results-updated'));
      if(location.pathname.includes('/nomad-control/'))location.reload();
    }catch(error){
      console.debug('Automatic result sync pending',error);
    }finally{
      busy=false;
    }
  }

  setTimeout(syncResults,1000);
  setInterval(syncResults,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncResults()});
})();
