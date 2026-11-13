import {DurableObject} from 'cloudflare:workers';
import {reduceBounded,generation} from './bounded-summary.mjs';
import {formulas,registry} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
import {SnapshotStore} from './snapshot-store.mjs';
// TEST candidate: internal service binding, no provider keys, routes or Cron.
export class StatisticsSummary extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.store=new SnapshotStore(ctx.storage);this.pending=null;this.checkedAt=0;this.saved=null;this.failed=false;}
 async read(path){
  const u=new URL(path,'https://engine.internal');
  if(u.pathname!=='/ledger-health'&&(u.pathname!=='/statistics'||u.searchParams.get('paged')!=='1'||!u.searchParams.get('cursor')?.startsWith('stat:v2:row:')))throw Error('READ_PATH_DENIED');
  const r=await this.env.ENGINE.fetch(new Request(u,{signal:AbortSignal.timeout(15000)}));
  if(Number(r.headers.get('content-length'))>12*1024*1024)throw Error('PAGE_SIZE_LIMIT');
  const body=await r.text();if(body.length>12*1024*1024)throw Error('PAGE_SIZE_LIMIT');const data=JSON.parse(body);
  if(!r.ok||data.ok!==true)throw Error(r.status===409?'SOURCE_CHANGED':'ENGINE_HTTP_'+r.status);return data;
 }
 async refresh(){
  if(this.pending)return this.pending;
  const task=(async()=>{
   const old=await this.store.active(),meta=await this.read('/ledger-health');
   let manifest=old;
   if(!old||old.signature!==generation(meta)||old.expiresAt<=Date.now()||old.summary.daily.tk!==formulas.sportDay(Date.now())){
    let error;for(let i=0;i<3;i++){try{manifest=await this.store.build(p=>this.read(p),(read,opts)=>reduceBounded(read,formulas,registry,opts));error=null;break}catch(e){error=e;if(e.message!=='SOURCE_CHANGED')break}}
    if(error)throw error;
   }
   // A rate-limited rebuild may still return the previous verified generation.
   const same=manifest.signature===generation(meta),asOf=same?Number(meta.updatedAt):manifest.sourceAsOf;
   this.saved={...manifest.summary,asOf,stale:!same||Date.now()-asOf>90000,historySnapshotId:manifest.id};this.failed=!same;this.checkedAt=Date.now();
  })();this.pending=task;try{await task}finally{if(this.pending===task)this.pending=null}
 }
 async fetch(request){
  const u=new URL(request.url);if(request.method!=='GET'||!['/summary','/history'].includes(u.pathname))return new Response('Not found',{status:404});
  try{
   if(u.pathname==='/history'&&u.searchParams.get('cursor')?.startsWith('snap1:'))return Response.json(await this.store.page(u.searchParams.get('cursor'),Number(u.searchParams.get('limit')||2000)),{headers:{'cache-control':'no-store'}});
   if(Date.now()-this.checkedAt>=5000||(!this.saved&&!this.checkedAt)){try{await this.refresh()}catch(error){this.failed=true;this.checkedAt=Date.now();const old=await this.store.active();if(!this.saved&&old)this.saved={...old.summary,stale:true,historySnapshotId:old.id};}}
   if(!this.saved)return Response.json({ok:false,error:'SUMMARY_NOT_READY'},{status:503,headers:{'cache-control':'no-store','retry-after':'5'}});
   if(u.pathname==='/summary')return Response.json({...this.saved,stale:this.failed||this.saved.stale||Date.now()-this.saved.asOf>90000||this.saved.daily.tk!==formulas.sportDay(Date.now())},{headers:{'cache-control':'no-store'}});
   const m=await this.store.active();if(!m||m.expiresAt<=Date.now())return Response.json({ok:false,error:'HISTORY_NOT_READY'},{status:503,headers:{'retry-after':'5','cache-control':'no-store'}});
   return Response.json(await this.store.page(this.store.firstCursor(m),Number(u.searchParams.get('limit')||2000)),{headers:{'cache-control':'no-store'}});
  }catch(error){return Response.json({ok:false,error:error.status===410?'STATISTICS_SNAPSHOT_EXPIRED':'STATISTICS_UNAVAILABLE'},{status:error.status||503,headers:{'cache-control':'no-store'}})}
 }
}
export default {fetch(request,env){return env.SUMMARY.get(env.SUMMARY.idFromName('global')).fetch(request)}};
