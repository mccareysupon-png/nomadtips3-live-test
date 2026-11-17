// Isolated staging persistence probe. No Engine write or production route.
// Actual archived source rows only. NOT a live settlement feed or source sequence.
import {normalizeRow,compareCursor,postComposite} from './shadow-composite-cursor-stage.mjs';
const results=new Set(['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS']);
function normalized(r){
 if(r?.status!=='SETTLED'||!results.has(r.result)||!r.id||!Number.isFinite(Number(r.settledAt))||Number(r.settledAt)<=0)return null;
 return {id:String(r.id),result:r.result,market:String(r.market??''),odds:r.odds??null,settledAt:Number(r.settledAt)};
}
const response=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export class ShadowPersistenceProbe {
 constructor(ctx){this.storage=ctx.storage}
 async fetch(req){
  const path=new URL(req.url).pathname;
  if(req.method==='POST'&&path==='/composite-post')return response(await postComposite(this.storage,await req.json()));
  if(req.method==='GET'&&path==='/composite-state')return response({state:await this.storage.get('composite:state')??null});
  if(req.method==='GET'&&path==='/state'){
   const balance=await this.storage.get('balance')??{WIN:0,LOSS:0,PUSH:0,HALF_WIN:0,HALF_LOSS:0,total:0};
   const pending=await this.storage.list({prefix:'pending:',limit:20});
   return response({balance,pending:pending.size});
  }
  if(req.method==='GET'&&path==='/pending'){
   const pending=await this.storage.list({prefix:'pending:',limit:20});
   return response({rows:[...pending.values()]});
  }
  if(req.method!=='POST')return response({ok:false},405);
  const row=await req.json();
  if(!row?.id||!results.has(row.result))return response({ok:false},400);
  if(path==='/queue'){
   await this.storage.transaction(async tx=>{
    const key='pending:'+row.id,old=await tx.get(key);
    if(old&&JSON.stringify(old)!==JSON.stringify(row))throw Error('QUEUE_CONFLICT');
    if(!old)await tx.put(key,row);
   });
   return response({ok:true});
  }
  if(path==='/ack'){await this.storage.delete('pending:'+row.id);return response({ok:true});}
  if(path==='/post'){
   const value=await this.storage.transaction(async tx=>{
    const key='receipt:'+row.id,old=await tx.get(key);
    if(old){if(JSON.stringify(old)!==JSON.stringify(row))throw Error('RECEIPT_CONFLICT');return {duplicate:true}}
    const balance=await tx.get('balance')??{WIN:0,LOSS:0,PUSH:0,HALF_WIN:0,HALF_LOSS:0,total:0};
    balance[row.result]++;balance.total++;
    await tx.put(key,row);await tx.put('balance',balance);return {duplicate:false};
   });
   return response({ok:true,...value});
  }
  return response({ok:false},404);
 }
}
const rpc=async(stub,path,row)=>{const r=await stub.fetch('https://shadow.internal'+path,row?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(row)}:{method:'GET'});if(!r.ok)throw Error('PROBE_STORAGE_HTTP_'+r.status);return r.json()};
export default {async fetch(req,env){
 if(!env.PROBE_TOKEN||req.headers.get('authorization')!=='Bearer '+env.PROBE_TOKEN)return response({ok:false},403);
 const u=new URL(req.url),run=u.searchParams.get('run')||'';
 if(!/^\d{1,20}$/.test(run))return response({ok:false,error:'INVALID_RUN'},400);
 const queue=env.PROBE_BOOK.get(env.PROBE_BOOK.idFromName('queue:'+run));
 const book=env.PROBE_BOOK.get(env.PROBE_BOOK.idFromName('book:'+run));
 try{
  if(req.method==='POST'&&u.pathname==='/import'){
   const r=await env.PRODUCTION_READ.fetch('https://www.ball46.com/api/engine/statistics?paged=1',{method:'GET',headers:{accept:'application/json'}});
   if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);
   const d=await r.json();if(!d.ok||!Array.isArray(d.rows))throw Error('SOURCE_INVALID');
   const distinct=new Map();for(const raw of d.rows){const x=normalized(raw);if(x&&!distinct.has(x.id))distinct.set(x.id,x);if(distinct.size===5)break}
   if(distinct.size!==5)throw Error('FIVE_ARCHIVED_ROWS_REQUIRED');
   for(const row of distinct.values())await rpc(queue,'/queue',row);
   // Stop before delivery to simulate a receiver outage; queue is durable.
   return response({ok:true,source:'REAL_ARCHIVED_ROWS_NOT_LIVE_EVENTS',queued:distinct.size});
  }
  if(req.method==='POST'&&u.pathname==='/cursor-probe'){
   const r=await env.PRODUCTION_READ.fetch('https://www.ball46.com/api/engine/statistics?paged=1',{method:'GET',headers:{accept:'application/json'}});
   if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);
   const d=await r.json();if(!d.ok||!Array.isArray(d.rows))throw Error('SOURCE_INVALID');
   const unique=new Map();for(const raw of d.rows){const row=normalized(raw);if(row&&!unique.has(row.id))unique.set(row.id,normalizeRow(row))}
   const all=[...unique.values()].sort(compareCursor);if(all.length<10)throw Error('TEN_REAL_ROWS_REQUIRED');
   // Prefer a real same-timestamp pair when one exists.
   const pair=all.findIndex((x,i)=>i>0&&x.settled_at===all[i-1].settled_at);
   const start=pair>0?Math.max(0,Math.min(pair-3,all.length-10)):all.length-10;
   const selected=all.slice(start,start+10);
   const stub=env.PROBE_BOOK.get(env.PROBE_BOOK.idFromName('cursor:'+run));
   if((await rpc(stub,'/composite-state')).state)throw Error('FRESH_CURSOR_BOOK_REQUIRED');
   const rounds=[];
   // Omit one older row, then recover it with overlapping replay after cursor advances.
   for(const group of [selected.slice(0,4),selected.slice(5,10),selected]){
    let accepted=0,duplicates=0,late=0;
    for(const row of group){const ack=await rpc(stub,'/composite-post',row);if(ack.duplicate)duplicates++;else{accepted++;if(ack.late)late++}}
    const state=(await rpc(stub,'/composite-state')).state;
    rounds.push({accepted,duplicates,late,total:state.total,cursor:state.cursor});
   }
   const state=(await rpc(stub,'/composite-state')).state;
   const expected=selected[9];
   if(rounds[0].total!==4||rounds[1].total!==9||rounds[2].accepted!==1||rounds[2].duplicates!==9||rounds[2].late!==1||state.total!==10||compareCursor(state.cursor,expected)!==0)throw Error('CURSOR_PROBE_FAILED');
   return response({ok:true,rounds,realSameTimestamp:selected.some((x,i)=>i>0&&x.settled_at===selected[i-1].settled_at),source:'REAL_ARCHIVED_ROWS',sourceCommitSequenceVerified:false});
  }
  if(req.method==='POST'&&u.pathname==='/gap-probe'){
   // Deliberately omit two real archived signals from a fresh isolated test book.
   // Recover known IDs from the authoritative source, never invent a commit sequence.
   const fetchPage=async cursor=>{
    const endpoint=new URL('https://www.ball46.com/api/engine/statistics?paged=1');
    if(cursor)endpoint.searchParams.set('cursor',cursor);
    const r=await env.PRODUCTION_READ.fetch(endpoint.toString(),{method:'GET',headers:{accept:'application/json'}});
    if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);
    const d=await r.json();if(!d.ok||!Array.isArray(d.rows))throw Error('SOURCE_INVALID');return d;
   };
   const initial=await rpc(book,'/state');
   if(initial.balance.total!==0)throw Error('FRESH_PROBE_BOOK_REQUIRED');
   const first=await fetchPage(null),selected=new Map();
   for(const raw of first.rows){const row=normalized(raw);if(row&&!selected.has(row.id))selected.set(row.id,row);if(selected.size===5)break}
   if(selected.size!==5)throw Error('FIVE_ARCHIVED_ROWS_REQUIRED');
   for(const row of [...selected.values()].slice(0,3))await rpc(book,'/post',row);
   const before=(await rpc(book,'/state')).balance.total;
   if(before!==3)throw Error('GAP_SETUP_FAILED');
   const found=new Map();let cursor=null,pages=0;const seen=new Set();
   do{
    const d=await fetchPage(cursor);pages++;
    for(const raw of d.rows){const row=normalized(raw);if(row&&selected.has(row.id))found.set(row.id,row)}
    if(found.size===5)break;
    cursor=d.nextCursor??null;
    if(cursor&&seen.has(cursor))throw Error('SOURCE_CURSOR_REPEAT');
    if(cursor)seen.add(cursor);
   }while(cursor&&pages<3);
   if(found.size!==5)throw Error('SOURCE_TARGETS_NOT_FOUND');
   let recovered=0,duplicate=0;
   for(const [id,row] of found){
    if(JSON.stringify(row)!==JSON.stringify(selected.get(id)))throw Error('SOURCE_CHANGED_DURING_PROBE');
    const ack=await rpc(book,'/post',row);
    if(ack.duplicate)duplicate++;else recovered++;
   }
   const final=(await rpc(book,'/state')).balance;
   if(recovered!==2||duplicate!==3||final.total!==5)throw Error('GAP_RECOVERY_MISMATCH');
   return response({ok:true,before,recovered,duplicate,final,pages,source:'REAL_ARCHIVE_ID_LOOKUP',sourceSequenceVerified:false});
  }
  if(req.method==='POST'&&u.pathname==='/recover'){
   const {rows}=await rpc(queue,'/pending');let duplicate=0;
   for(const row of rows){await rpc(book,'/post',row);const again=await rpc(book,'/post',row);if(again.duplicate)duplicate++;await rpc(queue,'/ack',row)}
   return response({ok:true,processed:rows.length,duplicate});
  }
  if(req.method==='GET'&&u.pathname==='/state')return response({ok:true,generation:env.PROBE_GENERATION,book:(await rpc(book,'/state')).balance,pending:(await rpc(queue,'/state')).pending,sourceSequenceVerified:false});
  return response({ok:false},404);
 }catch(e){return response({ok:false,error:String(e.message).slice(0,100)},503)}
}};
