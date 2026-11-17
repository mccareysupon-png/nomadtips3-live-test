// Production shadow inbox ONLY. No UI/read routing, no writes to the legacy Engine.
// Private Worker: service binding is the trust boundary for POST /settled.
// Health requires a separate secret; health never creates a ledger entry.
import {normalizeRow,compareCursor} from './shadow-composite-cursor-stage.mjs';
import {apply,display} from './clean-statistics-book.mjs';
const response=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const zero=()=>({win:0,loss:0,push:0,halfWin:0,halfLoss:0,net:0,stake:0});
const digest=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const rowForBook=x=>({status:'SETTLED',result:x.result,odds:x.odds});
export class ProductionShadowInbox {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(req){
  try{
   const path=new URL(req.url).pathname,store=this.ctx.storage;
   if(req.method==='GET'&&path==='/health'){
    const state=await store.get('shadow:state');
    const [pending,conflicts]=await Promise.all([store.list({prefix:'pending:',limit:1}),store.list({prefix:'conflict:',limit:1})]);
    return response({ok:true,mode:'SHADOW_WRITE_ONLY',seeded:false,total:state?.balance?.stake??0,hasPending:pending.size>0,hasConflicts:conflicts.size>0});
   }
   if(req.method!=='POST'||path!=='/settled')return response({ok:false},404);
   const body=await req.json(),events=body?.events;
   if(!Array.isArray(events)||events.length===0||events.length>500)return response({ok:false,error:'INVALID_BATCH'},400);
   const rows=await Promise.all(events.map(async raw=>{
    const row=normalizeRow(raw);
    const previous_result=raw.previous_result??null;
    // Validate financial calculation before accepting, preserve the source event.
    apply(zero(),null,rowForBook(row));
    const event={...row,previous_result},id=await digest(event);
    return {id,event};
   }));
   await store.transaction(async tx=>{
    for(const {id,event} of rows){
     const old=await tx.get('journal:'+id);
     if(!old){await tx.put('journal:'+id,event);await tx.put('pending:'+id,event);}
    }
    // Schedule only after queue rows are transactionally written; in same transaction.
    await tx.setAlarm(Date.now()+1000);
   });
   return response({ok:true,accepted:events.length});
  }catch(e){return response({ok:false,error:'SHADOW_INBOX_REJECTED'},503)}
 }
 async alarm(){
  const store=this.ctx.storage;
  // Bounded batches. Incoming data and journal remain durable even on failure.
  const entries=await store.list({prefix:'pending:',limit:32});
  for(const [key,event] of entries){
   await store.transaction(async tx=>{
    const current=await tx.get(key);if(!current)return;
    const id=key.slice('pending:'.length),signalKey='signal:'+event.signal_id;
    const prior=await tx.get(signalKey);
    const state=await tx.get('shadow:state')??{balance:zero(),cursor:null};
    if(prior){
     const equal=prior.result===event.result&&prior.odds===event.odds&&prior.market_type===event.market_type&&prior.settled_at===event.settled_at;
     if(!equal){
      // No authoritative correction revision: quarantine instead of applying potentially stale correction.
      await tx.put('conflict:'+id,{event,reason:'UNVERIFIED_CORRECTION_ORDER'});
     }
    }else if(event.previous_result!==null){
     await tx.put('conflict:'+id,{event,reason:'PRE_SHADOW_CORRECTION_REQUIRES_SEED'});
    }else{
     state.balance=apply(state.balance,null,rowForBook(event));
     if(!state.cursor||compareCursor(event,state.cursor)>0)state.cursor={settled_at:event.settled_at,signal_id:event.signal_id};
     await tx.put(signalKey,event);await tx.put('shadow:state',state);
    }
    await tx.delete(key);
   });
  }
  // Serialize pending check and alarm schedule with ingestion.
  await store.transaction(async tx=>{
   const left=await tx.list({prefix:'pending:',limit:1});
   if(left.size)await tx.setAlarm(Date.now()+1000);
   else await tx.deleteAlarm();
  });
 }
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==='/health'){
  if(req.method!=='GET'||!env.SHADOW_HEALTH_TOKEN||req.headers.get('authorization')!=='Bearer '+env.SHADOW_HEALTH_TOKEN)return response({ok:false},403);
 }else if(u.pathname!=='/settled'||req.method!=='POST')return response({ok:false},404);
 const book=env.PRODUCTION_SHADOW_BOOK.get(env.PRODUCTION_SHADOW_BOOK.idFromName('production-unseeded-shadow-v1'));
 return book.fetch(req);
}};
