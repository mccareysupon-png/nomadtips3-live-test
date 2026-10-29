/*
 * BALL46 Performance Snapshot V1 preview sidecar.
 * Safe to run in local CI. Not deployed or routed to production.
 * Only GET /api/performance/snapshot reads the dedicated D1 aggregate.
 * Only scheduled() calls BALL46's existing public Statistics endpoint.
 */
import {createPagedStatisticsSource} from './source-pages.mjs';
import {createD1SnapshotStore} from './d1-store.mjs';
import {getSnapshot,refreshSnapshot} from './snapshot-service.mjs';

const ALLOWED_ORIGINS=new Set(['https://ball46.com','https://www.ball46.com']);
function response(data,status,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'x-content-type-options':'nosniff',
    'x-robots-tag':'noindex, nofollow, noarchive',
    'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
    'cache-control':'no-store',
    ...headers
  }});
}
function cors(origin){
  return origin&&ALLOWED_ORIGINS.has(origin)?{
    'access-control-allow-origin':origin,
    'access-control-allow-methods':'GET, OPTIONS',
    'access-control-allow-headers':'accept',
    'vary':'Origin'
  }:{};
}
export function createPreviewApp({store,source,clock=Date.now}){
  if(!store?.read||!store?.putIfNewer)throw Error('SNAPSHOT_STORE_UNAVAILABLE');
  return {
    async fetch(request){
      const url=new URL(request.url);
      const origin=request.headers.get('origin');
      const headers=cors(origin);
      if(request.method==='OPTIONS'&&url.pathname==='/api/performance/snapshot'){
        return new Response(null,{status:204,headers:{
          ...headers,'cache-control':'no-store'
        }});
      }
      if(request.method!=='GET')return response({ok:false,error:'METHOD_NOT_ALLOWED'},405,headers);
      if(url.pathname==='/health'){
        return response({ok:true,role:'ball46-performance-snapshot-preview',mode:'preview-isolated'},200,headers);
      }
      if(url.pathname!=='/api/performance/snapshot')
        return response({ok:false,error:'NOT_FOUND'},404,headers);
      try{
        const result=await getSnapshot({store,nowMs:clock()});
        if(!result.ok)return response({ok:false,error:result.reason},result.status,headers);
        return response(result.payload,200,{
          ...headers,
          'cache-control':'public, max-age=15',
          'x-b46-snapshot-age':String(result.ageSeconds),
          'x-b46-snapshot-schema':'v1'
        });
      }catch{
        return response({ok:false,error:'SNAPSHOT_UNAVAILABLE'},503,headers);
      }
    },
    async scheduled(){
      if(!source?.head||!source?.pages)throw Error('READONLY_SOURCE_MISSING');
      return await refreshSnapshot({store,source,nowMs:clock()});
    }
  };
}
function appFromEnv(env){
  if(!env?.SNAPSHOT_DB)throw Error('ISOLATED_SNAPSHOT_DB_MISSING');
  return createPreviewApp({
    store:createD1SnapshotStore(env.SNAPSHOT_DB),
    source:createPagedStatisticsSource(fetch),
  });
}
export default {
  async fetch(request,env){
    try{return await appFromEnv(env).fetch(request)}
    catch{return response({ok:false,error:'PREVIEW_NOT_CONFIGURED'},503)}
  },
  async scheduled(_event,env,ctx){
    const task=appFromEnv(env).scheduled();
    ctx?.waitUntil?.(task);
    await task;
  }
};
