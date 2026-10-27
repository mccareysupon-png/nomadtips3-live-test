// BALL46: read-only aggregate worker rates. No source code, no secrets, no Cloudflare mutations.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Audit credentials missing');
const end=new Date(),start=new Date(end.getTime()-3600000);
const query='query($accountTag: string!, $start: Time!, $end: Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end},orderBy:[sum_requests_DESC]){dimensions{scriptName}sum{requests errors subrequests}} durableObjectsInvocationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end},orderBy:[sum_requests_DESC]){dimensions{scriptName type}sum{requests}}}}}';
const res=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{accountTag:account,start:start.toISOString(),end:end.toISOString()}}),signal:AbortSignal.timeout(25000)});
const j=await res.json().catch(()=>({}));
const acct=j.data?.viewer?.accounts?.[0]||{};
const worker=(acct.workersInvocationsAdaptive||[]).map(x=>({name:x.dimensions?.scriptName,count:x.sum?.requests||0,errors:x.sum?.errors||0})).filter(x=>x.name).sort((a,b)=>b.count-a.count);
const alarms=(acct.durableObjectsInvocationsAdaptiveGroups||[]).filter(x=>x.dimensions?.type==='alarm').map(x=>({name:x.dimensions?.scriptName,count:x.sum?.requests||0})).filter(x=>x.name).sort((a,b)=>b.count-a.count);
console.log('BALL46_ALL_WORKER_ACTIVITY='+JSON.stringify({timeUtc:end.toISOString(),hours:1,http:res.status,errorCount:j.errors?.length||0,workerCount:worker.length,workers:worker.slice(0,60),alarmCount:alarms.length,alarms:alarms.slice(0,60)}));
