// Isolated accounting storage; initialize exactly once from verified staging archive.
import {seedMarketAccounts,marketSnapshot} from './market-accounting-stage.mjs';
import {marketGroup} from './market-groups-stage.mjs';
import {applyMarketTransition} from './market-accounting-stage.mjs';
export class StageAccountingBook {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(request){
  const u=new URL(request.url);
  if(u.pathname==='/seed'&&request.method==='POST'){
   const old=await this.ctx.storage.get('opening:manifest');
   if(old)return Response.json({ok:true,revision:old.revision,existing:true});
   const kv=this.env.B46_STAGE_STATS_KV;
   const meta=await kv.get('verified-full-meta-v1','json');
   if(!meta?.key)throw Error('VERIFIED_ARCHIVE_REQUIRED');
   const raw=await kv.get(meta.key,'arrayBuffer');
   const data=await new Response(new Response(raw).body.pipeThrough(new DecompressionStream('gzip'))).json();
   const book=seedMarketAccounts({...data,rows:data.rows.map(r=>({...r,market:marketGroup(r.market)}))});
   // Store shards separately: Durable Object value size limit.
   await this.ctx.storage.transaction(async tx=>{
    if(await tx.get('opening:manifest'))return;
    for(const [key,value] of Object.entries(book.accounts))await tx.put('opening:market:'+key,value);
    await tx.put('opening:all',book.all);
    await tx.put('opening:manifest',{revision:0,ledgerTotal:data.ledgerTotal,savedAt:data.snapshotSavedAt});
   });
   return Response.json({ok:true,revision:0,ledgerTotal:data.ledgerTotal});
  }
  if(u.pathname==='/post'&&request.method==='POST'){
   const event=await request.json();
   if(!event.committed||!event.id||!event.newRow?.id)return Response.json({ok:false,error:'INVALID_EVENT'},{status:400});
   const result=await this.ctx.storage.transaction(async tx=>{
    const m=await tx.get('opening:manifest');
    if(!m)throw Error('OPENING_BALANCE_NOT_READY');
    const marker='event:'+event.id;
    if(await tx.get(marker))return {ok:true,mode:'ALREADY_APPLIED',revision:m.revision};
    const all=await tx.get('opening:all');
    const rows=await tx.list({prefix:'opening:market:'});
    const accounts=Object.fromEntries([...rows].map(([k,v])=>[k.slice('opening:market:'.length),v]));
    const normalize=r=>r?{...r,market:marketGroup(r.market)}:null;
    const next=applyMarketTransition({all,accounts},normalize(event.oldRow),normalize(event.newRow));
    if(next.mode.includes('REBUILD'))throw Error(next.mode);
    await tx.put('opening:all',next.state.all);
    for(const [k,v] of Object.entries(next.state.accounts))await tx.put('opening:market:'+k,v);
    await tx.put(marker,true);
    await tx.put('opening:manifest',{...m,revision:m.revision+1,ledgerTotal:next.state.all.stats.ledgerTotal});
    return {ok:true,mode:next.mode,revision:m.revision+1};
   });
   return Response.json(result);
  }
  if(u.pathname==='/balance'&&request.method==='GET'){
   const m=await this.ctx.storage.get('opening:manifest');
   if(!m)return Response.json({ok:false,error:'OPENING_BALANCE_NOT_READY'},{status:503});
   const all=await this.ctx.storage.get('opening:all');
   const rows=await this.ctx.storage.list({prefix:'opening:market:'});
   const accounts=Object.fromEntries([...rows].map(([k,v])=>[k.slice('opening:market:'.length),v]));
   return Response.json({ok:true,...marketSnapshot({all,accounts}),...m});
  }
  return new Response('Not found',{status:404});
 }
}
