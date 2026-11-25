import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const base='ed321803-bc3c-488e-9552-62a464fa79cf',candidate=process.env.B46_ORIGINAL_CANDIDATE;
assert(token&&account&&/^[0-9a-f-]{36}$/.test(candidate||''));
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path,method='GET',body){
 const h={authorization:'Bearer '+token};const opts={method,headers:h,signal:AbortSignal.timeout(50000)};
 if(body){h['content-type']='application/json';opts.body=JSON.stringify(body);}
 const r=await fetch(root+path,opts),d=await r.json();assert(r.ok&&d.success,JSON.stringify(d.errors||[]));return d.result;
}
async function active(){const d=await cf('/scripts/ball46-production/deployments?per_page=1');const v=d.deployments[0].versions;assert(v.length===1&&v[0].percentage===100);return v[0].version_id;}
const current=await active();
if(current===base){console.log('B46_ORIGINAL_OU_ROLLBACK_ALREADY_OLD_VERSION');process.exit(0);}
assert.equal(current,candidate,'STOP_ANOTHER_PRODUCTION_DEPLOYMENT_ACTIVE');
const r=await cf('/scripts/ball46-production/deployments','POST',{strategy:'percentage',
 versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback original O/U production due to failed browser QA'}});
for(let i=0;i<15;i++){if(await active()===base){console.log('B46_ORIGINAL_OU_ROLLBACK_CONFIRMED '+JSON.stringify({version:base,deployment:r.id}));process.exit(0);}await new Promise(r=>setTimeout(r,1400));}
throw Error('ROLLBACK_NOT_CONFIRMED');
