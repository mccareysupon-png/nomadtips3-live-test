import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const base='f3461d97-d22e-4bc3-9295-340d7b9a0b16',candidate=process.env.B46_UNIFIED_CANDIDATE;
const site='ball46-production',root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
assert(token&&account);assert.match(candidate??'',/^[0-9a-f-]{36}$/);
async function cf(path,method='GET',body){
 const opts={method,headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(50000)};
 if(body){opts.headers['content-type']='application/json';opts.body=JSON.stringify(body);}
 const r=await fetch(root+path,opts),j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors||[]));return j.result;
}
async function active(){
 const d=await cf('/scripts/'+site+'/deployments?per_page=1'),versions=d.deployments?.[0]?.versions;
 assert(versions?.length===1&&Number(versions[0].percentage)===100);
 return versions[0].version_id;
}
const id=await active();
if(id===base){console.log('B46_UNIFIED_ROLLBACK_NOT_REQUIRED '+base);process.exit(0);}
assert.equal(id,candidate,'NEWER_PRODUCTION_DEPLOYMENT_STOP_NO_ROLLBACK');
const restored=await cf('/scripts/'+site+'/deployments','POST',{
 strategy:'percentage',versions:[{version_id:base,percentage:100}],
 annotations:{'workers/message':'Rollback unified research UI after browser QA failure'}});
for(let i=0;i<15;i++){if(await active()===base){
 console.log('B46_UNIFIED_ROLLBACK_CONFIRMED '+JSON.stringify({version:base,deployment:restored.id}));process.exit(0);}
 await new Promise(r=>setTimeout(r,1400));
}
throw Error('PRODUCTION_ROLLBACK_NOT_CONFIRMED');
