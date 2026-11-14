// Isolated cloud-hosted staging ONLY. No bindings to Production Engine, Ledger,
// cron, production workers, or production routes. Private header required.
import {DurableObject} from 'cloudflare:workers';
import {PersistedReadStore} from './persisted-read-store.mjs';
import html from './qa/real-index.html';
import workspace from './qa/real-workspace.txt';
const prefix='b46:stat:read-v2:';
const send=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
const header={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'};
const staticOrigin='https://ball46-production.mccarey-supon.workers.dev';
export class StageReadDO extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.store=new PersistedReadStore(ctx.storage)}
 async fetch(request){
  const u=new URL(request.url);
  if(u.pathname==='/__qa/import'){
   if(request.method!=='POST')return send(405,{ok:false});
   const b=await request.json(),rev=Number(b.revision),batch=Number(b.batch),entries=b.entries;
   if(!Number.isSafeInteger(rev)||rev<1||!Number.isSafeInteger(batch)||batch<0||!Array.isArray(entries)||entries.length>25)return send(400,{ok:false,error:'INVALID_BATCH'});
   const marker='b46:stage:import:'+rev+':'+batch;
   const duplicate=await this.ctx.storage.get(marker);
   if(duplicate)return send(409,{ok:false,error:'DUPLICATE_BATCH'});
   const obj={};for(const [key,value]of entries){
    if(typeof key!=='string'||!key.startsWith(prefix+rev+':')||key===prefix+'active'||Object.hasOwn(obj,key))return send(400,{ok:false,error:'INVALID_KEY'});
    obj[key]=value;
   }
   if(!entries.length)return send(400,{ok:false,error:'EMPTY_BATCH'});
   await this.ctx.storage.transaction(async tx=>{await tx.put(obj);await tx.put(marker,entries.length)});
   return send(200,{ok:true,count:entries.length,batch});
  }
  if(u.pathname==='/__qa/activate'){
   if(request.method!=='POST')return send(405,{ok:false});
   const b=await request.json(),rev=Number(b.revision),batches=Number(b.batches),keys=Number(b.keys),sourceRows=Number(b.sourceRows);
   if(!Number.isSafeInteger(rev)||!Number.isSafeInteger(batches)||batches<1||batches>1000||!Number.isSafeInteger(keys)||keys<1||!Number.isSafeInteger(sourceRows))return send(400,{ok:false,error:'ACTIVATION_FIELDS'});
   let total=0;for(let i=0;i<batches;i++){const n=await this.ctx.storage.get('b46:stage:import:'+rev+':'+i);if(!Number.isSafeInteger(n))return send(409,{ok:false,error:'MISSING_BATCH_'+i});total+=n}
   if(total!==keys)return send(409,{ok:false,error:'STAGING_KEY_COUNT_MISMATCH'});
   const manifest=await this.ctx.storage.get(prefix+rev+':manifest');
   if(!manifest||manifest.contentRevision!==rev||manifest.sourceRows!==sourceRows||manifest.summary?.ledgerTotal!==sourceRows||manifest.pages<1||manifest.views<8)return send(409,{ok:false,error:'STAGING_MANIFEST_MISMATCH'});
   for(const market of ['all','1x2','ah','ou','btts','corners','cards','other']){
    const k=JSON.stringify([market,'all','all']);
    const view=await this.ctx.storage.get(prefix+rev+':view:'+encodeURIComponent(k));
    if(!view||view.totalRows!==manifest.summary.marketCounts[market])return send(409,{ok:false,error:'MARKET_COUNT_MISMATCH:'+market});
    const first=await this.ctx.storage.get(prefix+rev+':page:'+encodeURIComponent(k)+':1');
    if(!Array.isArray(first)||first.length>50)return send(409,{ok:false,error:'MARKET_FIRST_PAGE_MISSING:'+market});
   }
   await this.ctx.storage.transaction(async tx=>{
    const previousKey=await tx.get(prefix+'active');
    if(previousKey){const prior=await tx.get(previousKey);if(prior?.contentRevision>=rev)throw Error('STALE_STAGE_REVISION')}
    await tx.put(prefix+'active',prefix+rev+':manifest');
   });
   return send(200,{ok:true,revision:rev,sourceRows,pages:manifest.pages,views:manifest.views});
  }
  if(request.method!=='GET')return send(405,{ok:false});
  if(u.pathname==='/fast-summary'){const v=await this.store.summary();return send(v.ok?200:503,v)}
  if(u.pathname==='/fast-view'){
   const range=u.searchParams.get('rangeDays')||'all';
   const v=await this.store.view({
    market:u.searchParams.get('market')||'all',variant:u.searchParams.get('variant')||'all',filter:u.searchParams.get('filter')||'all',
    page:Number(u.searchParams.get('page')||1),limit:Number(u.searchParams.get('limit')||50),
    rangeDays:range==='all'?'all':Number(range),revision:u.searchParams.get('revision')
   });
   return send(v.status||200,v);
  }
  return send(404,{ok:false,error:'UNKNOWN_READ'});
 }
}
export default {async fetch(request,env,ctx){
 const u=new URL(request.url),token=request.headers.get('x-b46-stage-auth');
 if(!env.STAGE_TOKEN||token!==env.STAGE_TOKEN)return send(403,{ok:false,error:'PRIVATE_STAGING'});
 if(u.pathname.startsWith('/__qa/')){
  if(request.method!=='POST')return send(405,{ok:false});
  return env.READ_MODEL.get(env.READ_MODEL.idFromName('stat-stage-'+env.STAGE_ID)).fetch(new Request('https://internal.invalid'+u.pathname,{method:'POST',headers:{'content-type':'application/json'},body:request.body,duplex:'half'}));
 }
 if(['/api/statistics/fast-summary','/api/statistics/fast-view'].includes(u.pathname)){
  if(request.method!=='GET')return send(405,{ok:false});
  const internal='/'+u.pathname.replace('/api/statistics/','');
  return env.READ_MODEL.get(env.READ_MODEL.idFromName('stat-stage-'+env.STAGE_ID)).fetch(new Request('https://internal.invalid'+internal+u.search));
 }
 if(request.method!=='GET')return send(405,{ok:false});
 if(u.pathname==='/'||u.pathname==='/index.html'){
  const origin=u.origin;const patched=html.replaceAll('https://ball46.com/',origin+'/').replaceAll('https://www.ball46.com/',origin+'/');
  return new Response(patched,{headers:header});
 }
 if(u.pathname==='/singlepage-workspace-343.js')return new Response(workspace,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
 if(u.pathname.startsWith('/api/')){
  return send(200,{ok:true,preview:true,fixtures:[],signals:[],rows:[],ledgerRows:[],ledgerTotal:0,total:0,pending:0,unresolved:0,hasMore:false,markets:{},data:[],events:[]});
 }
 if(!/^\/[a-zA-Z0-9_./-]+\.(?:m?js|css|png|webp|avif|svg|jpe?g|gif|woff2?|ttf|ico|txt)$/.test(u.pathname)||u.pathname.includes('..'))return send(404,{ok:false,error:'STAGING_STATIC_ONLY'});
 const src=new URL(u.pathname+u.search,staticOrigin);
 const res=await fetch(src.toString(),{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!res.ok)return send(502,{ok:false,error:'STAGING_STATIC_SOURCE_'+res.status});
 const h=new Headers(res.headers);for(const key of ['content-length','content-encoding','etag','set-cookie','access-control-allow-origin'])h.delete(key);h.set('cache-control','public,max-age=300');h.set('x-robots-tag','noindex,nofollow');
 return new Response(res.body,{status:200,headers:h});
}};
