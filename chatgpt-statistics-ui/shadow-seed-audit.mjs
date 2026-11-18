// Full, independent Receiver/source reconciliation. Every network request here is GET.
import {createHmac} from 'node:crypto';
import {collect,canonical,order,fingerprint,summarize} from './shadow-seed-snapshot.mjs';
const endpoint='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function auditCredential(){
 if(!process.env.CLOUDFLARE_API_TOKEN)throw Error('AUDIT_ENV_MISSING');
 return createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('ball46/receiver/https-audit/v1/20261118').digest('hex');
}
export async function readFullBook(key){
 const read=async cursor=>{
  const u=new URL(endpoint+'/audit-book-page-v1');if(cursor)u.searchParams.set('cursor',cursor);
  const r=await fetch(u,{headers:{authorization:'Bearer '+key,'user-agent':'Mozilla/5.0 B46-Audit'},redirect:'manual',signal:AbortSignal.timeout(25000)});
  if(r.status===409)throw Error('BOOK_REVISION_CHANGED');
  const d=await r.json().catch(()=>null);if(r.status!==200||!d?.ok||!d.readOnly||!Array.isArray(d.rows)||!d.aggregate)throw Error('BOOK_PAGE_HTTP_'+r.status);
  return d;
 };
 for(let attempt=1;attempt<=4;attempt++){
  try{
   const first=await read(null),rows=[],seen=new Set();let d=first,pages=0;
   for(;;){
    if(d.version!==first.version||fingerprint(d.aggregate)!==fingerprint(first.aggregate))throw Error('BOOK_REVISION_CHANGED');
    if(++pages>150)throw Error('BOOK_PAGE_LIMIT');
    for(const raw of d.rows){
     const r=canonical(raw);if(!r.signal_id||seen.has(r.signal_id)||rows.length&&order(rows[rows.length-1],r)>=0)throw Error('BOOK_ID_DUPLICATE_OR_ORDER');seen.add(r.signal_id);rows.push(r);
    }
    if(d.next_cursor==null)break;
    if(d.next_cursor!==rows[rows.length-1]?.signal_id)throw Error('BOOK_CURSOR_INVALID');
    d=await read(d.next_cursor);
   }
   const last=await read(null);if(first.version!==last.version||fingerprint(first.aggregate)!==fingerprint(last.aggregate))throw Error('BOOK_REVISION_CHANGED');
   const totals=summarize(rows);
   if(totals.total!==first.aggregate.total||totals.total_pnl!==first.aggregate.total_pnl||Math.abs(totals.win_rate-first.aggregate.win_rate)>1e-9||Object.keys(totals.raw_counts).some(k=>totals.raw_counts[k]!==first.aggregate.raw_counts[k]))throw Error('BOOK_ACCUMULATED_AGGREGATE_MISMATCH');
   return {rows,pages,totals,hash:fingerprint(rows),aggregate:first.aggregate,seed:last.seed};
  }catch(e){
   if(e.message!=='BOOK_REVISION_CHANGED'||attempt===4)throw e;
   console.log('BOOK_READ_RETRY='+attempt);await sleep(1000);
  }
 }
}
export function compare(source,book){
 const a=new Map(source.rows.map(r=>[r.signal_id,r])),b=new Map(book.rows.map(r=>[r.signal_id,r]));
 let missing=0,extra=0,different=0;const examples=[];
 for(const id of new Set([...a.keys(),...b.keys()])){
  const x=a.get(id),y=b.get(id);if(!x)extra++;else if(!y)missing++;else if(fingerprint(x)!==fingerprint(y))different++;else continue;
  if(examples.length<5)examples.push({idHash:fingerprint(id).slice(0,16),reason:!x?'RECEIVER_ONLY':!y?'LEGACY_ONLY':'ROW_MISMATCH'});
 }
 return {sourceCount:a.size,receiverCount:b.size,matchingIds:a.size-missing,exactRows:a.size-missing-different,missing,extra,different,sourceHash:source.hash,receiverHash:book.hash,sourceTotals:source.totals,receiverTotals:book.totals,aggregate:book.aggregate,seed:book.seed,examples,exact:missing===0&&extra===0&&different===0&&source.hash===book.hash&&source.totals.total_pnl===book.totals.total_pnl};
}
export async function auditAll(){
 const key=auditCredential();console.log('::add-mask::'+key);
 for(let attempt=1;attempt<=4;attempt++){
  const source=await collect(),book=await readFullBook(key),diff=compare(source,book);
  const inboxResponse=await fetch(endpoint+'/audit-snapshot?from='+Date.now()+'&until='+Date.now(),{headers:{authorization:'Bearer '+key,'user-agent':'Mozilla/5.0 B46-Audit'},signal:AbortSignal.timeout(25000)});
  if(inboxResponse.status!==200)throw Error('INBOX_AUDIT_HTTP_'+inboxResponse.status);
  const inbox=(await inboxResponse.json()).inbox;
  const {rows,...meta}=source;
  console.log('FULL_HISTORY_AUDIT='+JSON.stringify({attempt,...diff,sourceSnapshot:meta,inbox}));
  if(diff.exact&&book.seed?.status==='loaded'&&inbox.pending_retry_queue===0&&inbox.quarantined===0)return diff;
  if(attempt<4)await sleep(2000);
 }
 throw Error('FULL_HISTORY_AUDIT_NOT_EXACT');
}
if(process.argv[1]?.endsWith('/shadow-seed-audit.mjs'))await auditAll();
