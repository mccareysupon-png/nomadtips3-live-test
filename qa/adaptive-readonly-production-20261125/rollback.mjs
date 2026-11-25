import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const site='ball46-production',candidate=process.env.B46_ADAPTIVE_CANDIDATE,rollback=process.env.B46_ADAPTIVE_BASE;
assert(token&&account);
assert.match(candidate||'',/^[0-9a-f-]{36}$/);
assert.equal(rollback,'ed321803-bc3c-488e-9552-62a464fa79cf');
async function cf(path,method='GET',body){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers'+path,{
  method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(55000)});
 const d=await r.json();assert(r.ok&&d.success,JSON.stringify(d.errors||[]));return d.result;
}
const current=await cf('/scripts/'+site+'/deployments?per_page=1');
const versions=current.deployments?.[0]?.versions;
assert(versions?.length===1&&Number(versions[0].percentage)===100);
const live=versions[0].version_id;
if(live===rollback){console.log('B46_ADAPTIVE_READONLY_ROLLBACK_ALREADY_BASE');process.exit(0);}
assert.equal(live,candidate,'A different active Production version must not be overwritten');
const d=await cf('/scripts/'+site+'/deployments','POST',
 {strategy:'percentage',versions:[{version_id:rollback,percentage:100}],annotations:{'workers/message':'Rollback Adaptive read-only route after failed browser QA'}});
for(let i=0;i<15;i++){
 const now=await cf('/scripts/'+site+'/deployments?per_page=1');
 if(now.deployments?.[0]?.versions?.[0]?.version_id===rollback){console.log('B46_ADAPTIVE_READONLY_ROLLBACK_CONFIRMED '+JSON.stringify({rollback,deployment:d.id}));process.exit(0);}
 await new Promise(resolve=>setTimeout(resolve,1400));
}
throw Error('Production rollback not confirmed');
