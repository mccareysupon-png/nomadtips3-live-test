// Pure Pre-Match evaluation. No network, no live dependencies. Experimental, owner OFF by default.
export const defaultConfig={enabled:false,bttsEnabled:true,oneX2Enabled:false,version:'experimental-v0.2',weights:[0.4,0.4,0.2],minPrice:1.5,maxPrice:10,minEV:0.05,minProbability:0.60};
export function evaluate(f,home,away,odds,cfg=defaultConfig,now){
 const base={fixtureId:f.id,home:f.teams?.home?.name??String(f.teams?.home?.id),away:f.teams?.away?.name??String(f.teams?.away?.id),kickoff:f.kickoff_ts,homeCount:home.length,awayCount:away.length,picks:[]};
 if(f.status!=='scheduled'||!Number.isSafeInteger(f.kickoff_ts)||f.kickoff_ts<=now)return {...base,state:'NOT_PREMATCH'};
 if(home.length!==10||away.length!==10)return {...base,state:'INSUFFICIENT_HISTORY'};
 const mean=(m,fn)=>m.reduce((n,x)=>n+Number(fn(x)),0)/m.length;
 const h=mean(home,x=>x.btts),a=mean(away,x=>x.btts),cross=0.5*(mean(home,x=>x.gf>0)*mean(away,x=>x.ga>0)+mean(away,x=>x.gf>0)*mean(home,x=>x.ga>0));
 const [w1,w2,w3]=cfg.weights;
 const probs={BTTS_YES:w1*h+w2*a+w3*cross};probs.BTTS_NO=1-probs.BTTS_YES;
 const w=0.5*(mean(home,x=>x.result==='W')+mean(away,x=>x.result==='L')),l=0.5*(mean(away,x=>x.result==='W')+mean(home,x=>x.result==='L')),d=0.5*(mean(home,x=>x.result==='D')+mean(away,x=>x.result==='D'));
 Object.assign(probs,{'1X2_HOME':w,'1X2_DRAW':d,'1X2_AWAY':l});
 const valid=odds?.bookmaker==='bet365'&&Number.isSafeInteger(odds.observed)&&odds.observed<=now&&odds.observed<f.kickoff_ts;
 const candidates=[];
 if(valid)for(const [pick,p] of Object.entries(probs)){if(pick.startsWith('BTTS')&&!cfg.bttsEnabled||pick.startsWith('1X2')&&!cfg.oneX2Enabled)continue;const price=odds.prices?.[pick];if(typeof price!=='number'||!Number.isFinite(price)||price<cfg.minPrice||price>cfg.maxPrice||p<cfg.minProbability)continue;const ev=p*price-1;if(ev>=cfg.minEV)candidates.push({pick,probability:p,price,ev,oddsObserved:odds.observed,configVersion:cfg.version})}
 return {...base,probabilities:probs,state:!valid?'NO_STORED_BET365_PRICE':!cfg.enabled?'OWNER_OFF':candidates.length?'QUALIFIED':'NO_MATCH',candidates,picks:cfg.enabled?candidates:[]};
}
