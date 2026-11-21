// Exact market-anchored exploratory formula evaluated in run 44763476390.
// Pure function: stored pre-match quotes and real historical scores only.
export const MARKET_1X2_VERSION='market-anchored-1x2-v1';
export function evaluateMarket1x2(input,config){
 const no=(reason,metrics=null)=>({signal:'NO_SIGNAL',reason,metrics});
 const keys=['HOME_WIN','DRAW','AWAY_WIN'],o=input?.odds,prices=[o?.home,o?.draw,o?.away];
 if(!['bet365','5usd-hub'].includes(o?.bookmaker)||!prices.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>1))return no('NO_STORED_BET365_PRICE');
 if(!Number.isSafeInteger(input.asOf)||!Number.isSafeInteger(input.kickoff)||input.asOf>=input.kickoff||!Number.isSafeInteger(o.observed)||o.observed<=0||o.observed>input.asOf||o.observed>=input.kickoff)return no('INVALID_PREMATCH_TIME');
 const h=input.homeLast10,a=input.awayLast10;
 const valid=rs=>Array.isArray(rs)&&rs.length<=10&&new Set(rs.map(r=>String(r.fixtureId))).size===rs.length&&rs.every(r=>r.fixtureId!=null&&Number.isSafeInteger(r.kickoff)&&r.kickoff<input.asOf&&Number.isSafeInteger(r.gf)&&r.gf>=0&&Number.isSafeInteger(r.ga)&&r.ga>=0);
 if(!valid(h)||!valid(a))return no('INVALID_HISTORY');
 const n=h.length+a.length,c=[0,0,0],weight=6,total=prices.reduce((s,x)=>s+1/x,0);
 for(const [rs,reverse] of [[h,false],[a,true]])for(const r of rs){const i=r.gf>r.ga?0:r.gf===r.ga?1:2;c[reverse?2-i:i]++}
 const tier=n===0?'market_only':Math.min(h.length,a.length)<3?'sparse':'both_min3';
 const sides=keys.map((signal,i)=>{const price=prices[i],implied=1/price,market=implied/total,model=(weight*market+c[i])/(weight+n),edge=model-market,ev=model*price-1,probabilityPassed=model>=config.minProbabilityBySide[signal],[min,max]=config.priceRanges[signal];return {signal,price,implied,market,model,edge,ev,probabilityPassed,passed:probabilityPassed&&price>=min&&price<=max&&edge>=config.minEdge&&ev>=config.minEV}});
 const metrics={method:MARKET_1X2_VERSION,quoteSource:o.bookmaker,calibration:'UNVALIDATED_EXPLORATORY',oddsObserved:o.observed,priorWeight:weight,evidenceTier:tier,historyCounts:[h.length,a.length],overround:total-1,sides};
 const best=sides.filter(x=>x.passed).sort((a,b)=>b.ev-a.ev||b.edge-a.edge||keys.indexOf(a.signal)-keys.indexOf(b.signal))[0];
 return best?{signal:best.signal,reason:'EXPLORATORY_SCREEN_PASSED',metrics}:no('FILTERS_NOT_MET',metrics)
}
