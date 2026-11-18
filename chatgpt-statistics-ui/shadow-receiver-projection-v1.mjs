// Receiver-only durable projection. Book receipts are never changed by this module.
// Bootstrap from independently verified source + Book snapshot; journal updates are applied once.
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
import {oneDay as foldDay,fold} from './shadow-stage-live-projection.mjs';
import {normalizeRow} from './shadow-composite-cursor-stage.mjs';
const groups=['all',...MARKET_GROUPS],R=['WIN','LOSS','HALF_WIN','HALF_LOSS','PUSH'];
const stateKey='projection:v2:state',graphsKey='projection:v2:graphs',journalSeq='projection:v2:journal:sequence';
const pfx='projection:v2:',journalKey=n=>pfx+'journal:event:'+String(n).padStart(16,'0');
const dayKey=t=>new Date(Number(t)+25200000).toISOString().slice(0,10);
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const json=(d,status=200)=>Response.json(d,{status,headers:{'cache-control':'no-store'}});
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(y=>y.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>a.signal_id===b.signal_id&&a.settled_at===b.settled_at&&a.result===b.result&&a.market_type===b.market_type&&(a.odds===b.odds||a.odds!=null&&b.odds!=null&&Number(a.odds)===Number(b.odds));
// Exact Selection normalization from deployed singlepage-workspace/longterm-performance.
export function nativeSelection(r){const x=String(r?.selection||r?.pick||'').trim().toUpperCase();if(x.includes('HOME'))return 'home';if(x.includes('AWAY'))return 'away';if(x.includes('DRAW')||x==='X')return 'draw';if(x.includes('OVER'))return 'over';if(x.includes('UNDER'))return 'under';if(x==='YES'||x.includes('BTTS YES'))return 'yes';if(x==='NO'||x.includes('BTTS NO'))return 'no';return x.toLowerCase().replace(/[^a-z0-9]+/g,'_')||'other'}
// Native Engine ledgerKey = stat:v2:row:<13 digit createdAt>:<id>; latestLedgerRows(reverse:true).
// Its stable settlement-time sort preserves createdAt descending then UTF-8 ID descending.
// Verified against all 629 exact timestamp tie groups at audit 44304554588.
const encoder=new TextEncoder();
export function receiverOrder(a,b){
 const n=Number(a.settledAt)-Number(b.settledAt)||Number(b.createdAt)-Number(a.createdAt);
 if(n)return n;
 const x=encoder.encode(String(a.id)),y=encoder.encode(String(b.id));
 for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return y[i]-x[i];
 return y.length-x.length;
}
const oneDay=rows=>foldDay(rows,receiverOrder);
const rangeDays={all:0,d7:7,d30:30,d90:90};
const filterKey=(market,variant,selection)=>JSON.stringify([market,variant,selection]);
const matching=(r,m,v,f)=>(m==='all'||marketGroup(r.market)===m)&&(v==='all'||r.market===v)&&(f==='all'||nativeSelection(r)===f);
function advancedDaily(rows){
 const bins=new Map;
 for(const r of rows)for(const market of ['all',marketGroup(r.market)])for(const variant of ['all',r.market])for(const filter of ['all',nativeSelection(r)]){
  const k=filterKey(market,variant,filter);if(!bins.has(k))bins.set(k,new Map);bins.get(k).set(r.id,r);
 }
 return Object.fromEntries([...bins].map(([k,v])=>[k,oneDay(v)]));
}
async function filteredGraph(store,s,market,variant,filter,range,at){
 const cutoff=rangeDays[range]?at-rangeDays[range]*86400000:0, boundary=cutoff?dayKey(cutoff):null;
 const days=new Map, key=filterKey(market,variant,filter);
 // Only precomputed daily summaries, plus one partial boundary day; no full receipt scans.
 for(const d of s.days){
  if(boundary&&d<boundary)continue;
  if(d===boundary){
   const rows=(await store.get(pfx+'day:'+d)??[]).filter(r=>r.settledAt>=cutoff&&matching(r,market,variant,filter));
   if(rows.length)days.set(d,oneDay(new Map(rows.map(r=>[r.id,r]))));
  }else{
   const index=await store.get(pfx+'advanced:'+d);
   if(!index)throw Error('ADVANCED_INDEX_MISSING');
   if(index[key]?.rows)days.set(d,index[key]);
  }
 }
 return {...fold(days,at),source:'RECEIVER_DURABLE_MARKET_BOOK',market,variant,filter,range};
}
const compact=(raw,rank)=>{const n=normalizeRow(raw),createdAt=Number(raw.createdAt);if(!Number.isSafeInteger(createdAt)||createdAt<=0||!Number.isSafeInteger(rank)||rank<0)throw Error('ORDER_METADATA_REQUIRED');return {id:n.signal_id,createdAt,settledAt:n.settled_at,market:n.market_type,result:n.result,status:'SETTLED',odds:n.odds==null?null:Number(n.odds),selection:nativeSelection(raw),_rank:rank}};
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
// Absolute monotonic Book revision: accepted unique settlements + accepted corrections.
const revision=s=>{const n=s?.total+(s?.corrections??0);if(!Number.isSafeInteger(n)||n<0)throw Error('INVALID_BOOK_REVISION');return n};
export async function journalAccepted(tx,prior,next,bookState){
 const seq=revision(bookState),stored=await tx.get(journalSeq);
 if(stored!==undefined&&stored!==null&&stored>=seq)throw Error('PROJECTION_SEQUENCE_REGRESSION');
 await tx.put(journalKey(seq),{seq,previous:prior??null,next,at:Date.now()});await tx.put(journalSeq,seq);
 // Remove the active pending index entry in the SAME Book transaction.
 // Preserve the full record for graph metadata and audit.
 const p=await tx.get(pfx+'pending:'+next.signal_id);
 if(p&&(await tx.get(stateKey))?.status==='loaded'){
  const idx=await tx.get(pfx+'pending-index')??[],filtered=idx.filter(x=>x.id!==next.signal_id);
  if(filtered.length!==idx.length){
   await tx.put(pfx+'pending-index',filtered);
   const ps=await tx.get(pfx+'pending-sync')??{};
   await tx.put(pfx+'pending-sync',{...ps,complete:false,reason:'BOOK_CHANGED_SINCE_SOURCE_VERIFICATION'});
   const state=await tx.get(stateKey);if(state){state.generation++;await tx.put(stateKey,state)}
  }
 }
}
// Direct local storage access: no fetch, service binding, or HTTP Journal API.
async function readJournal(store,after=null){
 return store.transaction(async tx=>{
  const s=await tx.get('composite:state');
  if(!s||s.pnl_schema!==1)throw Error('BOOK_NOT_READY');
  const seq=revision(s);
  if(after!==null&&(!Number.isSafeInteger(after)||after<0||after>seq))throw Error('JOURNAL_CURSOR_INVALID');
  const events=[];
  if(after!==null)for(let i=after+1;i<=Math.min(seq,after+25);i++){
   const e=await tx.get(journalKey(i));if(!e||e.seq!==i)throw Error('JOURNAL_GAP');events.push(e);
  }
  return {ok:true,sequence:seq,aggregate:{total:s.total,total_pnl:s.total_pnl,win_rate:s.winRate,raw_counts:Object.fromEntries(R.map(k=>[k,s[k]])),corrections:s.corrections??0},events};
 });
}
export async function journalRead(store,u){
 const after=u.searchParams.has('after')?Number(u.searchParams.get('after')):null;
 try{return json(await readJournal(store,after))}catch(e){return json({ok:false,error:String(e.message).slice(0,80)},503)}
}
const stateView=s=>s?{status:s.status,sequence:s.sequence,generation:s.generation,seedDays:s.nextDay,totalDays:s.manifest.days.length,pendingChunks:s.nextPending,pendingExpected:s.manifest.pending+s.manifest.unresolved,sourceHash:s.manifest.sourceHash,lastAppliedAt:s.lastAppliedAt??null,pendingVerifiedAt:s.pendingVerifiedAt??null,pendingLive:false,pendingSource:'LEGACY_VERIFIED_SNAPSHOT_NO_COMPLETE_DELTA_FEED',lastError:s.lastError??null}:null;
async function seed(store,env,input){
 const action=input?.action;
 if(action==='begin'){
  const m=input.manifest;
  if(!m||!hex(m.sourceHash)||!hex(m.sourceSignature)||!Number.isSafeInteger(m.sequence)||m.sequence<0||!Number.isSafeInteger(m.asOf)||m.asOf<=0||m.asOf>Date.now()+1000||!Number.isSafeInteger(m.expected?.total)||m.expected.total<16074||!Array.isArray(m.days)||m.days.length<1||m.days.length>730||m.days.some((x,i)=>!validDay(x.day)||!hex(x.hash)||!Number.isSafeInteger(x.count)||x.count<1||i&&x.day<=m.days[i-1].day)||m.days.reduce((n,x)=>n+x.count,0)!==m.expected.total||!Number.isSafeInteger(m.pending)||m.pending<0||!Number.isSafeInteger(m.unresolved)||m.unresolved<0||!Array.isArray(m.pendingHashes)||m.pendingHashes.some(x=>!hex(x))||m.pendingHashes.length!==Math.ceil((m.pending+m.unresolved)/50))return json({ok:false,error:'MANIFEST'},400);
  const h=await hash(m),j=await readJournal(store);
  if(m.sequence!==m.expected.total+(m.corrections??0)||m.sequence>j.sequence)return json({ok:false,error:'SEQUENCE_AHEAD_OR_MANIFEST_REVISION'},409);
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
   await tx.put(pfx+'day:'+d.day,rows);await tx.put(pfx+'daily:'+d.day,daily(rows));await tx.put(pfx+'advanced:'+d.day,advancedDaily(rows));s.nextDay++;await tx.put(stateKey,s);return json({ok:true,state:stateView(s)});
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
  // Exact ties are resolved by verified canonical ledger key order, not guessed rank.
  dest.push(r);
  for(const [d,rows] of affected){
   if(new TextEncoder().encode(JSON.stringify(rows)).length>1500000)throw Error('DAY_BUCKET_TOO_LARGE');
   await tx.put(pfx+'day:'+d,rows);days[d]=daily(rows);await tx.put(pfx+'daily:'+d,days[d]);await tx.put(pfx+'advanced:'+d,advancedDaily(rows));
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
// Only the first existing ledger page is fetched here; never the 33-page history.
export async function syncPendingFirstPage(store,{now=Date.now(),fetcher=fetch}={}){
 const syncKey=pfx+'pending-sync',previous=await store.get(syncKey);
 if(previous?.checkedAt&&now-previous.checkedAt<60000)return previous;
 const fail=async reason=>{
  const value={checkedAt:now,verifiedAt:previous?.verifiedAt??null,complete:false,reason};
  await store.put(syncKey,value);return value;
 };
 try{
  const before=await readJournal(store);
  const url='https://www.ball46.com/api/engine/statistics?paged=1';
  const response=await fetcher(url,{headers:{accept:'application/json','cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Receiver-Projection'},signal:AbortSignal.timeout(15000)});
  if(!response.ok||!(response.headers.get('content-type')??'').includes('application/json'))return fail('FIRST_PAGE_NON_JSON_OR_HTTP');
  const d=await response.json();
  if(!d?.ok||d.statisticsSource!=='LEDGER_V2_ONLY'||!Array.isArray(d.rows)||d.rows.length>500||!Number.isSafeInteger(d.pending)||!Number.isSafeInteger(d.unresolved)||!Number.isSafeInteger(d.total))return fail('FIRST_PAGE_SCHEMA');
  const incoming=d.rows.filter(x=>['PENDING','UNRESOLVED'].includes(x.status)),seen=new Set();
  for(const row of incoming){if(!row.id||seen.has(String(row.id))||!Number.isSafeInteger(Number(row.createdAt))||Number(row.createdAt)<=0)throw Error('FIRST_PAGE_PENDING_INVALID');seen.add(String(row.id))}
  const allVisible=incoming.filter(r=>r.status==='PENDING').length===d.pending&&incoming.filter(r=>r.status==='UNRESOLVED').length===d.unresolved;
  return await store.transaction(async tx=>{
   const b=await tx.get('composite:state'),state=await tx.get(stateKey);
   if(!state||state.status!=='loaded'||revision(b)!==before.sequence||d.total!==b.total)return {checkedAt:now,complete:false,reason:'SOURCE_BOOK_REVISION_CHANGED'};
   const old=await tx.get(pfx+'pending-index')??[],idx=new Map(old.map(x=>[x.id,x]));
   let changed=false,conflict=false;
   for(const row of incoming){
    const id=String(row.id);
    if(await tx.get('composite:receipt:'+id)){conflict=true;continue}
    const previousRow=await tx.get(pfx+'pending:'+id);
    if(JSON.stringify(previousRow)!==JSON.stringify(row)){changed=true;await tx.put(pfx+'pending:'+id,row)}
    idx.set(id,{id,market:String(row.market),createdAt:Number(row.createdAt),status:row.status});
   }
   // First-page refresh only merges observed open rows. Removal belongs to accepted Book settlements.
   // Absence from an upstream page is not a settlement event.
   const entries=[...idx.values()],complete=allVisible&&!conflict&&entries.filter(x=>x.status==='PENDING').length===d.pending&&entries.filter(x=>x.status==='UNRESOLVED').length===d.unresolved;
   const sync={checkedAt:now,verifiedAt:complete?now:previous?.verifiedAt??null,complete,bookSequence:before.sequence,expectedPending:d.pending,expectedUnresolved:d.unresolved,firstPagePending:incoming.filter(x=>x.status==='PENDING').length,indexPending:entries.filter(x=>x.status==='PENDING').length,reason:complete?null:'FIRST_PAGE_COVERAGE_NOT_PROVEN'};
   await tx.put(pfx+'pending-index',entries);await tx.put(syncKey,sync);
   if(changed){state.generation++;await tx.put(stateKey,state)}
   return sync;
  });
 }catch(e){return fail(String(e.message).slice(0,100))}
}
export async function projectionAlarm(store,env,{pendingFetcher=fetch}={}){
 const s=await store.get(stateKey);if(!s||s.status!=='loaded')return;
 let delay=30000;
 try{
  const j=await readJournal(store,s.sequence);
  for(const e of j.events)await applyEvent(store,e);
  const after=await store.get(stateKey);
  if(after.sequence===j.sequence){const graphs=await store.get(graphsKey);invariant(graphs,j.aggregate);
   if(after.lastError)await store.transaction(async tx=>{const v=await tx.get(stateKey);if(v.sequence===after.sequence){v.lastError=null;await tx.put(stateKey,v)}});
  }else delay=1000;
 }catch(e){
  await store.transaction(async tx=>{const v=await tx.get(stateKey);if(v){v.lastError=String(e.message).slice(0,100);await tx.put(stateKey,v)}});delay=30000;
 }
 // Throttled and independent of the graph journal. No historical scan.
 try{await syncPendingFirstPage(store,{fetcher:pendingFetcher})}catch{}
 await store.setAlarm(Date.now()+delay);
}
export async function isProjection(store){return !!(await store.get(stateKey))}
export async function projectionHandle(store,env,req,pendingCache=null){
 const u=new URL(req.url),p=u.pathname;
 if(p==='/projection-seed-v1'&&req.method==='POST')return seed(store,env,await req.json());
 if(p==='/projection-wake-v1'&&req.method==='POST'){
  const s=await store.get(stateKey);if(s?.status==='loaded'){const a=await store.getAlarm();if(a===null||a>Date.now()+1000)await store.setAlarm(Date.now()+250)}
  return json({ok:true});
 }
 if(req.method!=='GET')return json({ok:false},405);
 const s=await store.get(stateKey);
 if(p==='/projection-status-v1'){
  const j=await readJournal(store),sync=await store.get(pfx+'pending-sync')??null;const pendingLiveReady=!!(sync?.complete&&sync.bookSequence===j.sequence&&Date.now()-sync.verifiedAt<=90000);
  return json({ok:true,readOnly:true,projection:stateView(s),bookSequence:j.sequence,bookAggregate:j.aggregate,graphReady:s?.status==='loaded'&&!s.lastError&&s.sequence===j.sequence,pendingReadReady:s?.status==='loaded'&&Array.isArray(await store.get(pfx+'pending-index')),pendingLiveReady,pendingSync:sync});
 }
 if(s?.status!=='loaded')return json({ok:false,error:'PROJECTION_NOT_READY'},503);
 const market=u.searchParams.get('market')??'all';
 if(!groups.includes(market))return json({ok:false,error:'MARKET_INVALID'},400);
 const variant=u.searchParams.get('variant')??'all',filter=u.searchParams.get('filter')??'all',range=u.searchParams.get('range')??'all';
 if(!Object.hasOwn(rangeDays,range)||!(/^(all|(?:ft|ht)_[a-z0-9_]{1,64})$/.test(variant))||!(/^[a-z0-9_]{1,64}$/.test(filter)))return json({ok:false,error:'INVALID_ADVANCED_FILTER'},400);
 const advanced=variant!=='all'||filter!=='all'||range!=='all';
 if(advanced&&p!=='/projection-graph-v1')return json({ok:false,error:'FILTER_GRAPH_ONLY'},400);
 if(p==='/projection-graph-v1'){
  const j=await readJournal(store);if(s.lastError||s.sequence!==j.sequence)return json({ok:false,error:'PROJECTION_CATCHING_UP'},503);
  const graphs=await store.get(graphsKey);invariant(graphs,j.aggregate);
  const g=advanced?await filteredGraph(store,s,market,variant,filter,range,Date.now()):graphs[market];
  // Recheck generation: a concurrent event must not pair a new graph with an old state.
  const a=await store.get(stateKey);if(a.generation!==s.generation||a.sequence!==s.sequence)return json({ok:false,error:'GENERATION_CHANGED'},409);
  return json({...g,generation:s.generation,sequence:s.sequence,readOnly:true});
 }
 if(p==='/projection-pending-v1'||p==='/projection-pending-snapshot-v1'){
  const live=p==='/projection-pending-v1';
  const offset=Number(u.searchParams.get('offset')??0),limit=Number(u.searchParams.get('limit')??50);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)return json({ok:false},400);
  // Cache only row payloads, never freshness or Book sequence. Validate against a
  // consistent durable transaction on EVERY request, including warm hits.
  // Settlement/open/metadata writes advance generation in the same transaction.
  const cacheKey=JSON.stringify([market,offset,limit]),now=Date.now();
  const hit=pendingCache?.get(cacheKey);
  const outcome=await store.transaction(async tx=>{
   const meta=await tx.get([stateKey,pfx+'pending-sync','composite:state',pfx+'pending-index']);
   const state=meta.get(stateKey),sync=meta.get(pfx+'pending-sync')??null,book=meta.get('composite:state'),local=meta.get(pfx+'pending-index');
   if(state?.status!=='loaded'||!Array.isArray(local))return {error:'PENDING_INDEX_NOT_READY'};
   const seq=revision(book);
   const coverageVerified=!!(sync?.complete&&sync.bookSequence===seq&&Number.isFinite(sync.verifiedAt)&&now-sync.verifiedAt<=90000);
   const cacheHit=!!(hit&&hit.generation===state.generation&&hit.sequence===seq&&now>=hit.at&&now-hit.at<5000);
   let page;
   if(cacheHit){page=hit.page}
   else{
    const idx=local.filter(r=>market==='all'||marketGroup(r.market)===market).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
    const keys=idx.slice(offset,offset+limit).map(v=>pfx+'pending:'+v.id);
    const records=keys.length?await tx.get(keys):new Map();
    const rows=keys.map(k=>{const row=records.get(k);if(!row)throw Error('MISSING_PENDING_METADATA');return row});
    page={total:idx.length,pending:idx.filter(x=>x.status==='PENDING').length,unresolved:idx.filter(x=>x.status==='UNRESOLVED').length,rows,next:offset+limit<idx.length?offset+limit:null};
   }
   return {cacheHit,page,generation:state.generation,sequence:seq,coverageVerified,coverageReason:coverageVerified?null:(sync?.reason??'FULL_SOURCE_COVERAGE_NOT_VERIFIED'),lastBackgroundCheckAt:sync?.checkedAt??null,expectedSourcePending:sync?.expectedPending??null,indexPending:local.filter(x=>x.status==='PENDING').length,verifiedAt:sync?.verifiedAt??state.pendingVerifiedAt};
  });
  if(outcome.error)return json({ok:false,error:outcome.error},503);
  const {page,cacheHit,generation,sequence,...fresh}=outcome;
  if(pendingCache&&!cacheHit){
   // Bounded per-DO cache. Eviction/restart is always a normal cold read.
   pendingCache.delete(cacheKey);
   if(pendingCache.size>=24)pendingCache.delete(pendingCache.keys().next().value);
   pendingCache.set(cacheKey,{generation,sequence,at:now,page});
  }
  return json({ok:true,readOnly:true,live,source:live?'RECEIVER_PENDING_STATE':'SNAPSHOT_PLUS_OBSERVED_FIRST_PAGE_MINUS_BOOK_SETTLEMENTS',readMode:'DURABLE_OBJECT_STATE_ONLY',generation,...fresh,...page,cacheHit});
 }
 return json({ok:false},404);
}
export const projectionConstants={stateKey,journalSeq,groups,dayKey};
