import {normalizeHistory,validId,retrySeconds} from './history-core.mjs';
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
export class HistoryGate{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.pending=new Map();this.queue=Promise.resolve();}
 async read(teamId,cutoff,fixtureId){
  const key='team:'+teamId+':'+cutoff,old=await this.ctx.storage.get(key),now=Date.now();
  if(old&&old.expires>now)return{...old.data,cache:'HIT'};
  if(this.pending.has(key))return this.pending.get(key);
  if(this.pending.size>=2)throw Object.assign(Error('HISTORY_BUDGET_BUSY'),{status:429,retry:30});
  const work=this.queue.then(async()=>{
   const cached=await this.ctx.storage.get(key);if(cached&&cached.expires>Date.now())return{...cached.data,cache:'HIT'};
   const t=Date.now(),hour=Math.floor(t/3600000),day=Math.floor(t/86400000),budget=await this.ctx.storage.get('budget')||{};
   if(budget.cooldown>t)throw Object.assign(Error('PROVIDER_BACKOFF'),{status:429,retry:Math.ceil((budget.cooldown-t)/1000)});
   if((budget.hour===hour&&budget.hourCount>=40)||(budget.day===day&&budget.dayCount>=200))throw Object.assign(Error('HISTORY_BUDGET_BUSY'),{status:429,retry:3600});
   if(budget.last&&t-budget.last<15000)await new Promise(r=>setTimeout(r,15000-(t-budget.last)));
   const at=Date.now(),next={hour,day,hourCount:budget.hour===hour?(budget.hourCount||0)+1:1,dayCount:budget.day===day?(budget.dayCount||0)+1:1,last:at,cooldown:0};
   await this.ctx.storage.put('budget',next);
   const url=new URL('https://api.5dollarfootballapi.com/v1/teams/'+teamId+'/fixtures');url.search=new URLSearchParams({status:'finished',order:'desc',per_page:'10',end_time:String(Math.floor(cutoff/1000))});
   let response;try{response=await fetch(url,{headers:{authorization:'Bearer '+this.env.FIVEDOLLAR_API_KEY,accept:'application/json'},signal:AbortSignal.timeout(20000)});}catch{throw Object.assign(Error('HISTORY_CONNECTION_UNAVAILABLE'),{status:503});}
   if(response.status===429){const retry=retrySeconds(response.headers.get('retry-after'));await this.ctx.storage.put('budget',{...next,cooldown:Date.now()+retry*1000});throw Object.assign(Error('PROVIDER_BACKOFF'),{status:429,retry});}
   if(!response.ok){await this.ctx.storage.put('budget',{...next,cooldown:Date.now()+300000});throw Object.assign(Error(response.status===401||response.status===403?'HISTORY_SOURCE_NOT_AUTHORIZED':'HISTORY_SOURCE_UNAVAILABLE'),{status:503});}
   let payload;try{payload=await response.json();}catch{throw Object.assign(Error('INVALID_PROVIDER_RESPONSE'),{status:503});}
   const rows=normalizeHistory(payload,teamId,cutoff,fixtureId),data={teamId,source:'5USD',verified:true,fetchedAt:new Date().toISOString(),cutoffUtc:new Date(cutoff).toISOString(),count:rows.length,completeLastFive:rows.length===5,rows};
   await this.ctx.storage.put(key,{expires:Date.now()+(rows.length?21600000:900000),data});
   // Bounded retention without touching any football/vote database.
   const entries=await this.ctx.storage.list({prefix:'team:',limit:1000});if(entries.size>=900){const expired=[...entries].filter(([,v])=>v.expires<Date.now()).map(([k])=>k);if(expired.length)await this.ctx.storage.delete(expired);}
   return{...data,cache:'MISS'};
  });
  this.queue=work.catch(()=>{});this.pending.set(key,work);try{return await work;}finally{this.pending.delete(key);}
 }
 async fetch(request){
  const u=new URL(request.url);if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  if(u.pathname==='/health')return json({ok:!!this.env.FIVEDOLLAR_API_KEY,component:'BALL46_FORM_HISTORY_V1',source:'5USD',maxPerHour:40,maxPerDay:200});
  if(u.pathname!=='/last5')return json({ok:false,error:'NOT_FOUND'},404);
  const fixtureId=u.searchParams.get('fixtureId'),home=u.searchParams.get('home'),away=u.searchParams.get('away'),cutoff=Number(u.searchParams.get('cutoff'));
  if(!validId(fixtureId)||!validId(home)||!validId(away)||home===away||!Number.isFinite(cutoff)||cutoff<946684800000||cutoff>Date.now()+60*86400000)return json({ok:false,error:'INVALID_HISTORY_REQUEST'},400);
  try{const h=await this.read(home,cutoff,fixtureId),a=await this.read(away,cutoff,fixtureId);return json({ok:true,fixtureId,source:'5USD',cutoffUtc:new Date(cutoff).toISOString(),home:h,away:a});}
  catch(e){return json({ok:false,fixtureId,error:['PROVIDER_BACKOFF','HISTORY_BUDGET_BUSY','HISTORY_SOURCE_NOT_AUTHORIZED'].includes(e.message)?e.message:'HISTORY_TEMPORARILY_UNAVAILABLE'},e.status||503,e.retry?{'retry-after':String(e.retry)}:{});}
 }
}
export default{async fetch(request,env){if(new URL(request.url).hostname!=='history.internal')return json({ok:false,error:'NOT_FOUND'},404);return env.HISTORY_GATE.get(env.HISTORY_GATE.idFromName('global-last5-v1')).fetch(request);}};
