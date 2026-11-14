// Isolated Miniflare Durable Object TEST harness; not deployed and no Production bindings.
import {DurableObject} from 'cloudflare:workers';
import {PersistedReadStore} from './persisted-read-store.mjs';
import {registry,formulas} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
export class StatsStageDO extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.model=new PersistedReadStore(ctx.storage)}
 async fetch(request){
  const url=new URL(request.url),send=(code,value)=>Response.json(value,{status:code,headers:{'cache-control':'no-store'}});
  if(url.pathname==='/__qa/publish'){
   if(request.method!=='POST'||request.headers.get('x-local-stage')!=='1')return send(403,{ok:false,error:'TEST_AUTH_REQUIRED'});
   const data=await request.json();try{
    const m=await this.model.publish(data.rows,{contentRevision:data.revision,asOf:data.asOf,registry,formulas});
    return send(200,{ok:true,sourceRows:m.sourceRows,views:m.views,pages:m.pages,revision:m.contentRevision});
   }catch(e){return send(409,{ok:false,error:String(e.message||e)})}
  }
  if(request.method!=='GET')return send(405,{ok:false,error:'GET_ONLY'});
  if(url.pathname==='/fast-summary'){const v=await this.model.summary();return send(v.ok?200:503,v)}
  if(url.pathname==='/fast-view'){
   const range=url.searchParams.get('rangeDays')||'all',out=await this.model.view({
    market:url.searchParams.get('market')||'all',variant:url.searchParams.get('variant')||'all',filter:url.searchParams.get('filter')||'all',
    page:Number(url.searchParams.get('page')||1),limit:Number(url.searchParams.get('limit')||50),
    rangeDays:range==='all'?'all':Number(range),revision:url.searchParams.get('revision')
   });return send(out.status||200,out);
  }
  return send(404,{ok:false,error:'STAGING_API_ONLY'});
 }
}
export default{fetch(request,env){return env.STAGING.get(env.STAGING.idFromName('local-stage-isolated')).fetch(request)}};
