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
export function dryRunStored(db,fixtures,now,limit=10){
 const rows=[],seen=new Set(),counts={upcoming:0,historyComplete:0,bttsPrices:0,oneX2Prices:0,bothReady:0};
 for(const f of fixtures){const a=adaptStoredFixture(db,f,now);if(!a||seen.has(a.fixtureId))continue;seen.add(a.fixtureId);counts.upcoming++;
 const complete=a.homeCount===10&&a.awayCount===10;if(complete)counts.historyComplete++;if(a.btts)counts.bttsPrices++;if(a.oneX2)counts.oneX2Prices++;if(complete&&a.btts&&a.oneX2)counts.bothReady++;
 const reason=!complete?'INSUFFICIENT_HISTORY':'NO_STORED_BET365_PRICE';
 const btts=complete&&a.btts?evaluateBttsSignal(a.btts,{enabled:true}):no(reason);
 const oneX2=complete&&a.oneX2?evaluate1x2Signal(a.oneX2,{enabled:true}):no(reason);
 rows.push({fixtureId:a.fixtureId,home:a.home,away:a.away,homeCount:a.homeCount,awayCount:a.awayCount,btts,oneX2});
 }
 rows.sort((a,b)=>Number(!!b.btts.metrics&&!!b.oneX2.metrics)-Number(!!a.btts.metrics&&!!a.oneX2.metrics));
 return {mode:'READ_ONLY_SHADOW',counts,rows:rows.slice(0,limit),providerCalls:0,published:0,state:counts.bothReady>=5?'DRY_RUN_COMPLETE':'REAL_INPUT_INCOMPLETE'};
}
