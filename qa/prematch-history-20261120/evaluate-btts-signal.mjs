// Pure BTTS filter. No fetch, timers, storage, or production dependencies.
// Provisional model: 40% home BTTS, 40% away BTTS, 20% cross scoring/conceding.
export const DEFAULT_BTTS=Object.freeze({enabled:false,minHistory:10,minPrice:1.5,maxPrice:10,minEdge:0.05,minEV:0.05,minProbability:0.60});
export function evaluateBttsSignal(input,options={}){
 const cfg={...DEFAULT_BTTS,...options};
 const no=(reason,metrics=null)=>({signal:'NO_SIGNAL',reason,metrics});
 if(typeof cfg.enabled!=='boolean'||!Number.isInteger(cfg.minHistory)||cfg.minHistory<5||cfg.minHistory>10||![cfg.minPrice,cfg.maxPrice,cfg.minEdge,cfg.minEV,cfg.minProbability].every(Number.isFinite)||cfg.minPrice<=1||cfg.maxPrice<cfg.minPrice||cfg.minEdge<0||cfg.minEdge>1||cfg.minEV<0||cfg.minProbability<0.5||cfg.minProbability>1)return no('INVALID_CONFIG');
 const valid=a=>Array.isArray(a)&&a.length>=cfg.minHistory&&a.length<=10&&a.every(x=>Number.isSafeInteger(x?.gf)&&x.gf>=0&&Number.isSafeInteger(x?.ga)&&x.ga>=0)&&new Set(a.map(x=>String(x.fixtureId))).size===a.length&&a.every(x=>x.fixtureId!=null);
 if(!valid(input?.homeLast10)||!valid(input?.awayLast10))return no('INVALID_OR_INCOMPLETE_HISTORY');
 const odds=input.odds;
 if(odds?.bookmaker!=='bet365'||![odds.yes,odds.no].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>1))return no('INVALID_BET365_ODDS');
 const now=input.asOf,kickoff=input.kickoff;
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(kickoff)||now>=kickoff||!Number.isSafeInteger(odds.observed)||odds.observed>now||odds.observed>=kickoff)return no('INVALID_PREMATCH_TIME');
 for(const a of [input.homeLast10,input.awayLast10])if(a.some(x=>!Number.isSafeInteger(x.kickoff)||x.kickoff>=now))return no('INVALID_HISTORY_TIME');
 const form=a=>({btts:a.filter(x=>x.gf>0&&x.ga>0).length/a.length,blank:a.filter(x=>x.gf===0).length/a.length,conceded:a.filter(x=>x.ga>0).length/a.length});
 const home=form(input.homeLast10),away=form(input.awayLast10);
 const cross=((1-home.blank)*away.conceded+(1-away.blank)*home.conceded)/2;
 const yes=0.4*home.btts+0.4*away.btts+0.2*cross;
 const total=1/odds.yes+1/odds.no;
 const sides=[['BTTS_YES',yes,odds.yes],['BTTS_NO',1-yes,odds.no]].map(([signal,model,price])=>{const implied=1/price,market=implied/total,edge=model-market,ev=model*price-1;return {signal,model,price,implied,market,edge,ev,passed:price>=cfg.minPrice&&price<=cfg.maxPrice&&model>=cfg.minProbability&&edge>=cfg.minEdge&&ev>=cfg.minEV}});
 const metrics={home,away,cross,overround:total-1,sides};
 if(!cfg.enabled)return no('OWNER_OFF',metrics);
 const best=sides.filter(x=>x.passed).sort((a,b)=>b.ev-a.ev||b.edge-a.edge)[0];
 return best?{signal:best.signal,reason:'ALL_FILTERS_PASSED',metrics}:no('FILTERS_NOT_MET',metrics);
}
