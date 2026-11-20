// Real HUB actor adapter candidate. Imported only into the proposed version.
// History is hard OFF until account coordination and seed plan are established.
import {makeProviderBridge} from './provider-bridge.mjs';
const route='/__private/provider/v1',host='https://api.5dollarfootballapi.com';
const no=()=>Response.json({error:'NOT_FOUND'},{status:404,headers:{'cache-control':'no-store'}});
const unavailable=()=>Response.json({error:'BRIDGE_UNAVAILABLE'},{status:503});
const keys=env=>({history:env.B46_HISTORY_BRIDGE_SECRET,referee:env.B46_REFEREE_BRIDGE_SECRET,fullmarket:env.B46_MARKET_BRIDGE_SECRET});
const handlers=new WeakMap();
export async function dispatchCentralActor(actor,req){
 if(new URL(req.url).hostname!=='hub.internal'||new URL(req.url).pathname!==route||req.method!=='POST')return no();
 try{
  let handle=handlers.get(actor);
  if(!handle){
   const p=actor.bulkSpeed,env=actor.env;if(!p||!env?.FIVEDOLLAR_API_KEY)return unavailable();
   handle=makeProviderBridge({secrets:keys(env),enabled:true,historyHandler:async()=>Response.json({state:'deferred_budget',reason:'ACCOUNT_COORDINATION_NOT_VERIFIED'}),
    reserve:async x=>{const lease=await p.before(x.path,x.kind==='referee'?'REFEREE':'FULLMARKET');return {...lease,allowed:true}},
    observe:(r,lease)=>p.observe(r,lease),failed:lease=>p.failed(lease),
    transport:async(path,lease)=>fetch(host+path,{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+env.FIVEDOLLAR_API_KEY,accept:'application/json'}})});
   handlers.set(actor,handle);
  }
  return handle(req);
 }catch{return unavailable()}
}
export function wrapCentralDefault(base){
 return {...base,async fetch(req,env,ctx){
  const u=new URL(req.url);
  if(u.pathname!==route)return base.fetch(req,env,ctx);
  if(u.hostname!=='hub.internal'||req.method!=='POST')return no();
  // Service binding + per-caller credentials; no browser path.
  const k=Object.values(keys(env)),auth=req.headers.get('Authorization');
  if(!k.some(x=>typeof x==='string'&&x.length>=24&&auth==='Bearer '+x))return no();
  return env.HUB.get(env.HUB.idFromName('global')).fetch(req);
 }};
}
