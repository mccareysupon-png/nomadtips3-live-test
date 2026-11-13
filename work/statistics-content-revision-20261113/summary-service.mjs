import {DurableObject} from 'cloudflare:workers';
import {reduceBounded,generation} from './bounded-summary.mjs';
import {formulas,registry} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
import {SnapshotStore} from './snapshot-store.mjs';
import {readEngine} from './engine-reader.mjs';
// TEST candidate: internal service binding, no provider keys, routes or Cron.
export class StatisticsSummary extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.store=new SnapshotStore(ctx.storage);this.pending=null;this.checkedAt=0;this.saved=null;this.failed=false;}
 async read(path){return readEngine(this,path)}
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
   if(u.pathname==='/history'&&u.searchParams.get('cursor')?.startsWith('snap1:'))return await this.store.response(u.searchParams.get('cursor'),Number(u.searchParams.get('limit')||2000));
   if(Date.now()-this.checkedAt>=5000||(!this.saved&&!this.checkedAt)){try{await this.refresh()}catch(error){this.failed=true;this.failureCode=String(error.message||'SUMMARY_REFRESH_FAILED').slice(0,100);this.checkedAt=Date.now();const old=await this.store.active();if(!this.saved&&old)this.saved={...old.summary,stale:true,historySnapshotId:old.id};}}
   if(!this.saved)return Response.json({ok:false,error:'SUMMARY_NOT_READY',sourceErrorCode:this.failureCode??null,sourcePageLimit:this.sourcePageLimit??2000},{status:503,headers:{'cache-control':'no-store','retry-after':'5'}});
   if(u.pathname==='/summary')return Response.json({...this.saved,sourceErrorCode:this.failed?this.failureCode??null:null,sourcePageLimit:this.sourcePageLimit??2000,stale:this.failed||this.saved.stale||Date.now()-this.saved.asOf>90000||this.saved.daily.tk!==formulas.sportDay(Date.now())},{headers:{'cache-control':'no-store'}});
   const m=await this.store.active();if(!m||m.expiresAt<=Date.now())return Response.json({ok:false,error:'HISTORY_NOT_READY'},{status:503,headers:{'retry-after':'5','cache-control':'no-store'}});
   return await this.store.response(this.store.firstCursor(m),Number(u.searchParams.get('limit')||2000));
  }catch(error){return Response.json({ok:false,error:error.status===410?'STATISTICS_SNAPSHOT_EXPIRED':'STATISTICS_UNAVAILABLE'},{status:error.status||503,headers:{'cache-control':'no-store'}})}
 }
}
export default {fetch(request,env){return env.SUMMARY.get(env.SUMMARY.idFromName(env.STATISTICS_SOURCE_ID||'global')).fetch(request)}};
