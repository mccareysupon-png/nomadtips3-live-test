import {DurableObject} from 'cloudflare:workers';
import {reduceBounded,generation} from './bounded-summary.mjs';
import {formulas,registry} from './generated-summary-formulas.mjs';
// Internal service binding only. No custom domains, routes, workers.dev, Cron,
// provider credentials or writes to the Engine/Ledger.
export class StatisticsSummary extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.saved=null;this.pending=null;this.checkedAt=0;this.hydrated=false;}
 async read(path){
  if(path!=='/ledger-health'&&!/^\/statistics\?/.test(path))throw Error('READ_PATH_DENIED');
  const u=new URL(path,'https://engine.internal');if(u.pathname==='/statistics'&&(u.searchParams.get('paged')!=='1'||!u.searchParams.get('cursor')?.startsWith('stat:v2:row:')))throw Error('UNSAFE_CURSOR');
  const r=await this.env.ENGINE.fetch(new Request(u,{signal:AbortSignal.timeout(15000)}));
  if(!r.ok)throw Error('ENGINE_HTTP_'+r.status);
  const body=await r.text();if(body.length>12*1024*1024)throw Error('PAGE_SIZE_LIMIT');const data=JSON.parse(body);if(data.ok!==true)throw Error('ENGINE_NOT_OK');return data;
 }
 async refresh(){
  if(this.pending)return this.pending;
  this.pending=(async()=>{
   const meta=await this.read('/ledger-health');
   if(!this.saved||this.saved.signature!==generation(meta)||this.saved.data.daily.tk!==formulas.sportDay(Date.now())){
    const next=await reduceBounded(path=>this.read(path),formulas,registry);await this.ctx.storage.put('summary-v1',next);this.saved=next;
   }
   this.checkedAt=Date.now();
  })();
  try{await this.pending}finally{this.pending=null}
 }
 async fetch(request){
  if(request.method!=='GET'||new URL(request.url).pathname!=='/summary')return new Response('Not found',{status:404});
  if(!this.hydrated){this.saved=await this.ctx.storage.get('summary-v1')||null;this.hydrated=true;}
  let failed=false;
  if(Date.now()-this.checkedAt>=5000){try{await this.refresh()}catch{failed=true;this.checkedAt=Date.now();}}
  if(!this.saved)return Response.json({ok:false,error:'SUMMARY_NOT_READY'},{status:503,headers:{'cache-control':'no-store','retry-after':'5'}});
  const data=this.saved.data,stale=failed||Date.now()-data.asOf>90000||data.daily.tk!==formulas.sportDay(Date.now());
  return Response.json({...data,stale},{headers:{'cache-control':'no-store'}});
 }
}
export default {fetch(request,env){return env.SUMMARY.get(env.SUMMARY.idFromName('global')).fetch(request)}};
