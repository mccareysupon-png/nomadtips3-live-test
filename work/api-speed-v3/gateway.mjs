import{verifyOwner,errorResponse,controlPath}from'./owner-auth.mjs';
const PRIVATE='/__bulk-speed-v3',OWNER_HOST='ball46-owner-control-v2.mccarey-supon.workers.dev';
const headers={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const fail=(message,status=403)=>Object.assign(Error(message),{status});
export async function actorControl(hub,request){try{
 const owner=await verifyOwner(request,hub.env,{internal:true}),path=controlPath(request);
 if(path==='/control'){if(request.method!=='GET')throw fail('USE_OWNER_SPEED_CONTROL_V3',409);return Response.json(await hub.settings(),{headers});}
 if(!['GET','PUT'].includes(request.method))throw fail('METHOD_NOT_ALLOWED',405);
 let applied={};if(request.method==='PUT'){
  const text=await request.text();if(new TextEncoder().encode(text).length>2048)throw fail('BODY_TOO_LARGE',413);let body;try{body=JSON.parse(text)}catch{throw fail('INVALID_JSON',400)}
  applied=await hub.bulkSpeed.apply(body,owner);
  if(!applied.unchanged){const control=await hub.control(),delay=await hub.bulkSpeed.alarmDelay(control,control.liveRefreshSeconds*1000);await hub.scheduleNext(control,delay);}
 }
 const status=await hub.bulkSpeed.status(),health=await hub.health(),meta=await hub.meta();
 return Response.json({ok:true,...status,...applied,owner:{email:owner.email},health:{...health,liveDataAgeMs:meta?.liveFetchedAt?Math.max(0,Date.now()-meta.liveFetchedAt):null}},{headers});
}catch(e){return errorResponse(e);}}
export function wrapHub(previous){return{...previous,async fetch(request,env,ctx){
 const path=controlPath(request);if(path===PRIVATE)return errorResponse(fail('PRIVATE_ROUTE_DENIED'));
 if(!['/bulk-settings','/control'].includes(path))return previous.fetch(request,env,ctx);
 try{await verifyOwner(request,env,{internal:true});if(!['GET','PUT'].includes(request.method))throw fail('METHOD_NOT_ALLOWED',405);if(path==='/control'&&request.method!=='GET')throw fail('USE_OWNER_SPEED_CONTROL_V3',409);
  const url=new URL(request.url);url.pathname=path==='/control'?'/control':PRIVATE;
  if(!env.HUB?.get)throw fail('HUB_NOT_CONNECTED',503);
  return env.HUB.get(env.HUB.idFromName('global')).fetch(new Request(url,request));
 }catch(e){return errorResponse(e);}
}};}
export function wrapAdmin(previous){return{...previous,async fetch(request,env,ctx){
 if(controlPath(request)!=='/api/settings')return previous.fetch(request,env,ctx);
 try{if(new URL(request.url).hostname!==OWNER_HOST)throw fail('ADMIN_HOST_DENIED');await verifyOwner(request,env);if(!['GET','PUT'].includes(request.method))throw fail('METHOD_NOT_ALLOWED',405);
  if(!env.HUB?.fetch)throw fail('HUB_NOT_CONNECTED',503);const u=new URL(request.url);u.pathname='/bulk-settings';u.search='';const r=await env.HUB.fetch(new Request(u,request));return new Response(r.body,{status:r.status,headers});
 }catch(e){return errorResponse(e);}
}};}
