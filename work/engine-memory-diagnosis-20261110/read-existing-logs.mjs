import {writeFile} from 'node:fs/promises';
const A='62cb0db544160e6591342abd6b4f35cc',D='work/engine-memory-diagnosis-20261110',params={queryId:'ball46-memory-diagnosis-20261110',view:'events',timeframe:{from:Date.parse('2026-11-10T09:06:20Z'),to:Date.parse('2026-11-10T09:07:10Z')},parameters:{filters:[{key:'$metadata.service',operation:'eq',type:'string',value:'nomadtips3-engine-343'}],limit:100}};
const out={productionWrites:0,runtimeRequests:0,providerRequests:0,source:'Existing Cloudflare Workers logs only; temporary query, not saved',at:new Date().toISOString(),query:params};
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+'/workers/observability/telemetry/query',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(45000)});
const j=await r.json();out.status=r.status;out.success=j.success;
if(!r.ok||!j.success){out.errors=j.errors?.map(e=>({code:e.code,message:e.message}));}
else{
 out.resultKeys=Object.keys(j.result||{});out.eventsContainerKeys=Object.keys(j.result?.events||{});
 const events=[];function walk(x){if(!x||typeof x!=='object')return;if(x['$metadata']||x['$workers']){events.push(x);return}for(const v of Object.values(x))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}walk(j.result);
 const safe=x=>typeof x==='string'?x.replace(/Bearer\s+\S+/gi,'Bearer [omitted]').replace(/https?:\/\/[^\s)]+/g,'[URL omitted]').slice(0,1500):x;
 out.events=events.slice(0,100).map(e=>{const m=e.$metadata||{},w=e.$workers||{};return{timestamp:e.timestamp||e.$timestamp,metadata:Object.fromEntries(['service','origin','trigger','error','message','type','level','requestId'].filter(k=>k in m).map(k=>[k,safe(m[k])])),workers:Object.fromEntries(['scriptName','outcome','cpuTimeMs','wallTimeMs','requestId','eventType'].filter(k=>k in w).map(k=>[k,safe(w[k])])),workerKeys:Object.keys(w)}});out.count=events.length;
}
await writeFile(D+'/existing-logs-report.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));