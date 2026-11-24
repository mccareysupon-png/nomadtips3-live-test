import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_ENV_REQUIRED');
const worker='ball46-prematch-only-test-20261120',host='https://'+worker+'.mccarey-supon.workers.dev';
const ownerAuth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const cloud='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const now=Date.now(),cutoff=Date.parse('2026-11-24T12:00:00Z'); // November 24 19:00 ICT
const fmt=ms=>Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():null;
const ts=s=>{if(s==null)return null;if(typeof s==='number')return s<1e12?s*1000:s;const t=Date.parse(s);return Number.isFinite(t)?t:null};
async function owner(path){
 try{
  const r=await fetch(host+path,{headers:{authorization:ownerAuth,accept:'application/json'},signal:AbortSignal.timeout(45000),cache:'no-store'});
  const raw=await r.text();let value=null;try{value=JSON.parse(raw)}catch{}
  return {http:r.status,value,rawPreview:value?null:raw.slice(0,160)}
 }catch(e){return {error:String(e)}}
}
async function cf(path){
 const r=await fetch(cloud+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(35000)});
 const j=await r.json();return {status:r.status,success:j.success,result:j.result,errors:j.errors};
}
const [schedule,deploy]=await Promise.all([cf('/scripts/'+worker+'/schedules'),cf('/scripts/'+worker+'/deployments?per_page=1')]);
console.log('OU_NOV25_META '+JSON.stringify({atUtc:new Date(now).toISOString(),atThai:new Date(now).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false}),cron:schedule.result?.schedules?.map(x=>x.cron),workerVersion:deploy.result?.deployments?.[0]?.versions?.[0]?.version_id,cronStatus:schedule.status}));
const calls=['/prematch-ou-engine-state','/ou-adaptive-research-state-test','/ou-v3-stage-one-audit-test','/ou-value-v2-state','/daily-mission-state','/history-round-state'];
const result=await Promise.all(calls.map(owner));
for(let i=0;i<calls.length;i++){
 const path=calls[i],out=result[i],j=out.value;
 if(!j){console.log('OU_NOV25_STATE_ERROR '+JSON.stringify({path,http:out.http,error:out.error,rawPreview:out.rawPreview}));continue}
 if(path==='/prematch-ou-engine-state'){
  console.log('OU_NOV25_CORE '+JSON.stringify({path,http:out.http,last:j.last,lastAgeMinutes:(now-(ts(j.last?.at)||now))/60000,cursor:j.cursor,quota:j.quota,shadowCount:j.shadowCount,policy:j.policy,providerCallsThisRead:j.providerCallsThisRead}).slice(0,7800));
 }else if(path==='/ou-adaptive-research-state-test'){
  const list=j.records||[];
  const after=list.filter(r=>ts(r.picked_at)>=cutoff);
  const oldest=list.filter(r=>ts(r.picked_at)<cutoff).length;
  const max=list.reduce((a,r)=>Math.max(a,ts(r.picked_at)||0),0);
  const pickGrouped=Object.fromEntries([...new Set(list.map(r=>String(r.status)))].map(key=>[key,list.filter(r=>String(r.status)===key).length]));
  console.log('OU_NOV25_ADAPTIVE '+JSON.stringify({path,http:out.http,code:j.code,lastRunAt:j.lastRunAt,
   ageLastRunMinutes:(now-(ts(j.lastRunAt)||now))/60000,screeningCounts:j.screeningCounts,
   priced:j.priced,formulaCount:j.formulas?.length,totalRecords:list.length,recordsAfterYesterday19ICT:after.length,
   recordsBefore:oldest,maxPickedAt:fmt(max),statusCounts:pickGrouped,
   sampleAfter:after.slice(-3).map(r=>({fixture:r.fixture_id,formula:r.formula_id,pickedAt:fmt(ts(r.picked_at)),status:r.status})),rawCandidatesCount:j.rawCandidates?.length,
   rawCandidatesSample:j.rawCandidates?.slice(0,2).map(r=>({id:r.fixture_id,status:r.status}))}).slice(0,9200));
 }else if(path==='/ou-v3-stage-one-audit-test'){
  console.log('OU_NOV25_V3 '+JSON.stringify({path,http:out.http,policy:j.policy,summary:j.summary,stats:j.stats,counts:j.counts,last:j.last,ledger:j.ledger?{stats:j.ledger.stats,rows:j.ledger.rows?.length}:null,keys:Object.keys(j)}).slice(0,3800));
 }else if(path==='/ou-value-v2-state'){
  console.log('OU_NOV25_PRICE '+JSON.stringify({path,http:out.http,priceBridge:j.priceBridge,selectionCount:j.selections?.length,last:j.last,policy:j.policy,keys:Object.keys(j)}).slice(0,3800));
 }else if(path==='/daily-mission-state'){
  console.log('OU_NOV25_DAILY '+JSON.stringify({path,http:out.http,mission:j.mission,history:j.history?{businessDay:j.history.businessDay,completed:j.history.completed,imported:j.history.imported,remainingRounds:j.history.remainingRounds}:null,feed:j.feed?{at:j.feed.at,stats:j.feed.stats}:null}).slice(0,3800));
 }else console.log('OU_NOV25_HISTORY '+JSON.stringify({path,http:out.http,summary:j}).slice(0,1600));
}
console.log('OU_NOV25_READONLY_DONE '+JSON.stringify({worker,checkedAt:new Date().toISOString(),writes:0,paidApiRequests:0}));
