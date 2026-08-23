export const S8_EXTERNAL_URL='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev/quotes';
export const S8_MAX_BATCH=7;

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const quarterGoal=value=>finite(value)&&Math.abs(Number(value)*4-Math.round(Number(value)*4))<1e-9;

export function s8ExternalUnavailable(reason='price_not_checked',extra={}){
  return {
    status:'AH UNAVAILABLE',reason,source:'5DollarFootballAPI',bookmaker:'Bet365',bookmakerVerified:true,
    market:'FULL MATCH LIVE AH',sourceUpdatedAt:null,...extra,
  };
}

function normalizeReadyMarket(market,observedAt){
  const line=finite(market?.line)?Number(market.line):null;
  const homeOdds=finite(market?.homeOdds)?Number(market.homeOdds):null;
  const awayOdds=finite(market?.awayOdds)?Number(market.awayOdds):null;
  if(market?.status!=='AH READY'||!quarterGoal(line)||homeOdds===null||awayOdds===null||homeOdds<=1||awayOdds<=1){
    return s8ExternalUnavailable(market?.reason||'no_matching_live_ah',{fixtureId:market?.fixtureId??null});
  }
  // The adapter observation time is deliberately used only to satisfy the normal AH age gate.
  // price-sources.js excludes SOURCE 8 from cross-source freshness races.
  return {
    status:'AH READY',reason:null,source:'5DollarFootballAPI',bookmaker:'Bet365',bookmakerVerified:true,
    market:'FULL MATCH LIVE AH',line,homeOdds,awayOdds,sourceUpdatedAt:observedAt,
    sourceTimestampSemantics:'adapter_observed_at',fixtureId:market?.fixtureId??null,
  };
}

export async function fetchS8ExternalMarkets(matches=[],observedAt=Date.now(),fetchImpl=fetch,options={}){
  const input=Array.isArray(matches)?matches:[];
  const batch=input.slice(0,S8_MAX_BATCH);
  if(!batch.length) return {status:'NOT_NEEDED',checked:0,mapped:0,ready:0,results:[],upstream:null};
  const timeoutMs=Math.max(1000,Math.min(Number(options.timeoutMs)||7000,8000));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('S8_EXTERNAL_TIMEOUT'),timeoutMs);
  try{
    const headers={'content-type':'application/json','accept':'application/json','user-agent':'NOMADTIPS3-ENGINE-S8/1.0'};
    if(options.token) headers['x-s8-adapter-token']=String(options.token);
    const response=await fetchImpl(options.url||S8_EXTERNAL_URL,{
      method:'POST',headers,signal:controller.signal,cache:'no-store',
      body:JSON.stringify({matches:batch.map(match=>({
        clientId:match.id,home:match.home,away:match.away,league:match.league,score:match.score,
      }))}),
    });
    if(!response?.ok) throw new Error(`s8_adapter_http_${response?.status??'unknown'}`);
    const payload=await response.json();
    const byId=new Map((Array.isArray(payload?.results)?payload.results:[]).map(item=>[String(item?.clientId??''),item]));
    const results=batch.map(match=>{
      const item=byId.get(String(match.id));
      if(!item) return {matchId:match.id,matched:false,market:s8ExternalUnavailable('adapter_result_missing')};
      return {
        matchId:match.id,matched:Boolean(item.matched),mapping:item.mapping??null,fixtureId:item.fixtureId??null,
        market:normalizeReadyMarket(item.market,observedAt),
      };
    });
    const mapped=results.filter(item=>item.matched).length;
    const ready=results.filter(item=>item.market.status==='AH READY').length;
    return {
      status:payload?.ok===false?'DEGRADED':'READY',checked:batch.length,mapped,ready,results,
      error:payload?.error??null,live:payload?.live??null,upstream:payload?.upstream??null,
    };
  }finally{
    clearTimeout(timer);
  }
}
