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
 async fetch(req){
  const path=new URL(req.url).pathname;
  try{
   if(path==='/settled'){
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
    const {rows,run,fail}=await req.json();
    const target=this.env.HOOK_STAGE.get(this.env.HOOK_STAGE.idFromName('receiver:'+run));
    const tasks=[];
    const binding={fetch:async(url,init)=>fail?reply({error:'INTENTIONAL_RECEIVER_FAILURE'},500):target.fetch(url,init)};
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
 if(req.method!=='POST'||u.pathname!=='/test')return reply({ok:false},404);
 try{
  const r=await env.PRODUCTION_READ.fetch('https://www.ball46.com/api/engine/statistics?paged=1',{method:'GET',headers:{accept:'application/json'}});
  if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);
  const data=await r.json();const selected=new Map();
  for(const row of data.rows??[]){if(row?.status==='SETTLED'&&row.id&&row.settledAt&&['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(row.result))selected.set(String(row.id),row);if(selected.size===3)break}
  const rows=[...selected.values()];if(rows.length!==3)throw Error('REAL_ROWS_REQUIRED');
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
