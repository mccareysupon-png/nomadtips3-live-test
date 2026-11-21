/**
 * Separate Pre-Match TEST-ONLY graph receiver.
 * The only upstream dependency is the PREMATCH_STORE **test** service binding.
 * A dedicated SQLite-backed Durable Object namespace owns its own projection;
 * no BALL46 Production, live statistics, provider, engine, or ledger writes.
 */
import {DurableObject} from 'cloudflare:workers';
import {londonBusinessDay,receiverGraph} from './performance-core.mjs';
import {ingestTestPreview} from './test-ledger-import.mjs';

const receiverName='ball46-prematch-performance-test-20261121';
const objectName='prematch-1x2-standalone-test-20261121-v1';
const safeHeaders={'cache-control':'no-store','x-robots-tag':'noindex,nofollow','x-b46-scope':'PREMATCH_TEST_ONLY'};
const fail=(reason,code=503)=>Response.json({ok:false,error:reason,scope:'TEST_ONLY'},{status:code,headers:safeHeaders});
const getStub=env=>env.PREMATCH_PERF_STATE.get(env.PREMATCH_PERF_STATE.idFromName(objectName));
const readTestLedger=async env=>{
 const r=await env.PREMATCH_STORE.fetch('https://prematch.internal/preview-data',{method:'GET'});
 if(!r.ok)throw Error('TEST_SOURCE_HTTP_'+r.status);
 const j=await r.json();
 if(j?.testLedger?.mode!=='TEST_ONLY'||j.dailyBook?.providerCalls!==0)throw Error('NOT_AN_ISOLATED_TEST_LEDGER');
 return j;
};
export class PrematchPerformanceIsolatedDO extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;this.env=env;
  // Hydrate a new isolated state only once from read-only TEST preview data.
  // Reopening a persisted object never fetches or replays history.
  ctx.blockConcurrencyWhile(async()=>{
   if(await ctx.storage.get('projection'))return;
   const result=ingestTestPreview(null,await readTestLedger(env));
   await ctx.storage.put('projection',result.state);
  });
 }
 async fetch(request){
  const u=new URL(request.url);
  if(u.pathname==='/_sync'&&request.method==='POST'){
   let json;
   try{json=await request.json()}catch{return fail('INVALID_TEST_SYNC_PAYLOAD',400)}
   try{
    const result=await this.ctx.storage.transaction(async tx=>{
     const previous=await tx.get('projection');
     const next=ingestTestPreview(previous,json);
     if(next.changed||!previous)await tx.put('projection',next.state);
     return {changed:next.changed,selected:next.selected,settled:next.settled,
      sequence:next.state.snapshot.lastSequence,sourceRows:next.sourceRows};
    });
    return Response.json({ok:true,scope:'TEST_ONLY',...result},{headers:safeHeaders});
   }catch(e){return fail('SYNC_REJECTED_'+String(e.message||e),409)}
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return fail('READ_ONLY',405);
  const state=await this.ctx.storage.get('projection');
  if(!state||state.scope!=='PREMATCH_TEST_ONLY')return fail('TEST_PROJECTION_UNAVAILABLE');
  const snap=state.snapshot;
  if(u.pathname==='/health')return Response.json({
   ok:true,scope:'PREMATCH_TEST_ONLY',receiver:receiverName,
   source:'TEST_ONLY_PREMATCH_STORE',storage:'INDEPENDENT_DURABLE_OBJECT',
   sequence:snap.lastSequence,picks:snap.picks,settled:snap.settled,pending:snap.pending,
   units:snap.netUnits,dailyPoints:snap.daily.length,lastImportedAt:state.lastImportedAt
  },{headers:safeHeaders});
  if(u.pathname==='/graph'){
   const params=new URLSearchParams(u.search);
   const query={market:params.get('market')||'1X2',variant:params.get('variant')||'all',
    filter:params.get('filter')||'all',range:params.get('range')||'all',
    endDay:londonBusinessDay(new Date().toISOString())};
   try{
    const graph=receiverGraph(snap,query);
    return Response.json({...graph,scope:'PREMATCH_TEST_ONLY'},{headers:safeHeaders});
   }catch(e){return fail('INVALID_GRAPH_QUERY_'+String(e.message||e),400)}
  }
  return fail('NOT_FOUND',404);
 }
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return fail('READ_ONLY',405);
  if(url.pathname!=='/health'&&url.pathname!=='/graph')return fail('NOT_FOUND',404);
  try{
   const stub=getStub(env);
   const result=await stub.fetch(new Request('https://private.pm-test'+url.pathname+url.search,{method:'GET'}));
   return new Response(request.method==='HEAD'?null:result.body,{status:result.status,headers:{...safeHeaders,'content-type':'application/json'}});
  }catch(e){return fail('ISOLATED_RECEIVER_UNAVAILABLE',503)}
 },
 async scheduled(controller,env,ctx){
  // Internal read of TEST_ONLY preview, never contact 5USD/Goaloo or LIVE.
  // Normalizations/deduping and commit happen inside the separate DO.
  ctx.waitUntil((async()=>{
   const data=await readTestLedger(env);
   const stub=getStub(env);
   const res=await stub.fetch('https://private.pm-test/_sync',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)
   });
   if(!res.ok)throw Error('TEST_ONLY_SYNC_REJECTED_'+res.status);
  })());
 }
};
