import {WorkerEntrypoint} from 'cloudflare:workers';
// Shadow-only receiver. No public route, no reads by the existing website.
// Production health is read-only; ingestion is authorized by private service binding.
// Historical seed is isolated and checkpointed. No cutover. Newer revisions are applied atomically.
import {normalizeRow,compareCursor} from './shadow-composite-cursor-stage.mjs';
import {journalAccepted,journalRead,projectionHandle,projectionAlarm,isProjection} from './shadow-receiver-projection-v1.mjs';
const reply=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store'}});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const state0=()=>({received:0,pending:0,duplicates:0,delivered:0,quarantined:0});
// P&L fixed-point units (1e-8). Bootstrap only the existing receiver aggregate, never source data.
const results=['WIN','LOSS','HALF_WIN','HALF_LOSS','PUSH'];
const sameRow=(a,b)=>a.signal_id===b.signal_id&&a.settled_at===b.settled_at&&a.result===b.result&&a.market_type===b.market_type&&(a.odds===b.odds||(a.odds!=null&&b.odds!=null&&String(a.odds)===String(b.odds)));
const pnlUnits=r=>{
 if(r.result==='LOSS')return -100000000;
 if(r.result==='HALF_LOSS')return -50000000;
 if(r.result==='PUSH')return 0;
 const n=Number(r.odds);
 if(r.odds==null||!Number.isFinite(n)||n<1)return null;
 const v=Math.round((n-1)*(r.result==='HALF_WIN'?0.5:1)*100000000);
 if(!Number.isSafeInteger(v))throw Error('PNL_OUT_OF_RANGE');
 return v;
};
const changePnl=(s,r,sign)=>{const p=pnlUnits(r);if(p===null)s.unknown_pnl+=sign;else s.pnl_units+=sign*p;};
async function ensureAggregate(tx,s){
 if(s.pnl_schema===1)return;
 const counts={WIN:0,LOSS:0,HALF_WIN:0,HALF_LOSS:0,PUSH:0};
 let total=0,cursor;
 s.pnl_units=0;s.unknown_pnl=0;
 do{
  const rows=await tx.list({prefix:'composite:receipt:',limit:500,...(cursor?{startAfter:cursor}:{})});
  for(const [k,raw] of rows){cursor=k;const r=normalizeRow(raw);counts[r.result]++;total++;changePnl(s,r,1);}
  if(rows.size<500)break;
 }while(true);
 if(total!==s.total||results.some(k=>counts[k]!==s[k]))throw Error('EXISTING_BOOK_AGGREGATE_DRIFT');
 s.pnl_schema=1;s.corrections=s.corrections??0;
}
const newBook=()=>({cursor:null,WIN:0,LOSS:0,PUSH:0,HALF_WIN:0,HALF_LOSS:0,total:0,winRate:0});
async function applyRevision(tx,s,row){
 const key='composite:receipt:'+row.signal_id,old=await tx.get(key),prior=old?normalizeRow(old):null;
 if(prior){
  if(row.settled_at<prior.settled_at)return {stale:true,duplicate:false,corrected:false};
  if(sameRow(prior,row))return {duplicate:true,corrected:false};
  if(row.settled_at===prior.settled_at)throw Error('CORRECTION_REQUIRES_EXPLICIT_HANDLING');
 }
 await ensureAggregate(tx,s);
 if(prior){
  if(s[prior.result]<1)throw Error('OLD_COUNT_UNDERFLOW');
  s[prior.result]--;changePnl(s,prior,-1);s.corrections=(s.corrections??0)+1;
  await tx.put('composite:revision:'+prior.signal_id+':'+prior.settled_at,prior);
 }else s.total++;
 s[row.result]++;changePnl(s,row,1);
 if(s.unknown_pnl<0||!Number.isSafeInteger(s.pnl_units)||results.reduce((n,k)=>n+s[k],0)!==s.total)throw Error('BOOK_AGGREGATE_INVARIANT');
 const w=s.WIN+s.HALF_WIN,l=s.LOSS+s.HALF_LOSS;s.winRate=w+l?w/(w+l)*100:0;
 s.total_pnl=s.unknown_pnl?null:s.pnl_units/100000000;
 if(!s.cursor||compareCursor(row,s.cursor)>0)s.cursor={settled_at:row.settled_at,signal_id:row.signal_id};
 await tx.put(key,row);
 await journalAccepted(tx,prior,row,s);
 return {duplicate:false,corrected:!!prior,stale:false};
}
async function postRevision(storage,raw){
 const row=normalizeRow(raw);
 return storage.transaction(async tx=>{
  const s=await tx.get('composite:state')??newBook();
  const r=await applyRevision(tx,s,row);
  if(!r.duplicate&&!r.stale)await tx.put('composite:state',s);
  return r;
 });
}
const seedMarker='composite:historical-seed:20261118-v1';
const hex64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const canonicalSeed=r=>({signal_id:r.signal_id,settled_at:r.settled_at,result:r.result,market_type:r.market_type,odds:r.odds==null?null:Number(r.odds)});
const seedView=s=>s?{snapshot_hash:s.manifest.hash,source_signature:s.manifest.sourceSignature,source_revision:s.manifest.sourceRevision,cutoff:s.manifest.cutoff,expected:s.manifest.total,next_batch:s.next,batches:s.manifest.batchHashes.length,processed:s.processed,inserted:s.inserted,already_present:s.already,superseded:s.stale,corrected:s.corrected,status:s.status,completed_at:s.completedAt??null}:null;
async function seedHistorical(store,input){
 if(input?.action==='begin'){
  const m=input.manifest;
  if(!m||!hex64(m.hash)||!hex64(m.sourceSignature)||typeof m.sourceRevision!=='string'||!Number.isSafeInteger(m.cutoff)||m.cutoff<=0||m.cutoff>Date.now()+1000||!Number.isSafeInteger(m.total)||m.total<1000||m.total>50000||m.batchSize!==100||!Array.isArray(m.batchHashes)||m.batchHashes.length!==Math.ceil(m.total/100)||m.batchHashes.some(h=>!hex64(h)))return reply({ok:false,error:'SEED_MANIFEST_INVALID'},400);
  const mh=await digest(m);
  return store.transaction(async tx=>{
   const prev=await tx.get(seedMarker);
   if(prev)return reply(prev.manifestHash===mh?{ok:true,seed:seedView(prev)}:{ok:false,error:'DIFFERENT_SNAPSHOT_ALREADY_REGISTERED'},prev.manifestHash===mh?200:409);
   const state=await tx.get('composite:state');
   if(!state||state.pnl_schema!==1||state.total<121||state.unknown_pnl!==0)return reply({ok:false,error:'LIVE_BOOK_NOT_READY'},409);
   const record={manifest:m,manifestHash:mh,status:'loading',next:0,processed:0,inserted:0,already:0,stale:0,corrected:0,lastId:null};
   await tx.put(seedMarker,record);return reply({ok:true,seed:seedView(record)});
  });
 }
 if(input?.action!=='batch'||!hex64(input.snapshot_hash)||!Number.isSafeInteger(input.index)||input.index<0||!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100)return reply({ok:false,error:'SEED_BATCH_INVALID'},400);
 const rows=input.rows.map(r=>canonicalSeed(normalizeRow(r)));
 if(rows.some((r,i)=>r.odds!==null&&!Number.isFinite(r.odds)||i>0&&rows[i-1].signal_id>=r.signal_id))return reply({ok:false,error:'SEED_BATCH_ORDER_OR_ODDS'},400);
 const bh=await digest(rows);
 return store.transaction(async tx=>{
  const rec=await tx.get(seedMarker);
  if(!rec||rec.manifest.hash!==input.snapshot_hash||rec.manifest.batchHashes[input.index]!==bh)return reply({ok:false,error:'SEED_BATCH_HASH_MISMATCH'},409);
  if(input.index<rec.next)return reply({ok:true,already_processed:true,seed:seedView(rec)});
  if(rec.status!=='loading'||input.index!==rec.next||rows.length!==Math.min(100,rec.manifest.total-rec.processed)||rows[0].signal_id<=(rec.lastId??'')||rows.some(r=>r.settled_at>rec.manifest.cutoff))return reply({ok:false,error:'SEED_CHECKPOINT_MISMATCH'},409);
  const state=await tx.get('composite:state');
  if(!state||state.pnl_schema!==1||state.unknown_pnl!==0)throw Error('SEED_BOOK_STATE_INVALID');
  for(const row of rows){
   const r=await applyRevision(tx,state,row);
   if(r.stale)rec.stale++;else if(r.duplicate)rec.already++;else if(r.corrected)rec.corrected++;else rec.inserted++;
  }
  rec.lastId=rows[rows.length-1].signal_id;rec.processed+=rows.length;rec.next++;
  if(rec.processed===rec.manifest.total){rec.status='loaded';rec.completedAt=Date.now();}
  if(rec.inserted+rec.already+rec.stale+rec.corrected!==rec.processed||state.unknown_pnl!==0)throw Error('SEED_TOTAL_INVARIANT');
  await tx.put('composite:state',state);await tx.put(seedMarker,rec);
  return reply({ok:true,seed:seedView(rec)});
 });
}
async function auditBookPage(store,url){
 const cursor=url.searchParams.get('cursor')??'';
 if(cursor.length>512)return reply({ok:false},400);
 const s=await store.get('composite:state');
 const version=x=>x?JSON.stringify([x.total,x.corrections??0,x.pnl_units??null,x.unknown_pnl??null]):null;
 const rows=await store.list({prefix:'composite:receipt:',limit:500,...(cursor?{startAfter:'composite:receipt:'+cursor}:{})});
 const out=[...rows.values()].map(r=>canonicalSeed(normalizeRow(r)));
 const after=await store.get('composite:state');
 if(version(s)!==version(after))return reply({ok:false,error:'BOOK_CHANGED_DURING_PAGE'},409);
 const seed=seedView(await store.get(seedMarker));
 return reply({ok:true,readOnly:true,version:version(after),rows:out,next_cursor:out.length===500?out[out.length-1].signal_id:null,aggregate:after?{total:after.total,total_pnl:after.total_pnl??null,win_rate:after.winRate,raw_counts:Object.fromEntries(results.map(k=>[k,after[k]])),corrections:after.corrections??0}:null,seed});
}
const replayId='quarantine-replay-20261118-v1';
async function authorized(req,expected){
 const supplied=req.headers.get('authorization')??'';
 if(typeof expected!=='string'||expected.length!==64||supplied.length!==71)return false;
 const aa=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supplied)));
 const bb=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Bearer '+expected)));
 let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
export class ShadowProductionStore {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(req){
  const store=this.ctx.storage,path=new URL(req.url).pathname;
  try{
   if(path==='/projection-journal-v1'&&req.method==='GET')return journalRead(store,new URL(req.url));
   if(path.startsWith('/projection-'))return projectionHandle(store,this.env,req);
   if(path==='/statistics-summary-v1'&&req.method==='GET'){
    if(new URL(req.url).searchParams.get('projection')==='journal')return journalRead(store,new URL(req.url));
    // Constant-size read of materialized balance; never scan receipts.
    const data=await store.get('composite:state'),seed=await store.get(seedMarker);
    if(seed?.status!=='loaded'||!data||data.pnl_schema!==1||data.unknown_pnl!==0)return reply({ok:false,error:'BOOK_NOT_READY'},503);
    const raw_counts=Object.fromEntries(results.map(k=>[k,data[k]]));
    if(results.some(k=>!Number.isSafeInteger(raw_counts[k])||raw_counts[k]<0)||results.reduce((n,k)=>n+raw_counts[k],0)!==data.total||!Number.isFinite(data.total_pnl))return reply({ok:false,error:'BOOK_INVARIANT'},503);
    return reply({schema:1,ok:true,source:'RECEIVER_BOOK',scope:'SETTLED_TOTALS_ONLY',readOnly:true,total:data.total,raw_counts,total_pnl:data.total_pnl,win_rate:data.winRate,roi:data.total?data.total_pnl/data.total*100:0,latest_settled_at:data.cursor?.settled_at??null,corrections:data.corrections??0});
   }
   if(path==='/audit-book-page-v1'&&req.method==='GET')return auditBookPage(store,new URL(req.url));
   if(path==='/seed-history-v1'&&req.method==='POST')return seedHistorical(store,await req.json());
   if(path==='/state'&&req.method==='GET')return reply({ok:true,queue:await store.get('inbox:state')??state0(),book:await store.get('composite:state')??null,alarmScheduled:(await store.getAlarm())!==null});
   if(path==='/audit-snapshot'&&req.method==='GET'){
    // Only the private Durable Object binding can reach this handler.
    if(req.headers.get('x-audit-object')==='inbox'){
     const q=await store.get('inbox:state')??state0();
     const info={total_received:q.received,duplicate_count:q.duplicates,pending_retry_queue:q.pending,delivered:q.delivered,quarantined:q.quarantined,stale_ignored:q.stale_ignored??0,stale_delivered:q.stale_delivered??0,corrections_delivered:q.corrections_delivered??0};
     if(new URL(req.url).searchParams.get('quarantine')==='1'){
      const rows=await store.list({prefix:'inbox:quarantine:',limit:100});
      info.quarantine_rows=[...rows.values()].map(e=>({fingerprint:e.fingerprint,row:normalizeRow(e.row)}));
      info.replay=await store.get('inbox:replay:'+replayId)??null;
     }
     return reply(info);
    }
    if(req.headers.get('x-audit-object')!=='book')return reply({ok:false},400);
    const range=new URL(req.url).searchParams;
    const from=range.has('from')?Number(range.get('from')):0,until=range.has('until')?Number(range.get('until')):Number.MAX_SAFE_INTEGER;
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(until)||from<0||until<from)return reply({ok:false},400);
    const detail=range.get('detail')==='1';
    if(detail&&(!range.has('from')||!range.has('until')||until-from>86400000))return reply({ok:false},400);
    const raw_counts={WIN:0,LOSS:0,HALF_WIN:0,HALF_LOSS:0,PUSH:0},audit_rows=[];
    const prefix='composite:receipt:',recent=[];let cursor,settled_count=0,total_pnl=0,w=0,l=0,unknownOdds=0;
    do{
     const rows=await store.list({prefix,limit:500,...(cursor?{startAfter:cursor}:{})});
     if(!rows.size)break;
     for(const [key,raw] of rows){
      cursor=key;const r=normalizeRow(raw);if(r.settled_at<from||r.settled_at>until)continue;settled_count++;raw_counts[r.result]++;
      if(detail){if(audit_rows.length>=2000)return reply({ok:false,error:'AUDIT_WINDOW_TOO_LARGE'},413);audit_rows.push(r);}
      if(r.result==='WIN'||r.result==='HALF_WIN'){w++;const odds=Number(r.odds);if(r.odds===null||!Number.isFinite(odds)||odds<1)unknownOdds++;else total_pnl+=(odds-1)*(r.result==='HALF_WIN'?0.5:1);}
      if(r.result==='LOSS'||r.result==='HALF_LOSS'){l++;total_pnl-=r.result==='HALF_LOSS'?0.5:1;}
      recent.push(r);recent.sort((a,b)=>b.settled_at-a.settled_at||(a.signal_id<b.signal_id?1:a.signal_id>b.signal_id?-1:0));if(recent.length>5)recent.pop();
     }
     if(rows.size<500)break;
    }while(true);
    const aggregate=await store.get('composite:state');
    return reply({settled_count,recent_5_signals:recent,raw_counts,...(detail?{audit_rows}:{}),aggregate:aggregate?{total:aggregate.total,total_pnl:aggregate.total_pnl??null,win_rate:aggregate.winRate,raw_counts:Object.fromEntries(results.map(k=>[k,aggregate[k]])),corrections:aggregate.corrections??0,pnl_schema:aggregate.pnl_schema??0}:null,total_pnl:unknownOdds?null:Math.round(total_pnl*1e8)/1e8,win_rate:w+l?w/(w+l)*100:0});
   }
   if(req.method!=='POST')return reply({ok:false},405);
   if(path==='/book-post'){
    const row=await req.json();
    try{
     const result=await postRevision(store,row);
     if(!result.duplicate&&!result.stale){
      // Projection is in Book storage under a separate v2 key prefix.
      // The original receipt transaction does not depend on projection processing.
      try{if(await isProjection(store)){const alarm=await store.getAlarm();if(alarm===null||alarm>Date.now()+1000)await store.setAlarm(Date.now()+250)}}catch{}
     }
     return reply({ok:true,...result})
    }
    catch(e){if(e.message==='CORRECTION_REQUIRES_EXPLICIT_HANDLING')return reply({ok:false,error:'CORRECTION_CONFLICT'},409);throw e}
   }
   if(path==='/replay-quarantined-v1'){
    const body=await req.json(),ids=body?.fingerprints;
    if(!Array.isArray(ids)||ids.length!==9||new Set(ids).size!==9||ids.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)))return reply({ok:false},400);
    const outcome=await store.transaction(async tx=>{
     const marker='inbox:replay:'+replayId,done=await tx.get(marker);
     if(done)return {ok:true,already:true,...done};
     const q=await tx.get('inbox:state')??state0(),entries=await tx.list({prefix:'inbox:quarantine:',limit:10});
     if(q.quarantined!==9||entries.size!==9||ids.some(x=>!entries.has('inbox:quarantine:'+x)))return {ok:false,error:'QUARANTINE_DRIFT'};
     for(const fp of ids){
      const key='inbox:quarantine:'+fp,event=entries.get(key);
      if(event.fingerprint!==fp)throw Error('QUARANTINE_FINGERPRINT_DRIFT');
      const p='inbox:pending:replay-v1:'+fp;
      if(await tx.get(p))throw Error('REPLAY_PENDING_COLLISION');
      await tx.put('inbox:replay-archive:'+fp,event);await tx.put(p,event);await tx.delete(key);
     }
     q.quarantined-=9;q.pending+=9;await tx.put('inbox:state',q);
     const record={requeued:9,operation:replayId,at:Date.now()};await tx.put(marker,record);
     return {ok:true,already:false,...record};
    });
    if(!outcome.ok)return reply(outcome,409);
    const state=await store.get('inbox:state');if(state.pending&&(await store.getAlarm())===null)await store.setAlarm(Date.now()+1000);
    return reply(outcome);
   }
   if(path!=='/enqueue')return reply({ok:false},404);
   const {events}=await req.json();
   if(!Array.isArray(events)||events.length===0||events.length>500)return reply({ok:false,error:'INVALID_BATCH'},400);
   const inputs=[];for(const raw of events){const row=normalizeRow(raw);inputs.push({row,fingerprint:await digest(row),previous_result:raw.previous_result??null})}
   await store.transaction(async tx=>{
    const state=await tx.get('inbox:state')??state0();
    for(const event of inputs){
     const key='inbox:seen:'+event.fingerprint;
     if(await tx.get(key)){state.duplicates++;continue}
     const latestKey='inbox:latest:'+event.row.signal_id,latest=await tx.get(latestKey);
     if(latest&&event.row.settled_at<latest.settled_at){
      state.stale_ignored=(state.stale_ignored??0)+1;await tx.put(key,true);continue;
     }
     if(!latest||event.row.settled_at>latest.settled_at)await tx.put(latestKey,event.row);
     // The Book's persisted receipt remains authoritative for pre-upgrade IDs and same-time conflicts.
     state.received++;state.pending++;
     const queueKey='inbox:pending:'+String(state.received).padStart(16,'0');
     await tx.put(queueKey,event);await tx.put(key,true);
    }
    await tx.put('inbox:state',state);
   });
   const state=await store.get('inbox:state');
   if(state.pending){const alarm=await store.getAlarm();if(alarm===null)await store.setAlarm(Date.now()+1000)}
   return reply({ok:true,accepted:events.length,durable:true});
  }catch(e){console.error('SHADOW_RECEIVER_ERROR',String(e.message).slice(0,100));return reply({ok:false,error:'SHADOW_STORAGE_OR_VALIDATION_ERROR'},503)}
 }
 async alarm(){
  const store=this.ctx.storage;
  if(await isProjection(store))return projectionAlarm(store,this.env);
  const book=this.env.SHADOW_STORE.get(this.env.SHADOW_STORE.idFromName('book-v1'));
  let retry=false;
  try{
   for(const [key,event] of await store.list({prefix:'inbox:pending:',limit:25})){
    try{
     const res=await book.fetch('https://book.internal/book-post',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event.row)});
     const result=await res.json();
     if(!res.ok&&!(res.status===409&&result.error==='CORRECTION_CONFLICT'))throw Error('BOOK_HTTP_'+res.status);
     await store.transaction(async tx=>{
      if(!await tx.get(key))return;
      const state=await tx.get('inbox:state');state.pending--;
      if(res.status===409){state.quarantined++;await tx.put('inbox:quarantine:'+event.fingerprint,event)}
      else {state.delivered++;if(result.corrected)state.corrections_delivered=(state.corrections_delivered??0)+1;if(result.stale)state.stale_delivered=(state.stale_delivered??0)+1;}
      await tx.delete(key);await tx.put('inbox:state',state);
     });
    }catch{retry=true;break}
   }
  }catch{retry=true}
  const pending=await store.list({prefix:'inbox:pending:',limit:1});
  if(pending.size)await store.setAlarm(Date.now()+(retry?30000:1000));
 }
}
// Never forward an HTML error page as a Receiver API response.
async function projectionJson(request){
 try{
  const r=await request();
  if(!(r.headers.get('content-type')??'').toLowerCase().includes('application/json'))return reply({ok:false,error:'PROJECTION_UPSTREAM_NON_JSON',upstreamStatus:r.status},502);
  const data=await r.json();return reply(data,r.status);
 }catch{return reply({ok:false,error:'PROJECTION_READ_UNAVAILABLE'},503)}
}
const projectionRoutes=Object.freeze({'/audit-projection-journal-v1':'/projection-journal-v1','/audit-projection-status-v1':'/projection-status-v1','/audit-projection-graph-v1':'/projection-graph-v1','/audit-projection-pending-v1':'/projection-pending-v1','/audit-projection-pending-snapshot-v1':'/projection-pending-snapshot-v1'});
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==='/projection-seed-v1'){
  if(u.hostname!=='ball46-shadow-receiver-production.mccarey-supon.workers.dev'||req.method!=='POST'||!await authorized(req,env.PROJECTION_SEED_TOKEN))return reply({ok:false},403);
  const project=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
  return projectionJson(()=>project.fetch(new Request('https://store.internal/projection-seed-v1',req)));
 }
 if(Object.hasOwn(projectionRoutes,u.pathname)){
  if(u.hostname!=='ball46-shadow-receiver-production.mccarey-supon.workers.dev'||req.method!=='GET'||!await authorized(req,env.AUDIT_TOKEN))return reply({ok:false},403);
  return projectionJson(()=>projectionRead(env,projectionRoutes[u.pathname],u.pathname==='/audit-projection-journal-v1'?'':u.search));
 }
 // Explicit API namespace: unknown paths cannot reach a page or SPA.
 if(u.pathname.startsWith('/audit-projection-')||u.pathname.startsWith('/projection-'))return reply({ok:false,error:'API_ROUTE_NOT_FOUND'},404);

 if(u.pathname==='/audit-snapshot'){
  if(u.hostname!=='ball46-shadow-receiver-production.mccarey-supon.workers.dev'||req.method!=='GET')return reply({ok:false},403);
  if(!await authorized(req,env.AUDIT_TOKEN))return reply({ok:false},403);
  return readAuditSnapshot(env,u);
 }
 if(u.pathname==='/audit-statistics-summary-v1'){
  if(u.hostname!=='ball46-shadow-receiver-production.mccarey-supon.workers.dev'||req.method!=='GET'||!await authorized(req,env.AUDIT_TOKEN))return reply({ok:false},403);
  return readStatisticsSummary(env);
 }
 if(u.pathname==='/audit-book-page-v1'){
  if(u.hostname!=='ball46-shadow-receiver-production.mccarey-supon.workers.dev'||req.method!=='GET'||!await authorized(req,env.AUDIT_TOKEN))return reply({ok:false},403);
  const book=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
  const q=new URLSearchParams();if(u.searchParams.has('cursor'))q.set('cursor',u.searchParams.get('cursor'));
  return book.fetch('https://store.internal/audit-book-page-v1?'+q);
 }
 if(u.pathname==='/seed-history-v1'){
  if(u.hostname!=='ball46-shadow-receiver-production.mccarey-supon.workers.dev'||req.method!=='POST'||!await authorized(req,env.SEED_TOKEN))return reply({ok:false},403);
  const book=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
  return book.fetch('https://store.internal/seed-history-v1',req);
 }
 if(u.pathname==='/replay-quarantined-v1'){
  if(u.hostname!=='ball46-shadow-receiver-production.mccarey-supon.workers.dev'||req.method!=='POST'||!await authorized(req,env.REPLAY_TOKEN))return reply({ok:false},403);
  const inbox=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('inbox-v1'));
  return inbox.fetch('https://store.internal/replay-quarantined-v1',req);
 }
 if(u.hostname!=='shadow.internal')return reply({ok:false},403);
 const inbox=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('inbox-v1'));
 if(u.pathname==='/health'&&req.method==='GET'){
  if(!env.SHADOW_HEALTH_TOKEN||req.headers.get('authorization')!=='Bearer '+env.SHADOW_HEALTH_TOKEN)return reply({ok:false,error:'AUTH_REJECTED'},403);
  const book=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
  const a=await inbox.fetch('https://store.internal/state'),b=await book.fetch('https://store.internal/state');
  if(!a.ok||!b.ok)return reply({ok:false},503);
  return reply({ok:true,mode:'SHADOW_ONLY_UNSEEDED',environment:env.SHADOW_ENV,queue:(await a.json()).queue,book:(await b.json()).book,readOnly:true});
 }
 if(u.pathname==='/settled'&&req.method==='POST')return inbox.fetch('https://store.internal/enqueue',req);
 return reply({ok:false},404);
}};

// Internal named binding stays private. The HTTPS route separately checks its own audit-only credential.
async function readAuditSnapshot(env,u){
  const range=new URLSearchParams();
  for(const k of ['from','until','detail'])if(u.searchParams.has(k))range.set(k,u.searchParams.get(k));
  const query=range.toString();
  const inbox=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('inbox-v1'));
  const book=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
  const [a,b]=await Promise.all([inbox.fetch('https://store.internal/audit-snapshot'+(u.searchParams.get('quarantine')==='1'?'?quarantine=1':''),{headers:{'x-audit-object':'inbox'}}),book.fetch('https://store.internal/audit-snapshot'+(query?'?'+query:''),{headers:{'x-audit-object':'book'}})]);
  if(!a.ok||!b.ok)return reply({ok:false},[400,413].includes(b.status)?b.status:503);
  return reply({inbox:await a.json(),book:await b.json(),readOnly:true});
}
export class AuditReader extends WorkerEntrypoint {
 async fetch(req){
  const u=new URL(req.url);
  if(u.hostname!=='shadow.internal'||u.pathname!=='/audit-snapshot')return reply({ok:false},403);
  if(req.method!=='GET')return reply({ok:false},405);
  return readAuditSnapshot(this.env,u);
 }
}

// Website-only future service binding; no browser credential or public default route.
async function readStatisticsSummary(env){
 const book=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
 return book.fetch('https://store.internal/statistics-summary-v1');
}
export class StatisticsReader extends WorkerEntrypoint {
 async fetch(req){
  const u=new URL(req.url);
  if(u.hostname!=='shadow.internal'||u.pathname!=='/statistics-summary-v1')return reply({ok:false},403);
  if(req.method!=='GET')return reply({ok:false},405);
  return readStatisticsSummary(this.env);
 }
}

async function projectionRead(env,path,search){
 const project=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
 return project.fetch(new Request('https://store.internal'+path+search,{method:'GET'}));
}
export class MarketStatisticsReader extends WorkerEntrypoint {
 async fetch(req){
  const u=new URL(req.url);
  if(u.hostname!=='shadow.internal'||!['/projection-status-v1','/projection-graph-v1','/projection-pending-v1'].includes(u.pathname))return reply({ok:false},403);
  if(req.method!=='GET')return reply({ok:false},405);
  return projectionJson(()=>projectionRead(this.env,u.pathname,u.search));
 }
}
