import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const baseline='df9f8726-d653-44f6-8fd4-43a4b7b94696',candidate=process.env.B46_STATISTICS_CANDIDATE;
assert(token&&account&&/^[0-9a-f-]{36}$/.test(candidate||''));
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path,method='GET',body){
 const h={authorization:'Bearer '+token},options={method,headers:h,signal:AbortSignal.timeout(50000)};
 if(body){h['content-type']='application/json';options.body=JSON.stringify(body)}
 const r=await fetch(root+path,options),j=await r.json();
 assert(r.ok&&j.success,JSON.stringify(j.errors||[]));return j.result;
}
async function active(){
 const d=await cf('/scripts/ball46-production/deployments?per_page=1');
 assert(d.deployments[0].versions.length===1);
 return d.deployments[0].versions[0].version_id;
}
const version=await active();
if(version===baseline){console.log('B46_STATISTICS_ROLLBACK_NOT_REQUIRED');process.exit(0)}
assert.equal(version,candidate,'PRODUCTION_DEPLOYED_BY_SOMEONE_ELSE_STOP');
const result=await cf('/scripts/ball46-production/deployments','POST',{
 strategy:'percentage',versions:[{version_id:baseline,percentage:100}],annotations:{'workers/message':'Rollback faulty Statistics 7D/30D/90D patch'}});
for(let i=0;i<15;i++){
 if(await active()===baseline){console.log('B46_STATISTICS_ROLLBACK_CONFIRMED '+JSON.stringify({version:baseline,deploy:result.id}));process.exit(0)}
 await new Promise(resolve=>setTimeout(resolve,1200))
}
throw Error('ROLLBACK_NOT_CONFIRMED');
