(()=>{
  const KEY='nomadtips3.nomad-control.draft.v2';
  const URL='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/result-feed.json';
  const LIVE=new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
  let busy=false;

  const finite=value=>value!==null&&value!==''&&Number.isFinite(Number(value));
  const same=(a,b)=>String(a??'')===String(b??'');

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
        if(!result)return pick;

        const live=LIVE.has(String(result.status||'').toUpperCase());
        const confirmed=Boolean(result.resultConfirmed);
        const autoVoid=Boolean(result.autoVoid);
        const previousAutoVoid=Boolean(pick.resultAutoVoid);

        const next={
          ...pick,
          kickoffUtc:result.kickoffUtc||pick.kickoffUtc,
          homeScore:finite(result.homeScore)?Number(result.homeScore):null,
          awayScore:finite(result.awayScore)?Number(result.awayScore):null,
          matchStatus:result.status||pick.matchStatus||'NS',
          matchStatusLong:result.statusLong||null,
          elapsed:result.elapsed??null,
          resultSource:result.resultSource||pick.resultSource||'API-FOOTBALL',
          resultUpdatedAt:result.updatedAt||feed.generatedAt,
          resultAutoVoid:autoVoid
        };

        if(confirmed){
          next.status='RESULT_CONFIRMED';
          next.resultConfirmed=true;
          next.outcome=result.outcome||'pending';
        }else if(previousAutoVoid&&!autoVoid){
          next.status=live?'MATCH_IN_PROGRESS':'WAITING_FOR_RESULT';
          next.resultConfirmed=false;
          next.outcome='pending';
        }else if(!pick.resultConfirmed){
          next.status=live?'MATCH_IN_PROGRESS':'WAITING_FOR_RESULT';
          next.resultConfirmed=false;
          next.outcome='pending';
        }

        const fields=['kickoffUtc','homeScore','awayScore','matchStatus','matchStatusLong','elapsed','resultSource','resultUpdatedAt','resultAutoVoid','status','resultConfirmed','outcome'];
        if(fields.some(field=>!same(pick[field],next[field])))changed=true;
        return next;
      });

      state.resultFeedSummary=feed.summary||null;
      state.resultFeedGeneratedAt=feed.generatedAt||null;
      if(feed.summary?.allSettled){
        state.batchStatus='FINALIZED';
        state.batchFinalizedAt=feed.summary.finalizedAt||feed.generatedAt;
      }else{
        state.batchStatus='IN_PROGRESS';
      }

      if(!changed){
        localStorage.setItem(KEY,JSON.stringify(state));
        return;
      }
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

  setTimeout(syncResults,800);
  setInterval(syncResults,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncResults()});
})();
