import fs from 'node:fs';
const id=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!id||!token)throw Error('CLOUDFLARE_READ_TOKEN_MISSING');
const work=['nomadtips3-engine-343','ball46-multisource-shadow-20261018'];
const result={mode:'READ_ONLY_SHADOW_VS_ENGINE_DEPLOYMENT',at:new Date().toISOString(),
 readOnly:true,productionWrites:0,workers:{}};
for(const name of work){
 const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(id)+
 '/workers/scripts/'+encodeURIComponent(name)+'/deployments';
 const r=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token},
  redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('DEPLOYMENT_META_HTTP_'+r.status+'_'+name);
 const j=await r.json();
 const d=j.result?.deployments?.[0];
 if(!d?.id)throw Error('EMPTY_DEPLOYMENT_META_'+name);
 result.workers[name]={deploymentId:d.id,createdAt:d.created_on||null,
  versions:(d.versions||[]).map(v=>({id:v.version_id,percentage:v.percentage}))};
}
const primary=result.workers[work[0]],shadow=result.workers[work[1]];
result.sameDeployment=primary.deploymentId===shadow.deploymentId;
result.productionExpectedVersionUnchanged=primary.versions.some(v=>
 v.id==='9b363777-64fc-4a48-a10a-0fad822640cb'&&Number(v.percentage)===100);
result.shadowFullyDeployed=shadow.versions.some(v=>Number(v.percentage)===100);
fs.writeFileSync('shadow-vs-engine-readonly.json',JSON.stringify(result,null,2)+'\n');
console.log('READONLY_DEPLOYMENT_COMPARISON',JSON.stringify(result));
if(result.sameDeployment||!result.shadowFullyDeployed)process.exitCode=1;
