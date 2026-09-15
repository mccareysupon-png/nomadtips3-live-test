import {buildMockFullBoard} from './mock-fullboard.js';
import {createRuntimeState} from './central-runtime.js';
import {processCentralCycle} from './central-cycle.js';
import {renderControlPage} from './control-page.js';

const PROVIDER_URL='https://api.5dollarfootballapi.com/v1/fixtures?status=live&include=odds,events,stats&per_page=500';
const CONTROL_DEFAULTS={apiArmed:false,masterApiEnabled:false,pollingEnabled:false,activeMachineId:'341-STAGED-A',pollIntervalSeconds:60,requestTimeoutMs:15000,revision:0,updatedAt:null,updatedBy:'SYSTEM',leaseOwner:null,leaseId:null,leaseUntilMs:0,lastRunAt:null,lastRunResult:'NEVER'};
const RUNTIME_CHUNK_PREFIX='runtime:chunk:';
const RUNTIME_META_KEY='runtime:meta';
const RUNTIME_CHUNK_CHARS=30000;
const RUNTIME_MAX_CHUNKS=128;
let memoryState=createRuntimeState();
let memoryControl={...CONTROL_DEFAULTS};
let cycleInFlight=null;
let mockTick=0;

const commonHeaders={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*',...commonHeaders,...extra}});
const html=body=>new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8',...commonHeaders,'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"}});
const bool=v=>String(v??'false').toLowerCase()==='true';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||min));
const hardLiveEnabled=env=>bool(env?.NOMAD341_LIVE_PROVIDER_ENABLED);
const machineId=env=>String(env?.NOMAD341_MACHINE_ID||'341-STAGED-A').slice(0,64);
const normalizeMachine=v=>String(v||'').trim().replace(/[^a-zA-Z0-9._:-]/g,'').slice(0,64)||'341-STAGED-A';
const normalizeControl=input=>({...CONTROL_DEFAULTS,...(input&&typeof input==='object'?input:{}),apiArmed:Boolean(input?.apiArmed),masterApiEnabled:Boolean(input?.masterApiEnabled),pollingEnabled:Boolean(input?.pollingEnabled),activeMachineId:normalizeMachine(input?.activeMachineId||CONTROL_DEFAULTS.activeMachineId),pollIntervalSeconds:clamp(input?.pollIntervalSeconds??60,6,300),requestTimeoutMs:clamp(input?.requestTimeoutMs??15000,3000,60000),revision:Number(input?.revision)||0,leaseUntilMs:Number(input?.leaseUntilMs)||0});

export class Nomad341ControlState{
  constructor(ctx){this.ctx=ctx;}
  async read(){return normalizeControl(await this.ctx.storage.get('control'));}
  async readRuntime(){
    const meta=await this.ctx.storage.get(RUNTIME_META_KEY);
    if(!meta?.count)return null;
    const count=Number(meta.count)||0;
    if(count<1||count>RUNTIME_MAX_CHUNKS)return null;
    const keys=Array.from({length:count},(_,i)=>RUNTIME_CHUNK_PREFIX+i);
    const parts=await this.ctx.storage.get(keys);
    let raw='';
    for(const key of keys){const part=parts.get(key);if(typeof part!=='string')return null;raw+=part;}
    try{return JSON.parse(raw);}catch{return null;}
  }
  async writeRuntime(raw){
    if(typeof raw!=='string'||!raw.length)return {ok:false,error:'EMPTY_RUNTIME_STATE'};
    const count=Math.ceil(raw.length/RUNTIME_CHUNK_CHARS);
    if(count>RUNTIME_MAX_CHUNKS)return {ok:false,error:'RUNTIME_STATE_TOO_LARGE',chunks:count,maxChunks:RUNTIME_MAX_CHUNKS};
    const previous=await this.ctx.storage.get(RUNTIME_META_KEY);
    const entries={};
    for(let i=0;i<count;i++)entries[RUNTIME_CHUNK_PREFIX+i]=raw.slice(i*RUNTIME_CHUNK_CHARS,(i+1)*RUNTIME_CHUNK_CHARS);
    await this.ctx.storage.put(entries);
    await this.ctx.storage.put(RUNTIME_META_KEY,{count,chars:raw.length,updatedAt:new Date().toISOString()});
    const oldCount=Number(previous?.count)||0;
    if(oldCount>count){const stale=Array.from({length:oldCount-count},(_,i)=>RUNTIME_CHUNK_PREFIX+(count+i));if(stale.length)await this.ctx.storage.delete(stale.slice(0,128));}
    return {ok:true,count,chars:raw.length};
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/runtime'&&request.method==='GET'){
      const runtime=await this.readRuntime();
      return runtime?json(runtime):json({error:'RUNTIME_NOT_READY'},404);
    }
    if(url.pathname==='/runtime'&&request.method==='PUT'){
      const raw=await request.text();
      try{JSON.parse(raw);}catch{return json({error:'INVALID_RUNTIME_JSON'},400);}
      const result=await this.writeRuntime(raw);
      return json(result,result.ok?200:413);
    }
    if(request.method==='GET')return json(await this.read());
    const body=await request.json().catch(()=>({}));
    if(url.pathname==='/patch'){
      const current=await this.read();
      const next=normalizeControl({...current,...body,revision:current.revision+1,updatedAt:new Date().toISOString()});
      await this.ctx.storage.put('control',next);
      return json(next);
    }
    if(url.pathname==='/lease/acquire'){
      const current=await this.read(),now=Date.now();
      if(current.leaseUntilMs>now&&current.leaseId)return json({acquired:false,control:current,reason:'LEASE_BUSY'},409);
      const leaseId=crypto.randomUUID();
      const next=normalizeControl({...current,leaseOwner:normalizeMachine(body.machineId),leaseId,leaseUntilMs:now+clamp(body.ttlMs??30000,5000,120000)});
      await this.ctx.storage.put('control',next);
      return json({acquired:true,leaseId,control:next});
    }
    if(url.pathname==='/lease/release'){
      const current=await this.read();
      if(current.leaseId&&body.leaseId===current.leaseId){const next=normalizeControl({...current,leaseOwner:null,leaseId:null,leaseUntilMs:0});await this.ctx.storage.put('control',next);return json({released:true,control:next});}
      return json({released:false,control:current},409);
    }
    return json({error:'CONTROL_ROUTE_NOT_FOUND'},404);
  }
}

function controlStub(env){
  if(!env?.NOMAD341_CONTROL?.idFromName||!env?.NOMAD341_CONTROL?.get)return null;
  const id=env.NOMAD341_CONTROL.idFromName('nomad341-global-control');
  return env.NOMAD341_CONTROL.get(id);
}
async function loadControl(env){
  const stub=controlStub(env);if(!stub)return normalizeControl(memoryControl);
  const r=await stub.fetch('https://control/state');return normalizeControl(await r.json());
}
async function patchControl(env,patch={}){
  const clean={...patch};
  if('apiArmed' in clean)clean.apiArmed=Boolean(clean.apiArmed);
  if('activeMachineId' in clean)clean.activeMachineId=normalizeMachine(clean.activeMachineId);
  if('pollIntervalSeconds' in clean)clean.pollIntervalSeconds=clamp(clean.pollIntervalSeconds,6,300);
  if('requestTimeoutMs' in clean)clean.requestTimeoutMs=clamp(clean.requestTimeoutMs,3000,60000);
  if('masterApiEnabled' in clean)clean.masterApiEnabled=Boolean(clean.masterApiEnabled);
  if('pollingEnabled' in clean)clean.pollingEnabled=Boolean(clean.pollingEnabled);
  clean.updatedBy=String(clean.updatedBy||'OWNER').slice(0,40);
  const stub=controlStub(env);
  if(!stub){memoryControl=normalizeControl({...memoryControl,...clean,revision:(memoryControl.revision||0)+1,updatedAt:new Date().toISOString()});return memoryControl;}
  const r=await stub.fetch('https://control/patch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(clean)});return normalizeControl(await r.json());
}
async function acquireLease(env,control){
  const stub=controlStub(env);if(!stub){if(cycleInFlight)return {acquired:false,reason:'CYCLE_ALREADY_RUNNING'};return {acquired:true,leaseId:'MEMORY'};}
  const ttlMs=clamp((control.requestTimeoutMs||15000)+10000,10000,120000);
  const r=await stub.fetch('https://control/lease/acquire',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({machineId:machineId(env),ttlMs})});
  const j=await r.json();return r.ok?j:{acquired:false,reason:j.reason||'LEASE_BUSY'};
}
async function releaseLease(env,leaseId){const stub=controlStub(env);if(!stub||!leaseId||leaseId==='MEMORY')return;await stub.fetch('https://control/lease/release',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({leaseId})});}

async function loadState(env){
  const stub=controlStub(env);
  if(stub){const r=await stub.fetch('https://control/runtime');if(r.ok){try{return createRuntimeState(await r.json());}catch{}}}
  return createRuntimeState(memoryState);
}
async function saveState(env,state){
  memoryState=createRuntimeState(state);
  const stub=controlStub(env);if(!stub)return;
  const r=await stub.fetch('https://control/runtime',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(memoryState)});
  if(!r.ok){const detail=await r.text();throw new Error('RUNTIME_PERSIST_FAILED:'+detail.slice(0,160));}
}

function permission(env,control){const current=machineId(env),machineAllowed=normalizeMachine(control.activeMachineId)===current;return {hardProviderGate:hardLiveEnabled(env),currentMachineId:current,machineAllowed,effectiveProviderEnabled:hardLiveEnabled(env)&&control.apiArmed&&control.masterApiEnabled&&machineAllowed};}
function publicControl(env,control){const p=permission(env,control);return {...control,...p,persistence:controlStub(env)?'DURABLE_OBJECT_CHUNKED':'MEMORY_PREVIEW'};}
function adminAuthorized(request,env){const configured=String(env?.NOMAD341_ADMIN_TOKEN||'');if(!configured)return {ok:false,status:503,error:'ADMIN_TOKEN_NOT_CONFIGURED'};const supplied=String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');return supplied===configured?{ok:true}:{ok:false,status:401,error:'OWNER_TOKEN_REQUIRED'};}
function sameOriginControl(request){const url=new URL(request.url),origin=String(request.headers.get('origin')||''),site=String(request.headers.get('sec-fetch-site')||'');return origin===url.origin&&(!site||site==='same-origin');}

async function fetchProviderOnce(env,control,{forceMock=false}={}){
  const p=permission(env,control);
  if(forceMock)return {payload:buildMockFullBoard(new Date().toISOString(),mockTick++),providerRequestCount:0,providerLive:false,rateLimit:{limit:null,remaining:null,reset:null,retryAfter:null}};
  if(!p.effectiveProviderEnabled){const error=new Error('PROVIDER_NOT_AUTHORIZED');error.code='PROVIDER_NOT_AUTHORIZED';throw error;}
  if(!env?.FIVEUSD_API_KEY)throw new Error('LIVE_PROVIDER_ENABLED but FIVEUSD_API_KEY is missing');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort('PROVIDER_TIMEOUT'),control.requestTimeoutMs||15000);
  try{
    const response=await fetch(PROVIDER_URL,{method:'GET',headers:{Authorization:`Bearer ${env.FIVEUSD_API_KEY}`,Accept:'application/json'},signal:controller.signal});
    const rateLimit={limit:response.headers.get('X-RateLimit-Limit'),remaining:response.headers.get('X-RateLimit-Remaining'),reset:response.headers.get('X-RateLimit-Reset'),retryAfter:response.headers.get('Retry-After')};
    if(response.status===429){const error=new Error('5USD_RATE_LIMIT');error.code='RATE_LIMIT';error.rateLimit=rateLimit;throw error;}
    if(!response.ok)throw new Error(`5USD_HTTP_${response.status}`);
    return {payload:await response.json(),providerRequestCount:1,providerLive:true,rateLimit};
  }finally{clearTimeout(timer);}
}

export async function runCentralCycle(env={},options={}){
  const mode=String(options.mode||'AUTO').toUpperCase(),control=await loadControl(env),p=permission(env,control);
  if(mode==='AUTO'&&!control.pollingEnabled)return {skipped:true,reason:'POLLING_SWITCH_OFF'};
  if(mode==='AUTO'&&!p.effectiveProviderEnabled)return {skipped:true,reason:'PROVIDER_GATE_CLOSED'};
  if(mode==='PROVIDER'&&!p.effectiveProviderEnabled)return {skipped:true,reason:'PROVIDER_NOT_AUTHORIZED'};
  if(cycleInFlight)return {skipped:true,reason:'CYCLE_ALREADY_RUNNING'};
  const lease=await acquireLease(env,control);if(!lease.acquired)return {skipped:true,reason:lease.reason||'LEASE_BUSY'};
  cycleInFlight=(async()=>{
    const state=await loadState(env),startedAt=new Date().toISOString();
    try{
      const provider=await fetchProviderOnce(env,control,{forceMock:mode==='MOCK'});
      const {snapshot,state:next}=processCentralCycle(provider.payload,state,{observedAt:startedAt,provider:provider.providerLive?'5USD':'MOCK_5USD',providerLive:provider.providerLive,providerRequestCount:provider.providerRequestCount,rateLimit:provider.rateLimit});
      await saveState(env,next);await patchControl(env,{lastRunAt:startedAt,lastRunResult:provider.providerLive?'PROVIDER_OK':'MOCK_OK',updatedBy:'RUNTIME'});
      return {skipped:false,snapshot};
    }catch(error){
      if(error?.code==='RATE_LIMIT')state.last429={at:startedAt,retryAfter:error.rateLimit?.retryAfter||null};
      if(state.lastGoodSnapshot)state.lastGoodSnapshot={...state.lastGoodSnapshot,health:{...(state.lastGoodSnapshot.health||{}),state:'DEGRADED',lastError:String(error?.message||error),sources:[...((state.lastGoodSnapshot.health||{}).sources||[]),{name:'Last cycle',state:'FAILED · LAST GOOD SNAPSHOT SERVED'}]}};
      try{await saveState(env,state);}catch{}
      await patchControl(env,{lastRunAt:startedAt,lastRunResult:`ERROR:${String(error?.message||error).slice(0,80)}`,updatedBy:'RUNTIME'});
      return {skipped:false,error:String(error?.message||error),snapshot:state.lastGoodSnapshot||null};
    }
  })();
  try{return await cycleInFlight;}finally{cycleInFlight=null;await releaseLease(env,lease.leaseId);}
}

async function readSnapshot(env){const state=await loadState(env);return state.lastGoodSnapshot||null;}
function dataCheck(snapshot,state,env,control){
  const matches=Array.isArray(snapshot?.matches)?snapshot.matches:[],statsMatches=matches.filter(m=>m.statsAvailable).length,eventMatches=matches.filter(m=>Array.isArray(m.events)&&m.events.length).length,totalEvents=matches.reduce((n,m)=>n+(Array.isArray(m.events)?m.events.length:0),0),oddsMatches=matches.filter(m=>Array.isArray(m.priceSources)&&m.priceSources.length).length,priceQuotes=matches.reduce((n,m)=>n+(Array.isArray(m.priceSources)?m.priceSources.length:0),0),bookmakers=[...new Set(matches.flatMap(m=>(m.priceSources||[]).map(q=>q.bookmaker).filter(Boolean)))].sort();
  const ageSeconds=snapshot?.fetchedAt?Math.max(0,Math.round((Date.now()-Date.parse(snapshot.fetchedAt))/1000)):null,p=permission(env,control);
  return {service:'NOMAD 3.41 5USD central diagnostics',request:{endpoint:'/v1/fixtures?status=live&include=odds,events,stats&per_page=500',mode:'ONE_FULL_BOARD_PER_CYCLE',...p,apiArmed:control.apiArmed,providerRequestsThisCycle:Number(snapshot?.providerRequestCount)||0,browserProviderRequests:0,pollIntervalSeconds:control.pollIntervalSeconds,requestTimeoutMs:control.requestTimeoutMs},snapshot:{cycleId:snapshot?.cycleId||null,fetchedAt:snapshot?.fetchedAt||null,ageSeconds,rawCount:Number(snapshot?.rawCount)||0,normalizedCount:Number(snapshot?.normalizedCount)||0,hasMore:Boolean(snapshot?.hasMore),provider:snapshot?.provider||null},coverage:{statsMatches,statsPercent:matches.length?+((statsMatches/matches.length)*100).toFixed(1):0,eventMatches,totalEvents,oddsMatches,priceQuotes,bookmakers},rateLimit:snapshot?.rateLimit||{limit:null,remaining:null,reset:null,retryAfter:null},counts:snapshot?.counts||{},last429:state.last429||null,control:publicControl(env,control),safety:{cardClickProviderRequests:0,priceRefereeProviderRequests:0,statisticsProviderRequests:0,maxConcurrentProviderRequests:1,hasMorePolicy:'WARN_ONLY_NO_AUTO_FANOUT'}};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}});
    if((url.pathname==='/'||url.pathname==='/control')&&request.method==='GET')return html(renderControlPage());
    if(url.pathname==='/api/nomad341/live'){
      const snapshot=await readSnapshot(env),control=await loadControl(env);if(!snapshot)return json({success:0,error:'SNAPSHOT_NOT_READY',control:publicControl(env,control)},503);
      return json(snapshot,200,{'x-nomad-provider-live':permission(env,control).effectiveProviderEnabled?'1':'0','x-nomad-provider-requests':String(snapshot.providerRequestCount??0)});
    }
    if(url.pathname==='/api/nomad341/health'){
      const snapshot=await readSnapshot(env),control=await loadControl(env);return json({...((snapshot?.health)||{state:'NOT_READY',environment:'STAGED'}),apiControl:publicControl(env,control)});
    }
    if(url.pathname==='/api/nomad341/control'&&request.method==='GET')return json(publicControl(env,await loadControl(env)));
    if(url.pathname==='/api/nomad341/check'&&request.method==='GET'){
      const state=await loadState(env),control=await loadControl(env);return json(dataCheck(state.lastGoodSnapshot,state,env,control));
    }
    if(url.pathname==='/api/nomad341/master'&&request.method==='POST'){
      if(!sameOriginControl(request))return json({error:'SAME_ORIGIN_CONTROL_REQUIRED'},403);
      const body=await request.json().catch(()=>({})),enabled=body.enabled===true,current=await loadControl(env),wasEnabled=Boolean(current.apiArmed&&current.masterApiEnabled);
      const control=await patchControl(env,{apiArmed:enabled,masterApiEnabled:enabled,pollingEnabled:enabled,activeMachineId:machineId(env),pollIntervalSeconds:60,updatedBy:'ONE_CLICK_CONTROL'});
      if(enabled&&!wasEnabled&&ctx?.waitUntil)ctx.waitUntil(runCentralCycle(env,{mode:'PROVIDER'}));
      return json({success:1,control:publicControl(env,control),firstCycleStarted:enabled&&!wasEnabled});
    }
    if(url.pathname==='/api/nomad341/control'&&request.method==='POST'){
      const auth=adminAuthorized(request,env);if(!auth.ok)return json({error:auth.error},auth.status);
      const body=await request.json().catch(()=>({}));if(String(body.action||'').toUpperCase()!=='PATCH')return json({error:'INVALID_CONTROL_ACTION'},400);
      const patch={updatedBy:'OWNER'};for(const k of ['apiArmed','masterApiEnabled','pollingEnabled','activeMachineId','pollIntervalSeconds','requestTimeoutMs'])if(k in body)patch[k]=body[k];
      const control=await patchControl(env,patch);return json({success:1,control:publicControl(env,control)});
    }
    if(url.pathname==='/api/nomad341/control/run'&&request.method==='POST'){
      const auth=adminAuthorized(request,env);if(!auth.ok)return json({error:auth.error},auth.status);
      const body=await request.json().catch(()=>({})),mode=String(body.mode||'MOCK').toUpperCase();if(!['MOCK','PROVIDER'].includes(mode))return json({error:'INVALID_RUN_MODE'},400);
      const result=await runCentralCycle(env,{mode});if(result.skipped&&mode==='PROVIDER')return json({success:0,...result},409);return json({success:1,...result});
    }
    if(url.pathname==='/api/nomad341/status'){
      const control=await loadControl(env),p=permission(env,control);return json({success:1,service:'NOMAD 3.41 central runtime',providerHardGate:p.hardProviderGate,apiArmed:control.apiArmed,masterApiEnabled:control.masterApiEnabled,pollingEnabled:control.pollingEnabled,currentMachineId:p.currentMachineId,activeMachineId:control.activeMachineId,effectiveProviderEnabled:p.effectiveProviderEnabled,providerUrlPrepared:true,routineProviderRequestsPerCycle:p.effectiveProviderEnabled?1:0});
    }
    return json({error:'NOT_FOUND'},404);
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(runCentralCycle(env,{mode:'AUTO'}));}
};

export const STAGED_PROVIDER_URL=PROVIDER_URL;
