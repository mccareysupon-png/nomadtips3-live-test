import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const D='work/statistics-summary-shadow-20261113';
const source=JSON.parse(await readFile(D+'/source/active.json'));
const report={at:new Date().toISOString(),source,checks:[],productionWrites:0};
await mkdir(D+'/qa',{recursive:true});
try{
 for(const path of ['/api/engine/health','/api/hub/snapshot','/api/engine/statistics?paged=1&limit=1&cursor='+encodeURIComponent('stat:v2:row:\uffff')]){
  const r=await fetch('https://ball46-production.mccarey-supon.workers.dev'+path,{redirect:'error',signal:AbortSignal.timeout(20000)});
  const body=await r.text();let data;try{data=JSON.parse(body)}catch{data={error:'NON_JSON',sample:body.slice(0,160)}}
  const check={path,status:r.status,ok:data.ok,error:data.error,cacheOnly:data.cacheOnly,externalRequestsAdded:data.externalRequestsAdded,stale:data.stale,ledgerTotal:data.ledgerTotal,returned:data.rows?.length};report.checks.push(check);
  assert(r.ok&&data.ok===true,'BACKEND_NOT_OK:'+JSON.stringify(check));
  assert(!body.includes('SQLITE_TOOBIG'),'SQLITE_TOOBIG');
  if(path.includes('/hub/'))assert(data.cacheOnly===true&&data.externalRequestsAdded===0&&data.stale!==true,'LIVE_SNAPSHOT_NOT_READY');
 }
 report.ok=true;
}catch(e){report.ok=false;report.error=e.message;process.exitCode=1}
await writeFile(D+'/qa/deploy-preflight.json',JSON.stringify(report,null,2));
console.log('DEPLOY_PREFLIGHT '+JSON.stringify({...report,source:undefined}));

