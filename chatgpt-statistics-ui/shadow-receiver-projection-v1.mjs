// Receiver-only durable projection. Book receipts are never changed by this module.
// Bootstrap from independently verified source + Book snapshot; journal updates are applied once.
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
import {oneDay,fold} from './shadow-stage-live-projection.mjs';
import {normalizeRow} from './shadow-composite-cursor-stage.mjs';
const groups=['all',...MARKET_GROUPS],R=['WIN','LOSS','HALF_WIN','HALF_LOSS','PUSH'];
const stateKey='projection:v1:state',graphsKey='projection:v1:graphs',journalSeq='projection:v1:journal:sequence';
const pfx='projection:v1:',journalKey=n=>pfx+'journal:event:'+String(n).padStart(16,'0');
const dayKey=t=>new Date(Number(t)+25200000).toISOString().slice(0,10);
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const json=(d,status=200)=>Response.json(d,{status,headers:{'cache-control':'no-store'}});
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(y=>y.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>a.signal_id===b.signal_id&&a.settled_at===b.settled_at&&a.result===b.result&&a.market_type===b.market_type&&(a.odds===b.odds||a.odds!=null&&b.odds!=null&&Number(a.odds)===Number(b.odds));
const compact=(raw,rank)=>{const n=normalizeRow(raw),createdAt=Number(raw.createdAt);if(!Number.isSafeInteger(createdAt)||createdAt<=0||!Number.isSafeInteger(rank)||rank<0)throw Error('ORDER_METADATA_REQUIRED');return {id:n.signal_id,createdAt,settledAt:n.settled_at,market:n.market_type,result:n.result,status:'SETTLED',odds:n.odds==null?null:Number(n.odds),_rank:rank}};
function daily(rows){
 const bins=Object.fromEntries(groups.map(k=>[k,new Map()]));
 for(const r of rows){if(bins.all.has(r.id))throw Error('DUPLICATE_DAY_ID');bins.all.set(r.id,r);bins[marketGroup(r.market)].set(r.id,r)}
 return Object.fromEntries(groups.map(k=>[k,oneDay(bins[k])]));
}
function materialize(dailyMap,at){
 return Object.fromEntries(groups.map(k=>[k,{...fold(new Map(Object.entries(dailyMap).map(([d,o])=>[d,o[k]])),at),source:'RECEIVER_DURABLE_MARKET_BOOK',market:k,variant:'all',filter:'all',range:'all'}]));
}
function invariant(g,expected){
 const a=g.all;
 if(a.summary.rows!==expected.total||Math.abs(a.summary.net-expected.total_pnl)>1e-7||Math.abs(a.win_rate-expected.win_rate)>1e-8||R.some(k=>a.counts[k]!==expected.raw_counts[k]))throw Error('PROJECTION_BOOK_BALANCE_DRIFT');
 if(groups.slice(1).reduce((n,k)=>n+g[k].summary.rows,0)!==a.summary.rows)throw Error('PROJECTION_MARKET_COUNT_DRIFT');
}
function validDay(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)}
export async function journalAccepted(tx,prior,next){
 const seq=(await tx.get(journalSeq)??0)+1;if(!Number.isSafeInteger(seq))throw Error('PROJECTION_SEQUENCE_OVERFLOW');
 await tx.put(journalKey(seq),{seq,previous:prior??null,next,at:Date.now()});await tx.put(journalSeq,seq);
}
export async function journalRead(store,u){
 const after=u.searchParams.has('after')?Number(u.searchParams.get('after')):null;
 if(after!==null&&(!Number.isSafeInteger(after)||after<0))return json({ok:false},400);
 return store.transaction(async tx=>{
  const seq=await tx.get(journalSeq)??0,s=await tx.get('composite:state');
  if(!s||s.pnl_schema!==1)return json({ok:false,error:'BOOK_NOT_READY'},503);
  if(after!==null&&after>seq)return json({ok:false,error:'JOURNAL_CURSOR_AHEAD'},409);
  const events=[];
  if(after!==null)for(let i=after+1;i<=Math.min(seq,after+25);i++){const e=await tx.get(journalKey(i));if(!e||e.seq!==i)return json({ok:false,error:'JOURNAL_GAP'},503);events.push(e)}
  return json({ok:true,sequence:seq,aggregate:{total:s.total,total_pnl:s.total_pnl,win_rate:s.winRate,raw_counts:Object.fromEntries(R.map(k=>[k,s[k]])),corrections:s.corrections??0},events});
 });
}
const bookOf=env=>env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
async function readJournal(env,after){const r=await bookOf(env).fetch('https://store.internal/projection-journal-v1'+(after==null?'':'?after='+after));const j=await r.json();if(!r.ok||!j.ok)throw Error('JOURNAL_HTTP_'+r.status);return j}
const stateView=s=>s?{status:s.status,sequence:s.sequence,generation:s.generation,seedDays:s.nextDay,totalDays:s.manifest.days.length,pendingChunks:s.nextPending,pendingExpected:s.manifest.pending+s.manifest.unresolved,sourceHash:s.manifest.sourceHash,lastAppliedAt:s.lastAppliedAt??null,pendingVerifiedAt:s.pendingVerifiedAt??null,pendingLive:false,pendingSource:'LEGACY_VERIFIED_SNAPSHOT_NO_COMPLETE_DELTA_FEED',lastError:s.lastError??null}:null;
async function seed(store,env,input){
 const action=input?.action;
 if(action==='begin'){
  const m=input.manifest;
  if(!m||!hex(m.sourceHash)||!hex(m.sourceSignature)||!Number.isSafeInteger(m.sequence)||m.sequence<0||!Number.isSafeInteger(m.asOf)||m.asOf<=0||m.asOf>Date.now()+1000||!Number.isSafeInteger(m.expected?.total)||m.expected.total<16074||!Array.isArray(m.days)||m.days.length<1||m.days.length>730||m.days.some((x,i)=>!validDay(x.day)||!hex(x.hash)||!Number.isSafeInteger(x.count)||x.count<1||i&&x.day<=m.days[i-1].day)||m.days.reduce((n,x)=>n+x.count,0)!==m.expected.total||!Number.isSafeInteger(m.pending)||m.pending<0||!Number.isSafeInteger(m.unresolved)||m.unresolved<0||!Array.isArray(m.pendingHashes)||m.pendingHashes.some(x=>!hex(x))||m.pendingHashes.length!==Math.ceil((m.pending+m.unresolved)/50))return json({ok:false,error:'MANIFEST'},400);
  const h=await hash(m),j=await readJournal(env);
  if(m.sequence>j.sequence)return json({ok:false,error:'SEQUENCE_AHEAD'},409);
  return store.transaction(async tx=>{const old=await tx.get(stateKey);if(old)return json({ok:old.hash===h,state:stateView(old)},old.hash===h?200:409);
   const s={status:'loading',manifest:m,hash:h,sequence:m.sequence,generation:0,nextDay:0,nextPending:0,pendingVerifiedAt:m.asOf};await tx.put(stateKey,s);return json({ok:true,state:stateView(s)})});
 }
 if(action==='day'){
  if(!Number.isSafeInteger(input.index)||input.index<0||!Array.isArray(input.rows)||input.rows.length>20000)return json({ok:false},400);
  const actual=await hash(input.rows);
  return store.transaction(async tx=>{
   const s=await tx.get(stateKey),d=s?.manifest.days[input.index];if(!s||!d||input.manifestHash!==s.hash||actual!==d.hash||input.rows.length!==d.count)return json({ok:false,error:'DAY_HASH'},409);
   if(input.index<s.nextDay)return json({ok:true,state:stateView(s)});
   if(s.status!=='loading'||input.index!==s.nextDay)return json({ok:false,error:'DAY_ORDER'},409);
   const rows=input.rows.map(r=>compact(r,r._rank));
   if(new TextEncoder().encode(JSON.stringify(rows)).length>1500000)throw Error('DAY_BUCKET_TOO_LARGE');
   if(rows.some(r=>dayKey(r.settledAt)!==d.day))throw Error('DAY_MISMATCH');
   await tx.put(pfx+'day:'+d.day,rows);await tx.put(pfx+'daily:'+d.day,daily(rows));s.nextDay++;await tx.put(stateKey,s);return json({ok:true,state:stateView(s)});
  });
 }
 if(action==='pending'){
  if(!Number.isSafeInteger(input.index)||input.index<0||!Array.isArray(input.rows)||input.rows.length>50)return json({ok:false},400);
  const actual=await hash(input.rows);
  return store.transaction(async tx=>{
   const s=await tx.get(stateKey);
   if(!s||input.manifestHash!==s.hash||actual!==s.manifest.pendingHashes[input.index])return json({ok:false,error:'PENDING_HASH'},409);
   if(input.index<s.nextPending)return json({ok:true,state:stateView(s)});
   if(s.status!=='loading'||input.index!==s.nextPending||input.rows.length!==Math.min(50,s.manifest.pending+s.manifest.unresolved-input.index*50))return json({ok:false,error:'PENDING_ORDER'},409);
   const index=await tx.get(pfx+'pending-index')??[];
   const seen=new Set(index.map(r=>r.id));
   for(const row of input.rows){
    if(!row?.id||seen.has(String(row.id))||!['PENDING','UNRESOLVED'].includes(row.status)||!Number.isSafeInteger(Number(row.createdAt))||Number(row.createdAt)<=0)throw Error('INVALID_PENDING_ROW');
    const id=String(row.id);seen.add(id);index.push({id,market:String(row.market),createdAt:Number(row.createdAt),status:row.status});await tx.put(pfx+'pending:'+id,row);
   }
   await tx.put(pfx+'pending-index',index);s.nextPending++;await tx.put(stateKey,s);return json({ok:true,state:stateView(s)});
  });
 }
 if(action==='finish'){
  const response=await store.transaction(async tx=>{
   const s=await tx.get(stateKey);if(!s||input.manifestHash!==s.hash)return json({ok:false},409);
   if(s.status==='loaded')return json({ok:true,state:stateView(s)});
   if(s.nextDay!==s.manifest.days.length||s.nextPending!==s.manifest.pendingHashes.length)return json({ok:false,error:'SEED_INCOMPLETE'},409);
   const days={},idx=await tx.get(pfx+'pending-index')??[];
   for(const d of s.manifest.days){const v=await tx.get(pfx+'daily:'+d.day);if(!v)throw Error('MISSING_DAILY');days[d.day]=v}
   if(idx.filter(x=>x.status==='PENDING').length!==s.manifest.pending||idx.filter(x=>x.status==='UNRESOLVED').length!==s.manifest.unresolved)throw Error('PENDING_TOTAL_DRIFT');
   const graphs=materialize(days,s.manifest.asOf);invariant(graphs,s.manifest.expected);
   s.status='loaded';s.generation=1;s.lastAppliedAt=s.manifest.asOf;s.days=Object.keys(days).sort();s.lastError=null;
   await tx.put(pfx+'daily-index',days);await tx.put(graphsKey,graphs);await tx.put(stateKey,s);return json({ok:true,state:stateView(s)});
  });
  if(response.ok)await store.setAlarm(Date.now()+1000);
  return response;
 }
 return json({ok:false},400);
}
// Only fetch the newest source page when an event has no metadata in the existing projection.
// Unknown or mismatching metadata is never fabricated; the new read endpoint fails closed.
async function metadataFor(next){
 const url='https://www.ball46.com/api/engine/statistics?paged=1';
 const r=await fetch(url,{headers:{accept:'application/json','cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Receiver-Projection'},signal:AbortSignal.timeout(15000)});
 const d=await r.json();if(!r.ok||!d?.ok||d.statisticsSource!=='LEDGER_V2_ONLY'||!Array.isArray(d.rows))throw Error('METADATA_SOURCE_UNAVAILABLE');
 const row=d.rows.find(x=>String(x.id)===next.signal_id&&x.status==='SETTLED');
 if(!row)throw Error('METADATA_NOT_VERIFIED');
 const latest=normalizeRow(row);
 if(latest.settled_at<next.settled_at||latest.settled_at===next.settled_at&&!same(latest,next))throw Error('METADATA_NOT_VERIFIED');
 return row;
}
async function applyEvent(store,event){
 const before=await store.get(stateKey);
 if(event.seq<=before.sequence)return;
 if(event.seq!==before.sequence+1)throw Error('EVENT_GAP');
 const next=normalizeRow(event.next),prior=event.previous?normalizeRow(event.previous):null;
 let meta=null;
 if(!prior){
  meta=await store.get(pfx+'pending:'+next.signal_id);
  if(!meta)meta=await metadataFor(next);
 }
 await store.transaction(async tx=>{
  const s=await tx.get(stateKey);if(s.status!=='loaded')throw Error('NOT_LOADED');if(event.seq<=s.sequence)return;if(event.seq!==s.sequence+1)throw Error('EVENT_GAP');
  const days=await tx.get(pfx+'daily-index'),idx=await tx.get(pfx+'pending-index')??[];
  const target=dayKey(next.settled_at),oldDay=prior?dayKey(prior.settled_at):null,affected=new Map();
  for(const d of new Set([target,...(oldDay?[oldDay]:[])]))affected.set(d,await tx.get(pfx+'day:'+d)??[]);
  if(prior){
   const rows=affected.get(oldDay),i=rows.findIndex(x=>x.id===prior.signal_id);
   if(i<0||!same(normalizeRow(rows[i]),prior))throw Error('OLD_REVISION_NOT_IN_PROJECTION');
   meta=rows[i];rows.splice(i,1);
  }
  if(!meta||String(meta.id)!==next.signal_id)throw Error('META_NOT_FOUND');
  const r=compact({...meta,...next,id:next.signal_id,settledAt:next.settled_at,market:next.market_type,result:next.result,odds:next.odds},meta._rank??Number.MAX_SAFE_INTEGER-event.seq);
  const dest=affected.get(target);if(dest.some(x=>x.id===r.id))throw Error('EVENT_DUPLICATE_ID');
  if(meta._rank==null&&dest.some(x=>x.settledAt===r.settledAt&&x.createdAt===r.createdAt))throw Error('EXACT_TIE_ORDER_METADATA_REQUIRED');
  dest.push(r);
  for(const [d,rows] of affected){
   if(new TextEncoder().encode(JSON.stringify(rows)).length>1500000)throw Error('DAY_BUCKET_TOO_LARGE');
   await tx.put(pfx+'day:'+d,rows);days[d]=daily(rows);await tx.put(pfx+'daily:'+d,days[d]);
  }
  const graphs=materialize(days,event.at);
  const current=await tx.get(graphsKey);const prevCount=current.all.summary.rows;
  if(graphs.all.summary.rows!==prevCount+(prior?0:1))throw Error('COUNT_INVARIANT');
  // Preserve original pending metadata (a settled event removes it from active index only).
  const i=idx.findIndex(x=>x.id===next.signal_id);if(i>=0){idx.splice(i,1);await tx.put(pfx+'pending-index',idx)}
  s.sequence=event.seq;s.generation++;s.lastAppliedAt=event.at;s.days=Object.keys(days).sort();s.lastError=null;
  await tx.put(pfx+'daily-index',days);await tx.put(graphsKey,graphs);await tx.put(stateKey,s);
 });
}
export async function projectionAlarm(store,env){
 const s=await store.get(stateKey);if(!s||s.status!=='loaded')return;
 let delay=30000;
 try{
  const j=await readJournal(env,s.sequence);
  for(const e of j.events)await applyEvent(store,e);
  const after=await store.get(stateKey);
  if(after.sequence===j.sequence){const graphs=await store.get(graphsKey);invariant(graphs,j.aggregate);
   if(after.lastError)await store.transaction(async tx=>{const v=await tx.get(stateKey);if(v.sequence===after.sequence){v.lastError=null;await tx.put(stateKey,v)}});
  }else delay=1000;
 }catch(e){
  await store.transaction(async tx=>{const v=await tx.get(stateKey);if(v){v.lastError=String(e.message).slice(0,100);await tx.put(stateKey,v)}});delay=30000;
 }
 await store.setAlarm(Date.now()+delay);
}
export async function isProjection(store){return !!(await store.get(stateKey))}
export async function projectionHandle(store,env,req){
 const u=new URL(req.url),p=u.pathname;
 if(p==='/projection-seed-v1'&&req.method==='POST')return seed(store,env,await req.json());
 if(p==='/projection-wake-v1'&&req.method==='POST'){
  const s=await store.get(stateKey);if(s?.status==='loaded'){const a=await store.getAlarm();if(a===null||a>Date.now()+1000)await store.setAlarm(Date.now()+250)}
  return json({ok:true});
 }
 if(req.method!=='GET')return json({ok:false},405);
 const s=await store.get(stateKey);
 if(p==='/projection-status-v1'){
  const j=await readJournal(env);return json({ok:true,readOnly:true,projection:stateView(s),bookSequence:j.sequence,bookAggregate:j.aggregate,graphReady:s?.status==='loaded'&&!s.lastError&&s.sequence===j.sequence,pendingLiveReady:false});
 }
 if(s?.status!=='loaded')return json({ok:false,error:'PROJECTION_NOT_READY'},503);
 const market=u.searchParams.get('market')??'all';
 if(!groups.includes(market))return json({ok:false,error:'MARKET_INVALID'},400);
 if(['variant','filter','range'].some(k=>u.searchParams.has(k)&&u.searchParams.get(k)!=='all'))return json({ok:false,error:'ADVANCED_FILTER_NOT_VERIFIED'},400);
 if(p==='/projection-graph-v1'){
  const j=await readJournal(env);if(s.lastError||s.sequence!==j.sequence)return json({ok:false,error:'PROJECTION_CATCHING_UP'},503);
  const graphs=await store.get(graphsKey);invariant(graphs,j.aggregate);
  // Recheck generation: a concurrent event must not pair a new graph with an old state.
  const a=await store.get(stateKey);if(a.generation!==s.generation||a.sequence!==s.sequence)return json({ok:false,error:'GENERATION_CHANGED'},409);
  return json({...graphs[market],generation:s.generation,sequence:s.sequence,readOnly:true});
 }
 if(p==='/projection-pending-v1'){
  // Complete live delta feed is NOT available. Auditors may examine the explicitly labelled
  // last verified snapshot minus observed Book settlements. Never present it as live.
  return json({ok:false,error:'COMPLETE_PENDING_LIVE_SOURCE_UNAVAILABLE',pendingLiveReady:false,lastVerifiedAt:s.pendingVerifiedAt},503);
 }
 if(p==='/projection-pending-snapshot-v1'){
  const idx=(await store.get(pfx+'pending-index')??[]).filter(r=>market==='all'||marketGroup(r.market)===market).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
  const offset=Number(u.searchParams.get('offset')??0),limit=Number(u.searchParams.get('limit')??50);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)return json({ok:false},400);
  const rows=[];for(const v of idx.slice(offset,offset+limit)){const row=await store.get(pfx+'pending:'+v.id);if(!row)throw Error('MISSING_PENDING_METADATA');rows.push(row)}
  const current=await store.get(stateKey);if(current.generation!==s.generation)return json({ok:false,error:'GENERATION_CHANGED'},409);
  return json({ok:true,readOnly:true,live:false,source:'VERIFIED_SNAPSHOT_MINUS_BOOK_SETTLEMENTS',verifiedAt:s.pendingVerifiedAt,generation:s.generation,total:idx.length,pending:idx.filter(x=>x.status==='PENDING').length,unresolved:idx.filter(x=>x.status==='UNRESOLVED').length,rows,next:offset+limit<idx.length?offset+limit:null});
 }
 return json({ok:false},404);
}
export const projectionConstants={stateKey,journalSeq,groups,dayKey};
