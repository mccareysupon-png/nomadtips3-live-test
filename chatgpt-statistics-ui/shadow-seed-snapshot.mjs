// Receiver-only historical snapshot collector. All source requests are GET.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {normalizeRow} from './shadow-composite-cursor-stage.mjs';
const fields={WIN:'win',LOSS:'loss',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss',PUSH:'push'};
const keys=Object.keys(fields);
export const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const order=(a,b)=>a.signal_id<b.signal_id?-1:a.signal_id>b.signal_id?1:0;
export const canonical=r=>({signal_id:r.signal_id,settled_at:r.settled_at,result:r.result,market_type:r.market_type,odds:r.odds==null?null:Number(r.odds)});
export function summarize(rows){
 const counts=Object.fromEntries(keys.map(k=>[k,0]));let units=0;
 for(const r of rows){
  if(!Object.hasOwn(fields,r.result))throw Error('INVALID_RESULT');
  counts[r.result]++;
  let p=0;
  if(r.result==='WIN'||r.result==='HALF_WIN'){
   if(r.odds==null||!Number.isFinite(Number(r.odds))||Number(r.odds)<1)throw Error('UNKNOWN_WIN_ODDS');
   p=Math.round((Number(r.odds)-1)*(r.result==='HALF_WIN'?0.5:1)*1e8);
  }else if(r.result==='LOSS')p=-1e8;else if(r.result==='HALF_LOSS')p=-5e7;
  units+=p;if(!Number.isSafeInteger(units))throw Error('PNL_OVERFLOW');
 }
 const w=counts.WIN+counts.HALF_WIN,l=counts.LOSS+counts.HALF_LOSS;
 return {total:rows.length,raw_counts:counts,total_pnl:units/1e8,win_rate:w+l?w/(w+l)*100:0};
}
const signature=d=>JSON.stringify([d.ledgerTotal,d.total,d.pending,d.unresolved,d.win,d.loss,d.push,d.halfWin,d.halfLoss,d.version,d.settlementRevision,d.statisticsLedgerVersion,d.statisticsContentRevision??null,Object.entries(d.byMarket??{}).sort(([a],[b])=>a.localeCompare(b))]);
async function page(cursor){
 const u=new URL('https://www.ball46.com/api/engine/statistics');u.searchParams.set('paged','1');u.searchParams.set('_',String(Date.now()));if(cursor)u.searchParams.set('cursor',cursor);
 const r=await fetch(u,{headers:{accept:'application/json','cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Audit'},signal:AbortSignal.timeout(25000)});
 const d=await r.json().catch(()=>null);
 if(!r.ok||d?.ok!==true||!Array.isArray(d.rows))throw Error('SOURCE_PAGE_HTTP_'+r.status);
 if(d.statisticsSource!=='LEDGER_V2_ONLY')throw Error('SOURCE_NOT_CANONICAL_LEDGER');
 return d;
}
async function collectOnce(){
 const first=await page(),sig=signature(first),raw=[],seen=new Set(),cursors=new Set();let d=first,pages=0;
 while(true){
  if(signature(d)!==sig)throw Error('SOURCE_REVISION_CHANGED');
  pages++;if(pages>150)throw Error('PAGINATION_LIMIT');
  for(const r of d.rows){if(!r?.id||seen.has(String(r.id)))throw Error('SOURCE_DUPLICATE_OR_MISSING_ID');seen.add(String(r.id));raw.push(r);}
  if(!d.nextCursor){if(d.hasMore)throw Error('MISSING_CURSOR');break}
  if(cursors.has(d.nextCursor))throw Error('CURSOR_LOOP');cursors.add(d.nextCursor);d=await page(d.nextCursor);
 }
 const settled=[],other={PENDING:0,UNRESOLVED:0},unknownStatus={};let invalidSettled=0;
 for(const r of raw){
  if(r.status==='SETTLED'){
   try{settled.push(canonical(normalizeRow(r)))}catch{invalidSettled++}
  }else if(Object.hasOwn(other,r.status))other[r.status]++;else unknownStatus[String(r.status)]=(unknownStatus[String(r.status)]??0)+1;
 }
 if(invalidSettled||Object.keys(unknownStatus).length)throw Error('SOURCE_UNSUPPORTED_ROWS_'+JSON.stringify({invalidSettled,unknownStatus}));
 settled.sort(order);
 const totals=summarize(settled);
 if(!Number.isSafeInteger(first.ledgerTotal)||raw.length!==first.ledgerTotal||totals.total!==first.total||other.PENDING!==first.pending||other.UNRESOLVED!==first.unresolved||keys.some(k=>totals.raw_counts[k]!==first[fields[k]]))throw Error('SOURCE_TOTAL_MISMATCH_'+JSON.stringify({ledger:raw.length,expected:first.ledgerTotal,total:totals.total,expectedSettled:first.total,other,expectedPending:first.pending,expectedUnresolved:first.unresolved}));
 const latest=await page();if(signature(latest)!==sig)throw Error('SOURCE_REVISION_CHANGED');
 const cutoff=Date.now();if(settled.some(r=>r.settled_at>cutoff))throw Error('FUTURE_SETTLEMENT');
 return {cutoff,sourceSignature:fingerprint(sig),sourceRevision:String(first.statisticsContentRevision??first.settlementRevision??first.statisticsLedgerVersion??first.version??''),ledgerTotal:raw.length,other,pages,totals,hash:fingerprint(settled),rows:settled};
}
export async function collect(){
 for(let attempt=1;attempt<=4;attempt++){try{return await collectOnce()}catch(e){if(!String(e.message).includes('SOURCE_REVISION_CHANGED')||attempt===4)throw e;console.log('SNAPSHOT_RETRY='+attempt);await new Promise(r=>setTimeout(r,1000));}}
}
if(process.argv[1]?.endsWith('/shadow-seed-snapshot.mjs')){
 const d=await collect();const {rows,...meta}=d;
 writeFileSync(process.env.RUNNER_TEMP+'/b46-full-source.json',JSON.stringify(d),{mode:0o600});
 console.log('FULL_SOURCE_SNAPSHOT='+JSON.stringify(meta));
}
