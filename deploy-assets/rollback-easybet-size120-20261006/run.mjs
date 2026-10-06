import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production';
const currentExpected='2c9c6823-c365-4764-b9e9-0f17f4418e82';
const target='6b9e8b48-fd11-4486-9407-51959e00be60';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path,options={}){assert(account&&token,'CLOUDFLARE_AUTH_MISSING');const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});const j=await r.json();assert(r.ok&&j.success===true,`CF:${r.status}:${JSON.stringify(j.errors||[])}`);return j.result}
async function active(){const d=await api(`/scripts/${script}/deployments`);const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'AMBIGUOUS_ACTIVE');return v[0].version_id}
const before=await active();
assert.equal(before,currentExpected,'STOP_CURRENT_PRODUCTION_MOVED');
await api(`/workers/${script}/versions/${target}?include=modules`);
await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}],annotations:{'workers/message':'Rollback EasyBet size +20% patch'}})});
for(let i=0;i<20;i++){if(await active()===target)break;await new Promise(r=>setTimeout(r,1500))}
assert.equal(await active(),target,'ROLLBACK_NOT_ACTIVE');
console.log('BALL46_ROLLBACK_EASYBET_SIZE120_SUCCESS',JSON.stringify({before,active:target}));
