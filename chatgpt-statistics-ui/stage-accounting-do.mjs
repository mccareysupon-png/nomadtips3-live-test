// Isolated accounting storage; initialize exactly once from verified staging archive.
import {seedMarketAccounts,marketSnapshot} from './market-accounting-stage.mjs';
import {marketGroup} from './market-groups-stage.mjs';
import {postNewBook} from './new-accounting-book-stage.mjs';
export class StageAccountingBook {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(request){
  const u=new URL(request.url);
  if(u.pathname==='/seed'&&request.method==='POST'){
   const old=await this.ctx.storage.get('new-book:v1');
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
  if(u.pathname==='/balance'&&request.method==='GET'){
   const m=await this.ctx.storage.get('opening:manifest');
   if(!m)return Response.json({ok:false,error:'OPENING_BALANCE_NOT_READY'},{status:503});
   const all=await this.ctx.storage.get('opening:all');
   const rows=await this.ctx.storage.list({prefix:'opening:market:'});
   const accounts=Object.fromEntries([...rows].map(([k,v])=>[k.slice(15),v]));
   return Response.json({ok:true,...marketSnapshot({all,accounts}),...m});
  }
  return new Response('Not found',{status:404});
 }
}
