import {createHash} from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account)throw Error('CLOUDFLARE_CREDENTIALS_MISSING');
const worker='ball46-production';
const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+worker+'/deployments?per_page=1';
const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
const body=await response.json();
if(!response.ok||!body.success)throw Error('ACTIVE_VERSION_API_FAILED '+JSON.stringify(body.errors).slice(0,500));
const deployment=body.result?.deployments?.[0];
const version=deployment?.versions?.find(v=>Number(v.percentage)===100)?.version_id;
if(!version)throw Error('WORKER_NOT_100_PERCENT_SINGLE_VERSION '+JSON.stringify(deployment?.versions));
const paths=['/','/dashboard-v2-stage3-featured-facts-20261013a.js'];
const details=[];
for(const domain of ['https://ball46.com','https://www.ball46.com']){
 for(const path of paths){
  for(const bypass of [false,true]){
   const u=domain+path+(bypass?'?b46_verify_rollback='+Date.now():'');
   const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},cache:'no-store'});
   const s=await r.text();
   const hash=createHash('sha256').update(s).digest('hex');
   details.push({domain,path,bypass,status:r.status,hash,size:s.length,cache:r.headers.get('cf-cache-status'),
     hasV13:s.includes('B46_V13_FEATURED_STABLE_RENDER')||s.includes('b46-globe-hidden-v13-20261022'),
     hasV12:s.includes('V12 | Stabilize V11 team headings'),
     hasStatistics:s.includes('b46-statistics-no-old-flash-20261022')});
  }
 }
}
console.log('B46_V13_AFTER_FAILED_PURGE_ACTIVE',JSON.stringify({version,deploymentId:deployment.id,expectedRollback:'578fd91b-424f-46c8-8f2b-b104f080cbc5',details}));
if(version!=='578fd91b-424f-46c8-8f2b-b104f080cbc5')throw Error('PRODUCTION_NOT_ROLLED_BACK_TO_PREVIOUS_V12_STATISTICS_VERSION '+version);
if(details.some(x=>x.status!==200))throw Error('PRODUCTION_NOT_HTTP_200');
console.log('B46_V13_ROLLBACK_SAFE_CONFIRMED',JSON.stringify({version,domains:2,paths:2}));
