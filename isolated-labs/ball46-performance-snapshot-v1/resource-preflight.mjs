/*
 * Cloudflare preview-only inventory, GET requests exclusively.
 * No mutation, no provider calls, no production deployment.
 */
import {mkdir,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const url='https://api.cloudflare.com/client/v4/accounts/'+account;
const PREVIEW_WORKER='ball46-performance-snapshot-preview-only';
const PREVIEW_DB='ball46-performance-snapshot-v1-preview-only';
const report={checkedAt:new Date().toISOString(),writes:0,mode:'GET_ONLY',targetWorker:PREVIEW_WORKER,targetDatabase:PREVIEW_DB,checks:{},errors:[]};
async function get(path){
 const r=await fetch(url+path,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(22000)});
 let j;try{j=await r.json()}catch{j=null}
 return {http:r.status,ok:r.ok&&j?.success===true,body:j?.result??null};
}
try{
 if(!account||!token)throw Error('CLOUDFLARE_READ_CREDENTIALS_MISSING');
 const d1=await get('/d1/database?per_page=100');
 report.checks.d1ListReadable=d1.ok;
 if(d1.ok){
  const list=Array.isArray(d1.body)?d1.body:Array.isArray(d1.body?.databases)?d1.body.databases:[];
  report.d1={totalSeen:list.length,existingPreviewName:list.some(x=>x.name===PREVIEW_DB)};
  report.checks.newDedicatedD1NameAvailable=!report.d1.existingPreviewName;
 }else report.d1={http:d1.http};
 const workers=await get('/workers/scripts');
 report.checks.workerListReadable=workers.ok;
 if(workers.ok){
  const items=Array.isArray(workers.body)?workers.body:
   Array.isArray(workers.body?.workers)?workers.body.workers:
   Array.isArray(workers.body?.scripts)?workers.body.scripts:[];
  report.workers={totalSeen:items.length,
   previewNameCollision:items.some(x=>x.id===PREVIEW_WORKER||x.name===PREVIEW_WORKER||x.script===PREVIEW_WORKER)};
  report.checks.previewWorkerNameAvailable=!report.workers.previewNameCollision;
 }else report.workers={http:workers.http};
 const named=await get('/workers/scripts/'+PREVIEW_WORKER+'/deployments?per_page=1');
 report.checks.previewWorkerAbsent=named.http===404;
 report.workerNamedProbe={http:named.http,alreadyExists:named.ok};
 report.readyForExplicitStaging=Object.values(report.checks).every(Boolean);
}catch(e){report.errors.push(String(e.message).slice(0,200));report.readyForExplicitStaging=false}
finally{
 await mkdir('reports',{recursive:true});
 await writeFile('reports/ball46-snapshot-v1-resource-preflight.json',JSON.stringify(report,null,2));
 console.log('B46_RESOURCE_PREVIEW_PREFLIGHT='+JSON.stringify(report));
 if(!report.readyForExplicitStaging)process.exitCode=1;
}
