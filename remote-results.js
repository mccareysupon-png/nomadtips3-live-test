(()=>{
  const KEY='nomadtips3.nomad-control.draft.v2';
  const URL='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/result-feed.json';
  const LIVE=new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
  const STALE_AFTER_MS=3*60*1000;
  let busy=false;
  let latestFeed=null;

  const finite=value=>value!==null&&value!==''&&Number.isFinite(Number(value));
  const same=(a,b)=>String(a??'')===String(b??'');
  const jsonSame=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
  const parsedTime=value=>{
    const timestamp=Date.parse(value||'');
    return Number.isFinite(timestamp)?timestamp:null;
  };
  const mergeMarket=(base,incoming)=>({
    ...(base||{}),
    ...(incoming||{}),
    pick:incoming?.pick??base?.pick??'—',
    odds:finite(incoming?.odds)?Number(incoming.odds):(finite(base?.odds)?Number(base.odds):null),
    oddsStatus:incoming?.oddsStatus??base?.oddsStatus??(finite(incoming?.odds)||finite(base?.odds)?'LOCKED':'PENDING'),
    confidence:Number(incoming?.confidence??base?.confidence??0),
    outcome:incoming?.outcome??base?.outcome??'pending',
    settlement:incoming?.settlement??base?.settlement??null
  });

  function ensureDelayBanner(){
    let banner=document.getElementById('nomad-live-delay');
    if(banner)return banner;
    if(!document.getElementById('nomad-live-delay-style')){
      const style=document.createElement('style');
      style.id='nomad-live-delay-style';
      style.textContent=`
        #nomad-live-delay[hidden]{display:none!important}
        #nomad-live-delay{box-sizing:border-box;width:100%;padding:9px 14px;background:#7b1f27;color:#fff;border-bottom:1px solid rgba(255,255,255,.22);font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;text-align:center;letter-spacing:.05em;line-height:1.35;position:relative;z-index:1000}
        #nomad-live-delay strong{display:block;font-size:12px;font-weight:900}
        #nomad-live-delay span{display:block;margin-top:2px;font-size:9px;font-weight:700;opacity:.88}
      `;
      document.head.appendChild(style);
    }
    banner=document.createElement('div');
    banner.id='nomad-live-delay';
    banner.hidden=true;
    banner.setAttribute('role','status');
    banner.setAttribute('aria-live','polite');
    banner.innerHTML='<strong>LIVE DATA DELAYED</strong><span>RETRYING AUTOMATICALLY</span>';
    const topbar=document.querySelector('.topbar');
    if(topbar)topbar.insertAdjacentElement('afterend',banner);
    else document.body.prepend(banner);
    return banner;
  }

  function updateDelayBanner(feed,requestFailed=false){
    if(feed)latestFeed=feed;
    const banner=ensureDelayBanner();
    const summary=latestFeed?.summary||{};
    const pending=Number(summary.pending||0);
    const allSettled=Boolean(summary.allSettled);
    const openInResults=(latestFeed?.results||[]).some(item=>!item.resultConfirmed);
    const hasOpenMatches=!allSettled&&(pending>0||openInResults||!latestFeed);
    const generatedAt=parsedTime(latestFeed?.generatedAt);
    const ageMs=generatedAt===null?Infinity:Math.max(0,Date.now()-generatedAt);
    const delayed=hasOpenMatches&&(requestFailed||ageMs>STALE_AFTER_MS);

    banner.hidden=!delayed;
    if(!delayed){
      document.documentElement.removeAttribute('data-live-data');
      return;
    }
    document.documentElement.setAttribute('data-live-data','delayed');
    const detail=banner.querySelector('span');
    if(generatedAt!==null){
      const minutes=Math.max(3,Math.floor(ageMs/60000));
      const lastUpdate=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(generatedAt));
      detail.textContent=`LAST UPDATE ${lastUpdate} · ${minutes} MIN AGO · RETRYING AUTOMATICALLY`;
    }else{
      detail.textContent='LIVE FEED UNAVAILABLE · RETRYING AUTOMATICALLY';
    }
  }

  async function syncResults(){
    if(busy||document.hidden)return;
    busy=true;
    try{
      const response=await fetch(`${URL}?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw new Error(`Result feed HTTP ${response.status}`);
      const feed=await response.json();
      updateDelayBanner(feed,false);

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
        const incomingMarkets=result.markets||{};
        const nextMarkets={
          btts:mergeMarket(pick.markets?.btts,incomingMarkets.btts),
          doubleChance:mergeMarket(pick.markets?.doubleChance,incomingMarkets.doubleChance),
          asianHandicap:mergeMarket(pick.markets?.asianHandicap,incomingMarkets.asianHandicap)
        };

        const next={
          ...pick,
          providerFixtureId:result.providerFixtureId||pick.providerFixtureId||null,
          kickoffUtc:result.kickoffUtc||pick.kickoffUtc,
          homeScore:finite(result.homeScore)?Number(result.homeScore):null,
          awayScore:finite(result.awayScore)?Number(result.awayScore):null,
          matchStatus:result.status||pick.matchStatus||'NS',
          matchStatusLong:result.statusLong||null,
          elapsed:result.elapsed??null,
          resultSource:result.resultSource||pick.resultSource||'API-FOOTBALL',
          resultUpdatedAt:result.updatedAt||feed.generatedAt,
          resultAutoVoid:autoVoid,
          markets:nextMarkets
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

        const fields=['providerFixtureId','kickoffUtc','homeScore','awayScore','matchStatus','matchStatusLong','elapsed','resultSource','resultUpdatedAt','resultAutoVoid','status','resultConfirmed','outcome'];
        if(fields.some(field=>!same(pick[field],next[field]))||!jsonSame(pick.markets,next.markets))changed=true;
        return next;
      });

      state.resultFeedSummary=feed.summary||null;
      state.marketFeedSummary=feed.marketSummary||null;
      state.resultFeedGeneratedAt=feed.generatedAt||null;
      if(feed.summary?.allSettled){
        state.batchStatus='FINALIZED';
        state.batchFinalizedAt=feed.summary.finalizedAt||feed.generatedAt;
      }else{
        state.batchStatus='IN_PROGRESS';
      }

      localStorage.setItem(KEY,JSON.stringify(state));
      if(!changed)return;
      state.updatedAt=feed.generatedAt||new Date().toISOString();
      localStorage.setItem(KEY,JSON.stringify(state));
      window.dispatchEvent(new Event('nomad-results-updated'));
      if(location.pathname.includes('/nomad-control/'))location.reload();
    }catch(error){
      updateDelayBanner(latestFeed,true);
      console.debug('Automatic result sync pending',error);
    }finally{
      busy=false;
    }
  }

  setTimeout(syncResults,800);
  setInterval(syncResults,15000);
  setInterval(()=>updateDelayBanner(latestFeed,false),10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncResults()});
})();
