// Diagnose existing BALL46 3.43 error telemetry WITHOUT mutating Cloudflare.
// Do not print messages, request URLs, headers, payloads, API keys or visitor identifiers.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Cloudflare read credentials unavailable');
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
const until=Date.now(),since=until-30*60_000;
const workers=['nomadtips3-full-market-343-ball46','ball46-member-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
const classify=(v)=>{
 const s=String(v||'').toLowerCase();
 if(/429|rate.limit|too.many.requests/.test(s))return 'mentions_429_or_limit';
 if(/timeout|timed.out|deadline/.test(s))return 'mentions_timeout';
 if(/quota/.test(s))return 'mentions_quota';
 if(/unauthoriz|forbidden|403|401/.test(s))return 'mentions_auth';
 if(/typeerror/.test(s))return 'type_error';
 if(/referenceerror/.test(s))return 'reference_error';
 if(/fetch.*fail|network.*error/.test(s))return 'network_error';
 if(/exception|error/.test(s))return 'other_error';
 return 'unclassified';
};
async function queryWorker(worker){
 const payload={queryId:'ball46-observability-triage',dry:true,view:'events',limit:250,
  timeframe:{from:since,to:until},
  parameters:{datasets:['cloudflare-workers'],filterCombination:'and',filters:[
   {key:'$metadata.service',operation:'eq',type:'string',value:worker}
  ],limit:250}};
 try{
  const response=await fetch(base+'/workers/observability/telemetry/query',{
   method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  const json=await response.json().catch(()=>({}));
  const eventSet=json.result?.events||json.events||{};
  const items=Array.isArray(eventSet.events)?eventSet.events:[];
  const tally={};
  const sample=[];
  const add=(k)=>{tally[k]=(tally[k]||0)+1;};
  for(const x of items){
   const m=x.$metadata||{},w=x.$workers||{};
   const eventType=String(w.eventType||m.origin||m.trigger||'unknown').slice(0,40);
   const level=String(m.level||m.severity||x.level||'unknown').slice(0,25);
   add('event:'+eventType);add('level:'+level);
   const outcome=String(w.outcome||m.outcome||'unknown').slice(0,35);
   add('outcome:'+outcome);
   const code=m.statusCode??m.httpStatus??w.statusCode;
   if(Number.isInteger(Number(code)))add('status:'+Number(code));
   const classification=classify([m.message,m.error,m.exception,x.message,x.error,w.exception].filter(Boolean).join(' '));
   if(classification!=='unclassified')add('errorClass:'+classification);
   if(sample.length<5)sample.push({atUtc:typeof x.timestamp==='number'?new Date(x.timestamp).toISOString():null,eventType,level,outcome,errorClass:classification});
  }
  return {worker,http:response.status,queryOk:response.ok&&!json.errors?.length,eventTotal:eventSet.count??null,sampled:items.length,counts:tally,schema:{eventTopKeys:items[0]?Object.keys(items[0]).filter(s=>!s.startsWith('user')).slice(0,20):[],metadataKeys:items[0]?.$metadata?Object.keys(items[0].$metadata).filter(s=>!/(body|cookie|header|url|token|key)/i.test(s)).slice(0,30):[]},sample};
 }catch{return {worker,http:0,queryOk:false,reason:'query_failed'};}
}
const output=[];
for(const worker of workers)output.push(await queryWorker(worker));
console.log('BALL46_FULLMARKET_MEMBER_TRIAGE='+JSON.stringify({asOfUtc:new Date(until).toISOString(),lastMinutes:30,readOnly:true,results:output}));
