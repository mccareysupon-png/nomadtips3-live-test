// Isolated replay of the actual deployed ledger method on fresh staging DOs.
// The source bundle is obtained privately by CI, never committed to the repository.
import {b46StageRun} from './private-engine-stage.generated.mjs';
import {postComposite} from './shadow-composite-cursor-stage.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
async function rpc(stub,path,body){
 const r=await stub.fetch('https://stage.internal'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw Error('STAGE_RPC_'+r.status);return r.json();
}
export class HookStage {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async flushRetry(origin){
  const store=this.ctx.storage;
  const run=await store.get('retry:run');
  if(!run)return;
  const target=this.env.HOOK_STAGE.get(this.env.HOOK_STAGE.idFromName('receiver:'+run));
  const pending=await store.list({prefix:'retry:item:',limit:25});
  for(const [key,event] of pending){
   try{
    const res=await target.fetch('https://stage.internal/settled',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events:[event]})});
    if(!res.ok)throw Error('RECEIVER_HTTP_'+res.status);
    const ack=await res.json();if(ack.accepted!==1)throw Error('ACK_MISMATCH');
    await store.transaction(async tx=>{
     const current=await tx.get(key);
     if(current&&JSON.stringify(current)===JSON.stringify(event)){
      await tx.delete(key);
      if(origin==='alarm')await tx.put('retry:alarmDelivered',(await tx.get('retry:alarmDelivered')??0)+1);
     }
    });
   }catch(e){await store.put('retry:lastError',String(e.message).slice(0,80))}
  }
  const remaining=await store.list({prefix:'retry:item:',limit:1});
  if(remaining.size)await store.setAlarm(Date.now()+8000);
  else await store.deleteAlarm();
 }
 async alarm(){
  const store=this.ctx.storage;
  await store.put('retry:alarmRuns',(await store.get('retry:alarmRuns')??0)+1);
  await this.flushRetry('alarm');
 }
 async fetch(req){
  const path=new URL(req.url).pathname;
  try{
   if(path==='/availability'){
    const {offline}=await req.json();
    await this.ctx.storage.put('retry:receiverOffline',offline===true);return reply({ok:true});
   }
   if(path==='/retry-state'){
    const store=this.ctx.storage;
    const items=await store.list({prefix:'retry:item:',limit:100});
    return reply({pending:items.size,runs:await store.get('retry:alarmRuns')??0,delivered:await store.get('retry:alarmDelivered')??0,lastError:await store.get('retry:lastError')??null,alarmScheduled:(await store.getAlarm())!==null});
   }
   if(path==='/settled'){
    if(await this.ctx.storage.get('retry:receiverOffline'))return reply({error:'INTENTIONAL_RECEIVER_FAILURE'},500);
    const {events}=await req.json();
    if(!Array.isArray(events)||!events.length)throw Error('EMPTY_HOOK');
    for(const e of events)await postComposite(this.ctx.storage,e);
    return reply({accepted:events.length});
   }
   if(path==='/state'){
    const rows=await this.ctx.storage.list({prefix:'stat:v2:row:'});
    return reply({legacy:rows.size,newBook:(await this.ctx.storage.get('composite:state'))??null});
   }
   if(path==='/recover-row'){
    const {id}=await req.json();const entries=await this.ctx.storage.list({prefix:'stat:v2:row:'});
    const row=[...entries.values()].find(x=>String(x.id)===String(id));
    if(!row||row.status!=='SETTLED')throw Error('LEGACY_RECOVERY_ROW_NOT_FOUND');
    return reply({signal_id:row.id,result:row.result,market_type:row.market,odds:row.odds,settled_at:row.settledAt});
   }
   if(path==='/legacy'){
    const {rows,run,fail,autoRetry}=await req.json();
    const target=this.env.HOOK_STAGE.get(this.env.HOOK_STAGE.idFromName('receiver:'+run));
    const tasks=[];
    const binding={fetch:async(url,init)=>{
     if(!autoRetry)return fail?reply({error:'INTENTIONAL_RECEIVER_FAILURE'},500):target.fetch(url,init);
     const {events}=JSON.parse(init.body);
     const store=this.ctx.storage;
     await store.transaction(async tx=>{
      await tx.put('retry:run',run);
      for(const event of events){
       const key='retry:item:'+event.signal_id,prior=await tx.get(key);
       if(prior&&JSON.stringify(prior)!==JSON.stringify(event))throw Error('RETRY_CONFLICT');
       await tx.put(key,event);
      }
     });
     await store.setAlarm(Date.now()+8000);
     await this.flushRetry('initial');
     const pending=await store.list({prefix:'retry:item:',limit:1});
     return pending.size?reply({error:'QUEUED_FOR_RETRY'},500):reply({accepted:events.length});
    }};
    const ctx={storage:this.ctx.storage,waitUntil:p=>{tasks.push(p);this.ctx.waitUntil(p)}};
    const result=await b46StageRun(ctx,{B46_SHADOW_RECEIVER:binding},rows);
    await Promise.all(tasks);
    const count=(await this.ctx.storage.list({prefix:'stat:v2:row:'})).size;
    return reply({ok:result.ok,inserted:result.inserted,updated:result.updated,legacy:count,scheduled:tasks.length});
   }
   return reply({ok:false},404);
  }catch(e){return reply({ok:false,error:String(e.message).slice(0,140)},503)}
 }
}
export default {async fetch(req,env){
 if(!env.PROBE_TOKEN||req.headers.get('authorization')!=='Bearer '+env.PROBE_TOKEN)return reply({ok:false,error:'AUTH_REJECTED'},403);
 const u=new URL(req.url),run=u.searchParams.get('run')||'';
 if(!/^\d{1,20}$/.test(run))return reply({ok:false},400);
 if(u.pathname==='/ready')return reply({ok:true,stage:'hook-v1'});
 const legacyRetry=env.HOOK_STAGE.get(env.HOOK_STAGE.idFromName('retry-legacy:'+run));
 const receiverRetry=env.HOOK_STAGE.get(env.HOOK_STAGE.idFromName('receiver:'+run));
 if(req.method==='GET'&&u.pathname==='/retry-status'){
  try{return reply({ok:true,queue:await rpc(legacyRetry,'/retry-state'),legacy:(await rpc(legacyRetry,'/state')).legacy,book:(await rpc(receiverRetry,'/state')).newBook?.total??0})}catch(e){return reply({ok:false,error:String(e.message).slice(0,140)},503)}
 }
 if(req.method==='POST'&&u.pathname==='/retry-enable'){
  try{await rpc(receiverRetry,'/availability',{offline:false});return reply({ok:true})}catch(e){return reply({ok:false,error:String(e.message).slice(0,140)},503)}
 }
 if(req.method!=='POST'||!['/test','/retry-start'].includes(u.pathname))return reply({ok:false},404);
 try{
  const r=await env.PRODUCTION_READ.fetch('https://www.ball46.com/api/engine/statistics?paged=1',{method:'GET',headers:{accept:'application/json'}});
  if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);
  const data=await r.json();const selected=new Map();
  for(const row of data.rows??[]){if(row?.status==='SETTLED'&&row.id&&row.settledAt&&['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(row.result))selected.set(String(row.id),row);if(selected.size===3)break}
  const rows=[...selected.values()];if(rows.length!==3)throw Error('REAL_ROWS_REQUIRED');
  if(u.pathname==='/retry-start'){
   await rpc(receiverRetry,'/availability',{offline:true});
   const res=await rpc(legacyRetry,'/legacy',{rows:[rows[0]],run,autoRetry:true});
   const queue=await rpc(legacyRetry,'/retry-state'),book=(await rpc(receiverRetry,'/state')).newBook?.total??0;
   if(!res.ok||res.legacy!==1||queue.pending!==1||book!==0||queue.lastError!=='RECEIVER_HTTP_500'||!queue.alarmScheduled)throw Error('RETRY_SETUP_FAILED');
   return reply({ok:true,legacy:1,book,queue});
  }
  const legacy=env.HOOK_STAGE.get(env.HOOK_STAGE.idFromName('legacy:'+run)),receiver=env.HOOK_STAGE.get(env.HOOK_STAGE.idFromName('receiver:'+run));
  const normal=await rpc(legacy,'/legacy',{rows:rows.slice(0,2),run,fail:false});
  const first=await rpc(receiver,'/state');
  if(!normal.ok||normal.legacy!==2||normal.scheduled!==1||first.newBook?.total!==2)throw Error('NORMAL_HOOK_FAILED');
  const failed=await rpc(legacy,'/legacy',{rows:rows.slice(2),run,fail:true});
  const second=await rpc(receiver,'/state');
  if(!failed.ok||failed.legacy!==3||failed.scheduled!==1||second.newBook?.total!==2)throw Error('FAILURE_ISOLATION_FAILED');
  // Recovery of the deliberately omitted known ID from authoritative archived input.
  const missed=await rpc(legacy,'/recover-row',{id:rows[2].id});await rpc(receiver,'/settled',{events:[missed]});await rpc(receiver,'/settled',{events:[missed]});
  const final=await rpc(receiver,'/state');
  if(final.newBook?.total!==3)throw Error('RECOVERY_FAILED');
  return reply({ok:true,normal:normal.legacy,legacyAfter500:failed.legacy,receiverAfter500:second.newBook.total,recovered:final.newBook.total,source:'ACTUAL_ENGINE_METHOD_REPLAY_REAL_ARCHIVE',liveProductionHook:false});
 }catch(e){return reply({ok:false,error:String(e.message).slice(0,140)},503)}
}};
