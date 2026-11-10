import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
const A='62cb0db544160e6591342abd6b4f35cc',W='ball46-production',D='work/mobile-theme-fix-test-20261110/readiness',sha=s=>createHash('sha256').update(s).digest('hex');
await mkdir(D,{recursive:true});const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,productionWrites:0,runtimeEngineRequests:0,apiKeyOrSettingsWrites:0};
async function cf(path,query){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method:query?'POST':'GET',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(query?{'content-type':'application/json'}:{})},body:query?JSON.stringify(query):undefined,signal:AbortSignal.timeout(45000)}),j=await r.json();assert(r.ok&&j.success,'CF_READ_FAILED_'+r.status);return j.result}
async function active(w){const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{version:d.versions[0].version_id,deployment:d.id}}
try{
report.website=await active(W);const v=await cf('/workers/workers/'+W+'/versions/'+report.website.version+'?include=modules');
const main=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64');report.mainSha=sha(main);report.moduleCount=v.modules.length;
report.sourceMatchesTestedBaseline=report.website.version==='c9e86292-6ed9-4788-98de-1b363f478d74'&&report.mainSha==='b4d3b6f3f9e4fe00cc64d8a0f41d07746c0e9a9ab95a0f08dc2a2a81205ef626';
const engine=v.bindings.find(b=>b.type==='service'&&b.name==='ENGINE');assert(engine);report.engineService=engine.service;report.engine=await active(engine.service);
const to=Date.now(),from=to-15*60*1000;report.observationWindow={from:new Date(from).toISOString(),to:new Date(to).toISOString()};
const q=await cf('/workers/observability/telemetry/query',{queryId:'ball46-mobile-theme-readiness-20261110',view:'events',timeframe:{from,to},parameters:{filters:[{key:'$metadata.service',operation:'eq',type:'string',value:engine.service}],needle:{value:'memory',isRegex:false},limit:50}});
const found=[];function walk(x){if(!x||typeof x!=='object')return;if(x.$metadata||x.$workers){const m=x.$metadata||{},w=x.$workers||{};found.push({at:new Date(x.timestamp||x.$timestamp).toISOString(),trigger:m.trigger,error:typeof m.error==='string'?m.error.replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,500):undefined,outcome:w.outcome,durableObjectId:w.durableObjectId});return}for(const v of Object.values(x))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}walk(q);
report.recentMemoryEvents=found.filter(x=>x.outcome==='exceededMemory'||/memory limit|exceeded.*memory/i.test(x.error||''));report.eventCount=report.recentMemoryEvents.length;
report.after=await active(W);assert.deepEqual(report.after,report.website,'PRODUCTION_CHANGED_DURING_PREFLIGHT');
report.readyToContinue=report.sourceMatchesTestedBaseline&&report.eventCount===0;report.blockers=[];if(!report.sourceMatchesTestedBaseline)report.blockers.push('ACTIVE_SOURCE_DIFFERS_FROM_TESTED_BASELINE');if(report.eventCount)report.blockers.push('RECENT_ENGINE_MEMORY_EXHAUSTION');
report.ok=true;
}catch(e){report.ok=false;report.readyToContinue=false;report.error=String(e.stack);process.exitCode=1}
await writeFile(D+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));