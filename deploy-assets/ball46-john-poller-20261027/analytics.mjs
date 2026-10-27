// Read-only Cloudflare GraphQL (POST query, never mutation). No secrets are printed.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Cloudflare credentials missing');
const allowed=new Set(['ball46-production','nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46','nomadtips3-live-engine-5usd-shadow','nomadtips3-live-engine']);
const end=new Date(),start=new Date(end.valueOf()-60*60*1000);
const query=`query($accountTag: string!, $start: Time!, $end: Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$start,datetime_lt:$end},orderBy:[sum_requests_DESC]){dimensions{scriptName}sum{requests errors subrequests}}}}}`;
const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query,variables:{accountTag:account,start:start.toISOString(),end:end.toISOString()}}),signal:AbortSignal.timeout(30000)});
const data=await response.json().catch(()=>({}));
const accounts=data?.data?.viewer?.accounts||[];
const raw=accounts.flatMap(a=>a.workersInvocationsAdaptive||[]);
const found=raw.filter(x=>allowed.has(x?.dimensions?.scriptName)).map(x=>({script:x.dimensions.scriptName,requests:x.sum?.requests||0,errors:x.sum?.errors||0,subrequests:x.sum?.subrequests||0}));
const result={type:'BALL46_WORKER_ANALYTICS_READ_ONLY',fromUtc:start.toISOString(),toUtc:end.toISOString(),httpStatus:response.status,hasData:raw.length>0,errors:(data.errors||[]).map(e=>(e.extensions?.code||'graphql_error')).slice(0,3),workers:found};
console.log('BALL46_WORKER_ANALYTICS='+JSON.stringify(result));