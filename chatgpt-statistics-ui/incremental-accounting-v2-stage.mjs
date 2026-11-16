// BALL46 STAGING ONLY. Last verified balance + NEW SETTLED events.
// Historical Ledger is read once for bootstrap, NEVER on normal postings.
import {buildVerifiedGraph} from './chart-series-stage.mjs';
const FIELDS={WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'};
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const dateMs=v=>{const n=num(v);if(n!==null)return n<1e12?n*1000:n;const t=Date.parse(String(v||''));return Number.isFinite(t)?t:0};
const outcome=r=>String(r?.result||r?.settlement||r?.outcome||'').trim().toUpperCase();
const settled=r=>!!r&&String(r.status||'').toUpperCase()==='SETTLED'&&Object.hasOwn(FIELDS,outcome(r));
const dayKey=ms=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
 const d={};for(const p of parts)if(p.type!=='literal')d[p.type]=p.value;
 return [d.year,d.month,d.day].join('-');
};
const dayNumber=ms=>{const [y,m,d]=dayKey(ms).split('-').map(Number);return Math.floor(Date.UTC(y,m-1,d)/86400000)};
function payout(r){
 const o=outcome(r),odds=num(r?.odds);
 if(o==='PUSH')return{profit:0,stake:1,priced:true};
 if(o==='LOSS')return{profit:-1,stake:1,priced:true};
 if(o==='HALF_LOSS')return{profit:-.5,stake:1,priced:true};
 if(o==='WIN'||o==='HALF_WIN'){
  if(odds===null||odds<=1)return{profit:null,stake:0,priced:false};
  return{profit:o==='WIN'?odds-1:(odds-1)/2,stake:1,priced:true};
 }
 throw Error('UNKNOWN_SETTLED_RESULT');
}
function assertSource(summary,rows){
 if(!summary?.ok||!Array.isArray(rows)||rows.length!==summary.ledgerTotal||
    summary.total+summary.pending+summary.unresolved!==summary.ledgerTotal)
  throw Error('SEED_REQUIRES_CURRENT_FULL_VERIFIED_LEDGER');
 const ids=new Set(),counts={win:0,loss:0,push:0,halfWin:0,halfLoss:0,pending:0,unresolved:0,total:0};
 for(const row of rows){
  if(!row.id||ids.has(row.id))throw Error('SEED_DUPLICATE_ID');ids.add(row.id);
  if(settled(row)){counts.total++;counts[FIELDS[outcome(row)]]++}
  else if(row.status==='PENDING')counts.pending++;
  else if(row.status==='UNRESOLVED')counts.unresolved++;
  else throw Error('SEED_UNKNOWN_RESULT');
 }
 for(const [k,value] of Object.entries(counts))if(value!==summary[k])throw Error('SEED_COUNT_MISMATCH_'+k);
}
export function seedFromLatestVerified(source){
 const rows=source?.rows;assertSource(source,rows);
 const graph=buildVerifiedGraph(rows,Number(source.snapshotSavedAt||Date.now())).result;
 if(graph.summary.rows!==source.total||graph.summary.wins!==source.win+source.halfWin||
    graph.summary.losses!==source.loss+source.halfLoss||graph.summary.pushes!==source.push)
  throw Error('LATEST_GRAPH_COUNTERS_INCONSISTENT');
 let oddsSum=0,oddsCount=0,minDay=Infinity,maxDate=0,previousNet=0,trough=0;
 for(const row of rows.filter(settled).slice().sort((a,b)=>dateMs(a.settledAt??a.createdAt)-dateMs(b.settledAt??b.createdAt))){
  const ms=dateMs(row.settledAt??row.createdAt);if(ms<=0)throw Error('SETTLED_DATE_MISSING');
  minDay=Math.min(minDay,dayNumber(ms));maxDate=Math.max(maxDate,ms);
  const odds=num(row.odds);if(odds!==null&&odds>1){oddsSum+=odds;oddsCount++}
  const p=payout(row);if(p.priced){previousNet+=p.profit;trough=Math.min(trough,previousNet)}
 }
 return {
  schema:2,mode:'LATEST_VERIFIED_BALANCE_PLUS_NEW_SETTLEMENTS',
  stats:{ledgerTotal:source.ledgerTotal,total:source.total,pending:source.pending,
   unresolved:source.unresolved,win:source.win,loss:source.loss,push:source.push,
   halfWin:source.halfWin,halfLoss:source.halfLoss},
  summary:{...graph.summary},series:structuredClone(graph.series),
  _finance:{oddsSum,oddsCount,firstDay:Number.isFinite(minDay)?minDay:null,
    lastSettledAt:maxDate,lastAppliedId:null,trough},
  updatedAt:Number(source.snapshotSavedAt||Date.now()),
  sourceRevision:source.statisticsContentRevision||null,
  bootstrapLedgerCount:rows.length,historicalRowsRetained:0
 };
}
function putDay(arr,ms,value){
 const last=arr.at(-1),key=dayKey(ms);
 if(last&&dayKey(last.date)===key)arr[arr.length-1]={date:ms,value};
 else arr.push({date:ms,value});
}
function mutateCount(stats,row,sign){
 if(!row)return;
 stats.ledgerTotal+=sign;
 if(settled(row)){stats.total+=sign;stats[FIELDS[outcome(row)]]+=sign}
 else if(row.status==='PENDING')stats.pending+=sign;
 else if(row.status==='UNRESOLVED')stats.unresolved+=sign;
 else throw Error('UNSUPPORTED_LEDGER_STATUS');
}
function verifyCounters(s){
 if(Object.values(s).some(n=>!Number.isSafeInteger(n)||n<0)||
 s.total+s.pending+s.unresolved!==s.ledgerTotal||
 s.win+s.loss+s.push+s.halfWin+s.halfLoss!==s.total)
  throw Error('INCREMENTAL_COUNTER_INVARIANT');
}
// oldRow/newRow come from the serialized canonical Engine upsert, NOT a page scan.
// Corrections and out-of-order settlements stop; never publish a wrong P/L.
export function applyLedgerTransition(balance,oldRow,newRow,{at=Date.now()}={}){
 if(!balance||balance.schema!==2||balance.historicalRowsRetained!==0)
  throw Error('LATEST_BALANCE_NOT_READY');
 if(!newRow?.id||oldRow&&String(oldRow.id)!==String(newRow.id))
  throw Error('LEDGER_ID_REQUIRED_OR_CHANGED');
 if(oldRow&&JSON.stringify({status:oldRow.status,result:outcome(oldRow),odds:oldRow.odds,settledAt:oldRow.settledAt})===
             JSON.stringify({status:newRow.status,result:outcome(newRow),odds:newRow.odds,settledAt:newRow.settledAt}))
  return{mode:'ALREADY_APPLIED',state:balance};
 if(settled(oldRow)){
  return{mode:'HISTORICAL_CORRECTION_NEEDS_TARGETED_DAY_REBUILD',state:balance,
   signalId:newRow.id,priorDate:oldRow.settledAt??oldRow.createdAt};
 }
 if(!settled(newRow)){
  const state=structuredClone(balance);
  mutateCount(state.stats,oldRow,-1);mutateCount(state.stats,newRow,1);
  verifyCounters(state.stats);state.updatedAt=at;
  return{mode:'NON_SETTLED_COUNTER_UPDATE',state};
 }
 const ms=dateMs(newRow.settledAt??newRow.createdAt);
 if(ms<=0||ms<balance._finance.lastSettledAt)
  return{mode:'OUT_OF_ORDER_SETTLEMENT_NEEDS_TARGETED_DAY_REBUILD',state:balance,signalId:newRow.id};
 const state=structuredClone(balance);
 mutateCount(state.stats,oldRow,-1);mutateCount(state.stats,newRow,1);
 verifyCounters(state.stats);
 const o=outcome(newRow),odd=num(newRow.odds),p=payout(newRow),sum=state.summary;
 sum.rows++;if(o==='WIN'||o==='HALF_WIN')sum.wins++;
 if(o==='LOSS'||o==='HALF_LOSS')sum.losses++;
 if(o==='PUSH')sum.pushes++;
 if(odd!==null&&odd>1){state._finance.oddsSum+=odd;state._finance.oddsCount++}
 sum.avgOdds=state._finance.oddsCount?state._finance.oddsSum/state._finance.oddsCount:null;
 const credits=state.stats.win+.5*state.stats.halfWin,wl=sum.wins+sum.losses;
 if(p.priced){
  sum.priced++;sum.stake+=p.stake;sum.net+=p.profit;
  sum.peak=Math.max(sum.peak,sum.net);
  sum.maxDD=Math.max(sum.maxDD,sum.peak-sum.net);
  state._finance.trough=Math.min(state._finance.trough,sum.net);
  sum.bestRun=Math.max(sum.bestRun,sum.net-state._finance.trough);
  sum.roi=sum.stake?sum.net/sum.stake*100:null;
  putDay(state.series.units,ms,sum.net);
  putDay(state.series.roi,ms,sum.roi);
 }
 putDay(state.series.rate,ms,wl?credits/wl*100:0);
 if(state._finance.firstDay===null)state._finance.firstDay=dayNumber(ms);
 sum.settledDays=Math.max(1,dayNumber(ms)-state._finance.firstDay+1);
 state._finance.lastSettledAt=ms;state._finance.lastAppliedId=String(newRow.id);
 state.updatedAt=at;
 return{mode:'POSTED_NEW_SETTLEMENT',state};
}
export function displaySnapshot(balance){
 if(!balance||balance.schema!==2)throw Error('NO_VERIFIED_ACCOUNTING_SNAPSHOT');
 return{schema:2,ok:true,source:'RUNNING_BALANCE',updatedAt:balance.updatedAt,
  ledgerTotal:balance.stats.ledgerTotal,total:balance.stats.total,
  pending:balance.stats.pending,unresolved:balance.stats.unresolved,
  win:balance.stats.win,loss:balance.stats.loss,push:balance.stats.push,
  halfWin:balance.stats.halfWin,halfLoss:balance.stats.halfLoss,
  summary:{...balance.summary},series:structuredClone(balance.series)};
}