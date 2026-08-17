import settlementWorker,{Car31State} from './settlement-v2.js';
import {handleAnimationRequest} from './animation-v3-source.js';
import {enrichLiveResponseWithGoalooClock} from './goaloo-clock.js';

const OWNER_KEY_SHA256='6bdd1677e4d09eed8474307188f7d3aa03129cca66336e2a27e5933799aea20c';
const OWNER_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type,x-owner-key'
};

function json(data,status=200){return new Response(JSON.stringify(data,null,2),{status,headers:OWNER_HEADERS});}
async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function ownerAuthorized(request){
  const key=request.headers.get('x-owner-key')||'';
  if(!key)return false;
  return (await sha256Hex(key))===OWNER_KEY_SHA256;
}

// CAR 3.1 runtime continuity: same Durable Object, engine rules, BET365
// settlement contract and every-minute Cron. Only owner mutation routes are
// protected so CAR 3.5 can safely control config without exposing writes.
export{Car31State};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const ownerMutation=(url.pathname==='/config'||url.pathname==='/scan')&&request.method==='POST';

    if(request.method==='OPTIONS'&&(url.pathname==='/config'||url.pathname==='/scan')){
      return new Response(null,{status:204,headers:OWNER_HEADERS});
    }
    if(ownerMutation&&!(await ownerAuthorized(request))){
      return json({ok:false,error:'OWNER_AUTH_REQUIRED'},401);
    }
    if((request.method==='GET'||request.method==='OPTIONS')&&url.pathname==='/animation'){
      return handleAnimationRequest(request,env,settlementWorker);
    }
    if(request.method==='GET'&&url.pathname==='/live'){
      const response=await settlementWorker.fetch(request,env,ctx);
      return enrichLiveResponseWithGoalooClock(response);
    }
    return settlementWorker.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return settlementWorker.scheduled(event,env,ctx);
  }
};
