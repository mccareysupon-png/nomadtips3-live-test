(()=>{
  const KEY='nomadtips3.nomad-control.draft.v2';
  const WORKER_BASE='https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const FALLBACK_URL='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/result-feed.json';
  const PROVIDER_ID_BY_FIXTURE=Object.freeze({
    'DAY7-APOLLON-CZARNI':'1603952',
    'DAY7-SLAVIA-RANGERS':'1558465'
  });
  const LIVE=new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
  const STALE_AFTER_MS=3*60*1000;
  const POLL_MS=30*1000;
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

  function settleMainPick(record,homeScore,awayScore){
    if(!finite(homeScore)||!finite(awayScore))return'pending';
    const home=Number(homeScore);
    const away=Number(awayScore);
    const pick=String(record?.pick||'').toUpperCase();
    const correct=(pick==='HOME'&&home>away)||(pick==='AWAY'&&away>home)||(pick==='DRAW'&&home===away);
    return correct?'correct':'incorrect';
  }

  function settleBtts(market,homeScore,awayScore){
    if(!finite(homeScore)||!finite(awayScore))return'pending';
    const actual=Number(homeScore)>0&&Number(awayScore)>0;
    const pick=String(market?.pick||'').trim().toLowerCase();
    if(!pick)return'pending';
    const selected=pick.startsWith('y')?true:pick.startsWith('n')?false:null;
    return selected===null?'pending':selected===actual?'correct':'incorrect';
  }

  function settleDoubleChance(market,homeScore,awayScore){
    if(!finite(homeScore)||!finite(awayScore))return'pending';
    const home=Number(homeScore);
    const away=Number(awayScore);
    const pick=String(market?.pick||'').toUpperCase().replace(/\s+/g,'');
    let correct=null;
    if(pick.startsWith('1X'))correct=home>=away;
    else if(pick.startsWith('X2'))correct=away>=home;
    else if(pick.startsWith('12'))correct=home!==away;
    return correct===null?'pending':correct?'correct':'incorrect';
  }

  function handicapLine(market){
    const match=String(market?.pick||'').match(/([+-]?\d+(?:\.\d+)?)\s*$/);
    return match?Number(match[1]):0;
  }

  function settleSingleHandicap(selectedScore,opponentScore,line){
    const adjusted=Number(selectedScore)+Number(line)-Number(opponentScore);
    if(adjusted>0)return'win';
    if(adjusted<0)return'loss';
    return'push';
  }

  function settleAsianHandicap(record,market,homeScore,awayScore){
    if(!finite(homeScore)||!finite(awayScore))return'pending';
    const mainPick=String(record?.pick||'').toUpperCase();
    if(mainPick!=='HOME'&&mainPick!=='AWAY')return'pending';
    const selectedScore=mainPick==='HOME'?Number(homeScore):Number(awayScore);
    const opponentScore=mainPick==='HOME'?Number(awayScore):Number(homeScore);
    const line=handicapLine(market);
    const quarter=Math.abs(Math.round(line*4))%2===1;
    if(!quarter)return settleSingleHandicap(selectedScore,opponentScore,line);

    const first=settleSingleHandicap(selectedScore,opponentScore,line-0.25);
    const second=settleSingleHandicap(selectedScore,opponentScore,line+0.25);
    const pair=[first,second].sort().join('|');
    if(first==='win'&&second==='win')return'win';
    if(first==='loss'&&second==='loss')return'loss';
    if(first==='push'&&second==='push')return'push';
    if(pair==='push|win')return'half-win';
    if(pair==='loss|push')return'half-loss';
    return'push';
  }

  function buildWorkerFeed(state,payload){
    const fixtures=new Map((payload?.results||[]).map(item=>[String(item.providerFixtureId??item.fixtureId),item]));
    const results=(state.publishedPicks||[]).map(record=>{
      const providerFixtureId=String(record.providerFixtureId||PROVIDER_ID_BY_FIXTURE[String(record.fixtureId)]||'');
      const fixture=fixtures.get(providerFixtureId);
      if(!fixture)return null;
      const confirmed=Boolean(fixture.resultConfirmed);
      const homeScore=fixture.homeScore;
      const awayScore=fixture.awayScore;
      const markets=record.markets||{};
      return{
        fixtureId:String(record.fixtureId),
        providerFixtureId,
        kickoffUtc:fixture.kickoffUtc||record.kickoffUtc,
        status:fixture.status||'NS',
        statusLong:fixture.statusLong||null,
        elapsed:fixture.elapsed??null,
        homeScore:finite(homeScore)?Number(homeScore):null,
        awayScore:finite(awayScore)?Number(awayScore):null,
        outcome:confirmed?settleMainPick(record,homeScore,awayScore):'pending',
        markets:{
          btts:{...markets.btts,outcome:confirmed?settleBtts(markets.btts,homeScore,awayScore):'pending'},
          doubleChance:{...markets.doubleChance,outcome:confirmed?settleDoubleChance(markets.doubleChance,homeScore,awayScore):'pending'},
          asianHandicap:{...markets.asianHandicap,outcome:confirmed?settleAsianHandicap(record,markets.asianHandicap,homeScore,awayScore):'pending'}
        },
        resultConfirmed:confirmed,
        autoVoid:false,
        resultSource:'CLOUDFLARE · API-FOOTBALL',
        updatedAt:payload.generatedAt||new Date().toISOString()
      };
    }).filter(Boolean);

    const correct=results.filter(item=>item.outcome==='correct').length;
    const incorrect=results.filter(item=>item.outcome==='incorrect').length;
    const voids=results.filter(item=>item.outcome==='void').length;
    const pending=Math.max(0,(state.publishedPicks||[]).length-correct-incorrect-voids);
    const settled=correct+incorrect;
    return{
      selectionDate:(state.publishedPicks||[])[0]?.pickDate||null,
      generatedAt:payload.generatedAt||new Date().toISOString(),
      source:'CLOUDFLARE · API-FOOTBALL',
      summary:{
        total:(state.publishedPicks||[]).length,
        correct,
        incorrect,
        void:voids,
        pending,
        settled,
        allSettled:pending===0,
        accuracy:settled?Number(((correct/settled)*100).toFixed(2)):0,
        finalizedAt:pending===0?(payload.generatedAt||new Date().toISOString()):null
      },
      results
    };
  }

  async function fetchWorkerFeed(state){
    const ids=[...new Set((state.publishedPicks||[])
      .map(record=>record.providerFixtureId||PROVIDER_ID_BY_FIXTURE[String(record.fixtureId)])
      .filter(Boolean)
      .map(String))];
    if(ids.length===0)throw new Error('No provider fixture ids configured');
    const response=await fetch(`${WORKER_BASE}/fixtures?ids=${encodeURIComponent(ids.join(','))}&t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Worker HTTP ${response.status}`);
    const payload=await response.json();
    if(!payload?.results?.length)throw new Error(payload?.error||'Worker returned no fixtures');
    return buildWorkerFeed(state,payload);
  }

  async function fetchFallbackFeed(){
    const response=await fetch(`${FALLBACK_URL}?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Fallback feed HTTP ${response.status}`);
    return response.json();
  }

  async function loadFeed(state){
    try{
      return await fetchWorkerFeed(state);
    }catch(workerError){
      console.debug('Cloudflare result sync pending',workerError);
      return fetchFallbackFeed();
    }
  }

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
      const raw=localStorage.getItem(KEY);
      if(!raw)return;
      const state=JSON.parse(raw);
      if(!Array.isArray(state.publishedPicks))return;

      const feed=await loadFeed(state);
      updateDelayBanner(feed,false);
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
          resultSource:result.resultSource||pick.resultSource||'CLOUDFLARE · API-FOOTBALL',
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
      state.resultFeedSource=feed.source||null;
      if(feed.summary?.allSettled){
        state.batchStatus='FINALIZED';
        state.batchFinalizedAt=feed.summary.finalizedAt||feed.generatedAt;
      }else{
        state.batchStatus='IN_PROGRESS';
      }

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
  setInterval(syncResults,POLL_MS);
  setInterval(()=>updateDelayBanner(latestFeed,false),10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncResults()});
})();
