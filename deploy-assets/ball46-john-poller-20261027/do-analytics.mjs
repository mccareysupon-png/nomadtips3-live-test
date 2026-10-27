// BALL46: Durable Object invocations + known non-secret shadow configuration.
// Pure read-only GraphQL query (POST query, not mutation) and GET; never log secrets or raw API responses.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Missing Cloudflare audit credentials');
const names=new Set(['ball46-production','nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46','nomadtips3-live-engine-5usd-shadow','nomadtips3-live-engine']);
const end=new Date(),start=new Date(end.valueOf()-60*60*1000);
const query=`query($accountTag: string!, $start: Time!, $end: Time!){viewer{accounts(filter:{accountTag:$accountTag}){durableObjectsInvocationsAdaptiveGroups(filter:{datetime_geq:$start,datetime_lt:$end},limit:1000,orderBy:[sum_requests_DESC]){dimensions{scriptName type}sum{requests}}}}}`;
const resp=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query,variables:{accountTag:account,start:start.toISOString(),end:end.toISOString()}}),signal:AbortSignal.timeout(25000)});
const body=await resp.json().catch(()=>({}));
const rows=(body?.data?.viewer?.accounts||[]).flatMap(a=>a.durableObjectsInvocationsAdaptiveGroups||[]);
const listed=rows.filter(x=>names.has(x?.dimensions?.scriptName)).map(x=>({script:x.dimensions.scriptName,type:x.dimensions.type,requests:x.sum?.requests||0}));
const settingResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/nomadtips3-live-engine-5usd-shadow/settings`,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
const setting=await settingResponse.json().catch(()=>({}));
const keyNames=new Set(['FIVEUSD_LIVE_REFRESH_MS','FIVEUSD_NATIVE_MODE','ENGINE_CYCLE_MODE','FIVEUSD_SHADOW_LEGACY_DISABLED']);
const cfg=(setting?.result?.bindings||[]).filter(x=>x.type==='plain_text'&&keyNames.has(x.name)).map(x=>({name:x.name,value:String(x.text||'').slice(0,40)}));
const out={type:'BALL46_DO_READONLY',fromUtc:start.toISOString(),toUtc:end.toISOString(),graphqlHttp:resp.status,graphqlErrors:(body.errors||[]).map(x=>x.extensions?.code||'query_error'),matchedDO:listed,shadowNonsecretSettings:cfg};
console.log('BALL46_DO_ANALYTICS='+JSON.stringify(out));