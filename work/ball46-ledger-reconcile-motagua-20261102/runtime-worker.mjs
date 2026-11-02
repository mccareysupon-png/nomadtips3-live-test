// LOCAL TEST ENTRYPOINT ONLY. Never included in a Cloudflare upload.
import{Nomad343Engine,__test as t}from'./stage/runtime-engine.mjs';
export class TestHarness extends Nomad343Engine{
 async fetch(request){const path=new URL(request.url).pathname;if(path==='/seed'){const rows=await request.json(),meta=t.blankLedgerMeta();for(const row of rows){await this.ctx.storage.put(t.ledgerKey(row),row);t.applyLedgerMeta(meta,row,1)}await this.ctx.storage.put(t.metaKey,meta);return Response.json({ok:true})}
 if(path==='/apply')return Response.json(await this.__b46NamedRepair());
 if(path==='/restore')return Response.json(await this.__b46LedgerWrite(()=>this.__b46RestoreNamedRepair('b46:ledger:repair:motagua:203745645:20261102:v1','b46:ledger:duplicate-alias:v1:'+t.plan.duplicateId)));
 if(path==='/transaction-failure'){try{await this.ctx.storage.transaction(async tx=>{await tx.put('local-test-atomic','changed');throw Error('SIMULATED_ROLLBACK')})}catch(e){if(e.message!=='SIMULATED_ROLLBACK')throw e}return Response.json({rolledBack:await this.ctx.storage.get('local-test-atomic')===undefined})}
 if(path==='/snapshot'){const rows=await this.ctx.storage.list({prefix:t.prefix}),meta=await this.ctx.storage.get(t.metaKey),j=await this.ctx.storage.get('b46:ledger:repair:motagua:203745645:20261102:v1');return Response.json({rows:[...rows.values()],meta,journal:j})}
 return new Response('Local test route only',{status:404})
 }
}
export default{fetch(request,env){return env.TEST.get(env.TEST.idFromName('isolated-local-ledger')).fetch(request)}};
