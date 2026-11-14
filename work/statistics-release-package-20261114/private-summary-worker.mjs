// New private service only; never writes to Engine or provider endpoints.
import {DurableObject} from 'cloudflare:workers';
import {PersistedReadStore} from '../statistics-read-model-v2-20261114/persisted-read-store.mjs';
import {PinnedSourceReader} from '../statistics-read-model-v2-20261114/pinned-source-reader.mjs';
import {formulas} from '../statistics-read-model-v2-20261114/qa/current-formulas.mjs';
import {registry} from '../statistics-read-model-v2-20261114/qa/current-registry.mjs';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
export class StatisticsReadModel extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.store=new PersistedReadStore(ctx.storage);this.reader=new PinnedSourceReader(this.store,env.ENGINE,{registry,formulas,budgetMs:120000});this.lastCheck=0;this.lastRequest=0;this.refreshing=null;}
 kick(){if(this.refreshing)return;this.lastCheck=Date.now();this.refreshing=this.reader.refresh().catch(()=>{}).finally(()=>{this.refreshing=null});this.ctx.waitUntil(this.refreshing);}
 async alarm(){if(Date.now()-this.lastRequest>600000)return;try{await this.reader.refresh()}catch{}finally{await this.ctx.storage.setAlarm(Date.now()+5000)}}
 async fetch(request){
  const u=new URL(request.url);if(request.method!=='GET')return Response.json({ok:false,error:'GET_ONLY'},{status:405,headers});
  if(!['/ready','/fast-summary','/fast-view'].includes(u.pathname))return new Response('Not found',{status:404});
  this.lastRequest=Date.now();if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+5000);
  if(Date.now()-this.lastCheck>=5000)this.kick();
  if(u.pathname==='/ready'){const m=await this.store.active();return Response.json({ok:!!m},{status:m?200:503,headers})}
  if(u.pathname==='/fast-summary'){const s=await this.store.summary();return Response.json(s,{status:s.ok?200:503,headers})}
  const q=u.searchParams,range=q.get('rangeDays')||'all';
  const v=await this.store.view({market:q.get('market')||'all',variant:q.get('variant')||'all',filter:q.get('filter')||'all',page:Number(q.get('page')||1),limit:Number(q.get('limit')||50),rangeDays:range==='all'?'all':Number(range),metric:q.get('metric')||'units',revision:q.get('revision')});
  return Response.json(v,{status:v.status||200,headers});
 }
}
export default{fetch(request,env){const p=new URL(request.url).pathname;if(request.method!=='GET'||!['/ready','/fast-summary','/fast-view'].includes(p))return new Response('Not found',{status:404});return env.READ_MODEL.get(env.READ_MODEL.idFromName('statistics-read-model-v2')).fetch(request)}};
