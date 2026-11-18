import {WorkerEntrypoint} from 'cloudflare:workers';
// Shadow-only receiver. No public route, no reads by the existing website.
// Production health is read-only; ingestion is authorized by private service binding.
// No seed or cutover. Conflicting corrections are preserved for reconciliation.
import {normalizeRow,postComposite} from './shadow-composite-cursor-stage.mjs';
const reply=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store'}});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const state0=()=>({received:0,pending:0,duplicates:0,delivered:0,quarantined:0});
export class ShadowProductionStore {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(req){
  const store=this.ctx.storage,path=new URL(req.url).pathname;
  try{
   if(path==='/state'&&req.method==='GET')return reply({ok:true,queue:await store.get('inbox:state')??state0(),book:await store.get('composite:state')??null,alarmScheduled:(await store.getAlarm())!==null});
   if(path==='/audit-snapshot'&&req.method==='GET'){
    // Only the private Durable Object binding can reach this handler.
    if(req.headers.get('x-audit-object')==='inbox'){
     const q=await store.get('inbox:state')??state0();
     return reply({total_received:q.received,duplicate_count:q.duplicates,pending_retry_queue:q.pending});
    }
    if(req.headers.get('x-audit-object')!=='book')return reply({ok:false},400);
    const prefix='composite:receipt:',recent=[];let cursor,settled_count=0,total_pnl=0,w=0,l=0,unknownOdds=0;
    do{
     const rows=await store.list({prefix,limit:500,...(cursor?{startAfter:cursor}:{})});
     if(!rows.size)break;
     for(const [key,raw] of rows){
      cursor=key;const r=normalizeRow(raw);settled_count++;
      if(r.result==='WIN'||r.result==='HALF_WIN'){w++;const odds=Number(r.odds);if(r.odds===null||!Number.isFinite(odds)||odds<1)unknownOdds++;else total_pnl+=(odds-1)*(r.result==='HALF_WIN'?0.5:1);}
      if(r.result==='LOSS'||r.result==='HALF_LOSS'){l++;total_pnl-=r.result==='HALF_LOSS'?0.5:1;}
      recent.push(r);recent.sort((a,b)=>b.settled_at-a.settled_at||a.signal_id.localeCompare(b.signal_id));if(recent.length>5)recent.pop();
     }
     if(rows.size<500)break;
    }while(true);
    return reply({settled_count,recent_5_signals:recent,total_pnl:unknownOdds?null:Math.round(total_pnl*1e8)/1e8,win_rate:w+l?w/(w+l)*100:0});
   }
   if(req.method!=='POST')return reply({ok:false},405);
   if(path==='/book-post'){
    const row=await req.json();
    try{const result=await postComposite(store,row);return reply({ok:true,duplicate:result.duplicate})}
    catch(e){if(e.message==='CORRECTION_REQUIRES_EXPLICIT_HANDLING')return reply({ok:false,error:'CORRECTION_CONFLICT'},409);throw e}
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
  const store=this.ctx.storage,book=this.env.SHADOW_STORE.get(this.env.SHADOW_STORE.idFromName('book-v1'));
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
      else state.delivered++;
      await tx.delete(key);await tx.put('inbox:state',state);
     });
    }catch{retry=true;break}
   }
  }catch{retry=true}
  const pending=await store.list({prefix:'inbox:pending:',limit:1});
  if(pending.size)await store.setAlarm(Date.now()+(retry?30000:1000));
 }
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.hostname!=='shadow.internal')return reply({ok:false},403);
 if(u.pathname==='/audit-snapshot')return reply({ok:false},403);
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

// Named entrypoint is reachable only by a Cloudflare Service Binding targeting it.
// The default HTTP entrypoint always rejects this path, even if a public route is added later.
export class AuditReader extends WorkerEntrypoint {
 async fetch(req){
  const u=new URL(req.url);
  if(u.hostname!=='shadow.internal'||u.pathname!=='/audit-snapshot')return reply({ok:false},403);
  if(req.method!=='GET')return reply({ok:false},405);
  const env=this.env;
  const inbox=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('inbox-v1'));
  const book=env.SHADOW_STORE.get(env.SHADOW_STORE.idFromName('book-v1'));
  const [a,b]=await Promise.all([inbox.fetch('https://store.internal/audit-snapshot',{headers:{'x-audit-object':'inbox'}}),book.fetch('https://store.internal/audit-snapshot',{headers:{'x-audit-object':'book'}})]);
  if(!a.ok||!b.ok)return reply({ok:false},503);
  return reply({inbox:await a.json(),book:await b.json(),readOnly:true});
 }
}
