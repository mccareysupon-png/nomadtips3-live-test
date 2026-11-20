import {DurableObject} from 'cloudflare:workers';
import {BulkSpeedPolicy,TELEMETRY} from './speed-policy.mjs';
import {HistoryAuthority,historyHandler} from './hub-history-authority.mjs';
import {makeProviderBridge} from './provider-bridge.mjs';
const MODE='liveFirstHistoryMode',CLOCK='shadowClock',CALLS='shadowCalls',HOLD='shadowLiveHold',FAIL='shadowReply';
const PATH='/__private/provider/v1';
const json=(j,status=200)=>Response.json(j,{status,headers:{'cache-control':'no-store'}});
export class LiveFirstShadow extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.storage=ctx.storage;this.env=env;this.now=0;this.serial=null}
 async init(){if(!this.now)this.now=await this.storage.get(CLOCK)??Math.floor(Date.now()/1000)*1000;if(!this.policy){this.policy=new BulkSpeedPolicy(this.storage,()=>this.now);this.authority=new HistoryAuthority(this.policy,{clock:()=>this.now,enabled:true,coordinated:true,persistentSwitch:true});this.history=historyHandler({policy:this.policy,authority:this.authority,authorize:r=>r.headers.get('x-bridge-verified')==='1',transport:(p,l)=>this.mock(p,l),clock:()=>this.now});this.bridge=makeProviderBridge({secrets:{history:this.env.HISTORY_TEST_SECRET,referee:this.env.REFEREE_TEST_SECRET,fullmarket:this.env.MARKET_TEST_SECRET},historyHandler:this.history,enabled:true,clock:()=>this.now,reserve:async x=>{const l=await this.policy.before(x.path,x.kind==='referee'?'REFEREE':'FULLMARKET');return {...l,allowed:true}},transport:(p,l)=>this.mock(p,l),observe:(r,l)=>this.policy.observe(r,l),failed:l=>this.policy.failed(l)});}}
 async mock(path,lease){
  // This deployed Worker has no 5USD key, no network fetch to provider, no cron.
  const kind=path.includes('/odds/history')?'REFEREE':path.includes('/odds?')?'FULLMARKET':path.includes('status=live')?'LIVE':'HISTORY';
  const counts=await this.storage.transaction(async tx=>{const old=await tx.get(CALLS)??{live:0,history:0,referee:0,fullmarket:0,windowUsed:0,window:-1};const w=Math.floor(this.now/60000);if(old.window!==w){old.window=w;old.windowUsed=0}old.windowUsed++;old[kind.toLowerCase()]++;await tx.put(CALLS,old);return old});
  const code=kind==='HISTORY'?await this.storage.get(FAIL)??200:200;
  return Response.json({success:1,data:[],pagination:{page:Number(new URL('https://mock.invalid'+path).searchParams.get('page')??1),per_page:100,count:0,has_more:false}},{status:code,headers:{'x-ratelimit-limit':'40','x-ratelimit-remaining':String(Math.max(0,40-counts.windowUsed)),'x-ratelimit-reset':String((Math.floor(this.now/60000)+1)*60),'retry-after':code===429?'120':'0'}});
 }
 async live(){const lease=await this.policy.before('/v1/fixtures?status=live','ALARM_LIVE');try{const r=await this.mock('/v1/fixtures?status=live',lease);await this.policy.observe(r,lease);return json({ok:true})}catch(e){await this.policy.failed(lease);throw e}}
 async dispatch(req){await this.init();const p=new URL(req.url).pathname;
  if(p===PATH)return this.bridge(req);
  const body=req.method==='POST'?await req.json().catch(()=>({})):{};
  if(p==='/mode'){if(typeof body.enabled!=='boolean')return json({error:'INVALID_MODE'},400);await this.storage.transaction(tx=>tx.put(MODE,{enabled:body.enabled,scope:'ISOLATED_SHADOW_ONLY'}));return json({enabled:body.enabled});}
  if(p==='/advance'){if(!Number.isSafeInteger(body.ms)||body.ms<0||body.ms>600000)return json({error:'INVALID_CLOCK'},400);this.now+=body.ms;await this.storage.put(CLOCK,this.now);return json({now:this.now})}
  if(p==='/live')return this.live();
  if(p==='/hold'){const lease=await this.policy.before('/v1/fixtures?status=live','ALARM_LIVE');await this.storage.put(HOLD,lease);return json({ok:true})}
  if(p==='/release'){const l=await this.storage.get(HOLD);if(l){await this.policy.failed(l);await this.storage.delete(HOLD)}return json({ok:true})}
  if(p==='/reply'){if(![200,429].includes(body.status))return json({error:'INVALID_STATUS'},400);await this.storage.put(FAIL,body.status);return json({ok:true})}
  if(p==='/status'){const t=await this.policy.telemetry();return json({scope:'ISOLATED_SHADOW_ONLY',mode:(await this.storage.get(MODE))?.enabled===true,calls:await this.storage.get(CALLS)??{live:0,history:0,referee:0,fullmarket:0},pending:t.pending.length,lastHistoryAt:t.lastHistoryAt??null,providerRemaining:t.provider?.remaining??null,backoffUntil:t.backoffUntil??0,realProviderCalls:0})}
  return json({error:'NOT_FOUND'},404);
 }
 async fetch(req){try{return await this.dispatch(req)}catch(e){return json({error:String(e.message).slice(0,160),status:e.status??500},e.status??500)}}
}
export default {async fetch(req,env){
 const u=new URL(req.url),run=u.searchParams.get('run');
 if(!run||!/^[a-z0-9-]{8,80}$/.test(run))return json({error:'NOT_FOUND'},404);
 if(u.pathname==='/version'&&req.method==='GET')return json({version:'LIVE_FIRST_SHADOW_V1',realProviderCalls:0});
 if(u.pathname!==PATH&&req.headers.get('Authorization')!=='Bearer '+env.SHADOW_OWNER_SECRET)return json({error:'NOT_FOUND'},404);
 if(!['/mode','/advance','/live','/hold','/release','/reply','/status',PATH].includes(u.pathname))return json({error:'NOT_FOUND'},404);
 if(u.pathname!=='/status'&&req.method!=='POST')return json({error:'NOT_FOUND'},404);
 const stub=env.SHADOW.get(env.SHADOW.idFromName(run));return stub.fetch(new Request('https://shadow.internal'+u.pathname,req));
}};
