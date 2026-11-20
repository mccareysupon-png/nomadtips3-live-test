import {DurableObject} from 'cloudflare:workers';
import {init,ingest,coverage,totals,dailyPlan,normalize} from './history.mjs';
import {initBackfill,planBackfill} from './backfill.mjs';
import {initJohn,prepareDay,prepareCatalog,observeUnresolved,prepareUnknown,johnSummary,nextCutoff} from './john-sync.mjs';
const SYNC_POLICY='JOHN_LOCAL_PLAN_V3';
const H='https://hub.internal/snapshot';
const epoch=()=>Math.floor(Date.now()/1000);
export function adapt(f){
 if(f?.boardState!=='finished'&&f?.boardState!=='unknown')return null;
 if(f.status!==f.boardState)return null;
 // Only accept explicit normal-time completion, never assume a default 0:0.
 const code=String(f.statusCode??'').trim().toLowerCase();
 if(f.status==='finished'&&!['full','ft','full_time','full time','finished'].includes(code))return null;
 if(/abandon|cancel|award|walkover|extra.time|penalt|suspend|postpon/i.test(String(f.statusReason??'')))return null;
 const k=Number.isFinite(f.kickoffAt)?Math.floor(f.kickoffAt/1000):Math.floor(Date.parse(f.kickoffUtc)/1000);
 const v={id:f.fixtureId,league:{id:f.league?.id},teams:{home:{id:f.home?.id},away:{id:f.away?.id}},kickoff_ts:k,status:f.status,status_code:f.status==='finished'?'full':null,goals:{home:f.goals?.home,away:f.goals?.away}};
 return normalize(v)?v:null;
}
function nextAlarm(now){return nextCutoff(now)*1000}
export class RealHistory extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.db={exec:(q,...a)=>ctx.storage.sql.exec(q,...a),transaction:f=>ctx.storage.transactionSync(f)};init(this.db);initBackfill(this.db);initJohn(this.db);this.busy=null}
 async run(){
  if(this.busy)return this.busy;
  this.busy=(async()=>{
   const now=epoch(),cycle=dailyPlan(now).cycle,prev=await this.ctx.storage.get('report');
   if(prev?.cycle===cycle&&prev?.state==='ok'&&prev.syncPolicy===SYNC_POLICY)return prev;
   const r=await this.env.SOURCE_HUB.fetch(H,{method:'GET'});if(!r.ok)throw Error('HUB_HTTP_'+r.status);
   const j=await r.json();
   if(j.ok!==true||j.cacheOnly!==true||Number(j.externalRequestsAdded)!==0||j.stale===true||!Array.isArray(j.fixtures)||!j.fixtures.length||j.fixtures.length>15000)throw Error('CACHE_CONTRACT');
   if(!Number.isFinite(Number(j.ageMs))||Number(j.ageMs)<0||Number(j.ageMs)>3600000)throw Error('CACHE_AGE');
   const a=[],codes={};let seen=0;
   for(const f of j.fixtures){if(f.boardState==='finished'||f.boardState==='unknown'){seen++;const code=String(f.statusCode??'missing').replace(/[^a-zA-Z0-9_ -]/g,'?').slice(0,60);codes[code]=(codes[code]||0)+1;const v=adapt(f);if(v)a.push(v)}}
   if(!a.some(f=>f.status==='finished'))throw Error('NO_VALID_FINISHED rows='+seen+' codes='+JSON.stringify(codes));
   const stats=ingest(this.db,a,now),t=totals(this.db);
   prepareDay(this.db,now);prepareCatalog(this.db,'initial-v3',now-180*86400);observeUnresolved(this.db,j.fixtures,now);prepareUnknown(this.db,now);
   let upcoming=0,eligible=0,homeCovered=0,awayCovered=0,oneOrMore=0;const teams=new Set(),covered=new Set();
   for(const f of j.fixtures){if(f.boardState!=='scheduled'||f.status!=='scheduled')continue;
    const k=Number.isFinite(f.kickoffAt)?Math.floor(f.kickoffAt/1000):Math.floor(Date.parse(f.kickoffUtc)/1000);
    const h=String(f.home?.id??''),a=String(f.away?.id??'');
    if(!Number.isSafeInteger(k)||k<=now||!(/^[1-9]\d{0,15}$/).test(h)||!(/^[1-9]\d{0,15}$/).test(a)||!Number.isSafeInteger(Number(h))||!Number.isSafeInteger(Number(a)))continue;
    upcoming++;teams.add(h);teams.add(a);
    const hc=coverage(this.db,h,k,now),ac=coverage(this.db,a,k,now);
    if(hc.complete){homeCovered++;covered.add(h)}if(ac.complete){awayCovered++;covered.add(a)}if(hc.complete&&ac.complete)eligible++;if(hc.count||ac.count)oneOrMore++;
   }
   const report={syncPolicy:SYNC_POLICY,sync:johnSummary(this.db),mode:'REAL_HUB_CACHE_ONLY_TEST',state:'ok',cycle,observedAt:new Date(now*1000).toISOString(),sourceRows:j.fixtures.length,sourceFinishedOrUnknown:seen,accepted:a.length,excluded:seen-a.length,statusCodes:codes,ingest:stats,stored:t,upcoming,upcomingTeams:teams.size,teamsWith10:covered.size,homeCovered,awayCovered,eligible,upcomingWithAnyHistory:oneOrMore,externalRequestsAdded:0,backfillComplete:false,nextAlarmAt:new Date(nextAlarm(now)).toISOString()};
   const plan=planBackfill(this.db,j.fixtures,now,cycle);await this.ctx.storage.put('backfillPlan',{...plan,cycle,observedAt:report.observedAt});
   await this.ctx.storage.put('report',report);return report;
  })().finally(()=>this.busy=null);return this.busy
 }
 async alarm(){
  try{await this.run()}catch(e){const prev=await this.ctx.storage.get('report');await this.ctx.storage.put('failure',{at:new Date().toISOString(),error:String(e.message).slice(0,200),lastSuccess:prev?.observedAt??null})}
  finally{await this.ctx.storage.setAlarm(nextAlarm(epoch()))}
 }
 async fetch(req){
  const path=new URL(req.url).pathname;
  if(req.method==='POST'&&path==='/bootstrap'){
   try{const report=await this.run();await this.ctx.storage.setAlarm(nextAlarm(epoch()));return Response.json(report)}catch(e){return Response.json({error:String(e.message).slice(0,400)},{status:502})}
  }
  if(req.method==='POST'&&path==='/prepare-backfill'){
   try{
    const now=epoch(),cycle=dailyPlan(now).cycle;
    const prev=await this.ctx.storage.get('backfillPlan');if(prev?.cycle===cycle&&prev?.policy==='JOHN_ONCE_PER_LEAGUE_SEASON_V2')return Response.json(prev);
    const r=await this.env.SOURCE_HUB.fetch(H,{method:'GET'});if(!r.ok)throw Error('HUB_HTTP');
    const j=await r.json();if(j.ok!==true||j.cacheOnly!==true||Number(j.externalRequestsAdded)!==0||j.stale===true||!Array.isArray(j.fixtures)||!j.fixtures.length||j.fixtures.length>15000||!Number.isFinite(Number(j.ageMs))||Number(j.ageMs)<0||Number(j.ageMs)>3600000)throw Error('CACHE_CONTRACT');
    const plan={...planBackfill(this.db,j.fixtures,now,cycle),cycle,observedAt:new Date(now*1000).toISOString()};
    await this.ctx.storage.put('backfillPlan',plan);return Response.json(plan);
   }catch(e){return Response.json({error:String(e.message).slice(0,200)},{status:502})}
  }
  if(req.method==='GET'&&path==='/backfill'){const plan=await this.ctx.storage.get('backfillPlan');return Response.json(plan?.policy==='JOHN_ONCE_PER_LEAGUE_SEASON_V2'?plan:{state:'uninitialized',legacyDailyQueue:'DISABLED'},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}})}
  if(req.method==='GET'&&path==='/health'){
   const r=await this.ctx.storage.get('report');return Response.json(r??{mode:'REAL_HUB_CACHE_ONLY_TEST',state:'uninitialized'},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
  }
  return new Response('Not found',{status:404})
 }
}
// Bootstrap protected using test-only randomly generated secret, removed from public response. No viewer-triggered sync.
export default {async fetch(req,env){
 const p=new URL(req.url).pathname,stub=env.HISTORY.get(env.HISTORY.idFromName('real-isolated-v1'));
 if(req.method==='GET'&&['/','/health'].includes(p))return stub.fetch('https://history.internal/health');
 if(req.method==='GET'&&p==='/backfill')return stub.fetch('https://history.internal/backfill');
 if(req.method==='POST'&&['/bootstrap','/prepare-backfill'].includes(p)&&env.BOOTSTRAP_SECRET&&req.headers.get('Authorization')==='Bearer '+env.BOOTSTRAP_SECRET)return stub.fetch('https://history.internal'+p,{method:'POST'});
 return new Response('Not found',{status:404});
}};
