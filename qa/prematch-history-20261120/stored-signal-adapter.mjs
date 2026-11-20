// Read-only adapter: actual normalized SQLite rows + stored scheduled fixture and Bet365 record.
// Never fetches, writes, fills missing history, substitutes market values, or publishes signals.
import {lastMatches} from './history.mjs';
import {evaluateBttsSignal} from './evaluate-btts-signal.mjs';
import {evaluate1x2Signal} from './evaluate-1x2-signal.mjs';
const id=x=>/^[1-9]\d*$/.test(String(x??''))&&Number.isSafeInteger(Number(x));
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>1;
const no=reason=>({signal:'NO_SIGNAL',reason,metrics:null});
export function adaptStoredFixture(db,f,now){
 const k=f?.kickoff_ts,h=f?.teams?.home?.id,a=f?.teams?.away?.id;
 if(f?.status!=='scheduled'||!id(f.id)||!id(h)||!id(a)||Number(h)===Number(a)||!Number.isSafeInteger(k)||!Number.isSafeInteger(now)||k<=now)return null;
 const homeLast10=lastMatches(db,Number(h),k,now),awayLast10=lastMatches(db,Number(a),k,now);
 const stored=f.storedBet365, p=stored?.prices;
 const verified=stored?.bookmaker==='bet365'&&Number.isSafeInteger(stored.observed)&&stored.observed<=now&&stored.observed<k;
 const meta=verified?{bookmaker:'bet365',observed:stored.observed}:null;
 const common={homeLast10,awayLast10,asOf:now,kickoff:k};
 const btts=meta&&price(p?.BTTS_YES)&&price(p?.BTTS_NO)?{...common,odds:{...meta,yes:p.BTTS_YES,no:p.BTTS_NO}}:null;
 const oneX2=meta&&price(p?.['1X2_HOME'])&&price(p?.['1X2_DRAW'])&&price(p?.['1X2_AWAY'])?{...common,odds:{...meta,home:p['1X2_HOME'],draw:p['1X2_DRAW'],away:p['1X2_AWAY']}}:null;
 return {fixtureId:String(f.id),home:f.teams.home.name??String(h),away:f.teams.away.name??String(a),kickoff:k,homeCount:homeLast10.length,awayCount:awayLast10.length,btts,oneX2};
}
// These profiles apply exclusively to read-only shadow tests. Owner issuance remains OFF.
export const BASELINE_SHADOW=Object.freeze({version:'shadow-baseline-10',minHistory:10,btts:{minProbability:.60,minEdge:.05,minEV:.05},oneX2:{minProbability:.60,minEdge:.05,minEV:.05}});
export const ACCUMULATION_SHADOW=Object.freeze({version:'shadow-accumulation-5',minHistory:5,btts:{minProbability:.57,minEdge:.03,minEV:.03},oneX2:{minProbabilityBySide:{HOME_WIN:.50,DRAW:.33,AWAY_WIN:.50},minEdge:.03,minEV:.03,priceRanges:{HOME_WIN:[1.60,3.50],DRAW:[2.90,4.20],AWAY_WIN:[1.60,3.50]}}});
export function dryRunStored(db,fixtures,now,limit=10,profile=ACCUMULATION_SHADOW){
 const rows=[],seen=new Set(),outcomes={btts:{BTTS_YES:0,BTTS_NO:0,NO_SIGNAL:0,reasons:{}},oneX2:{HOME_WIN:0,DRAW:0,AWAY_WIN:0,NO_SIGNAL:0,reasons:{}}},counts={upcoming:0,historyComplete:0,bttsPrices:0,oneX2Prices:0,bothReady:0};
 for(const f of fixtures){const a=adaptStoredFixture(db,f,now);if(!a||seen.has(a.fixtureId))continue;seen.add(a.fixtureId);counts.upcoming++;
 const complete=a.homeCount>=profile.minHistory&&a.awayCount>=profile.minHistory;if(complete)counts.historyComplete++;if(a.btts)counts.bttsPrices++;if(a.oneX2)counts.oneX2Prices++;if(complete&&a.btts&&a.oneX2)counts.bothReady++;
 const reason=!complete?'INSUFFICIENT_HISTORY':'NO_STORED_BET365_PRICE';
 const btts=complete&&a.btts?evaluateBttsSignal(a.btts,{...profile.btts,minHistory:profile.minHistory,enabled:true}):no(reason);
 const oneX2=complete&&a.oneX2?evaluate1x2Signal(a.oneX2,{...profile.oneX2,minHistory:profile.minHistory,enabled:true}):no(reason);
 for(const [market,result] of [['btts',btts],['oneX2',oneX2]]){const o=outcomes[market];o[result.signal]++;o.reasons[result.reason]=(o.reasons[result.reason]??0)+1}
 rows.push({fixtureId:a.fixtureId,home:a.home,away:a.away,homeCount:a.homeCount,awayCount:a.awayCount,btts,oneX2});
 }
 rows.sort((a,b)=>Number(!!b.btts.metrics&&!!b.oneX2.metrics)-Number(!!a.btts.metrics&&!!a.oneX2.metrics));
 return {mode:'READ_ONLY_SHADOW',profile,counts,outcomes,rows:rows.slice(0,limit),providerCalls:0,published:0,state:counts.bothReady>=5?'DRY_RUN_COMPLETE':'REAL_INPUT_INCOMPLETE'};
}
