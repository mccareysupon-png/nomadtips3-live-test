// Test candidate: restricted service-binding transport. No independent provider key in clients.
import {parseHistoryPath} from './history-gateway.mjs';
const host='https://api.5dollarfootballapi.com';
const pathID=/^[1-9]\d{0,15}$/;
const json=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store'}});
const route='/__private/provider/v1';
export function classifyProviderPath(kind,path,now){
 if(typeof path!=='string'||!path.startsWith('/v1/')||path.length>650)throw Error('invalid_path');
 const u=new URL(path,host);
 if(u.origin!==host||u.hash||u.username||u.password)throw Error('invalid_origin');
 if(kind==='history')return parseHistoryPath(path,now).path;
 const m=/^\/v1\/fixtures\/([1-9]\d{0,15})\/odds(\/history)?$/.exec(u.pathname);
 if(!m||!pathID.test(m[1]))throw Error('invalid_fixture');
 const q=u.searchParams,keys=[...q.keys()].sort().join(',');
 if(kind==='referee'){
  if(!m[2]||keys!=='bookmaker,market,per_page'||q.get('bookmaker')!=='bet365'||q.get('per_page')!=='500'||!/^corners?(?:[_-][a-z0-9]+){0,5}$/i.test(q.get('market')??''))throw Error('invalid_referee');
 }else if(kind==='fullmarket'){
  if(m[2]||keys!=='bookmakers'||!/^([A-Za-z0-9_-]{1,40})(,[A-Za-z0-9_-]{1,40}){0,39}$/.test(q.get('bookmakers')??''))throw Error('invalid_fullmarket');
 }else throw Error('invalid_kind');
 return u.pathname+u.search;
}
export async function forwardProvider(env,kind,url){
 if(!env?.HUB||!env?.PROVIDER_BRIDGE_SECRET)throw Error('CENTRAL_PROVIDER_BRIDGE_REQUIRED');
 const u=new URL(url);if(u.origin!==host||u.hash)throw Error('INVALID_PROVIDER_URL');
 // Forward only the required upstream reply, including rate/Retry-After headers.
 return env.HUB.fetch('https://hub.internal'+route,{method:'POST',headers:{authorization:'Bearer '+env.PROVIDER_BRIDGE_SECRET,'content-type':'application/json'},body:JSON.stringify({kind,path:u.pathname+u.search})});
}
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
// Public wrapper must intercept this route BEFORE any generic proxy routing;
// trusted binding credentials differ per caller; no wildcard or fallback.
export function makeProviderBridge({secrets,historyHandler,reserve,observe,failed,transport,clock=Date.now,enabled=false}){
 if(!secrets||[historyHandler,reserve,observe,failed,transport].some(x=>typeof x!=='function'))throw Error('BRIDGE_ADAPTER_REQUIRED');
 const keys=Object.values(secrets);if(keys.some(k=>typeof k!=='string'||k.length<24)||new Set(keys).size!==keys.length)throw Error('DISTINCT_CALLER_KEYS_REQUIRED');
 return async req=>{
  if(new URL(req.url).pathname!==route||req.method!=='POST')return json({error:'NOT_FOUND'},404);
  let j;try{j=await req.json()}catch{return json({error:'NOT_FOUND'},404)}
  if(!['history','referee','fullmarket'].includes(j?.kind)||!same(req.headers.get('Authorization'),'Bearer '+secrets[j.kind]))return json({error:'NOT_FOUND'},404);
  if(Object.keys(j).sort().join(',')!=='kind,path')return json({error:'BAD_REQUEST'},400);
  let path;try{path=classifyProviderPath(j.kind,j.path,Math.floor(clock()/1000))}catch{return json({error:'BAD_PATH'},400)}
  if(!enabled)return j.kind==='history'?json({state:'deferred_budget',reason:'BRIDGE_DISABLED'}):json({error:'BRIDGE_DISABLED'},503);
  if(j.kind==='history')return historyHandler(new Request('https://hub.internal/internal/prematch-history/page',{method:'POST',headers:{'content-type':'application/json','x-bridge-verified':'1'},body:JSON.stringify({path})}));
  let lease;try{lease=await reserve({kind:j.kind,path})}catch{return json({error:'QUOTA_UNVERIFIED'},503)}
  if(!lease?.allowed)return json({error:lease?.reason??'QUOTA_DENIED'},429);
  let r;try{r=await transport(path,lease)}catch{await failed(lease);return json({error:'TRANSPORT_UNCERTAIN_NO_RETRY'},502)}
  try{await observe(r,lease)}catch{return json({error:'QUOTA_OBSERVATION_FAILED'},502)}
  return r;
 };
}
