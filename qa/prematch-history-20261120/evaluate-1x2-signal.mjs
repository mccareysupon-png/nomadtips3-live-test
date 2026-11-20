// Pure 1X2 evaluator. All inputs supplied by caller; no network or storage.
export const DEFAULT_1X2=Object.freeze({enabled:false,minProbability:0.60,minEdge:0.05,minEV:0.05, minGoalDifference:0,minRecentGoalDifference:0,maxRecentRateDrop:0.20,priceRanges:{HOME_WIN:[1.6,3.5],DRAW:[2.9,4.2],AWAY_WIN:[1.6,3.5]}});
export function evaluate1x2Signal(input,options={}){
 const cfg={...DEFAULT_1X2,...options,priceRanges:{...DEFAULT_1X2.priceRanges,...options.priceRanges}};
 const no=(reason,metrics=null)=>({signal:'NO_SIGNAL',reason,metrics});
 const keys=['HOME_WIN','DRAW','AWAY_WIN'];
 if(typeof cfg.enabled!=='boolean'||![cfg.minProbability,cfg.minEdge,cfg.minEV,cfg.minGoalDifference,cfg.minRecentGoalDifference,cfg.maxRecentRateDrop].every(Number.isFinite)||cfg.minProbability<0||cfg.minProbability>1||cfg.minEdge<0||cfg.minEdge>1||cfg.minEV<0||cfg.maxRecentRateDrop<0||cfg.maxRecentRateDrop>1||keys.some(k=>!Array.isArray(cfg.priceRanges[k])||cfg.priceRanges[k].length!==2||!cfg.priceRanges[k].every(Number.isFinite)||cfg.priceRanges[k][0]<=1||cfg.priceRanges[k][1]<cfg.priceRanges[k][0]))return no('INVALID_CONFIG');
 const valid=a=>Array.isArray(a)&&a.length===10&&a.every(x=>x?.fixtureId!=null&&Number.isSafeInteger(x.gf)&&x.gf>=0&&Number.isSafeInteger(x.ga)&&x.ga>=0)&&new Set(a.map(x=>String(x.fixtureId))).size===10;
 if(!valid(input?.homeLast10)||!valid(input?.awayLast10))return no('INVALID_OR_INCOMPLETE_HISTORY');
 const now=input.asOf,kickoff=input.kickoff,odds=input.odds;
 if(odds?.bookmaker!=='bet365'||![odds.home,odds.draw,odds.away].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>1))return no('INVALID_BET365_ODDS');
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(kickoff)||now>=kickoff||!Number.isSafeInteger(odds.observed)||odds.observed>now||odds.observed>=kickoff)return no('INVALID_PREMATCH_TIME');
 if([...input.homeLast10,...input.awayLast10].some(x=>!Number.isSafeInteger(x.kickoff)||x.kickoff>=now))return no('INVALID_HISTORY_TIME');
 const form=a=>({w:a.filter(x=>x.gf>x.ga).length/a.length,d:a.filter(x=>x.gf===x.ga).length/a.length,l:a.filter(x=>x.gf<x.ga).length/a.length,gf:a.reduce((s,x)=>s+x.gf,0)/a.length,ga:a.reduce((s,x)=>s+x.ga,0)/a.length,gd:a.reduce((s,x)=>s+x.gf-x.ga,0)/a.length});
 const recent=a=>form([...a].sort((a,b)=>b.kickoff-a.kickoff||String(b.fixtureId).localeCompare(String(a.fixtureId))).slice(0,5));
 const h=form(input.homeLast10),a=form(input.awayLast10),hr=recent(input.homeLast10),ar=recent(input.awayLast10);
 const probs=(h,a)=>[(h.w+a.l)/2,(h.d+a.d)/2,(a.w+h.l)/2];
 const p=probs(h,a),rp=probs(hr,ar),prices=[odds.home,odds.draw,odds.away],total=prices.reduce((s,x)=>s+1/x,0);
 const sides=keys.map((signal,i)=>{const price=prices[i],implied=1/price,market=implied/total,edge=p[i]-market,ev=p[i]*price-1,[min,max]=cfg.priceRanges[signal];
 const gd=i===0?h.gd-a.gd:i===2?a.gd-h.gd:null,recentGd=i===0?hr.gd-ar.gd:i===2?ar.gd-hr.gd:null;
 const guard=(gd===null||gd>=cfg.minGoalDifference&&recentGd>=cfg.minRecentGoalDifference)&&rp[i]+cfg.maxRecentRateDrop>=p[i]-1e-12;
 return {signal,model:p[i],recentModel:rp[i],price,implied,market,edge,ev,goalDifferenceEdge:gd,recentGoalDifferenceEdge:recentGd,formGuard:guard,passed:guard&&price>=min&&price<=max&&p[i]>=cfg.minProbability&&edge>=cfg.minEdge&&ev>=cfg.minEV}});
 const metrics={home:h,away:a,homeRecent5:hr,awayRecent5:ar,overround:total-1,sides};
 if(!cfg.enabled)return no('OWNER_OFF',metrics);
 const best=sides.filter(x=>x.passed).sort((a,b)=>b.ev-a.ev||b.edge-a.edge||keys.indexOf(a.signal)-keys.indexOf(b.signal))[0];
 return best?{signal:best.signal,reason:'ALL_FILTERS_PASSED',metrics}:no('FILTERS_NOT_MET',metrics);
}
