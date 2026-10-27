// Cloudflare Observability selective error-event investigation (read-only).
// Absolutely no raw messages, query URLs, request bodies, tokens or visitor identifiers printed.
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Missing audit credentials');
const now=Date.now(),from=now-45*60*1000;
const services=['nomadtips3-full-market-343-ball46','ball46-member-production','nomadtips3-5usd-hub-343'];
const filters=[
 {key:'$metadata.level',operation:'eq',type:'string',value:'error'},
 {key:'$workers.outcome',operation:'eq',type:'string',value:'exception'}
];
const classify=s=>{
 const x=String(s||'').toLowerCase();
 if(/(^|\D)429(\D|$)|too many requests|rate.?limit/.test(x))return 'mentions_429';
 if(/(^|\D)401(\D|$)|unauthorized|invalid.key/.test(x))return 'mentions_401';
 if(/(^|\D)403(\D|$)|forbidden/.test(x))return 'mentions_403';
 if(/(^|\D)500(\D|$)|internal server error/.test(x))return 'mentions_500';
 if(/timeout|timed out/.test(x))return 'mentions_timeout';
 if(/api key|secret/.test(x))return 'mentions_secret_key';
 if(/typeerror/.test(x))return 'type_error';
 if(/referenceerror/.test(x))return 'reference_error';
 if(/fetch.*failed|network/.test(x))return 'network_error';
 return 'unknown';
};
async function run(service,filter){
 const payload={queryId:'ball46-3.43-errorevents',dry:true,view:'events',limit:250,
 timeframe:{from,to:now},parameters:{datasets:['cloudflare-workers'],filterCombination:'and',
 filters:[{key:'$metadata.service',operation:'eq',type:'string',value:service},filter],limit:250}};
 try{
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/observability/telemetry/query',
 {method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
 const j=await r.json().catch(()=>({}));const e=j.result?.events||j.events||{};
 const items=Array.isArray(e.events)?e.events:[];
 const cats={};const types={};const examples=[];
 for(const x of items){
  const m=x.$metadata||{},w=x.$workers||{};
  const type=String(w.eventType||m.trigger||'unknown').slice(0,40);
  types[type]=(types[type]||0)+1;
  const msg=[m.message,m.error,m.exception,w.exception].filter(Boolean).join(' ');
  const c=classify(msg);cats[c]=(cats[c]||0)+1;
  if(examples.length<8)examples.push({timestamp:typeof x.timestamp==='string'?x.timestamp:null,level:m.level||null,outcome:w.outcome||null,type,class:c});
 }
 return {service,filter:filter.value,http:r.status,valid:r.ok&&!j.errors?.length,results:e.count??null,returned:items.length,errorCodes:(j.errors||j.result?.errors||[]).map(q=>q.extensions?.code||q.code||'').slice(0,3),types,classes:cats,examples};
 }catch{return {service,filter:filter.value,http:0,error:'network_timeout'};}
}
const results=[];
for(const service of services)for(const filter of filters)results.push(await run(service,filter));
console.log('BALL46_ERROR_EVENTS='+JSON.stringify({utc:new Date(now).toISOString(),lastMinutes:45,queries:results}));
