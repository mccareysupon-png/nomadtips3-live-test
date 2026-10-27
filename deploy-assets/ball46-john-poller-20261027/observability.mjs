// Read-only Cloudflare Workers Observability query. Query "dry" mode; never save queries.
// Output includes ONLY bounded counts and sanitized execution metadata; never raw URLs, headers or messages.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Missing audit credentials');
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
const now=Date.now();
const windows=[
 {name:'recent_20m',from:now-20*60_000,to:now},
 {name:'john_0432_utc',from:Date.parse('2026-10-27T04:32:00Z'),to:Date.parse('2026-10-27T04:33:15Z')}
];
const workers=['nomadtips3-live-engine-5usd-shadow','nomadtips3-5usd-hub-343','nomadtips3-live-engine','nomadtips3-live-engine-5dollar'];
async function readOne(w,window){
 const body={queryId:'ball46-ad-hoc-observation',dry:true,view:'events',limit:100,
  timeframe:{from:window.from,to:window.to},
  parameters:{datasets:['cloudflare-workers'],filterCombination:'and',filters:[
   {key:'$metadata.service',operation:'eq',type:'string',value:w}
  ],limit:100}};
 try{
  const resp=await fetch(base+'/workers/observability/telemetry/query',{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(22000)});
  const j=await resp.json().catch(()=>({}));
  const ev=j.result?.events||j.events||{};
  const rows=Array.isArray(ev.events)?ev.events:[];
  const res={worker:w,window:window.name,status:resp.status,
    success:j.success===true||Boolean(j.run),errors:(j.errors||[]).map(e=>({code:e.code||null,messageClass:String(e.message||'').slice(0,130)})),
    eventTotal:ev.count??null,sampleCount:rows.length,
    origins:{},eventTypes:{},hasProviderHostInMetadata:0,outboundMetadataRows:0,
    timeExamples:[]};
  for(const item of rows){
   const m=item.$metadata||{};
   const origin=String(m.origin||m.trigger||'unknown').slice(0,45);
   const type=String(item.$workers?.eventType||m.type||'unknown').slice(0,35);
   res.origins[origin]=(res.origins[origin]||0)+1;
   res.eventTypes[type]=(res.eventTypes[type]||0)+1;
   if(/5dollarfootballapi/i.test(String(m.url||'')+' '+String(m.spanName||'')))res.hasProviderHostInMetadata++;
   if(/subrequest|fetch|http_client/i.test(String(m.spanName||'').slice(0,80)))res.outboundMetadataRows++;
   if(res.timeExamples.length<6)res.timeExamples.push({atUtc:new Date(item.timestamp||m.startTime||now).toISOString(),eventType:type,httpStatus:m.statusCode??null,metadataHasUrl:typeof m.url==='string'});
  }
  return res;
 }catch(e){return {worker:w,window:window.name,status:0,error:'query_not_available'};}
}
const result=[];
for(const w of workers)for(const window of windows)result.push(await readOne(w,window));
console.log('BALL46_OUTBOUND_LOG_AUDIT='+JSON.stringify({asOfUtc:new Date(now).toISOString(),readOnly:true,queries:result}));
