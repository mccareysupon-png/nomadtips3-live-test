// QA harness only: never upload/deploy this entry point.
import {DurableObject} from 'cloudflare:workers';
import {Nomad343Engine as Engine} from './source/engine.js';
import {ShadowSummary} from './summary.mjs';
import {ledgerTestAdapter} from './test-ledger-adapter.mjs';
export class SummaryHarness extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;}
 async fetch(request){
  const source={engineVersion:'02e09215-02b1-47fb-b1cf-9423f50c7ce9',engineSha:'30aef0bb9c4be48a40c4bf38bf113b40ca1fd2d384187eefc275829c43e8ba56',generation:'runtime-test'};
  const wrapped=await ledgerTestAdapter(this.ctx.storage,'runtime',source,{mode:'ISOLATED_TEST_STORAGE'});
  const shadow=new ShadowSummary(this.ctx.storage,'runtime'),{operation,row}=await request.json();
  if(operation==='write'){
   const result=await Engine.prototype.__b46UpsertLedgerUnlocked.call({ctx:{storage:wrapped}},[row]);
   return Response.json({result,summary:await shadow.read()});
  }
  if(operation==='read')return Response.json(await shadow.read());
  if(operation==='rollback'){
   try{await wrapped.transaction(async tx=>{await tx.put('stat:v2:row:rollback-fixture',row);throw Error('ROLLBACK_TEST');});}catch(e){if(e.message!=='ROLLBACK_TEST')throw e;}
   return Response.json(await shadow.read());
  }
  return new Response('Unknown operation',{status:400});
 }
}
export default {fetch(request,env){return env.HARNESS.get(env.HARNESS.idFromName('isolated-qa')).fetch(request);}};
