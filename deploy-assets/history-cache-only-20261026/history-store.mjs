import {normalizeHistory,validId,retrySeconds} from './history-core.mjs';
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
export class HistoryGate{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.pending=new Map();this.queue=Promise.resolve();}
 async cached(teamId,cutoff){
  const old=await this.ctx.storage.get('team:'+teamId+':'+cutoff);
  return old&&old.expires>Date.now()&&old.data?.verified===true?{...old.data,cache:'HIT'}:null;
 }
 // This method is called only by the scheduled refresh path, never by viewer GETs.
 async refreshTeam(teamId,cutoff,fixtureId){
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
 async refreshScheduled(){
  if(this.refreshing)return {ok:true,skipped:'REFRESH_RUNNING'};
  this.refreshing=true;
  const report={at:new Date().toISOString(),trigger:'cron',providerRequests:0};
  try{
   const last=await this.ctx.storage.get('scheduled-at');
   if(last&&Date.now()-last<240000)return {ok:true,skipped:'RECENT_SCHEDULE'};
   await this.ctx.storage.put('scheduled-at',Date.now());
   const res=await fetch('https://ball46.com/api/engine/board',{signal:AbortSignal.timeout(30000)}),board=await res.json();
   if(!res.ok||board.ok!==true||board.stale===true||!Array.isArray(board.fixtures))throw Error('BOARD_UNAVAILABLE');
   const now=Date.now();
   const fixtures=board.fixtures.filter(f=>['live','scheduled'].includes(f.boardState)&&validId(String(f.fixtureId))&&validId(String(f.home?.id||''))&&validId(String(f.away?.id||''))&&String(f.home.id)!==String(f.away.id)&&Number.isFinite(Date.parse(f.kickoffUtc))&&Date.parse(f.kickoffUtc)>946684800000&&Date.parse(f.kickoffUtc)<now+86400000)
    .sort((a,b)=>(a.boardState==='live'?0:1)-(b.boardState==='live'?0:1)||Date.parse(a.kickoffUtc)-Date.parse(b.kickoffUtc)||String(a.fixtureId).localeCompare(String(b.fixtureId)));
   for(const f of fixtures){
    const cutoff=Date.parse(f.kickoffUtc),home=String(f.home.id),away=String(f.away.id),id=String(f.fixtureId);
    if(await this.cached(home,cutoff)&&await this.cached(away,cutoff))continue;
    report.fixtureId=id;
    const before=await this.ctx.storage.get('budget');
    try{await this.refreshTeam(home,cutoff,id);await this.refreshTeam(away,cutoff,id);report.refreshed=true;}
    finally{const after=await this.ctx.storage.get('budget');report.providerRequests=after?.day===before?.day?(after?.dayCount||0)-(before?.dayCount||0):after?.dayCount||0;}
    break; // At most one fixture / two team requests per five-minute cron.
   }
   report.ok=true;return report;
  }catch(e){report.ok=false;report.error=e.message;return report;}
  finally{await this.ctx.storage.put('scheduled-report',report);this.refreshing=false;}
 }
 async fetch(request){
  const u=new URL(request.url);
  if(u.pathname==='/scheduled-refresh'&&request.method==='POST')return json(await this.refreshScheduled());
  if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  if(u.pathname==='/health')return json({ok:!!this.env.FIVEDOLLAR_API_KEY,component:'BALL46_FORM_HISTORY_V1',source:'5USD',providerMode:'scheduled-only',viewerMode:'cache-only',schedule:'*/5 * * * *',maxPerHour:40,maxPerDay:200,lastRefresh:await this.ctx.storage.get('scheduled-report')||null});
  if(u.pathname!=='/last5')return json({ok:false,error:'NOT_FOUND'},404);
  const fixtureId=u.searchParams.get('fixtureId'),home=u.searchParams.get('home'),away=u.searchParams.get('away'),cutoff=Number(u.searchParams.get('cutoff'));
  if(!validId(fixtureId)||!validId(home)||!validId(away)||home===away||!Number.isFinite(cutoff)||cutoff<946684800000||cutoff>Date.now()+60*86400000)return json({ok:false,error:'INVALID_HISTORY_REQUEST'},400);
  try{const h=await this.cached(home,cutoff),a=await this.cached(away,cutoff);if(!h||!a)return json({ok:false,fixtureId,error:'HISTORY_CACHE_NOT_READY',providerMode:'scheduled-only',retryAfter:300},503,{'retry-after':'300'});return json({ok:true,fixtureId,source:'5USD',providerMode:'scheduled-only',cutoffUtc:new Date(cutoff).toISOString(),home:h,away:a});}
  catch(e){return json({ok:false,fixtureId,error:['PROVIDER_BACKOFF','HISTORY_BUDGET_BUSY','HISTORY_SOURCE_NOT_AUTHORIZED'].includes(e.message)?e.message:'HISTORY_TEMPORARILY_UNAVAILABLE'},e.status||503,e.retry?{'retry-after':String(e.retry)}:{});}
 }
}
export default{
 async fetch(request,env){const u=new URL(request.url);if(u.hostname!=='history.internal'||!['/health','/last5'].includes(u.pathname))return json({ok:false,error:'NOT_FOUND'},404);if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);return env.HISTORY_GATE.get(env.HISTORY_GATE.idFromName('global-last5-v1')).fetch(request);},
 async scheduled(controller,env,ctx){ctx.waitUntil(env.HISTORY_GATE.get(env.HISTORY_GATE.idFromName('global-last5-v1')).fetch('https://history.internal/scheduled-refresh',{method:'POST'}));}
};
