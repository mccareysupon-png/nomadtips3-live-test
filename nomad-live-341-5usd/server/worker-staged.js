import {buildMockFullBoard} from './mock-fullboard.js';
import {createRuntimeState,processFullBoard} from './central-runtime.js';

const PROVIDER_URL='https://api.5dollarfootballapi.com/v1/fixtures?status=live&include=odds,events,stats&per_page=500';
let memoryState=createRuntimeState();
let cycleInFlight=null;
let mockTick=0;

const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
const liveEnabled=env=>String(env?.NOMAD341_LIVE_PROVIDER_ENABLED||'false').toLowerCase()==='true';

async function loadState(env){
  if(env?.NOMAD341_STATE?.get){
    const raw=await env.NOMAD341_STATE.get('runtime-state');
    if(raw){try{return createRuntimeState(JSON.parse(raw));}catch{}}
  }
  return createRuntimeState(memoryState);
}
async function saveState(env,state){
  memoryState=createRuntimeState(state);
  if(env?.NOMAD341_STATE?.put)await env.NOMAD341_STATE.put('runtime-state',JSON.stringify(memoryState));
}

async function fetchProviderOnce(env){
  if(!liveEnabled(env))return {payload:buildMockFullBoard(new Date().toISOString(),mockTick++),providerRequestCount:0,providerLive:false,rateLimit:{limit:null,remaining:null,reset:null,retryAfter:null}};
  if(!env?.FIVEUSD_API_KEY)throw new Error('LIVE_PROVIDER_ENABLED but FIVEUSD_API_KEY is missing');
  const response=await fetch(PROVIDER_URL,{method:'GET',headers:{Authorization:`Bearer ${env.FIVEUSD_API_KEY}`,Accept:'application/json'}});
  const rateLimit={limit:response.headers.get('X-RateLimit-Limit'),remaining:response.headers.get('X-RateLimit-Remaining'),reset:response.headers.get('X-RateLimit-Reset'),retryAfter:response.headers.get('Retry-After')};
  if(response.status===429){const error=new Error('5USD_RATE_LIMIT');error.code='RATE_LIMIT';error.rateLimit=rateLimit;throw error;}
  if(!response.ok)throw new Error(`5USD_HTTP_${response.status}`);
  return {payload:await response.json(),providerRequestCount:1,providerLive:true,rateLimit};
}

export async function runCentralCycle(env={}){
  if(cycleInFlight)return {skipped:true,reason:'CYCLE_ALREADY_RUNNING'};
  cycleInFlight=(async()=>{
    const state=await loadState(env),startedAt=new Date().toISOString();
    try{
      const provider=await fetchProviderOnce(env);
      const {snapshot,state:next}=processFullBoard(provider.payload,state,{observedAt:startedAt,provider:provider.providerLive?'5USD':'MOCK_5USD',providerLive:provider.providerLive,providerRequestCount:provider.providerRequestCount,rateLimit:provider.rateLimit});
      await saveState(env,next);
      return {skipped:false,snapshot};
    }catch(error){
      if(error?.code==='RATE_LIMIT')state.last429={at:startedAt,retryAfter:error.rateLimit?.retryAfter||null};
      if(state.lastGoodSnapshot){
        state.lastGoodSnapshot={...state.lastGoodSnapshot,health:{...(state.lastGoodSnapshot.health||{}),state:'DEGRADED',lastError:String(error?.message||error),sources:[...((state.lastGoodSnapshot.health||{}).sources||[]),{name:'Last cycle',state:'FAILED · LAST GOOD SNAPSHOT SERVED'}]}};
      }
      await saveState(env,state);
      return {skipped:false,error:String(error?.message||error),snapshot:state.lastGoodSnapshot||null};
    }
  })();
  try{return await cycleInFlight;}finally{cycleInFlight=null;}
}

async function readSnapshot(env){
  const state=await loadState(env);
  return state.lastGoodSnapshot||null;
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/nomad341/live'){
      const snapshot=await readSnapshot(env);
      if(!snapshot)return json({success:0,error:'SNAPSHOT_NOT_READY',providerLiveEnabled:liveEnabled(env)},503);
      return json(snapshot,200,{'x-nomad-provider-live':liveEnabled(env)?'1':'0','x-nomad-provider-requests':String(snapshot.providerRequestCount??0)});
    }
    if(url.pathname==='/api/nomad341/health'){
      const snapshot=await readSnapshot(env);
      return json(snapshot?.health||{state:'NOT_READY',environment:liveEnabled(env)?'STAGED LIVE':'STAGED MOCK'});
    }
    return json({success:1,service:'NOMAD 3.41 staged central runtime',providerLiveEnabled:liveEnabled(env),providerUrlPrepared:true,routineProviderRequestsPerCycle:liveEnabled(env)?1:0},200);
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(runCentralCycle(env));}
};

export const STAGED_PROVIDER_URL=PROVIDER_URL;
