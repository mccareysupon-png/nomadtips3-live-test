import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production';
const BASE='93023cc5-0065-421a-a909-4fea2b95800e';
const CANDIDATE='af1a01b5-3005-40aa-89ea-4caf5eadb05c';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path,options={}){assert(account&&token,'CLOUDFLARE_AUTH_MISSING');const r=await fetch(root+path,{...options,signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});const j=await r.json();assert(r.ok&&j.success===true,`CLOUDFLARE_ERROR:${r.status}:${JSON.stringify(j.errors||[])}`);return j.result}
async function active(){const d=await api(`/scripts/${script}/deployments`);const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_VERSION_AMBIGUOUS');return v[0].version_id}
const before=await active();console.log('ROLLBACK_PREFLIGHT',JSON.stringify({before,BASE,CANDIDATE}));
if(before===BASE){console.log('ROLLBACK_ALREADY_AT_BASE');process.exit(0)}
assert.equal(before,CANDIDATE,'STOP_FOREIGN_ACTIVE_VERSION');
await api(`/workers/${script}/versions/${BASE}?include=modules`);
await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:BASE,percentage:100}],annotations:{'workers/message':'Rollback Ball46 Performance summary-only 20261006'}})});
for(let i=0;i<20;i++){if(await active()===BASE)break;await new Promise(r=>setTimeout(r,1000))}
assert.equal(await active(),BASE,'ROLLBACK_NOT_CONFIRMED');
console.log('BALL46_PERFORMANCE_SUMMARY_ONLY_ROLLBACK_SUCCESS',BASE);